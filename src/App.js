import React, { useState, useEffect } from "react";
import "./App.css";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [waivers, setWaivers] = useState([]);
  const [trades, setTrades] = useState([]);
  const [players, setPlayers] = useState([]);
  let Database = require('./data.json');
  const sport = "nfl";
  const leagueId = "1181024367924011008";
  const weeks = 18;

  const teams = {
    1: "Key West Pirates", 2: "Chamonix Alpines", 3: "Shanghai Warrior Monks", 4: "New Delhi Penguins",
    5: "Galway Potato Farmers", 6: "The London Merchants", 7: "Alamo City Renegades", 8: "Hiroshima Kamikazes",
    9: "Glasgow Highlanders", 10: "Midtown Rainmakers",
  };

  const formatDate = (ms) => new Date(ms).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });

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
      let totalWaivers = [];
      let totalTrades = [];
      try {
        for (let i = 1; i < weeks; i++) {
          const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/transactions/${i}`);
          const json = await res.json();
          const completed = json.filter((t) => t.status === "complete");
          totalWaivers.push(completed.filter((t) => t.type === "waiver"));
          totalTrades.push(completed.filter((t) => t.type === "trade"));
        }
        const dbMap = Object.fromEntries(Database.map(d => [d.transactionId, d.notes]));

        totalTrades = totalTrades.map(tradeGroup =>
          tradeGroup.map(trade => ({
            ...trade,
            notes: dbMap[trade.transaction_id] ?? trade.notes
          }))
        );

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

  var list = []

  return (
    <div>
      <main className="p-4">
        <h1 className="text-2xl font-bold mb-4" style={{ textAlign: "center" }}>
          The International Football League
        </h1>

        {loading ? <p>Loading Transactions...</p> : (
          <div>
            {trades.map((week, weekIdx) =>
              week.length === 0 ? null : (
                <div key={weekIdx} className="my-4">
                  <h3 style={{ textAlign: "center" }}>Week {weekIdx + 1}</h3>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Date</th><th>Team</th><th>Players</th><th>Draft Picks</th><th>Notes</th>
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
                        list.push({"transactionId": trade.transaction_id, "notes": ""})

                        return (
                          <React.Fragment key={tradeIdx}>
                            {teamIds.map((teamId, i) => (
                              <tr key={i}>
                                {i === 0 && <td rowSpan={teamIds.length}>{formatDate(trade.created)}</td>}
                                <td>{teams[teamId]}</td>
                                <td>{playerGroups[i].map((pid) => <div key={pid}>{players[pid]?.full_name ?? pid}</div>)}</td>
                                <td>{draftGroups[i].map((pick, idx) => (
                                  <div key={idx}>{pick.season} Round {pick.round} via {teams[pick.roster_id]}</div>
                                ))}</td>
                                {i === 0 && (
                                  <td 
                                  rowSpan={teamIds.length}>
                                    <div
                                      style={{ width: "100%", minHeight: "50px" }}
                                    >
                                      {trade.notes || "No Notes"}
                                      
                                      </div>
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
            )}
          </div>
        )}
      </main>
      {console.log(list)}
    </div>
  );
}
