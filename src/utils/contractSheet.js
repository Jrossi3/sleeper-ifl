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
//   The DEAD CAP section below the roster reuses the same
//   column layout, with the label in the POS
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
  "Chamonix Alpines": "378134153",
  "Shanghai Warrior Monks": "1717026914",
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
const stripSuffix = (parts) =>
  parts.length > 1 && SUFFIXES.has(parts[parts.length - 1]) ? parts.slice(0, -1) : parts;

function namesMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aParts = stripSuffix(na.split(" "));
  const bParts = stripSuffix(nb.split(" "));
  const aLast = aParts[aParts.length - 1];
  const bLast = bParts[bParts.length - 1];
  if (aLast !== bLast) return false;
  const aFirst = aParts[0];
  const bFirst = bParts[0];
  if (aFirst.length <= 2 || bFirst.length <= 2) {
    return aFirst[0] === bFirst[0];
  }
  return aFirst === bFirst;
}

export function findContract(contractPlayers, sleeperFullName) {
  if (!contractPlayers || !sleeperFullName) return null;
  return (
    contractPlayers.find(
      (p) => namesMatch(p.name, sleeperFullName)
    ) || null
  );
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

// The sheet already computes per-year totals itself in labeled summary
// rows ("Remaining Budget:", "Draft Cap Spent:") — read those directly
// instead of reconstructing them from the roster + dead cap section,
// which requires guessing at every source of dead money. Values start
// wherever the first real number appears after the label cell.
function findLabeledSeries(rows, labelRegex, yearCount) {
  for (const r of rows) {
    const labelIdx = r.findIndex((c) => labelRegex.test((c || "").trim()));
    if (labelIdx === -1) continue;
    const valueStart = findValueStart(r, labelIdx);
    if (valueStart === -1) continue;
    const values = [];
    for (let k = 0; k < yearCount; k++) {
      const v = toNumber(r[valueStart + k]);
      values.push(isNaN(v) ? null : v);
    }
    return values;
  }
  return null;
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
    if (!player) continue;
    const valueStart = priceIdx !== -1 ? findValueStart(r, priceIdx) : -1;
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

  const spentSeries = findLabeledSeries(rows, /DRAFT CAP SPENT/i, displayYears.length);
  const remainingSeries = findLabeledSeries(rows, /REMAINING BUDGET/i, displayYears.length);
  if (!spentSeries || !remainingSeries) {
    console.warn(
      "contractSheet: couldn't find 'Draft Cap Spent:' / 'Remaining Budget:' rows — team cap totals will be unavailable."
    );
  }
  const budgetByYear = {};
  displayYears.forEach((y, k) => {
    budgetByYear[y] = {
      spent: spentSeries?.[k] ?? null,
      remaining: remainingSeries?.[k] ?? null,
    };
  });

  return { players, years: displayYears, budgetByYear };
}

// ── Public API ───────────────────────────────────────────────────────────

const normalizeTeamName = (name = "") =>
  name.toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ").trim();

function findGidForTeam(teamName) {
  if (TEAM_SHEET_GIDS[teamName]) return TEAM_SHEET_GIDS[teamName];
  // Fall back to a case/whitespace-insensitive match — Sleeper's team_name
  // and this map's keys are maintained separately and can drift slightly
  // (extra space, different capitalization) without actually being a
  // different team.
  const target = normalizeTeamName(teamName);
  const match = Object.keys(TEAM_SHEET_GIDS).find((k) => normalizeTeamName(k) === target);
  return match ? TEAM_SHEET_GIDS[match] : null;
}

export async function fetchTeamContracts(teamName) {
  const gid = findGidForTeam(teamName);
  if (!gid) {
    console.warn(
      `contractSheet: no sheet tab mapped for team "${teamName}" — check TEAM_SHEET_GIDS for an exact or near match.`
    );
    return null;
  }

  const cached = cache.get(gid);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Contract sheet fetch failed for ${teamName}: ${res.status}`);
  }
  const text = await res.text();
  const parsed = parseTeamCsv(csvToRows(text));

  // eslint-disable-next-line no-console
  console.log(
    `[contractSheet] ${teamName}: parsed ${parsed.players.length} players, years=${JSON.stringify(
      parsed.years
    )}, sample=${JSON.stringify(parsed.players[0] || null)}`
  );

  cache.set(gid, { time: Date.now(), data: parsed });
  return parsed;
}

export const CAP_TOTAL = 1000;