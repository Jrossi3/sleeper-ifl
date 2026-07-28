// src/components/CapCalculator.js
//
// Two tools in one, both driven by Constitution 4.1c / 4.2b:
//  - "New Contract": given a draft price and a contract length, project the
//    year-by-year cap hit (18% compounded annually).
//  - "Buyout Existing Contract": pick a rostered player and see their
//    remaining contract, the 25%-of-remaining-value buyout cost, and how
//    much cap that frees up this year vs. across all remaining years.
//
// The buyout tool reads from `contractsByTeam`, the same live sheet data
// used on the Rosters page — so it only has players to choose from once
// that data has loaded at least once this session.

import React, { useMemo, useState } from "react";

const CONTRACT_LENGTHS = [1, 2, 3, 4, 5];
const ESCALATOR = 1.18;

function projectContract(price, years) {
  const rows = [];
  let amount = price;
  for (let i = 0; i < years; i++) {
    if (i > 0) amount *= ESCALATOR;
    rows.push(Math.round(amount * 100) / 100);
  }
  return rows;
}

export default function CapCalculator({ contractsByTeam, currentYear }) {
  const [mode, setMode] = useState("new");

  // ── New contract mode ──────────────────────────────────────────────
  const [price, setPrice] = useState(50);
  const [years, setYears] = useState(3);
  const projection = useMemo(
    () => projectContract(Number(price) || 0, Number(years) || 1),
    [price, years]
  );
  const projectionTotal = projection.reduce((a, b) => a + b, 0);

  // ── Buyout mode ────────────────────────────────────────────────────
  const teamNames = Object.keys(contractsByTeam || {}).filter((t) => contractsByTeam[t]);
  const [buyoutTeam, setBuyoutTeam] = useState("");
  const teamContracts = contractsByTeam?.[buyoutTeam];
  const [buyoutPlayerName, setBuyoutPlayerName] = useState("");
  const contract = teamContracts?.players.find((p) => p.name === buyoutPlayerName);

  const remainingYears = useMemo(() => {
    if (!contract || !teamContracts) return [];
    const startIdx = teamContracts.years.indexOf(currentYear);
    if (startIdx === -1) return teamContracts.years.filter((y) => contract.capByYear[y] != null);
    return teamContracts.years.slice(startIdx).filter((y) => contract.capByYear[y] != null);
  }, [contract, teamContracts, currentYear]);

  const remainingTotal = remainingYears.reduce(
    (sum, y) => sum + (contract?.capByYear[y] || 0),
    0
  );
  const buyoutCost = Math.round(remainingTotal * 0.25 * 100) / 100;
  const thisYearFreed = (contract && contract.capByYear[currentYear]) || 0;

  const btnStyle = (active) => ({
    padding: "6px 14px",
    marginRight: "8px",
    borderRadius: "6px",
    border: "1px solid #444",
    background: active ? "#444" : "#fff",
    color: active ? "#fff" : "#333",
    cursor: "pointer",
  });

  return (
    <div style={{ maxWidth: 640, margin: "2rem auto", textAlign: "center" }}>
      <h3>Cap Calculator</h3>
      <div style={{ marginBottom: "1.25rem" }}>
        <button style={btnStyle(mode === "new")} onClick={() => setMode("new")}>
          New Contract
        </button>
        <button style={btnStyle(mode === "buyout")} onClick={() => setMode("buyout")}>
          Buyout Existing Contract
        </button>
      </div>

      {mode === "new" && (
        <div>
          <label style={{ marginRight: "1.5rem" }}>
            Draft Price: $
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ width: 80, marginLeft: 6 }}
            />
          </label>
          <label>
            Contract Length:{" "}
            <select value={years} onChange={(e) => setYears(e.target.value)}>
              {CONTRACT_LENGTHS.map((y) => (
                <option key={y} value={y}>
                  {y} year{y > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>

          <table className="custom-table" style={{ margin: "1.25rem auto" }}>
            <thead>
              <tr>
                {projection.map((_, i) => (
                  <th key={i}>Year {i + 1}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {projection.map((v, i) => (
                  <td key={i}>${v.toFixed(2)}</td>
                ))}
                <td>
                  <strong>${projectionTotal.toFixed(2)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: "0.85em", color: "#888" }}>
            18% compounded annually, per Constitution 4.1c
          </p>
        </div>
      )}

      {mode === "buyout" && (
        <div>
          {teamNames.length === 0 ? (
            <p>
              Open the Rosters and Records view once so team contract data loads, then come
              back here.
            </p>
          ) : (
            <>
              <select
                value={buyoutTeam}
                onChange={(e) => {
                  setBuyoutTeam(e.target.value);
                  setBuyoutPlayerName("");
                }}
                style={{ marginRight: "8px" }}
              >
                <option value="">Select a team…</option>
                {teamNames.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {teamContracts && (
                <select
                  value={buyoutPlayerName}
                  onChange={(e) => setBuyoutPlayerName(e.target.value)}
                >
                  <option value="">Select a player…</option>
                  {teamContracts.players.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.position})
                    </option>
                  ))}
                </select>
              )}

              {contract && (
                <div style={{ marginTop: "1.25rem" }}>
                  <table className="custom-table" style={{ margin: "1rem auto" }}>
                    <thead>
                      <tr>
                        {remainingYears.map((y) => (
                          <th key={y}>{y}</th>
                        ))}
                        <th>Total Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {remainingYears.map((y) => (
                          <td key={y}>${contract.capByYear[y]}</td>
                        ))}
                        <td>
                          <strong>${remainingTotal.toFixed(2)}</strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p>
                    Buyout cost (25% to prize pool, Constitution 4.2b):{" "}
                    <strong>${buyoutCost.toFixed(2)}</strong>
                    <br />
                    {currentYear} cap freed immediately: <strong>${thisYearFreed}</strong>
                    <br />
                    Total cap wiped across remaining years:{" "}
                    <strong>${remainingTotal.toFixed(2)}</strong>
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
