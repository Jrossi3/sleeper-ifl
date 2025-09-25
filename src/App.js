import React, { useState, useEffect } from "react";
import { Container, Row, Col } from 'react-bootstrap'; // Assuming react-bootstrap is installed
import Navbar from "./components/Navbar";

export default function App() {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [waivers, setWaivers] = useState([]);
  const [trades, setTrades] = useState([]);
  const [players, setPlayers] = useState([]);

  // Replace with your Sleeper details
  const userId = "1054571285751156736";   // e.g. 123456789
  const sport = "nfl";             // nfl, nba, etc.
  const season = "2025";           // year/season
  const leagueId = "1181024367924011008"
  const weeks = 18
  var totalWaivers = []
  var totalTrades = []
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
    10: "Peter"
  }
  // GET https://api.sleeper.app/v1/league/<league_id>/users
  //api.sleeper.app/v1/user/1054571285751156736/leagues/nfl/2025
  // curl "https://api.sleeper.app/v1/league/1181024367924011008/transactions/1
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
    const fetchTrades = async () => {
      try {
        const res = await fetch(
          `https://api.sleeper.app/v1/players/nfl`
        );
        if (!res.ok) throw new Error("Failed to fetch players");
        var json = await res.json();
        setPlayers(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
  }, []);
  console.log("hello part 2")
  useEffect(() => {
    let fetched = false;

    const fetchTransactions = async () => {
      if (fetched) return;
      fetched = true;
      console.log("hello")
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
          console.log(json)
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
      {/* <Navbar /> */}
      <main className="p-4">
        <h1 style={{ textAlign: 'center' }} className="text-2xl font-bold mb-4">The International Football League</h1>
        {loading ? (
          <p>Loading Transactions...</p>
        ) : leagues.length === 0 ? (
          <p>No leagues found for this user.</p>
        ) : (
          <ul className="space-y-3">
            {/* {leagues
              .filter((league) => league.name === "The International Football League")
              .map((league) => (
                <li
                  key={league.league_id}
                  className="p-3 rounded-md shadow-md bg-gray-100"
                >
                  <p>Sport: {league.sport}</p>
                  <p>Season: {league.season}</p>
                  <p>Status: {league.status}</p>
                </li>
              ))} */}
            {waivers.map((week, weekIdx) => {
              if (!week || week.length === 0) return null;
              return (
                <div key={`week-${weekIdx}`}>
                  <h2 style={{ textAlign: 'center' }} className="text-xl font-bold my-3">Week {weekIdx + 1}</h2>

                  {week.map((player, playerIdx) => {
                    const key = `${weekIdx}-${playerIdx}-${player.status}`;

                    if (!containsOnlyLetters(Object.keys(player.adds))) {
                      return (
                        <li
                          key={key}
                          className="p-3 rounded-md shadow-md bg-gray-100"
                        >
                          <h2 className="font-semibold">Player Waiver</h2>
                          <p>Team: {teams[parseInt(player.consenter_ids[0])]}</p>
                          <p>Added: {players[Object.keys(player.adds)]?.full_name}</p>
                          {player.drops !== null && (
                            <p>Dropped: {players[Object.keys(player.drops)]?.full_name}</p>
                          )}
                          <p>Bid: {player.settings.waiver_bid}</p>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={key}
                        className="p-3 rounded-md shadow-md bg-gray-100"
                      >
                        <h2 className="font-semibold">Defensive Waiver</h2>
                        <p>Team: {teams[parseInt(player.consenter_ids[0])]}</p>
                        <p>Added: {players[Object.keys(player.adds)]?.team}</p>
                        {player.drops !== null && (
                          <p>Dropped: {players[Object.keys(player.drops)]?.team}</p>
                        )}
                        <p>Bid: {player.settings.waiver_bid}</p>
                      </li>
                    );
                  })}
                </div>)
            })}


            <h2 style={{ textAlign: 'center' }}>Trades</h2>
            <Container>
              {trades.map((week, weekIdx) => {
                // skip empty weeks
                if (!week || week.length === 0) return null;

                return (
                  <div key={`week-${weekIdx}`}>
                    {/* Week header */}
                    <h2 style={{ textAlign: 'center' }} className="text-xl font-bold my-3 text-center">
                      Week {weekIdx + 1}
                    </h2>

                    <Row>
                      {week.map((trade, tradeIdx) => {
                        let team1 = [];
                        let team2 = [];
                        let draft1 = [];
                        let draft2 = [];

                        const teamOne = Object.values(trade.adds ?? {})[0];

                        if (trade.adds) {
                          for (let i = 0; i < Object.keys(trade.adds).length; i++) {
                            if (Object.values(trade.adds)[i] === teamOne) {
                              team1.push(Object.keys(trade.adds)[i]);
                            } else {
                              team2.push(Object.keys(trade.adds)[i]);
                            }
                          }
                        }

                        if (trade.draft_picks) {
                          for (let i = 0; i < Object.keys(trade.draft_picks).length; i++) {
                            if (trade.draft_picks[i].owner_id === teamOne) {
                              draft1.push(trade.draft_picks[i]);
                            } else {
                              draft2.push(trade.draft_picks[i]);
                            }
                          }
                        }

                        return (
                          <Col
                            key={`${weekIdx}-${tradeIdx}-${trade.status}`}
                            xs={12}
                            sm={6}
                            md={4}
                            lg={3} // responsive grid
                            className="mb-4"
                          >
                            <div className="p-3 rounded-md shadow-md bg-gray-100 h-100">
                              <h2 className="font-semibold">Trade</h2>

                              {trade.adds && (
                                <p>Team 1: {teams[parseInt(Object.values(trade.adds)[0])]}</p>
                              )}

                              {trade.adds &&
                                team1.map((playerId) => (
                                  <p key={playerId}>
                                    {players[playerId]?.full_name ?? playerId}
                                  </p>
                                ))}

                              {trade.draft_picks &&
                                draft1.map((pick, i) => (
                                  <p key={`d1-${i}`}>
                                    {pick.season} Round {pick.round} via{" "}
                                    {teams[pick.roster_id]}
                                  </p>
                                ))}

                              {trade.adds && (
                                <p>
                                  Team 2: {teams[parseInt(Object.values(trade.drops ?? {})[0])]}
                                </p>
                              )}

                              {trade.adds &&
                                team2.map((playerId) => (
                                  <p key={playerId}>
                                    {players[playerId]?.full_name ?? playerId}
                                  </p>
                                ))}

                              {trade.draft_picks &&
                                draft2.map((pick, i) => (
                                  <p key={`d2-${i}`}>
                                    {pick.season} Round {pick.round} via{" "}
                                    {teams[pick.roster_id]}
                                  </p>
                                ))}
                            </div>
                          </Col>
                        );
                      })}
                    </Row>
                  </div>
                );
              })}
            </Container>
          </ul>
        )}
      </main>
    </div>
  );
}
