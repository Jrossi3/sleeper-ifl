// Pickups and auction prices from earlier seasons of the same league.
//
// A long-term contract signed in a previous season (e.g. a $17 waiver
// pickup in August 2025) shows up in THAT season's league, which Sleeper
// links through `previous_league_id`. Walking that chain gives the price
// and season of each acquisition, so a later drop can be priced at the
// escalated amount (price x 1.18 per season since signing).

const API = "https://api.sleeper.app/v1";
const MAX_SEASONS_BACK = 4; // contracts run at most five seasons
const cache = new Map();

async function getJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function eventsForLeague(leagueId, season) {
  const events = [];
  const [drafts, ...weeks] = await Promise.all([
    getJson(`${API}/league/${leagueId}/drafts`),
    ...Array.from({ length: 19 }, (_, w) => getJson(`${API}/league/${leagueId}/transactions/${w}`)),
  ]);

  await Promise.all(
    (drafts || []).map(async (d) => {
      const picks = (await getJson(`${API}/draft/${d.draft_id}/picks`)) || [];
      const time = d.last_picked ?? d.start_time ?? d.created ?? 0;
      picks.forEach((pk) => {
        const amt = pk.metadata?.amount;
        if (amt != null && !isNaN(Number(amt)))
          events.push({ time, rid: pk.roster_id, pid: pk.player_id, amt: Number(amt), season: Number(d.season) || season });
      });
    })
  );

  weeks.forEach((week) =>
    (Array.isArray(week) ? week : []).forEach((t) => {
      if (t.status !== "complete" || !t.adds || (t.type !== "free_agent" && t.type !== "waiver")) return;
      const time = t.status_updated ?? t.created ?? 0;
      Object.entries(t.adds).forEach(([pid, rid]) =>
        events.push({ time, rid, pid, amt: Number(t.settings?.waiver_bid ?? 0), season })
      );
    })
  );
  return events;
}

// Returns { [rosterId]: { [playerId]: [{ time, amt, season }, ...] } } for
// every season BEFORE the given league, oldest pickup first.
export async function loadPriorPickups(leagueId) {
  if (cache.has(leagueId)) return cache.get(leagueId);

  const history = {};
  let current = await getJson(`${API}/league/${leagueId}`);
  let prevId = current?.previous_league_id;
  for (let i = 0; i < MAX_SEASONS_BACK && prevId && prevId !== "0"; i++) {
    const info = await getJson(`${API}/league/${prevId}`);
    if (!info) break;
    const events = await eventsForLeague(prevId, Number(info.season));
    events.forEach((e) => {
      const byPlayer = (history[e.rid] = history[e.rid] || {});
      (byPlayer[e.pid] = byPlayer[e.pid] || []).push({ time: e.time, amt: e.amt, season: e.season });
    });
    prevId = info.previous_league_id;
  }
  Object.values(history).forEach((byPlayer) =>
    Object.values(byPlayer).forEach((list) => list.sort((a, b) => a.time - b.time))
  );
  cache.set(leagueId, history);
  return history;
}
