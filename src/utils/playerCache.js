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

const CACHE_KEY = "ifl_sleeper_players_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Sleeper's player DB updates ~daily

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
  const data = await res.json();

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data }));
  } catch (err) {
    // localStorage has a ~5-10MB quota in most browsers and this payload is
    // large; if it doesn't fit, just skip caching rather than fail the app.
    console.warn("Player cache write skipped (likely over quota):", err);
  }

  return data;
}
