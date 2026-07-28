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
// IF A TAB'S COLUMN ORDER DIFFERS FROM WHAT'S BELOW, ADJUST
// `YEAR_COLS_START` / the column indices in `parseTeamCsv` to match.
// Expected column order per team tab:
//   POS | PLAYER | CONTRACT (end year) | DRAFTED (year) | PRICE | <year1> | <year2> | ...
// followed by a blank row, then a "DEAD CAP / OLD CONTRACTS" (and/or
// "PRE SEASON TRADE ADJUSTMENTS") section with rows shaped like:
//   PLUS CAP | Player Name | ... | <year1 offset> | <year2 offset> | ...

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

const YEAR_COLS_START = 5; // columns after POS, PLAYER, CONTRACT, DRAFTED, PRICE

const CACHE_MS = 5 * 60 * 1000; // re-fetch a given tab at most once per 5 min
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

function namesMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const aParts = na.split(" ");
  const bParts = nb.split(" ");
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

// ── Sheet parsing ────────────────────────────────────────────────────────

function parseTeamCsv(rows) {
  const headerIdx = rows.findIndex(
    (r) => (r[0] || "").trim().toUpperCase() === "POS"
  );
  if (headerIdx === -1) return { players: [], years: [] };

  const header = rows[headerIdx].map((h) => h.trim());
  const years = header.slice(YEAR_COLS_START).filter(Boolean);

  const players = [];
  let i = headerIdx + 1;
  for (; i < rows.length; i++) {
    const r = rows[i];
    const pos = (r[0] || "").trim();
    const name = (r[1] || "").trim();
    if (!pos || !name) break; // blank row before the dead-cap section
    if (/DEAD CAP|PLUS CAP|PRE ?SEASON/i.test(pos + name)) break;
    players.push({
      position: pos,
      name,
      contractEnd: (r[2] || "").trim(),
      draftedYear: (r[3] || "").trim(),
      draftPrice: parseFloat(r[4]) || 0,
      capByYear: years.reduce((acc, y, yi) => {
        const v = parseFloat(r[YEAR_COLS_START + yi]);
        acc[y] = isNaN(v) ? null : v;
        return acc;
      }, {}),
      offsetByYear: {},
    });
  }

  // Remaining rows: DEAD CAP / PLUS CAP / trade-adjustment sections.
  // Any row that names a player already on the roster gets its year
  // columns applied as an offset (e.g. -123 = fully covered by another team).
  for (; i < rows.length; i++) {
    const r = rows[i];
    const label = (r[0] || "").trim().toUpperCase();
    const name = (r[1] || "").trim();
    if (!name || !/PLUS CAP|DEAD CAP/.test(label)) continue;
    const player = players.find((p) => namesMatch(name, p.name));
    if (!player) continue;
    years.forEach((y, yi) => {
      const v = parseFloat(r[YEAR_COLS_START + yi]);
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

  return { players, years };
}

// ── Public API ───────────────────────────────────────────────────────────

export async function fetchTeamContracts(teamName) {
  const gid = TEAM_SHEET_GIDS[teamName];
  if (!gid) return null;

  const cached = cache.get(gid);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Contract sheet fetch failed for ${teamName}: ${res.status}`);
  }
  const text = await res.text();
  const parsed = parseTeamCsv(csvToRows(text));

  cache.set(gid, { time: Date.now(), data: parsed });
  return parsed;
}

export const CAP_TOTAL = 1000;
