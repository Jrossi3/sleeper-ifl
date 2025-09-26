import React, { useState, useEffect } from "react";
import "./App.css";

const BACKEND_URL = "https://your-backend-url.com"; // replace with Render backend URL

export default function App() {
  const [loading, setLoading] = useState(true);
  const [waivers, setWaivers] = useState([]);
  const [trades, setTrades] = useState([]);
  const [players, setPlayers] = useState([]);

  const userId = "1054571285751156736";
  const sport = "nfl";
  const season = "2025";
  const leagueId = "1181024367924011008";
  const weeks = 18;

  const teams = {
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

  const formatDate = (ms) =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  // Fetch players
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const res = await fetch(`https://api.sleeper.app/v1/players/nfl`);
        const json = await res.json();
        setPlayers(json);
      } catch (err) {
        console.error(err);
      }
    };
    fetchPlayers();
  }, []);

  // Fetch trades, waivers, and notes
  useEffect(() => {
    const fetchTransactionsAndNotes = async () => {
      setLoading(true);
      let totalWaivers = [];
      let totalTrades = [];
      try {
        for (let i = 1; i < weeks; i++) {
          const res = await fetch(
            `https://api.sleeper.app/v1/league/${leagueId}/transactions/${i}`
          );
          const json = await res.json();
          const completed = json.filter((t) => t.status === "complete");
          totalWaivers.push(completed.filter((t) => t.type === "waiver"));
          totalTrades.push(completed.filter((t) => t.type === "trade"));
        }

        // Fetch saved notes
        const notesRes = await fetch(`${BACKEND_URL}/api/trades/notes`);
        const notesMap = await notesRes.json();

        const tradesWithNotes = totalTrades.map((week) =>
          week.map((trade) => ({
            ...trade,
            notes: notesMap[trade.transaction_id] || "",
          }))
        );

        setWaivers(totalWaivers);
        setTrades(tradesWithNotes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransactionsAndNotes();
  }, []);

  const handleNotesChange = (e, tradeId) => {
    const newNotes = e.target.value;
    setTrades((prevTrades) =>
      prevTrades.map((week) =>
        week.map((trade) =>
          trade.transaction_id === tradeId
            ? { ...trade, notes: newNotes }
            : trade
        )
      )
    );
  };

  const handleNotesBlur = async (tradeId) => {
    const trade = trades.flat().find((t) => t.transaction_id === tradeId);
    if (!trade) return;
    try {
      await fetch(`${BACKEND_URL}/api/trades/${tradeId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: trade.notes }),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const saveAllNotes = async () => {
    const notesToSave = {};
    trades.flat().forEach((trade) => {
      notesToSave[trade.transaction_id] = trade.notes || "";
    });

    try {
      await fetch(`${BACKEND_URL}/api/trades/notes/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesToSave }),
      });
      alert("All notes saved!");
    } catch (err) {
      console.error(err);
      alert("Failed to save notes");
    }
  };

  return (
    <div>
      <main className="p-4">
        <h1 className="text-2xl font-bold mb-4" style={{ textAlign: "center" }}>
          The International Football League
        </h1>

        <button
          onClick={saveAllNotes}
          style={{ marginBottom: "20px", padding: "10px 20px" }}
        >
          Save All Notes
        </button>

        {loading ? (
          <p>Loading Transactions...</p>
        ) : (
          <div>
            {trades.map((week, weekIdx) =>
              week.length === 0 ? null : (
                <div key={`week-${weekIdx}`} className="my-4">
                  <h3 style={{ textAlign: "center" }}>Week {weekIdx + 1}</h3>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Team</th>
                        <th>Players</th>
                        <th>Draft Picks</th>
                        <th>Notes</th>
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

                        return (
                          <React.Fragment key={`trade-${weekIdx}-${tradeIdx}`}>
                            {teamIds.map((teamId, i) => (
                              <tr key={i}>
                                {i === 0 && (
                                  <td rowSpan={teamIds.length}>
                                    {formatDate(trade.created)}
                                  </td>
                                )}
                                <td>{teams[teamId]}</td>
                                <td>
                                  {playerGroups[i].map((pid) => (
                                    <div key={pid}>{players[pid]?.full_name ?? pid}</div>
                                  ))}
                                </td>
                                <td>
                                  {draftGroups[i].map((pick, idx) => (
                                    <div key={idx}>
                                      {pick.season} Round {pick.round} via {teams[pick.roster_id]}
                                    </div>
                                  ))}
                                </td>
                                {i === 0 && (
                                  <td rowSpan={teamIds.length}>
                                    <textarea
                                      value={trade.notes || ""}
                                      onChange={(e) => handleNotesChange(e, trade.transaction_id)}
                                      onBlur={() => handleNotesBlur(trade.transaction_id)}
                                      style={{ width: "100%", minHeight: "50px" }}
                                    />
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
    </div>
  );
}
