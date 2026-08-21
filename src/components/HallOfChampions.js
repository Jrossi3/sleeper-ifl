// src/components/HallOfChampions.js
//
// Two things live on this page:
//  1. The trophy table — every season's champion, found by matching this
//     username's leagues each year by name (see the note below on why —
//     not every league is linked season-to-season the way Sleeper expects).
//  2. A full championship-game box score (same presentation as the
//     Matchups view — every player, every point, starters bolded) for
//     whichever year is currently selected app-wide, defaulting to the
//     current season since that's what `year` itself defaults to.

import React, { useEffect, useState } from "react";

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

const YEARS_TO_CHECK = ["2026", "2025", "2024", "2023", "2022", "2021"];

// Resolves a season's own league_id by matching this username's leagues
// that year by name — NOT Sleeper's previous_league_id chain, which
// assumes every season was created via Sleeper's own season-rollover flow.
// This league manages contracts/rosters outside that flow to begin with,
// so season-to-season linkage isn't something to depend on here.
async function findSeasonLeagueId(idUser, leagueName, season) {
  const leagues = await fetchJSON(
    `https://api.sleeper.app/v1/user/${idUser}/leagues/nfl/${season}`
  ).catch(() => []);
  const match = leagues.find((l) => l.name === leagueName);
  return match ? match.league_id : null;
}

