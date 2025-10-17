import React, { useState, useEffect } from "react";
import "./App.css";
import Dropdown from "./components/dropdown";
import TextInput from "./components/TextInput"

export default function App() {
  const [loading, setLoading] = useState(false);
  const [freeAgents, setFreeAgents] = useState([]);
  const [trades, setTrades] = useState([]);
  const [players, setPlayers] = useState([]);
  const [newTeam, setNewTeam] = useState("All Teams");
  const [transaction, setTransactions] = useState("Trades");
  const [leagueId, setLeagueId] = useState("");
  const [dropdownLeagueOptions, setLeagueDropdown] = useState([])
  const [leagueName, setLeagueName] = useState("")
  const [teamsKey, setKey] = useState([])
  const [teams, setTeams] = useState({})
  const [dropdownTeamOptions, setDropdownTeams] = useState([])
  const [leagueType, setLeagueType] = useState("")
  const [rosters, setRosters] = useState([])
  const [year, setYear] = useState("2025")
  const [user, setUser] = useState("")
  const [idUser, setUserId] = useState("");
  const [availableYears, setAvailableYears] = useState(["2025"]);
  const [tradeCount, setTradeCount] = useState(1)

  let Database = require("./data.json");
  const sport = "nfl";
  const weeks = 18;

  const dropdownYearOptions = availableYears.map((y) => ({ label: y }));

  const dropdownTransactionOptions = [
    { label: "Trades" },
    { label: "Free Agent Transactions" },
    { label: "Rosters and Records" }
  ];

  const formatDate = (ms) =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const getKeyByValue = (object, value) =>
    Object.keys(object).find((key) => object[key] === value);

  const handleDropdownTeam = (selectedOption) => {
    setNewTeam(selectedOption.label);
  };
  const handleDropdownTransactions = (selectedOption) => {
    setTransactions(selectedOption.label);
  };

  const handleDropdownLeague = (selectedOption) => {
    setLeagueId(selectedOption.id)
    setLeagueName(selectedOption.label)
    setLeagueType(selectedOption.dynasty)
    fetchAvailableYears(selectedOption.label);
  };

  const handleDropdownYear = (selectedOption) => {
    setYear(selectedOption.label);
  };

  const handleInputSubmit = async (value) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!value) {
      alert("Please enter a username.");
      return;
    }

    try {
      // Fetch the user info by username
      const res = await fetch(`https://api.sleeper.app/v1/user/${value}`);
      if (!res.ok) throw new Error("User not found");

      const json = await res.json();

      // If the response is empty or missing a user_id, show alert
      if (!json || !json.user_id) {
        alert(`No user found matching "${value}".`);
        return;
      }
      const userId = json.user_id;
      // 🔄 Reset state before fetching new data
      setLeagueId("");
      setLeagueName("");
      setLeagueDropdown([]);
      setDropdownTeams([]);
      setTeams({});
      setNewTeam("All Teams");
      setTrades([])
      setTransactions("Trades")
      setKey([])
      setUser(value)
      setUserId(userId)
      setAvailableYears(["2025"])
      setYear("2025")

    } catch (err) {
      console.error("Fetch failed:", err);
      alert(`Nothing matches with the username "${value}".`);
    }
  };

  const fetchAvailableYears = async (selectedLeagueName) => {
    if (!idUser) return;

    const yearsToCheck = ["2025", "2024", "2023"];
    const activeYears = [];

    try {
      for (const y of yearsToCheck) {
        const res = await fetch(`https://api.sleeper.app/v1/user/${idUser}/leagues/nfl/${y}`);
        if (!res.ok) continue;

        const leagues = await res.json();
        const found = leagues.some((l) => l.name === selectedLeagueName);
        if (found) activeYears.push(y);
      }

      // Sort years descending (latest first)
      setAvailableYears(activeYears.sort((a, b) => b - a));

    } catch (err) {
      console.error("Failed to fetch available years:", err);
    }
  };


  useEffect(() => {
    const fetchLeagues = async () => {

      try {
        // Fetch leagues for that user
        const res1 = await fetch(`https://api.sleeper.app/v1/user/${idUser}/leagues/nfl/${year}`);
        const leagues = await res1.json();

        // If no leagues found
        if (!leagues || leagues.length === 0) {
          alert(`User "${user}" has no leagues.`);
        } else {
          const temp = leagues.map((l) => ({
            label: l.name,
            id: l.league_id,
            dynasty: l.settings.taxi_slots > 0 ? "Dynasty" : "Redraft"
          }));

          var check = false
          temp.map((league) => {
            if (league.label == leagueName) {
              setLeagueId(league.id)
              check = true;
            }
          })
          if (!check) {
            setLeagueId("")
            setLeagueDropdown("")
            setLeagueType("")
            setTrades([])
            setKey([])
          }
          setLeagueDropdown(temp);
        }
      } catch (err) {
        console.error(err);
      }
    }
    fetchLeagues();
  }, [year, idUser])

  useEffect(() => {
    if (!leagueId) return;
    // Whenever you change leagues, reset team-related state
    setNewTeam("All Teams");
    setKey([]);
    setTeams({});
    setDropdownTeams([]);
    setTrades([]);
    setFreeAgents([]);
    setRosters([]);
  }, [leagueId]);


  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/players/${sport}`);
        const json = await res.json();
        setPlayers(json);
      } catch (err) {
        console.error(err);
      }
    };
    fetchPlayers();
  }, []);


  useEffect(() => {
    const fetchTransactions = async () => {
      if (!leagueId) return; // ⛔ only fetch when a league is selected
      // Prevent stale fetch if user switches leagues mid-load
      const currentLeague = leagueId;
      setLoading(true);
      let totalFreeAgents = [];
      let totalTrades = [];
      let counter = 0

      try {
        for (let i = 1; i < weeks; i++) {
          const res = await fetch(
            `https://api.sleeper.app/v1/league/${currentLeague}/transactions/${i}`
          );
          if (currentLeague !== leagueId) return; // 🚫 Cancel if league changed mid-fetch
          const json = await res.json();
          const completed = json.filter((t) => t.status === "complete");
          totalFreeAgents.push(
            completed.filter((t) => t.type === "free_agent" || t.type === "waiver").reverse()
          );
          totalTrades.push(
            completed.filter((t) => t.type === "trade").reverse()
          );
          counter = counter + totalTrades[i-1].length
        }
        setTradeCount(counter)

        const users = await fetch(
          `https://api.sleeper.app/v1/league/${leagueId}/users`
        );
        const jsonUsers = await users.json();
        var user = []
        for (let i = 0; i < jsonUsers.length; i++) {
          user.push({ team: jsonUsers[i].metadata.team_name, owner_id: jsonUsers[i].user_id, username: jsonUsers[i].display_name })
        }
        console.log(user, 'users here', jsonUsers)

        const res = await fetch(
          `https://api.sleeper.app/v1/league/${leagueId}/rosters`
        );
        const json = await res.json();
        var roster = []
        for (let i = 0; i < json.length; i++) {
          roster.push({ roster_id: json[i].roster_id, owner_id: json[i].owner_id, players: json[i].players, reserve: json[i].reserve, taxi: json[i].taxi, wins: json[i].settings.wins, losses: json[i].settings.losses })
        }
        console.log(roster, 'rosters here', json)

        var teams = {}
        var key = []
        var dropdownTeams = [{ label: "All Teams" }]
        for (let i = 0; i < user.length; i++) {
          for (let x = 0; x < roster.length; x++) {
            if (user[i].owner_id == roster[x].owner_id) {
              teams[roster[x].roster_id] = user[i].team ? user[i].team : "Team " + user[i].username
              dropdownTeams.push({ label: user[i].team ? user[i].team : "Team " + user[i].username })
              roster[x]["team_name"] = user[i].team ? user[i].team : "Team " + user[i].username
            }
          }
          key.push({ team: user[i].team ? user[i].team : "Team " + user[i].username, username: user[i].username })
        }
        console.log('updated rosters', roster)
        setRosters(roster)

        console.log(teams, 'teams here')
        setTeams(teams)
        setKey(key)
        console.log(key, 'key here')
        setDropdownTeams(dropdownTeams)
        const dbMap = Object.fromEntries(
          Database.map((d) => [d.transactionId, d.notes])
        );

        totalTrades = totalTrades.map((tradeGroup) =>
          tradeGroup.map((trade) => ({
            ...trade,
            notes: dbMap[trade.transaction_id] ?? trade.notes,
          }))
        );

        if (newTeam === "All Teams") {
          setTrades(totalTrades);
          setFreeAgents(totalFreeAgents);
          setRosters(roster)
        } else {
          const key = getKeyByValue(teams, newTeam);
          if (!key) return;

          const filteredTrades = totalTrades.map((tradeGroup) =>
            tradeGroup.filter((trade) =>
              trade.consenter_ids?.includes(Number(key))
            )
          );
          const filteredAgents = totalFreeAgents.map((agentGroup) =>
            agentGroup.filter(
              (drop) =>
                drop.roster_ids?.includes(Number(key)) ||
                drop.consenter_ids?.includes(Number(key))
            )
          );
          roster = [roster[key - 1]]

          setTrades(filteredTrades);
          setFreeAgents(filteredAgents);
          setRosters(roster)
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [newTeam, leagueId, transaction]);

  function useMediaQuery(query) {
    const mediaQuery = window.matchMedia(query);
    const [matches, setMatches] = useState(mediaQuery.matches);
  
    useEffect(() => {
      const handler = (e) => setMatches(e.matches);
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }, [mediaQuery]);
  
    return matches;
  }

  const isMobile = useMediaQuery('(max-width: 600px)');

  const divStyle = {
    display: isMobile ? "": "flex",
    gap: "10px",
    justifyContent: "center",
    margin: isMobile ? "1rem" : ""
  };

  return (
    <div>
      <main className="p-4">
        <h1
          className="text-2xl font-bold mb-4"
          style={{ textAlign: "center" }}
        >
          The International Football League
        </h1>
        <div style={{ textAlign: "center", marginTop: "2rem" }}>
          <TextInput onSubmitValue={handleInputSubmit} />
          <button
            onClick={() => {
              if (user) {
                setUser("");
                setLeagueId("");
                setLeagueDropdown([]);
                setDropdownTeams([]);
                setTeams({});
                setTrades([]);
                setFreeAgents([]);
                setKey([])
                alert("User data cleared.");
              }
            }}
            style={{
              position: "relative",
              width: "200px",
              cursor: "pointer",
              fontFamily: "sans-serif",
              justifyContent: "space-between",
              alignItems: "center",
              border: "1px solid #aaa",
              borderRadius: "6px",
              padding: "8px 12px",
              margin: "10px auto",
              backgroundColor: "white",
              fontSize: "15px"
            }}
          >
            Logout & Clear Data
          </button>
          </div>

          {user.length > 0 ?
          
            <div
              style={divStyle}
            >
              <p>Welcome {user}</p>
              <Dropdown
                placeholder={"Select a League"}
                options={dropdownLeagueOptions}
                onSelect={handleDropdownLeague}
                style={divStyle}
                resetTrigger={user} // 👈 this resets when username changes
              />
              {availableYears.length > 1 && (
                <Dropdown
                  placeholder={"Select a year"}
                  options={dropdownYearOptions}
                  onSelect={handleDropdownYear}
                  // resetTrigger={leagueId}
                  value = {year}
                />
              )}

              <Dropdown
                placeholder={"Select a team"}
                options={dropdownTeamOptions}
                onSelect={handleDropdownTeam}
                resetTrigger={leagueId} // 👈 resets when league changes
              />
              <Dropdown
                placeholder={"Select a view"}
                options={dropdownTransactionOptions}
                onSelect={handleDropdownTransactions}
                resetTrigger={user}
              />
            </div>
            : null}

        {loading ? (
          <p style={{ textAlign: "center" }}>Loading...</p>
        ) : (
          <div>
            {transaction === "Trades" ? (
              // ---------- SHOW TRADES ----------
              tradeCount > 0 ? trades.map((week, weekIdx) =>
                week.length === 0 ? null : (
                  <div key={weekIdx} className="my-4">
                    <h3 style={{ textAlign: "center" }}>Week {weekIdx + 1} Trades</h3>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Team</th>
                          <th>Players</th>
                          {leagueType == "Dynasty" ? <th>Draft Picks</th> : null}
                          {leagueName == "The International Football League" ? <th>Notes</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {week.map((trade, tradeIdx) => {
                          const teamIds = Object.values(trade.consenter_ids || {});
                          const playerGroups = teamIds.map(() => []);
                          const draftGroups = teamIds.map(() => []);

                          if (trade.adds) {
                            Object.entries(trade.adds).forEach(([pid, owner]) => {
                              const idx = teamIds.indexOf(owner);
                              if (idx >= 0) playerGroups[idx].push(pid);
                            });
                          }

                          if (trade.draft_picks) {
                            trade.draft_picks.forEach((pick) => {
                              const idx = teamIds.indexOf(pick.owner_id);
                              if (idx >= 0) draftGroups[idx].push(pick);
                            });
                          }

                          const rows = [];
                          teamIds.forEach((teamId, i) => {
                            playerGroups[i].forEach((pid) => {
                              rows.push({
                                teamId,
                                player: players[pid]?.full_name ?? pid,
                                pick: null,
                              });
                            });
                            draftGroups[i].forEach((pick) => {
                              rows.push({
                                teamId,
                                player: null,
                                pick: `${pick.season} Round ${pick.round} via ${teams[pick.roster_id]}`,
                              });
                            });
                          });

                          return (
                            <React.Fragment key={tradeIdx}>
                              {rows.map((row, rowIdx) => (
                                <tr
                                  key={rowIdx}
                                  style={
                                    rowIdx === rows.length - 1
                                      ? { borderBottom: "5px solid #444" }
                                      : {}
                                  }
                                >
                                  {rowIdx === 0 && (
                                    <td rowSpan={rows.length}>
                                      {formatDate(trade.created)}
                                    </td>
                                  )}
                                  <td>{teams[row.teamId]}</td>
                                  <td>{row.player}</td>
                                  {leagueType == "Dynasty" ? <td>{row.pick}</td> : null}
                                  {rowIdx === 0 && leagueName == "The International Football League" && (
                                    <td rowSpan={rows.length}>
                                      {trade.notes || "No Notes"}
                                    </td>
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
              ) : <h3 style={{ textAlign: "center" }}>No Trades Yet!</h3>
            ) : transaction === "Free Agent Transactions" ? (
              // ---------- SHOW FREE AGENT DROPS ----------
              freeAgents.map((week, weekIdx) =>
                week.length === 0 ? null : (
                  <div key={weekIdx} className="my-4">
                    <h3 style={{ textAlign: "center" }}>
                      Week {weekIdx + 1} Free Agents
                    </h3>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Team</th>
                          <th>Added</th>
                          <th>Dropped</th>
                        </tr>
                      </thead>
                      <tbody>
                        {week.map((fa, idx) => {
                          var adds = fa.adds
                            ? Object.keys(fa.adds).map(
                              (pid) => players[pid]?.full_name ?? pid
                            )
                            : [];
                          if (fa.settings ? "waiver_bid" in fa.settings : null) {
                            adds[0] = adds[0] + " - $" + fa.settings.waiver_bid
                          }

                          const drops = fa.drops
                            ? Object.keys(fa.drops).map(
                              (pid) => players[pid]?.full_name ?? pid
                            )
                            : [];

                          const teamId = fa.roster_ids?.[0];
                          const rowCount = Math.max(adds.length, drops.length) || 1;

                          return (
                            <React.Fragment key={idx}>
                              {[...Array(rowCount)].map((_, i) => (
                                <tr key={`${idx}-${i}`}>
                                  {i === 0 && (
                                    <td rowSpan={rowCount}>{formatDate(fa.created)}</td>
                                  )}
                                  <td>{teams[teamId]}</td>
                                  <td>{adds[0] ?? ""}</td>
                                  <td>{drops[0] ?? ""}</td>
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
            ) : (// ---------- SHOW ROSTERS ----------

              rosters.map((roster, rosterIdx) => {
                const playerList = roster.players || [];
                const irList = roster.reserve || [];
                const taxiList = roster.taxi || [];

                // find the longest list length to balance table rows
                const maxLen = Math.max(
                  playerList.length,
                  irList.length,
                  taxiList.length
                );

                return (
                  <div key={rosterIdx} className="my-4">
                    <h3 style={{ textAlign: "center" }}>
                      {roster.team_name} - Record: {roster.wins}-{roster.losses}
                    </h3>
                    <table
                      className="custom-table"
                    >
                      <thead>
                        <tr>
                          <th>Players</th>
                          <th>IR</th>
                          {leagueType === "Dynasty" ? <th>Taxi</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {[...Array(maxLen)].map((_, i) => (
                          <tr key={i}>
                            <td>{players[playerList[i]]?.first_name ?? ""} {players[playerList[i]]?.last_name ?? ""}</td>
                            <td>{players[irList[i]]?.full_name ?? ""}</td>
                            {leagueType === "Dynasty" ? (
                              <td>{players[taxiList[i]]?.full_name ?? ""}</td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })
            )}
            <br />
            <br />
            <table className="custom-table" style={{ width: "30%", marginLeft: "auto", marginRight: "auto" }}>
              <thead>
                <tr>
                  {teamsKey.length > 0 ? <th>Team</th> : null}
                  {teamsKey.length > 0 ? <th>Username</th> : null}
                </tr>
              </thead>
              <tbody>
                {teamsKey.map((team, i) => (
                  <tr>
                    <td>{team.team}</td>
                    <td>{team.username}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <br />
            <br />
          </div>
        )}
      </main>
    </div>
  );
}
