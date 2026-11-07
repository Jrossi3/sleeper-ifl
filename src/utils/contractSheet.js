// src/utils/contractSheet.js
//
// Pulls live salary-cap / contract data straight from the IFL Google Sheet
// (the same one the commissioner already maintains) so the site always
// reflects whatever is currently in the sheet — no manual sync step.
//
// HOW IT WORKS
// The sheet must be shared as "Anyone with the link can view" (Google's
// gviz CSV export endpoint below only works for public sheets — there's no
// backend here to hold a private API key). Each team has its own tab
// (gid) in the workbook; we fetch that tab as CSV and parse it.
//
// ACTUAL SHEET STRUCTURE (confirmed from the live IFL Official Ledger):
//   Col A is always blank. Col B=POS, C=Player, D=Contract (end year),
//   E=Year Drafted, F=Draft Price, then TWO blank spacer columns, then
//   sequential single-year cap-hit columns starting at 2026 with no year
//   text directly above them in this row (the "2026/2027/…" labels live
//   in a separate summary box a couple of rows above the player table, at
//   a different column offset — not usable for locating these columns).
//   The DEAD CAP / PLUS CAP section below the roster reuses the same
//   column layout, with the label ("PLUS CAP"/"DEAD CAP") in the POS
//   column and the player's name in the Player column.
//
// If a tab's layout differs from this, adjust FIRST_CONTRACT_YEAR /
// YEAR_VALUES_OFFSET_FROM_PRICE below.

const FIRST_CONTRACT_YEAR = 2026;
const MAX_CONTRACT_YEARS_TRACKED = 15; // generous — real contracts run at most 5 years, this just avoids missing any

// Cells in the "value" region are always either a number or the literal
// placeholder "--" once a contract has expired — never truly blank. This
// lets each row locate where its own year-value columns start, rather than
// trusting a fixed spacer-column count that could differ row to row or
// tab to tab.
function isValueCell(raw) {
  const t = (raw || "").trim();
  if (t === "") return false;
  if (t === "--" || t === "-") return true;
  return !isNaN(toNumber(t));
}

function findValueStart(row, afterIdx) {
  let idx = afterIdx + 1;
  while (idx < row.length && !isValueCell(row[idx])) idx++;
  return idx < row.length ? idx : -1;
}

const SPREADSHEET_ID = "13v9XhA8LLc0-gaqNS4Xf3JDIeRHqSSujvorwXJhcHEQ";

// Sleeper roster.team_name -> that team's tab (gid) in the contract sheet.
// Update this if a franchise rebrands (Constitution 1.1d) or the league
// expands (Constitution 3.5) — just add/update the entry, no code changes.
export const TEAM_SHEET_GIDS = {
  "Hiroshima Kamikazes": "1886957383",
  "Belfast Car Bombers": "177213629",
  "Cuzco Incas": "378134153",
  "Beijing Tank Men": "1717026914",
  "Glasgow Highlanders": "1666016011",
  "Galway Potato Farmers": "155272364",
  "Montauk Bluefins": "152517402",
  "New Delhi Penguins": "2071830785",
  "Rome Gladiators": "1615622057",
  "London Merchants": "172571890",
};

const CACHE_MS = 5 * 60 * 1000; // re-fetch a given tab at most once per 5 minutes
const cache = new Map();

// ── CSV parsing ──────────────────────────────────────────────────────────

