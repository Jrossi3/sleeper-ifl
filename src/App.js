import React, { useState, useEffect } from "react";
import "./App.css";

export default function App() {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [waivers, setWaivers] = useState([]);
  const [trades, setTrades] = useState([]);
  const [players, setPlayers] = useState([]);

  const userId = "1054571285751156736";
  const sport = "nfl";
  const season = "2025";
  const leagueId = "1181024367924011008";
  const weeks = 18;

  var totalWaivers = [];
  var totalTrades = [];
  var teams = {
    1: "Townsend",
    2: "Sierant",
    3: "Luo",
    4: "Yash",
    5: "Maher",
    6: "Ben",
    7: "Yajur",
    8: "Rossi",
    9: "Brinkworth",
    10: "Peter",
  };

  function formatDate(ms) {
    return new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        const res = await fetch(
          `https://api.sleeper.app/v1/user/${userId}/leagues/${sport}/${season}`
        );
        if (!res.ok) throw new Error("Failed to fetch leagues");
        const json = await res.json();
        setLeagues(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeagues();
  }, []);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/players/nfl`);
        if (!res.ok) throw new Error("Failed to fetch players");
        var json = await res.json();
        setPlayers(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  useEffect(() => {
    let fetched = false;
    const fetchTransactions = async () => {
      if (fetched) return;
      fetched = true;

      try {
        for (let i = 1; i < weeks; i++) {
          const res = await fetch(
            `https://api.sleeper.app/v1/league/${leagueId}/transactions/${i}`
          );
          if (!res.ok) throw new Error("Failed to fetch transactions");
          let json = await res.json();
          json = json.filter((league) => league.status === "complete");
          totalWaivers.push(json.filter((league) => league.type === "waiver"));
          totalTrades.push(json.filter((league) => league.type === "trade"));
        }
        setWaivers(totalWaivers);
        setTrades(totalTrades);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, []);

  function containsOnlyLetters(str) {
    return /^[A-Za-z]*$/.test(str);
  }

  return (
    <div>
      <main className="p-4">
        <h1
          style={{ textAlign: "center" }}
          className="text-2xl font-bold mb-4"
        >
          The International Football League
        </h1>
        {loading ? (
          <p>Loading Transactions...</p>
        ) : leagues.length === 0 ? (
          <p>No leagues found for this user.</p>
        ) : (
          <div>
            {/* Waivers Table */}
            <h2 style={{ textAlign: "center" }}>Waivers</h2>
            {waivers.map((week, weekIdx) => {
              if (!week || week.length === 0) return null;
              return (
                <div key={`week-${weekIdx}`} className="my-4">
                  <h3 style={{ textAlign: "center" }}>
                    Week {weekIdx + 1}
                  </h3>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Team</th>
                        <th>Added</th>
                        <th>Dropped</th>
                        <th>Bid</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {week.map((player, playerIdx) => {
                        const key = `${weekIdx}-${playerIdx}-${player.status}`;
                        const isPlayer = !containsOnlyLetters(
                          Object.keys(player.adds)
                        );

                        return (
                          <tr key={key}>
                            <td>{formatDate(player.created)}</td>
                            <td>{teams[parseInt(player.consenter_ids[0])]}</td>
                            <td>
                              {isPlayer
                                ? players[Object.keys(player.adds)]?.full_name
                                : players[Object.keys(player.adds)]?.team}
                            </td>
                            <td>
                              {player.drops !== null
                                ? isPlayer
                                  ? players[Object.keys(player.drops)]
                                    ?.full_name
                                  : players[Object.keys(player.drops)]?.team
                                : "-"}
                            </td>
                            <td>{player.settings.waiver_bid}</td>
                            <td>
                              {isPlayer ? "Player Waiver" : "Defensive Waiver"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}

            {/* Trades Table */}
            {/* Trades Table */}
            <h2 style={{ textAlign: "center" }}>Trades</h2>
            {trades.map((week, weekIdx) => {
              if (!week || week.length === 0) return null;
              return (
                <div key={`week-${weekIdx}`} className="my-4">
                  <h3 style={{ textAlign: "center" }}>Week {weekIdx + 1}</h3>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Team</th>
                        <th>Players</th>
                        <th>Draft Picks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {week.map((trade, tradeIdx) => {
                        let team1 = [];
                        let team2 = [];
                        let team3 = [];
                        let draft1 = [];
                        let draft2 = [];
                        let draft3 = [];

                        const teamOne = Object.values(trade.consenter_ids ?? {})[0];
                        const teamTwo = Object.values(trade.consenter_ids ?? {})[1];

                        if (trade.adds) {
                          for (let i = 0; i < Object.keys(trade.adds).length; i++) {
                            if (Object.values(trade.adds)[i] === teamOne) {
                              team1.push(Object.keys(trade.adds)[i]);
                            } else if (Object.values(trade.adds)[i] === teamTwo) {
                              team2.push(Object.keys(trade.adds)[i]);
                            } else {
                              team3.push(Object.keys(trade.adds)[i]);
                            }
                          }
                        }

                        if (trade.draft_picks) {
                          for (let i = 0; i < Object.keys(trade.draft_picks).length; i++) {
                            if (trade.draft_picks[i].owner_id === teamOne) {
                              draft1.push(trade.draft_picks[i]);
                            } else if (trade.draft_picks[i].owner_id === teamTwo) {
                              draft2.push(trade.draft_picks[i]);
                            } else {
                              draft3.push(trade.draft_picks[i]);
                            }
                          }
                        }

                        return (
                          <React.Fragment key={`trade-${weekIdx}-${tradeIdx}`}>
                            <tr>
                              <td rowSpan={trade.consenter_ids.length}>
                                {formatDate(trade.created)}
                              </td>
                              <td>{teams[teamOne]}</td>
                              <td>
                                {team1.map((pid) => (
                                  <div key={pid}>{players[pid]?.full_name ?? pid}</div>
                                ))}
                              </td>
                              <td>
                                {draft1.map((pick, i) => (
                                  <div key={`d1-${i}`}>
                                    {pick.season} Round {pick.round} via{" "}
                                    {teams[pick.roster_id]}
                                  </div>
                                ))}
                              </td>
                            </tr>
                            <tr>
                              <td>{teams[teamTwo]}</td>
                              <td>
                                {team2.map((pid) => (
                                  <div key={pid}>{players[pid]?.full_name ?? pid}</div>
                                ))}
                              </td>
                              <td>
                                {draft2.map((pick, i) => (
                                  <div key={`d2-${i}`}>
                                    {pick.season} Round {pick.round} via{" "}
                                    {teams[pick.roster_id]}
                                  </div>
                                ))}
                              </td>
                            </tr>
                            {trade.consenter_ids.length === 3 && (
                              <tr>
                                <td>{teams[parseInt(trade.consenter_ids[2])]}</td>
                                <td>
                                  {team3.map((pid) => (
                                    <div key={pid}>{players[pid]?.full_name ?? pid}</div>
                                  ))}
                                </td>
                                <td>
                                  {draft3.map((pick, i) => (
                                    <div key={`d3-${i}`}>
                                      {pick.season} Round {pick.round} via{" "}
                                      {teams[pick.roster_id]}
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}

          </div>
        )}
      </main>
    </div>
  );
}
