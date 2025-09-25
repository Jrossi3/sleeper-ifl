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
      {/* <Navbar /> */}
      <main className="p-4">
        <h1 style={{ textAlign: 'center' }} className="text-2xl font-bold mb-4">The International Football League</h1>
        {loading ? (
          <p>Loading Transactions...</p>
        ) : leagues.length === 0 ? (
          <p>No leagues found for this user.</p>
        ) : (
          <ul className="space-y-3">
                        <h2 style={{ textAlign: 'center' }}>Waivers</h2>
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
                                <p>Team 1: {teams[parseInt(Object.values(trade.consenter_ids)[0])]}</p>
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
                                  Team 2: {teams[parseInt(Object.values(trade.consenter_ids)[1])]}
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

                              {trade.consenter_ids.length === 3 && (
                                <p>
                                  Team 3: {teams[parseInt(Object.values(trade.consenter_ids)[2])]}
                                </p>
                              )}

                              {trade.consenter_ids.length === 3 &&
                                team3.map((playerId) => (
                                  <p key={playerId}>
                                    {players[playerId]?.full_name ?? playerId}
                                  </p>
                                ))}

                              {trade.consenter_ids.length === 3 &&
                                draft3.map((pick, i) => (
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
            <h2 style = {{textAlign: 'center'}}>Trade Notes</h2>
            <p>Brinkworth Covers:</p>
            <ul>Njoku's 2026 contract</ul>
            <ul>Bucky's 2026 contract</ul>
            <ul>MHJ's 2026 contract</ul>
            <p>Peter Covers:</p>
            <ul>$50 of Tee Higgins in 2026</ul>
            <p>Townsend Covers:</p>
            <ul>$13 in 2026 and $25 in 2027 of Jameson Williams</ul>
            <p>Luo Covers:</p>
            <ul>$15 of Javonte Williams' 2026 contract</ul>
            <p>Rossi Covers:</p>
            <ul>N/A</ul>
            <p>Sierant Covers:</p>
            <ul>N/A</ul>
            <p>Yajur Covers:</p>
            <ul>N/A</ul>
            <p>Maher Covers:</p>
            <ul>$21 of Sam Laporta in 2026</ul>
            <p>Peter Covers:</p>
            <ul>N/A</ul>
            <p>Ben Covers:</p>
            <ul>N/A</ul>
            <br></br>
            <br></br>
            <br></br>
            <br></br>
          </ul>
          
        )}
        
      </main>
      
    </div>
  );
}