function csvToRows(text) {
  const rows = [];
  let row = [],
    field = "",
    inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// ── Name matching ────────────────────────────────────────────────────────
// The sheet sometimes abbreviates first names ("T. McBride"); Sleeper gives
// full names ("Trey McBride"). This tolerates that mismatch.

const normalize = (name = "") =>
  name
    .toLowerCase()
    .replace(/[.'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

// Team defenses are listed inconsistently ("Rams", "Rams DEF", "LA Rams",
// "Los Angeles Rams D/ST") while Sleeper calls them "Los Angeles Rams".
// [nickname, city, abbreviations...] — a defense can be written as any of
// these ("SF", "San Francisco", "49ers", "San Francisco 49ers D/ST").
const NFL_TEAMS = [
  ["cardinals", "arizona", "ari", "az"], ["falcons", "atlanta", "atl"], ["ravens", "baltimore", "bal"],
  ["bills", "buffalo", "buf"], ["panthers", "carolina", "car"], ["bears", "chicago", "chi"],
  ["bengals", "cincinnati", "cin"], ["browns", "cleveland", "cle"], ["cowboys", "dallas", "dal"],
  ["broncos", "denver", "den"], ["lions", "detroit", "det"], ["packers", "green bay", "gb", "gnb"],
  ["texans", "houston", "hou"], ["colts", "indianapolis", "ind"], ["jaguars", "jacksonville", "jax", "jac"],
  ["chiefs", "kansas city", "kc", "kan"], ["raiders", "las vegas", "lv", "lvr", "oakland", "oak"],
  ["chargers", "los angeles chargers", "lac", "sd"], ["rams", "los angeles rams", "lar", "stl"],
  ["dolphins", "miami", "mia"], ["vikings", "minnesota", "min"], ["patriots", "new england", "ne", "nwe"],
  ["saints", "new orleans", "no", "nor"], ["giants", "new york giants", "nyg"], ["jets", "new york jets", "nyj"],
  ["eagles", "philadelphia", "phi"], ["steelers", "pittsburgh", "pit"], ["49ers", "san francisco", "sf", "sfo", "niners"],
  ["seahawks", "seattle", "sea"], ["buccaneers", "tampa bay", "tb", "tam", "bucs"],
  ["titans", "tennessee", "ten"], ["commanders", "washington", "was", "wsh", "redskins"],
];
const DEF_WORDS = /\b(def|defense|defence|dst|d st|d\/st|special teams|st|d)\b/g;
const TEAM_ALIAS = new Map();
NFL_TEAMS.forEach(([nick, ...aliases]) => {
  TEAM_ALIAS.set(nick, nick);
  aliases.forEach((a) => TEAM_ALIAS.set(a, nick));
  aliases.forEach((a) => TEAM_ALIAS.set(`${a} ${nick}`, nick));
});
// Returns the team's nickname if the name is a team defense in any of the
// accepted spellings, otherwise null.
const defenseKey = (name) => {
  const hadDefWord = DEF_WORDS.test(normalize(name.replace(/\//g, " ")));
  DEF_WORDS.lastIndex = 0;
  const cleaned = normalize(name.replace(/\//g, " ")).replace(DEF_WORDS, " ").replace(/\s+/g, " ").trim();
  if (TEAM_ALIAS.has(cleaned)) {
    // Bare abbreviations/cities ("no", "was", "car") are only trusted with a
    // defense marker or a nickname, to avoid matching ordinary names.
    const isNick = NFL_TEAMS.some((t) => t[0] === cleaned);
    const multiWord = cleaned.includes(" ");
    if (isNick || multiWord || hadDefWord || cleaned.length >= 2) return TEAM_ALIAS.get(cleaned);
  }
  // "LA Rams", "NY Jets": a nickname as the last word identifies the team.
  const last = cleaned.split(" ").pop();
  return NFL_TEAMS.some((t) => t[0] === last) ? last : null;
};
const stripSuffix = (parts) =>
  parts.length > 1 && SUFFIXES.has(parts[parts.length - 1]) ? parts.slice(0, -1) : parts;

function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export function namesMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const da = defenseKey(a);
  const db = defenseKey(b);
  if (da && db) return da === db;
  const aParts = stripSuffix(na.split(" "));
  const bParts = stripSuffix(nb.split(" "));
  const aLast = aParts[aParts.length - 1];
  const bLast = bParts[bParts.length - 1];
  const aFirst = aParts[0];
  const bFirst = bParts[0];
  if (aLast !== bLast) {
    // Same first name, last name one letter off ("McGowen" vs "McGowan").
    return (
      aFirst.length > 2 && aFirst === bFirst &&
      aLast.length >= 5 && bLast.length >= 5 && withinOneEdit(aLast, bLast)
    );
  }
  if (aFirst.length <= 2 || bFirst.length <= 2) {
    return aFirst[0] === bFirst[0];
  }
  if (aFirst === bFirst) return true;
  // One-letter typo in the first name ("Tyron" vs "Tyrone"): same last
  // name plus a first name one edit away is the same person.
  return aFirst.length >= 5 && bFirst.length >= 5 && withinOneEdit(aFirst, bFirst);
}

export function findContract(contractPlayers, sleeperFullName) {
  if (!contractPlayers || !sleeperFullName) return null;
  return (
    contractPlayers.find(
      (p) => namesMatch(p.name, sleeperFullName)
    ) || null
  );
}

export function findDeadCapEntry(deadCap, fullName) {
  if (!deadCap || !fullName) return null;
  // A player can have more than one dead-cap row; combine them by year.
  const matches = deadCap.filter((d) => namesMatch(d.name, fullName));
  if (!matches.length) return null;
  const byYear = {};
  matches.forEach((m) =>
    Object.entries(m.byYear).forEach(([y, v]) => {
      byYear[y] = (byYear[y] || 0) + v;
    })
  );
  return { name: matches[0].name, names: matches.map((m) => m.name), byYear };
}

// Google's CSV export can render currency-formatted cells as "$104" and
// numeric years as "2026.0" — parseFloat alone mishandles the former, so
// strip anything but digits/decimal/minus before parsing.
function toNumber(v) {
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[^0-9.-]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return NaN;
  return parseFloat(cleaned);
}

// Pulls a 4-digit year out of a cell regardless of surrounding formatting
// ("2028", "2028.0", " 2028 " all resolve to "2028").
function extractYear(v) {
  const match = String(v || "").match(/20\d{2}/);
  return match ? match[0] : "";
}
// ── Sheet parsing ────────────────────────────────────────────────────────
//
// Columns are located by their header TEXT, not a fixed position — this
// makes parsing resilient to an extra spacer column, slightly different
// header wording, or column reordering, any of which would silently
// zero-out every team under a fixed-index approach.

function findHeaderRowCandidates(rows) {
  const candidates = [];
  for (let i = 0; i < rows.length; i++) {
    const upper = rows[i].map((c) => (c || "").trim().toUpperCase());
    if (upper.indexOf("POS") !== -1) candidates.push({ rowIdx: i, upper });
  }
  return candidates;
}

// Attempts to parse the player roster starting from one candidate header
// row. Returns { players, nextRowIdx } — nextRowIdx is where scanning
// should resume for the DEAD CAP section afterward.
function parsePlayersFromHeader(rows, headerIdx, upper, years) {
  const posIdx = upper.indexOf("POS");

  // Across every real tab checked, "POS" is the one header cell that has
  // never failed to match by text. The other four columns are always
  // consecutive right after it in the same order — Player, Contract, Year
  // Drafted, Draft Price — but text search for any of THEM can fail on a
  // given tab even though the column is really there (inconsistent
  // formatting/hidden characters have shown up per-tab, differently each
  // time). So: try text search first for each, but anchor any that fail
  // positionally off POS rather than leaving them unresolved.
  let nameIdx = upper.indexOf("PLAYER");
  let contractIdx = upper.findIndex((h) => h.includes("CONTRACT"));
  let draftedIdx = upper.findIndex((h) => h.includes("DRAFTED"));
  let priceIdx = upper.findIndex((h) => h.includes("PRICE"));
  if (posIdx !== -1) {
    if (nameIdx === -1) nameIdx = posIdx + 1;
    if (contractIdx === -1) contractIdx = posIdx + 2;
    if (draftedIdx === -1) draftedIdx = posIdx + 3;
    if (priceIdx === -1) priceIdx = posIdx + 4;
  }

  const players = [];
  let i = headerIdx + 1;
  let consecutiveBlanks = 0;
  for (; i < rows.length; i++) {
    const r = rows[i];
    const marker = `${r[0] || ""} ${r[1] || ""}`.toUpperCase();
    if (/DEAD CAP|PLUS CAP|PRE ?SEASON/.test(marker)) break;
    const pos = (r[posIdx] || "").trim();
    const name = (r[nameIdx] || "").trim();
    if (!pos || !name) {
      // A single blank row can be cosmetic spacing within the roster
      // block, not necessarily the boundary before the dead-cap section.
      // Only treat a longer run of blank rows as the real end — matches
      // the ~30-row gap the sheet actually uses before "DEAD CAP".
      consecutiveBlanks++;
      if (consecutiveBlanks >= 3) break;
      continue;
    }
    consecutiveBlanks = 0;

    const valueStart = priceIdx !== -1 ? findValueStart(r, priceIdx) : -1;
    const capByYear = {};
    years.forEach((y, k) => {
      if (valueStart === -1) {
        capByYear[y] = null;
        return;
      }
      const v = toNumber(r[valueStart + k]);
      capByYear[y] = isNaN(v) ? null : v;
    });

    players.push({
      position: pos,
      name,
      contractEnd: contractIdx !== -1 ? extractYear(r[contractIdx]) || (r[contractIdx] || "").trim() : "",
      draftedYear: draftedIdx !== -1 ? extractYear(r[draftedIdx]) || (r[draftedIdx] || "").trim() : "",
      draftPrice: priceIdx !== -1 ? (isNaN(toNumber(r[priceIdx])) ? 0 : toNumber(r[priceIdx])) : 0,
      capByYear,
      offsetByYear: {},
    });
  }

  return { players, nextRowIdx: i, posIdx, nameIdx, priceIdx };
}

function parseTeamCsv(rows) {
  const candidates = findHeaderRowCandidates(rows);
  if (candidates.length === 0) {
    console.warn(
      "contractSheet: couldn't find a header row containing both POS and PLAYER — check the sheet's column labels."
    );
    return { players: [], years: [] };
  }

  const years = [];
  for (let k = 0; k < MAX_CONTRACT_YEARS_TRACKED; k++) years.push(String(FIRST_CONTRACT_YEAR + k));

  // A sheet can have more than one row containing both "POS" and "PLAYER"
  // text (e.g. a second reference table elsewhere on the tab). Try each
  // candidate in order and use the first one that actually yields player
  // rows, rather than committing to the first match and silently coming
  // up empty if that one turns out not to be followed by real data.
  let result = null;
  for (const { rowIdx, upper } of candidates) {
    const attempt = parsePlayersFromHeader(rows, rowIdx, upper, years);
    if (attempt.players.length > 0) {
      result = { headerIdx: rowIdx, ...attempt };
      break;
    }
  }
  if (!result) {
    // None of the candidates produced players — fall back to the first
    // candidate so downstream code still has consistent column info,
    // but this will end up with an empty players array.
    const { rowIdx, upper } = candidates[0];
    result = { headerIdx: rowIdx, ...parsePlayersFromHeader(rows, rowIdx, upper, years) };
    console.warn(
      "contractSheet: found header row(s) but none were followed by parseable player rows."
    );
  }

  const { players, nextRowIdx, nameIdx, priceIdx } = result;
  let i = nextRowIdx;
  const deadCap = [];

  if (players.length === 0) {
    console.warn(
      "contractSheet: header row found but zero player rows parsed — the rows under the header may not line up with POS/PLAYER as expected."
    );
  }

  // Any row below the roster that names a player still on the team, with a
  // real (non-zero) number in the value column, is an adjustment to that
  // player's cap hit — e.g. a negative number means another team is
  // covering part of the cost. The label cell's text doesn't matter and
  // isn't checked at all.
  for (; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[nameIdx] || r[1] || "").trim();
    if (!name) continue;
    const player = players.find((p) => namesMatch(name, p.name));
    const valueStart = priceIdx !== -1 ? findValueStart(r, priceIdx) : -1;
    if (!player) {
      // Not on the active roster: a player who was cut/traded. Keep it as
      // a dead-cap entry so dropped players can be priced from it.
      if (valueStart === -1 || /^(dead cap|plus cap|pre ?season|old contracts)/i.test(name)) continue;
      const byYear = {};
      let any = false;
      years.forEach((y, k) => {
        const v = toNumber(r[valueStart + k]);
        if (!isNaN(v) && v !== 0) {
          byYear[y] = v;
          any = true;
        }
      });
      if (any) deadCap.push({ name, byYear });
      continue;
    }
    if (valueStart === -1) continue;
    years.forEach((y, k) => {
      const v = toNumber(r[valueStart + k]);
      if (!isNaN(v) && v !== 0) {
        player.offsetByYear[y] = (player.offsetByYear[y] || 0) + v;
      }
    });
  }

  players.forEach((p) => {
    p.netCapByYear = {};
    years.forEach((y) => {
      const base = p.capByYear[y];
      const offset = p.offsetByYear[y] || 0;
      p.netCapByYear[y] = base == null ? null : base + offset;
    });
  });

  // Always show a consistent 5-season window (this year + next 4) for
  // every team, rather than trimming per-team based on whose contract
  // happens to run longest — that produced a different cutoff year per
  // team, which is confusing to compare side by side.
  const displayYears = years.slice(0, 5);

  return { players, years: displayYears, deadCap };
}

// ── Public API ───────────────────────────────────────────────────────────

const normalizeTeamName = (name = "") =>
  name.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();

function findGidForTeam(teamName) {
  if (TEAM_SHEET_GIDS[teamName]) return TEAM_SHEET_GIDS[teamName];
  // Case/whitespace/"The " insensitive match against the known map.
  const target = normalizeTeamName(teamName);
  const match = Object.keys(TEAM_SHEET_GIDS).find((k) => normalizeTeamName(k) === target);
  return match ? TEAM_SHEET_GIDS[match] : null;
}

const gvizUrl = (param) =>
  `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&${param}`;

// For teams without a hardcoded gid (new/renamed franchises), look the tab
// up by NAME. Google silently returns the FIRST tab when a sheet name
// doesn't exist, so the response is compared against a deliberately bogus
// sheet name's response and rejected if identical.
let defaultTabText = null;
async function fetchTabByName(teamName) {
  if (defaultTabText == null) {
    try {
      defaultTabText = await (await fetch(gvizUrl("sheet=__no_such_tab__"))).text();
    } catch (e) {
      defaultTabText = "";
    }
  }
  const variants = [...new Set([teamName, teamName.replace(/^the\s+/i, ""), `The ${teamName.replace(/^the\s+/i, "")}`])];
  for (const v of variants) {
    try {
      const res = await fetch(gvizUrl(`sheet=${encodeURIComponent(v)}`));
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text !== defaultTabText) return text;
    } catch (e) {
      /* try next variant */
    }
  }
  return null;
}

export async function fetchTeamContracts(teamName) {
  const gid = findGidForTeam(teamName);
  const cacheKey = gid || `name:${normalizeTeamName(teamName)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

  let text;
  if (gid) {
    const res = await fetch(gvizUrl(`gid=${gid}`));
    if (!res.ok) throw new Error(`Contract sheet fetch failed for ${teamName}: ${res.status}`);
    text = await res.text();
  } else {
    text = await fetchTabByName(teamName);
    if (!text) {
      console.warn(
        `contractSheet: no tab found for "${teamName}" by name — add its gid to TEAM_SHEET_GIDS (the number after gid= in the tab's URL).`
      );
      return null;
    }
  }
  const parsed = parseTeamCsv(csvToRows(text));

  cache.set(cacheKey, { time: Date.now(), data: parsed });
  return parsed;
}

export const CAP_TOTAL = 1000;
