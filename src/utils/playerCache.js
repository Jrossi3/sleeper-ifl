// src/utils/playerCache.js
//
// The Sleeper player database (`playerData.json`) is ~19MB. Bundling it
// directly into the app (via require/import) ships that whole file to
// every visitor on every load, whether they need it or not.
//
// Sleeper publishes the same data at a public endpoint and only updates it
// roughly once a day, so instead we fetch it once and cache it in
// localStorage. Repeat visits within the TTL window load instantly from
// cache with zero network cost; the bundle itself drops by ~19MB.
//
// The raw payload includes many fields (stats, injury details, birth date,
// etc.) this app never reads — only first_name, last_name, position, and
// full_name are actually used anywhere. Trimming to just those before
// caching cuts the payload drastically, which both reduces memory use and
// makes it far more likely to actually fit under localStorage's ~5-10MB
// per-origin quota instead of silently failing to cache every session.

const CACHE_KEY = "ifl_sleeper_players_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Sleeper's player DB updates ~daily

function trimPlayers(raw) {
  const trimmed = {};
  for (const [id, p] of Object.entries(raw)) {
    if (!p) continue;
    trimmed[id] = {
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" "),
      position: p.position,
    };
  }
  return trimmed;
}

export async function loadPlayers() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { time, data } = JSON.parse(cached);
      if (data && Date.now() - time < CACHE_TTL_MS) return data;
    }
  } catch (err) {
    console.warn("Player cache read failed, will re-fetch:", err);
  }

  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) throw new Error(`Failed to fetch player list: ${res.status}`);
  const raw = await res.json();
  const data = trimPlayers(raw);

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data }));
  } catch (err) {
    // Trimmed payload should comfortably fit, but if a browser's quota is
    // unusually tight, just skip caching rather than fail the app.
    console.warn("Player cache write skipped (likely over quota):", err);
  }

  return data;
}