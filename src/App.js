import React, { useState, useEffect } from "react";
import "./App.css";
import Dropdown from "./components/dropdown";
import TextInput from "./components/TextInput";
import GridDisplay from "./components/GridDisplays";

// ── Helpers ───────────────────────────────────────────────────────────────────

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, [query]);
  return matches;
}

const formatDate = (ms) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const getKeyByValue = (obj, val) => Object.keys(obj).find((k) => obj[k] === val);

/**
 * Reconstructs current draft pick ownership by replaying Sleeper's traded_picks log.
 * Returns picks owned by rosterId, or all picks if rosterId is null.
 */
async function getDynastyPicks(leagueId, rosterId, years, totalTeams, rounds = 4) {
  const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`);
  if (!res.ok) throw new Error(`traded_picks fetch failed: ${res.status}`);
  const tradedPicks = await res.json();

  const picks = [];
  for (const year of years) {
    for (let team = 1; team <= totalTeams; team++) {
      for (let round = 1; round <= rounds; round++) {
        const lastTrade = tradedPicks
          .filter((p) => p.season === String(year) && p.round === round && p.roster_id === team)
          .at(-1);
        const currentOwner = lastTrade ? lastTrade.owner_id : team;
        if (rosterId == null || currentOwner === Number(rosterId)) {
          picks.push({ season: year, round, originalTeam: team, currentOwner, wasTraded: !!lastTrade });
        }
      }
    }
  }
  return picks;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const playerDatabase = require("./playerData.json");
  const Database = require("./data.json");

  const [loading, setLoading] = useState(false);
  const [players] = useState(playerDatabase);
  const [trades, setTrades] = useState([]);
  const [freeAgents, setFreeAgents] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [teams, setTeams] = useState({});
  const [teamsKey, setKey] = useState([]);
  const [dropdownTeamOptions, setDropdownTeams] = useState([]);
  const [dynastyPicks, setDynastyPicks] = useState([]);
  const [matchups, setMatchups] = useState([]);

  const [user, setUser] = useState("");
  const [idUser, setUserId] = useState("");
  const [leagueId, setLeagueId] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [leagueType, setLeagueType] = useState("");
  const [positions, setLeaguePositions] = useState([]);
  const [dropdownLeagueOptions, setLeagueDropdown] = useState([]);

  const [year, setYear] = useState("2026");
  const [availableYears, setAvailableYears] = useState(["2026"]);
  const [newTeam, setNewTeam] = useState("All Teams");
  const [transaction, setTransactions] = useState("Trades");
  const [tradeCount, setTradeCount] = useState(1);

  const [activeWeek, setActiveWeek] = useState(0);
  const [weekChecker, setWeekChecker] = useState(false);
  const [dropdownWeeks, setDropdownWeeks] = useState([]);
  const weeks = 17;

  const isMobile = useMediaQuery("(max-width: 600px)");

  // ── Derived options ───────────────────────────────────────────────────────────

  const dropdownYearOptions = availableYears.map((y) => ({ label: y }));
  const dropdownWeekOptions = dropdownWeeks.map((w) => ({ label: `Week ${w}`, value: w }));
  const dropdownTransactionOptions = [
    { label: "Trades" },
    { label: "Free Agent Transactions" },
    { label: "Rosters and Records" },
    { label: "Matchups" },
    ...(leagueType === "Dynasty" ? [{ label: "Draft Picks" }] : []),
  ];

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const clearButton = () => {
    if (!user) return;
    setUser(""); 
    setUserId(""); 
    setLeagueId(""); 
    setLeagueName("");
    setLeagueDropdown([]); 
    setDropdownTeams([]); 
    setTeams({});
    setTrades([]); 
    setFreeAgents([]); 
    setKey([]); 
    setRosters([]);
    setMatchups([]); 
    setDynastyPicks([]); 
    setActiveWeek(0); 
    setWeekChecker(false);
    alert("User data cleared.");
  };

  const handleDropdownLeague = (opt) => {
    setLeagueId(opt.id);
    setLeagueName(opt.label);
    setLeagueType(opt.dynasty);
    setLeaguePositions(opt.roster);
    fetchAvailableYears(opt.label);
  };

  // ── Data fetching ─────────────────────────────────────────────────────────────

  const handleInputSubmit = async (value) => {
    await new Promise((r) => setTimeout(r, 500));
    if (!value) { alert("Please enter a username."); return; }
    try {
      const res = await fetch(`https://api.sleeper.app/v1/user/${value}`);
      if (!res.ok) throw new Error("User not found");
      const json = await res.json();
      if (!json?.user_id) { alert(`No user found matching "${value}".`); return; }

      setLeagueId(""); setLeagueName(""); setLeagueDropdown([]); setDropdownTeams([]);
      setTeams({}); setNewTeam("All Teams"); setTrades([]); setTransactions("Trades");
      setKey([]); setUser(value); setUserId(json.user_id);
      setAvailableYears(["2026"]); setYear("2026"); setWeekChecker(false); setMatchups([]);
    } catch {
      alert(`Nothing matches with the username "${value}".`);
    }
  };

  const fetchAvailableYears = async (selectedLeagueName) => {
    if (!idUser) return;
    const yearsToCheck = ["2026", "2025", "2024", "2023", "2022", "2021"];
    try {
      const results = await Promise.all(
        yearsToCheck.map((y) =>
          fetch(`https://api.sleeper.app/v1/user/${idUser}/leagues/nfl/${y}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((leagues) => (leagues.some((l) => l.name === selectedLeagueName) ? y : null))
        )
      );
      setAvailableYears(results.filter(Boolean).sort((a, b) => b - a));
    } catch (err) {
      console.error("Failed to fetch available years:", err);
    }
  };

  // Fetch leagues when year or user changes
  useEffect(() => {
    if (!idUser) return;
    const fetchLeagues = async () => {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/user/${idUser}/leagues/nfl/${year}`);
        const leagues = await res.json();
        if (!leagues?.length) { alert(`User "${user}" has no leagues.`); return; }

        const temp = leagues.map((l) => ({
          label: l.name,
          id: l.league_id,
          dynasty: l.settings.taxi_slots > 0 ? "Dynasty" : "Redraft",
          roster: l.roster_positions.filter((p) => p !== "BN"),
        }));

        const match = temp.find((l) => l.label === leagueName);
        if (match) {
          setLeagueId(match.id);
        } else {
          setLeagueId(""); setLeagueDropdown(""); setLeagueType(""); setTrades([]); setKey([]);
        }
        setLeagueDropdown(temp);
      } catch (err) {
        console.error(err);
      }
    };
    fetchLeagues();
  }, [year, idUser]);

  // Reset team state when league changes
  useEffect(() => {
    if (!leagueId) return;
    setKey([]); setTeams({}); setDropdownTeams([]); setTrades([]);
    setFreeAgents([]); setRosters([]); setNewTeam(""); setDynastyPicks([]);
  }, [leagueId]);

  // Fetch matchups
  useEffect(() => {
    if (!leagueId) return;
    const currentLeague = leagueId;
    const fetchMatchups = async () => {
      try {
        const stateRes = await fetch("https://api.sleeper.app/v1/state/nfl");
        const nflState = await stateRes.json();

        let currentWeek;
        if (year === "2026") {
          const maxWeek = nflState.week;
          setDropdownWeeks(Array.from({ length: maxWeek }, (_, i) => i + 1));
          currentWeek = activeWeek > maxWeek ? maxWeek : (activeWeek && weekChecker ? activeWeek : maxWeek);
          setActiveWeek(currentWeek);
        } else {
          setDropdownWeeks(Array.from({ length: 17 }, (_, i) => i + 1));
          currentWeek = activeWeek && weekChecker ? activeWeek : 17;
          setActiveWeek(currentWeek);
        }

        const res = await fetch(`https://api.sleeper.app/v1/league/${currentLeague}/matchups/${currentWeek}`);
        const json = await res.json();

        const paired = [];
        for (let i = 0; i < json.length; i++) {
          const mid = json[i].matchup_id;
          if (!mid) continue;
          for (let x = i + 1; x < json.length; x++) {
            if (json[x].matchup_id === mid) {
              paired.push({
                matchupId: mid,
                team1: { teamId: json[i].roster_id, starters: json[i].starters, points: json[i].points, players_points: json[i].players_points, players: json[i].players },
                team2: { teamId: json[x].roster_id, starters: json[x].starters, points: json[x].points, players_points: json[x].players_points, players: json[x].players },
              });
            }
          }
        }

        if (!newTeam || newTeam === "All Teams") {
          setMatchups(paired);
        } else {
          const key = getKeyByValue(teams, newTeam);
          setMatchups(paired.filter((m) => m.team1.teamId.toString() === key || m.team2.teamId.toString() === key));
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchMatchups();
  }, [activeWeek, leagueId, transaction, newTeam]);

  // Fetch transactions, rosters, and users
  useEffect(() => {
    if (!leagueId) return;
    const currentLeague = leagueId;
    setLoading(true);

    const fetchTransactions = async () => {
      try {
        // All weeks fetched in parallel
        const weekResults = await Promise.all(
          Array.from({ length: weeks }, (_, i) =>
            fetch(`https://api.sleeper.app/v1/league/${currentLeague}/transactions/${i + 1}`)
              .then((r) => r.json())
              .then((json) => json.filter((t) => t.status === "complete"))
          )
        );
        if (currentLeague !== leagueId) return;

        let totalFreeAgents = weekResults.map((week) =>
          week.filter((t) => t.type === "free_agent" || t.type === "waiver").reverse()
        );
        let totalTrades = weekResults.map((week) => week.filter((t) => t.type === "trade").reverse());
        setTradeCount(totalTrades.reduce((sum, w) => sum + w.length, 0));

        // Users + Rosters in parallel
        const [usersRes, rostersRes] = await Promise.all([
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`).then((r) => r.json()),
          fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`).then((r) => r.json()),
        ]);

        const userList = usersRes.map((u) => ({
          team: u.metadata.team_name,
          owner_id: u.user_id,
          username: u.display_name,
        }));
        let roster = rostersRes.map((r) => ({
          roster_id: r.roster_id,
          owner_id: r.owner_id,
          players: r.players,
          reserve: r.reserve,
          taxi: r.taxi,
          wins: r.settings.wins,
          losses: r.settings.losses,
        }));

        const teamsMap = {};
        const dropdownTeams = [{ label: "All Teams" }];
        const keyArr = [];

        for (const u of userList) {
          const teamName = u.team || `Team ${u.username}`;
          const match = roster.find((r) => r.owner_id === u.owner_id);
          if (match) {
            teamsMap[match.roster_id] = teamName;
            dropdownTeams.push({ label: teamName });
            match.team_name = teamName;
          }
          keyArr.push({ team: teamName, username: u.username });
        }

        setRosters(roster);
        setTeams(teamsMap);
        setKey(keyArr);
        setDropdownTeams(dropdownTeams);

        // Annotate trades with local notes
        const dbMap = Object.fromEntries(Database.map((d) => [d.transactionId, d.notes]));
        totalTrades = totalTrades.map((group) =>
          group.map((t) => ({ ...t, notes: dbMap[t.transaction_id] ?? t.notes }))
        );

        if (!newTeam || newTeam === "All Teams") {
          setTrades(totalTrades);
          setFreeAgents(totalFreeAgents);
          setRosters(roster);
        } else {
          const key = getKeyByValue(teamsMap, newTeam);
          if (!key) return;
          setTrades(totalTrades.map((g) => g.filter((t) => t.consenter_ids?.includes(Number(key)))));
          setFreeAgents(totalFreeAgents.map((g) => g.filter((t) => t.roster_ids?.includes(Number(key)) || t.consenter_ids?.includes(Number(key)))));
          setRosters([roster[key - 1]]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [newTeam, leagueId, transaction, activeWeek, year]);

  // Fetch dynasty picks
  useEffect(() => {
    if (!leagueId || leagueType !== "Dynasty" || !rosters.length) return;
    const currentYear = parseInt(year, 10);
    const years = [currentYear, currentYear + 1, currentYear + 2];
    const rosterId = newTeam && newTeam !== "All Teams" ? getKeyByValue(teams, newTeam) : null;

    getDynastyPicks(leagueId, rosterId, years, rosters.length)
      .then(setDynastyPicks)
      .catch((err) => console.error("Failed to fetch dynasty picks:", err));
  }, [leagueId, leagueType, newTeam, rosters, year]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const divStyle = {
    display: isMobile ? "" : "flex",
    gap: "10px",
    justifyContent: "center",
    margin: isMobile ? "1rem" : "",
  };

  return (
    <div>
      <main className="p-4">
        <h1 className="text-2xl font-bold mb-4" style={{ textAlign: "center" }}>
          The International Football League
        </h1>

        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <TextInput onSubmitValue={handleInputSubmit} />
          <button className="clear-button" onClick={clearButton}>Logout & Clear Data</button>
        </div>

        {user.length > 0 && (
          <div style={divStyle}>
            <p>Welcome {user}</p>
            <Dropdown placeholder="Select a League" options={dropdownLeagueOptions} onSelect={handleDropdownLeague} resetTrigger={user} />

            {leagueName && (
              <>
                {availableYears.length > 1 && (
                  <Dropdown placeholder="Select a year" options={dropdownYearOptions} onSelect={(o) => setYear(o.label)} value={year} />
                )}
                <Dropdown placeholder="Select a team" options={dropdownTeamOptions} onSelect={(o) => setNewTeam(o.label)} resetTrigger={leagueId} />
                <Dropdown placeholder="Select a view" options={dropdownTransactionOptions} onSelect={(o) => setTransactions(o.label)} resetTrigger={user} />
                {transaction === "Matchups" && (
                  <Dropdown
                    placeholder="Select a week"
                    options={dropdownWeekOptions}
                    onSelect={(o) => { setActiveWeek(o.value); setWeekChecker(true); }}
                    resetTrigger={year}
                  />
                )}
              </>
            )}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: "center" }}>Loading...</p>
        ) : user && leagueId ? (
          <div style={{ textAlign: "center" }}>
            <h3>Starting Positions</h3>
            <GridDisplay items={positions} />

            <div>
              {/* ── Trades ── */}
              {transaction === "Trades" && (
                tradeCount > 0
                  ? trades.map((week, weekIdx) =>
                    week.length === 0 ? null : (
                      <div key={weekIdx} className="my-4">
                        <h3 style={{ textAlign: "center" }}>Week {weekIdx + 1} Trades</h3>
                        <table className="custom-table">
                          <thead>
                            <tr>
                              <th>Date</th><th>Team</th><th>Players</th>
                              {leagueType === "Dynasty" && <th>Draft Picks</th>}
                              {leagueName === "The International Football League" && year <= "2025" && <th>Notes</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {week.map((trade, tradeIdx) => {
                              const teamIds = Object.values(trade.consenter_ids || {});
                              const playerGroups = teamIds.map(() => []);
                              const draftGroups = teamIds.map(() => []);

                              Object.entries(trade.adds || {}).forEach(([pid, owner]) => {
                                const idx = teamIds.indexOf(owner);
                                if (idx >= 0) playerGroups[idx].push(pid);
                              });
                              (trade.draft_picks || []).forEach((pick) => {
                                const idx = teamIds.indexOf(pick.owner_id);
                                if (idx >= 0) draftGroups[idx].push(pick);
                              });

                              const rows = teamIds.flatMap((teamId, i) => [
                                ...playerGroups[i].map((pid) => ({ teamId, player: players[pid]?.full_name ?? pid, pick: null })),
                                ...draftGroups[i].map((pick) => ({ teamId, player: null, pick: `${pick.season} Round ${pick.round} via ${teams[pick.roster_id]}` })),
                              ]);

                              return (
                                <React.Fragment key={tradeIdx}>
                                  {rows.map((row, rowIdx) => (
                                    <tr key={rowIdx} style={rowIdx === rows.length - 1 ? { borderBottom: "5px solid #444" } : {}}>
                                      {rowIdx === 0 && <td rowSpan={rows.length}>{formatDate(trade.created)}</td>}
                                      <td>{teams[row.teamId]}</td>
                                      <td>{row.player}</td>
                                      {leagueType === "Dynasty" && <td>{row.pick}</td>}
                                      {rowIdx === 0 && leagueName === "The International Football League" && year <= "2025" && (
                                        <td rowSpan={rows.length}>{trade.notes || "No Notes"}</td>
                                      )}
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  )
                  : <h3 style={{ textAlign: "center" }}>No Trades Yet!</h3>
              )}

              {/* ── Free Agents ── */}
              {transaction === "Free Agent Transactions" &&
                freeAgents.map((week, weekIdx) =>
                  week.length === 0 ? null : (
                    <div key={weekIdx} className="my-4">
                      <h3 style={{ textAlign: "center" }}>Week {weekIdx + 1} Free Agents</h3>
                      <table className="custom-table">
                        <thead><tr><th>Date</th><th>Team</th><th>Added</th><th>Dropped</th></tr></thead>
                        <tbody>
                          {week.map((fa, idx) => {
                            const adds = fa.adds ? Object.keys(fa.adds).map((pid) => players[pid]?.full_name ?? pid) : [];
                            if (fa.settings && "waiver_bid" in fa.settings) adds[0] = `${adds[0]} - $${fa.settings.waiver_bid}`;
                            const drops = fa.drops ? Object.keys(fa.drops).map((pid) => players[pid]?.full_name ?? pid) : [];
                            const teamId = fa.roster_ids?.[0];
                            const rowCount = Math.max(adds.length, drops.length) || 1;
                            return (
                              <React.Fragment key={idx}>
                                {[...Array(rowCount)].map((_, i) => (
                                  <tr key={`${idx}-${i}`}>
                                    {i === 0 && <td rowSpan={rowCount}>{formatDate(fa.created)}</td>}
                                    <td>{teams[teamId]}</td>
                                    <td>{adds[i] ?? ""}</td>
                                    <td>{drops[i] ?? ""}</td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )
              }

              {/* ── Draft Picks ── */}
              {transaction === "Draft Picks" && (() => {
                if (!dynastyPicks.length) return <h3 style={{ textAlign: "center" }}>No dynasty picks data available.</h3>;
                const ownerNames = newTeam && newTeam !== "All Teams"
                  ? [newTeam]
                  : [...new Set(dynastyPicks.map((p) => teams[p.currentOwner] || `Roster ${p.currentOwner}`))].sort();
                return ownerNames.map((ownerName) => {
                  const ownerPicks = dynastyPicks
                    .filter((p) => (teams[p.currentOwner] || `Roster ${p.currentOwner}`) === ownerName)
                    .sort((a, b) => a.season - b.season || a.round - b.round);
                  if (!ownerPicks.length) return null;
                  return (
                    <div key={ownerName} className="my-4">
                      <h3 style={{ textAlign: "center" }}>{ownerName} — Draft Picks</h3>
                      <table className="custom-table">
                        <thead><tr><th>Year</th><th>Round</th><th>Original Team</th><th>Acquired via Trade</th></tr></thead>
                        <tbody>
                          {ownerPicks.map((pick, i) => (
                            <tr key={i}>
                              <td>{pick.season}</td>
                              <td>Round {pick.round}</td>
                              <td>{teams[pick.originalTeam] || `Roster ${pick.originalTeam}`}</td>
                              <td>{pick.wasTraded ? "Yes" : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                });
              })()}

              {/* ── Rosters ── */}
              {transaction === "Rosters and Records" &&
                rosters.map((roster, rosterIdx) => {
                  const playerList = roster.players || [];
                  const irList = roster.reserve || [];
                  const taxiList = roster.taxi || [];
                  const maxLen = Math.max(playerList.length, irList.length, taxiList.length);
                  return (
                    <div key={rosterIdx} className="my-4">
                      <h3 style={{ textAlign: "center" }}>{roster.team_name} - Record: {roster.wins}-{roster.losses}</h3>
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>Players</th><th>IR</th>
                            {leagueType === "Dynasty" && <th>Taxi</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {[...Array(maxLen)].map((_, i) => (
                            <tr key={i}>
                              <td>{players[playerList[i]]?.first_name ?? ""} {players[playerList[i]]?.last_name ?? ""}</td>
                              <td>{players[irList[i]]?.full_name ?? ""}</td>
                              {leagueType === "Dynasty" && <td>{players[taxiList[i]]?.full_name ?? ""}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })
              }

              {/* ── Matchups ── */}
              {transaction === "Matchups" &&
                matchups.map((matchup, matchupIdx) => {
                  const team1Name = teams[matchup.team1.teamId] || "Unknown Team 1";
                  const team2Name = teams[matchup.team2.teamId] || "Unknown Team 2";
                  const t1pts = matchup.team1.points || 0;
                  const t2pts = matchup.team2.points || 0;
                  const t1starters = new Set(matchup.team1.starters || []);
                  const t2starters = new Set(matchup.team2.starters || []);
                  const sortByStarters = (players, starters) => [
                    ...players.filter((p) => starters.has(p)),
                    ...players.filter((p) => !starters.has(p)),
                  ];
                  const sorted1 = sortByStarters(matchup.team1.players || [], t1starters);
                  const sorted2 = sortByStarters(matchup.team2.players || [], t2starters);
                  const maxRows = Math.max(sorted1.length, sorted2.length);
                  const t1Won = t1pts > t2pts, t2Won = t2pts > t1pts;

                  return (
                    <div key={matchupIdx} className="my-4">
                      <h3 style={{ textAlign: "center", marginBottom: "10px" }}>
                        Week {activeWeek} —{" "}
                        <span style={{ color: t1Won ? "green" : t2Won ? "red" : "gray" }}>
                          {t1Won ? `${team1Name} Wins` : t2Won ? `${team2Name} Wins` : "Tie"}
                        </span>
                      </h3>
                      <table className="custom-table" style={{ width: "95%", margin: "auto" }}>
                        <thead>
                          <tr><th colSpan="2">{team1Name}</th><th colSpan="2">{team2Name}</th></tr>
                          <tr><th>Player</th><th>Points</th><th>Player</th><th>Points</th></tr>
                        </thead>
                        <tbody>
                          {[...Array(maxRows)].map((_, i) => {
                            const p1 = sorted1[i], p2 = sorted2[i];
                            const p1d = players[p1], p2d = players[p2];
                            return (
                              <tr key={i}>
                                <td style={{ fontWeight: t1starters.has(p1) ? "bold" : "normal", backgroundColor: t1starters.has(p1) ? "#e6ffe6" : "" }}>
                                  {p1d && <>{p1d.first_name} {p1d.last_name} <span style={{ color: "#888" }}>{p1d.position}</span></>}
                                </td>
                                <td>{p1 && matchup.team1.players_points?.[p1]?.toFixed(2)}</td>
                                <td style={{ fontWeight: t2starters.has(p2) ? "bold" : "normal", backgroundColor: t2starters.has(p2) ? "#e6ffe6" : "" }}>
                                  {p2d && <>{p2d.first_name} {p2d.last_name} <span style={{ color: "#888" }}>{p2d.position}</span></>}
                                </td>
                                <td>{p2 && matchup.team2.players_points?.[p2]?.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                          <tr style={{ fontWeight: "bold", borderTop: "2px solid #444", backgroundColor: "#f8f8f8" }}>
                            <td>Total</td><td>{t1pts.toFixed(2)}</td>
                            <td>Total</td><td>{t2pts.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })
              }
            </div>

            {/* ── Team / Username key ── */}
            <br /><br />
            {teamsKey.length > 0 && (
              <table className="custom-table" style={{ width: "30%", margin: "0 auto" }}>
                <thead><tr><th>Team</th><th>Username</th></tr></thead>
                <tbody>
                  {teamsKey.map((team, i) => (
                    <tr key={i}><td>{team.team}</td><td>{team.username}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <br /><br />
          </div>
        ) : null}
      </main>
    </div>
  );
}