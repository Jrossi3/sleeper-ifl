import React, { useState, useEffect } from "react";
import "./App.css";
import Dropdown from "./components/dropdown";
import TextInput from "./components/TextInput"

export default function App() {
  const [loading, setLoading] = useState(true);
  const [freeAgents, setFreeAgents] = useState([]);
  const [trades, setTrades] = useState([]);
  const [players, setPlayers] = useState([]);
  const [newTeam, setNewTeam] = useState("All Teams");
  const [transaction, setTransactions] = useState("Trades");
  const [leagueId, setLeagueId] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [dropdownLeagueOptions, setLeagueDropdown] = useState([])
  const [leagueName, setLeagueName] = useState("")
  const [userLeagues, setUserLeagues] = useState([]);
  const [users, setUsers] = useState([])
  const [teams, setTeams] = useState({})
  const [dropdownTeamOptions, setDropdownTeams] = useState([])
  let Database = require("./data.json");
  const sport = "nfl";

  const leagueId2023 = "991037254564958208";
  const leagueId2024 = "1048193774259703808";
  const leagueId2025 = "1181024367924011008";
  const weeks = 18;

  const dropdownYearOptions = [
    { label: "2025" },
    { label: "2024" },
    { label: "2023" },
  ];

  const dropdownTransactionOptions = [
    { label: "Trades" },
    { label: "Free Agent Drops" }
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
  };

  const handleDropdownYear = (selectedOption) => {
    if (selectedOption.label === "2025") {
      setLeagueId(leagueId2025);
    } else if (selectedOption.label === "2024") {
      setLeagueId(leagueId2024);
    } else {
      setLeagueId(leagueId2023);
    }
  };
  const handleInputSubmit = async (value) => {
    if (!value) {
      alert("Please enter a username.");
      return;
    }

    // 🔄 Reset state before fetching new data
    setLeagueId("");
    setLeagueName("");
    setLeagueDropdown([]);
    setUserLeagues([]);
    setDropdownTeams([]);
    setTeams({});
    setNewTeam("All Teams");
    setTrades([])
    setTransactions("Trades")
  
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
  
      // Fetch leagues for that user
      const userId = json.user_id;
      const res1 = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/2025`);
      const leagues = await res1.json();
  
      // If no leagues found
      if (!leagues || leagues.length === 0) {
        alert(`User "${value}" has no leagues.`);
      } else {
        const temp = leagues.map((l) => ({
          label: l.name,
          id: l.league_id,
        }));
  
        setUserLeagues(leagues);
        setLeagueDropdown(temp);
        setSubmittedText(value);
      }
    } catch (err) {
      console.error("Fetch failed:", err);
      alert(`Nothing matches with the username "${value}".`);
    }
  };


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
      setLoading(true);
      let totalFreeAgents = [];
      let totalTrades = [];

      try {
        for (let i = 1; i < weeks; i++) {
          const res = await fetch(
            `https://api.sleeper.app/v1/league/${leagueId}/transactions/${i}`
          );
          const json = await res.json();
          const completed = json.filter((t) => t.status === "complete");
          totalFreeAgents.push(
            completed.filter((t) => t.type === "free_agent").reverse()
          );
          totalTrades.push(
            completed.filter((t) => t.type === "trade").reverse()
          );
        }

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
          roster.push({ roster_id: json[i].roster_id, owner_id: json[i].owner_id })
        }
        console.log(roster, 'rosters here')

        var teams = {}
        var dropdownTeams = [{ label: "All Teams" }]
        for (let i = 0; i < user.length; i++) {
          for (let x = 0; x < roster.length; x++) {
            if (user[i].owner_id == roster[x].owner_id) {
              teams[roster[x].roster_id] = user[i].team ? user[i].team : "Team " + user[i].username
              dropdownTeams.push({ label: user[i].team ? user[i].team : "Team " + user[i].username })
            }
          }
        }
        console.log(teams, 'teams here')
        setTeams(teams)
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

          setTrades(filteredTrades);
          setFreeAgents(filteredAgents);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [newTeam, leagueId, transaction]);

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
          {submittedText.length > 0 ?
            <div
              style={{ display: "flex", gap: "10px", justifyContent: "center" }}
            >
              <p>Welcome {submittedText}</p>
              <Dropdown
                placeholder={"Select a League"}
                options={dropdownLeagueOptions}
                onSelect={handleDropdownLeague}
                resetTrigger={submittedText} // 👈 this resets when username changes
              />
              {leagueName == "The International Football League" ? <Dropdown
                placeholder={"Select a year"}
                options={dropdownYearOptions}
                onSelect={handleDropdownYear}
              /> : null}
            </div>
            : null}
        </div>
        <div
          style={{ display: "flex", gap: "10px", justifyContent: "center" }}
        >
          <Dropdown
            placeholder={"Select a team"}
            options={dropdownTeamOptions}
            onSelect={handleDropdownTeam}
            resetTrigger={leagueId} // 👈 resets when league changes
          />
          <Dropdown
            placeholder={"Select a transaction"}
            options={dropdownTransactionOptions}
            onSelect={handleDropdownTransactions}
            resetTrigger={leagueId}
          />
        </div>

        {loading ? (
          <p>Loading Transactions...</p>
        ) : (
          <div>
            {transaction === "Trades" ? (
              // ---------- SHOW TRADES ----------
              trades.map((week, weekIdx) =>
                week.length === 0 ? null : (
                  <div key={weekIdx} className="my-4">
                    <h3 style={{ textAlign: "center" }}>Week {weekIdx + 1} Trades</h3>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Team</th>
                          <th>Players</th>
                          <th>Draft Picks</th>
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
                                  <td>{row.pick}</td>
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
              )
            ) : (
              // ---------- SHOW FREE AGENT DROPS ----------
              freeAgents.map((week, weekIdx) =>
                week.length === 0 ? null : (
                  <div key={weekIdx} className="my-4">
                    <h3 style={{ textAlign: "center" }}>
                      Week {weekIdx + 1} Free Agent Drops
                    </h3>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Team</th>
                          <th>Dropped</th>
                        </tr>
                      </thead>
                      <tbody>
                        {week.map((fa, idx) => {
                          const drops = fa.drops
                            ? Object.keys(fa.drops).map(
                              (pid) => players[pid]?.full_name ?? pid
                            )
                            : [];
                          const teamId = fa.roster_ids?.[0];

                          return drops.map((dropName, i) => (
                            <tr
                              key={`${idx}-${i}`}
                            >
                              {i === 0 && (
                                <td rowSpan={drops.length}>{formatDate(fa.created)}</td>
                              )}
                              <td>{teams[teamId]}</td>
                              <td>{dropName}</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )
            )}

          </div>
        )}
      </main>
    </div>
  );
}