export default function HallOfChampions({ idUser, leagueName, year, players }) {
  const [champions, setChampions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [champGame, setChampGame] = useState(null);
  const [champGameStatus, setChampGameStatus] = useState("loading"); // loading | ready | none | error

  // ── Trophy table ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!idUser || !leagueName) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const perYear = await Promise.all(
          YEARS_TO_CHECK.map(async (season) => {
            const id = await findSeasonLeagueId(idUser, leagueName, season);
            return id ? { season, leagueId: id } : null;
          })
        );
        const seasons = perYear.filter(Boolean);

        const results = await Promise.all(
          seasons.map(async ({ leagueId: id, season }) => {
            try {
              const bracket = await fetchJSON(`https://api.sleeper.app/v1/league/${id}/winners_bracket`);
              const finals = bracket.find((m) => m.p === 1 && m.w);
              if (!finals) return null;

              const [rostersRes, usersRes] = await Promise.all([
                fetchJSON(`https://api.sleeper.app/v1/league/${id}/rosters`),
                fetchJSON(`https://api.sleeper.app/v1/league/${id}/users`),
              ]);

              const champRoster = rostersRes.find((r) => r.roster_id === finals.w);
              if (!champRoster) return null;
              const owner = usersRes.find((u) => u.user_id === champRoster.owner_id);
              const teamName = owner?.metadata?.team_name || owner?.display_name || "Unknown Team";
              const ownerName = owner?.display_name || "Unknown Owner";

              return { season, teamName, ownerName };
            } catch {
              return null;
            }
          })
        );

        if (!cancelled) {
          setChampions(
            results.filter(Boolean).sort((a, b) => Number(b.season) - Number(a.season))
          );
        }
      } catch (err) {
        console.error("Failed to load Hall of Champions:", err);
        if (!cancelled) setError("Couldn't load this league's season history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [idUser, leagueName]);

  // ── Championship box score for the selected year ────────────────────
  useEffect(() => {
    if (!idUser || !leagueName || !year) return;
    let cancelled = false;

    const load = async () => {
      setChampGameStatus("loading");
      setChampGame(null);
      try {
        const id = await findSeasonLeagueId(idUser, leagueName, year);
        if (!id) {
          if (!cancelled) setChampGameStatus("none");
          return;
        }

        const [league, bracket] = await Promise.all([
          fetchJSON(`https://api.sleeper.app/v1/league/${id}`),
          fetchJSON(`https://api.sleeper.app/v1/league/${id}/winners_bracket`),
        ]);

        const finals = bracket.find((m) => m.p === 1 && m.w);
        if (!finals) {
          if (!cancelled) setChampGameStatus("none"); // not decided yet this season
          return;
        }

        const playoffStart = league.settings?.playoff_week_start || 15;
        const champWeek = playoffStart + (finals.r - 1);

        const [weekMatchups, rostersRes, usersRes] = await Promise.all([
          fetchJSON(`https://api.sleeper.app/v1/league/${id}/matchups/${champWeek}`),
          fetchJSON(`https://api.sleeper.app/v1/league/${id}/rosters`),
          fetchJSON(`https://api.sleeper.app/v1/league/${id}/users`),
        ]);

        const m1 = weekMatchups.find((m) => m.roster_id === finals.t1);
        const m2 = weekMatchups.find((m) => m.roster_id === finals.t2);
        if (!m1 || !m2) {
          if (!cancelled) setChampGameStatus("none");
          return;
        }

        const teamNameFor = (rosterId) => {
          const r = rostersRes.find((rr) => rr.roster_id === rosterId);
          const owner = r && usersRes.find((u) => u.user_id === r.owner_id);
          return owner?.metadata?.team_name || owner?.display_name || `Team ${rosterId}`;
        };

        if (!cancelled) {
          setChampGame({
            week: champWeek,
            champRosterId: finals.w,
            team1: {
              teamId: finals.t1,
              name: teamNameFor(finals.t1),
              starters: m1.starters || [],
              points: m1.points || 0,
              players: m1.players || [],
              players_points: m1.players_points || {},
            },
            team2: {
              teamId: finals.t2,
              name: teamNameFor(finals.t2),
              starters: m2.starters || [],
              points: m2.points || 0,
              players: m2.players || [],
              players_points: m2.players_points || {},
            },
          });
          setChampGameStatus("ready");
        }
      } catch (err) {
        console.error("Failed to load championship box score:", err);
        if (!cancelled) setChampGameStatus("error");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [idUser, leagueName, year]);

  return (
    <div>
      {/* ── Championship box score ── */}
      <div style={{ marginBottom: "2.5rem" }}>
        {champGameStatus === "loading" && (
          <p style={{ textAlign: "center" }}>Loading the {year} championship game…</p>
        )}
        {champGameStatus === "error" && (
          <p style={{ textAlign: "center" }}>Couldn't load the {year} championship game.</p>
        )}
        {champGameStatus === "none" && (
          <p style={{ textAlign: "center" }}>
            The {year} championship hasn't been decided yet.
          </p>
        )}
        {champGameStatus === "ready" && champGame && (
          <ChampionshipBoxScore game={champGame} year={year} players={players || {}} />
        )}
      </div>

      {/* ── Trophy table ── */}
      {loading ? (
        <p style={{ textAlign: "center" }}>Loading league history…</p>
      ) : error ? (
        <p style={{ textAlign: "center" }}>{error}</p>
      ) : champions.length === 0 ? (
        <p style={{ textAlign: "center" }}>
          No completed seasons found for this username in this league — check the browser console
          for details if you expected results here.
        </p>
      ) : (
        <div style={{ maxWidth: 520, margin: "2rem auto" }}>
          <h3 style={{ textAlign: "center" }}>Hall of Champions</h3>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Season</th>
                <th>Champion</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {champions.map((c) => (
                <tr key={c.season}>
                  <td>{c.season}</td>
                  <td style={{ fontWeight: 600, color: "var(--floodlight)" }}>{c.teamName}</td>
                  <td>{c.ownerName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Same presentation as the main Matchups view — every player, every point,
// starters bolded and highlighted — just for the one game that matters most.
function ChampionshipBoxScore({ game, year, players }) {
  const { team1, team2, champRosterId } = game;
  const t1starters = new Set(team1.starters);
  const t2starters = new Set(team2.starters);
  const sortByStarters = (list, starters) => [
    ...list.filter((p) => starters.has(p)),
    ...list.filter((p) => !starters.has(p)),
  ];
  const sorted1 = sortByStarters(team1.players, t1starters);
  const sorted2 = sortByStarters(team2.players, t2starters);
  const maxRows = Math.max(sorted1.length, sorted2.length);
  const t1Won = champRosterId === team1.teamId;
  const t2Won = champRosterId === team2.teamId;

  return (
    <div className="my-4">
      <h3 style={{ textAlign: "center", marginBottom: "10px" }}>
        {year} Championship — Week {game.week}
        <br />
        <span style={{ color: "var(--floodlight)" }}>{t1Won ? team1.name : team2.name} win the title</span>
      </h3>
      <table className="custom-table" style={{ width: "95%", margin: "auto" }}>
        <thead>
          <tr>
            <th colSpan="2" style={{ color: t1Won ? "var(--floodlight)" : undefined }}>
              {team1.name}{t1Won ? " 🏆" : ""}
            </th>
            <th colSpan="2" style={{ color: t2Won ? "var(--floodlight)" : undefined }}>
              {team2.name}{t2Won ? " 🏆" : ""}
            </th>
          </tr>
          <tr><th>Player</th><th>Points</th><th>Player</th><th>Points</th></tr>
        </thead>
        <tbody>
          {[...Array(maxRows)].map((_, i) => {
            const p1 = sorted1[i], p2 = sorted2[i];
            const p1d = players[p1], p2d = players[p2];
            return (
              <tr key={i}>
                <td style={{ fontWeight: t1starters.has(p1) ? "bold" : "normal", backgroundColor: t1starters.has(p1) ? "rgba(245, 184, 48, 0.1)" : "" }}>
                  {p1d && <>{p1d.first_name} {p1d.last_name} <span style={{ color: "var(--chalk-dim)" }}>{p1d.position}</span></>}
                </td>
                <td>{p1 && team1.players_points[p1]?.toFixed(2)}</td>
                <td style={{ fontWeight: t2starters.has(p2) ? "bold" : "normal", backgroundColor: t2starters.has(p2) ? "rgba(245, 184, 48, 0.1)" : "" }}>
                  {p2d && <>{p2d.first_name} {p2d.last_name} <span style={{ color: "var(--chalk-dim)" }}>{p2d.position}</span></>}
                </td>
                <td>{p2 && team2.players_points[p2]?.toFixed(2)}</td>
              </tr>
            );
          })}
          <tr style={{ fontWeight: "bold", borderTop: "2px solid var(--floodlight-dim)", backgroundColor: "var(--turf-2)" }}>
            <td>Total</td><td>{team1.points.toFixed(2)}</td>
            <td>Total</td><td>{team2.points.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}