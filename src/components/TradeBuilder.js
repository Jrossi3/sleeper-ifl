// src/components/TradeBuilder.js
//
// Build a trade between any number of teams (2 up to the whole league) and
// see exactly how each team's salary cap moves, year by year.
//
// League rules this models (IFL Constitution 4.1c / 4.2):
//  - A traded player's full contract becomes the new owner's responsibility;
//    a team may NOT eat part of a player's future money.
//  - FAAB cannot be traded: the receiving team takes on the player's entire
//    contract, every year, exactly as it stands.
//  - No team may be over the cap. A team over the cap THIS season makes the
//    trade impossible; a team over in a later season is flagged, since it
//    has until the draft to fix it.
//  - A trade needs a majority vote of the teams not involved in it.

import React, { useMemo, useState } from "react";

const money = (n) => (n < 0 ? `-$${Math.abs(n)}` : `$${n}`);
const ROUND_LABEL = (r) => `Round ${r}`;

export default function TradeBuilder({ teams, years, capTotal, picks = {} }) {
  const currentYear = years[0];
  const [participants, setParticipants] = useState([]);
  // `${ownerId}|${playerKey}` -> destination team id
  const [sends, setSends] = useState({});

  const teamById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const inTrade = participants.filter((id) => teamById[id]);
  const available = teams.filter((t) => !inTrade.includes(t.id));

  const addTeam = (id) => setParticipants((p) => [...p, Number(id)]);
  const removeTeam = (id) => {
    setParticipants((p) => p.filter((x) => x !== id));
    // drop anything to or from the removed team
    setSends((s) => {
      const next = {};
      Object.entries(s).forEach(([k, dest]) => {
        if (Number(k.split("|")[0]) !== id && dest !== id) next[k] = dest;
      });
      return next;
    });
  };
  const setDest = (k, dest) =>
    setSends((s) => {
      const next = { ...s };
      if (!dest) delete next[k];
      else next[k] = Number(dest);
      return next;
    });

  // ── Every moving player, with where it goes ──
  const moves = useMemo(() => {
    const list = [];
    inTrade.forEach((ownerId) => {
      teamById[ownerId].rows.forEach((row) => {
        const k = `${ownerId}|${row.key}`;
        const dest = sends[k];
        if (dest && inTrade.includes(dest) && dest !== ownerId) {
          list.push({ k, ownerId, dest, row, cost: row.hitByYear || {} });
        }
      });
    });
    // Draft picks carry no cap cost.
    inTrade.forEach((ownerId) => {
      (picks[ownerId] || []).forEach((pk) => {
        const k = `${ownerId}|pick:${pk.key}`;
        const dest = sends[k];
        if (dest && inTrade.includes(dest) && dest !== ownerId) {
          const via = pk.originalTeam !== ownerId && teamById[pk.originalTeam] ? ` (${teamById[pk.originalTeam].name})` : "";
          list.push({
            k,
            ownerId,
            dest,
            isPick: true,
            row: { key: pk.key, name: `${pk.season} ${ROUND_LABEL(pk.round)} pick${via}`, position: "" },
            cost: {},
          });
        }
      });
    });
    return list;
  }, [inTrade, sends, teamById, picks]);

  // ── Cap math per team per year ──
  const results = inTrade.map((id) => {
    const t = teamById[id];
    const byYear = {};
    years.forEach((y) => {
      const base = t.budgetByYear[y] || { spent: 0 };
      const out = moves.filter((m) => m.ownerId === id).reduce((s, m) => s + (m.cost[y] || 0), 0);
      const inc = moves.filter((m) => m.dest === id).reduce((s, m) => s + (m.cost[y] || 0), 0);
      const after = base.spent - out + inc;
      byYear[y] = { before: base.spent, out, inc, after, remaining: capTotal - after };
    });
    return { id, name: t.name, byYear };
  });

  // ── Verdict ──
  const problems = [];
  const warnings = [];
  if (inTrade.length < 2) problems.push("Add at least two teams.");
  if (moves.length === 0) problems.push("Nothing is being traded yet.");
  if (inTrade.length >= 2 && moves.length > 0) {
    const idle = inTrade.filter((id) => !moves.some((m) => m.ownerId === id || m.dest === id));
    if (idle.length)
      problems.push(
        `${idle.map((id) => teamById[id].name).join(", ")} ${idle.length === 1 ? "isn't" : "aren't"} sending or receiving anyone — remove ${idle.length === 1 ? "them" : "them"} from the trade or add a player.`
      );
  }
  results.forEach((r) => {
    years.forEach((y) => {
      const rem = r.byYear[y].remaining;
      if (rem < 0) {
        const text = `${r.name} would be ${money(-rem)} over the cap in ${y}.`;
        (y === currentYear ? problems : warnings).push(
          y === currentYear ? text : `${text} They must clear this before the draft.`
        );
      }
    });
  });
  moves.forEach((m) => {
    const unknown = !m.isPick && years.every((y) => m.cost[y] == null);
    if (unknown) warnings.push(`${m.row.name} has no cost on record, so he counts as $0 here.`);
  });
  const uninvolved = teams.length - inTrade.length;
  const votesNeeded = Math.floor(uninvolved / 2) + 1;
  const possible = problems.length === 0;

  return (
    <div className="my-4 tb-root" style={{ textAlign: "left", maxWidth: 1100, margin: "0 auto" }}>
      <h3 style={{ textAlign: "center" }}>Trade Builder</h3>
      <p className="ifl-note" style={{ textAlign: "center" }}>
        Pick the teams and choose where each player and draft pick goes. The receiving team takes the player's entire contract, every year — contracts can't be changed and FAAB can't be traded.
      </p>

      {/* Participants */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", margin: "0.75rem 0" }}>
        {inTrade.map((id) => (
          <span key={id} className="ifl-scoreboard-chip" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            {teamById[id].name}
            <button
              type="button"
              aria-label={`Remove ${teamById[id].name}`}
              onClick={() => removeTeam(id)}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
            >
              ×
            </button>
          </span>
        ))}
        {available.length > 0 && (
          <select
            aria-label="Add a team to the trade"
            value=""
            onChange={(e) => e.target.value && addTeam(e.target.value)}
            className="ifl-text-input"
            style={{ width: "auto" }}
          >
            <option value="">+ Add team…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        {available.length > 0 && inTrade.length < teams.length && (
          <button type="button" className="clear-button" onClick={() => setParticipants(teams.map((t) => t.id))}>
            Include all teams
          </button>
        )}
      </div>

      {inTrade.length === 0 && (
        <p className="ifl-note" style={{ textAlign: "center", margin: "1.5rem 0" }}>
          Add the teams involved in the trade to get started — two or more, up to the whole league.
        </p>
      )}

      {/* Verdict */}
      {inTrade.length > 0 && (
      <div
        role="status"
        style={{
          border: `1px solid ${possible ? "var(--floodlight-dim)" : "var(--flag)"}`,
          borderRadius: 8,
          padding: "0.75rem 1rem",
          margin: "1rem 0",
          background: "var(--turf)",
        }}
      >
        <strong style={{ color: possible ? "var(--floodlight)" : "var(--flag)" }}>
          {possible ? "This trade is possible under the cap." : "This trade is not possible yet."}
        </strong>
        {problems.map((p, i) => <div key={`p${i}`}>• {p}</div>)}
        {warnings.map((w, i) => <div key={`w${i}`} style={{ color: "var(--chalk-dim)" }}>⚠ {w}</div>)}
        {possible && (
          <div style={{ color: "var(--chalk-dim)", marginTop: 4 }}>
            {uninvolved > 0
              ? `Needs a majority vote of the ${uninvolved} team${uninvolved === 1 ? "" : "s"} not in the trade: ${votesNeeded} vote${votesNeeded === 1 ? "" : "s"}.`
              : "Every team is in this trade, so there is no one left to vote — the commissioner would need to approve it."}
          </div>
        )}
      </div>
      )}

      {/* The deal: who gets whom */}
      {moves.length > 0 && (
        <>
          <h3 style={{ textAlign: "center" }}>The deal</h3>
          <div className="tb-grid">
            {inTrade.map((id) => {
              const incoming = moves.filter((m) => m.dest === id);
              const outgoing = moves.filter((m) => m.ownerId === id);
              if (!incoming.length && !outgoing.length) return null;
              const r = results.find((x) => x.id === id);
              const delta = r.byYear[currentYear].after - r.byYear[currentYear].before;
              const chips = (cost, isPick) =>
                isPick ? <span className="deal-chip">no cap</span> :
                years
                  .filter((y) => cost[y] != null)
                  .map((y) => (
                    <span key={y} className="deal-chip">
                      <small>{y}</small> ${cost[y]}
                    </span>
                  ));
              return (
                <section key={id} className="tb-card deal-card">
                  <header className="deal-head">
                    <span className="deal-team">{teamById[id].name}</span>
                    <span className={`deal-net ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
                      {currentYear} cap {delta > 0 ? "−" : delta < 0 ? "+" : ""}${Math.abs(delta)}
                    </span>
                  </header>

                  <div className="deal-section in">
                    <div className="deal-label">Receives</div>
                    {incoming.length === 0 && <div className="deal-none">Nothing</div>}
                    {incoming.map((m) => (
                      <div key={m.k} className="deal-item">
                        <div>
                          <strong>{m.row.name}</strong> <span className="deal-pos">{m.row.position}</span>
                          <div className="deal-from">← from {teamById[m.ownerId].name}</div>
                        </div>
                        <div className="deal-chips">{chips(m.cost, m.isPick)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="deal-section out">
                    <div className="deal-label">Sends</div>
                    {outgoing.length === 0 && <div className="deal-none">Nothing</div>}
                    {outgoing.map((m) => (
                      <div key={m.k} className="deal-item">
                        <div>
                          <strong>{m.row.name}</strong> <span className="deal-pos">{m.row.position}</span>
                          <div className="deal-from">→ to {teamById[m.dest].name}</div>
                        </div>
                        <div className="deal-chips">{chips(m.cost, m.isPick)}</div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {inTrade.length > 0 && <h3 style={{ textAlign: "center" }}>Choose the players and picks</h3>}
      {/* Assets */}
      <div className="tb-grid">
        {inTrade.map((id) => {
          const t = teamById[id];
          // Only years in which this team actually has money committed.
          const shown = years.filter((y) => y === currentYear || t.rows.some((r) => r.hitByYear?.[y] != null));
          return (
            <section key={id} className="tb-card">
              <div className="ifl-nameplate"><span className="ifl-nameplate-name">{t.name}</span></div>
              <div className="tb-scroll">
              <table className="custom-table tb-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    {shown.map((y) => <th key={y}>{y}</th>)}
                    <th>Sends to</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.filter((r) => r.name).map((row) => {
                    const k = `${id}|${row.key}`;
                    const dest = sends[k];
                    return (
                      <tr key={row.key} style={dest ? { background: "rgba(245, 184, 48, 0.14)" } : undefined}>
                        <td>{row.name} <span style={{ color: "var(--chalk-dim)" }}>{row.position}</span></td>
                        {shown.map((y) => (
                          <td key={y}>{row.hitByYear?.[y] != null ? `$${row.hitByYear[y]}` : ""}</td>
                        ))}
                        <td>
                          <select
                            aria-label={`Where ${row.name} goes`}
                            value={dest || ""}
                            onChange={(e) => setDest(k, e.target.value)}
                            className="ifl-text-input"
                          >
                            <option value="">—</option>
                            {inTrade.filter((o) => o !== id).map((o) => (
                              <option key={o} value={o}>{teamById[o].name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              {(picks[id] || []).length > 0 && (
                <div className="tb-scroll">
                  <table className="custom-table tb-table">
                    <thead>
                      <tr><th>Draft pick</th><th>Sends to</th></tr>
                    </thead>
                    <tbody>
                      {(picks[id] || [])
                        .slice()
                        .sort((a, b) => a.season - b.season || a.round - b.round)
                        .map((pk) => {
                          const k = `${id}|pick:${pk.key}`;
                          const dest = sends[k];
                          const via = pk.originalTeam !== id && teamById[pk.originalTeam] ? teamById[pk.originalTeam].name : null;
                          return (
                            <tr key={pk.key} style={dest ? { background: "rgba(245, 184, 48, 0.14)" } : undefined}>
                              <td>
                                {pk.season} {ROUND_LABEL(pk.round)}
                                {via && <span style={{ color: "var(--chalk-dim)" }}> · via {via}</span>}
                              </td>
                              <td>
                                <select
                                  aria-label={`Where the ${pk.season} ${ROUND_LABEL(pk.round)} pick goes`}
                                  value={dest || ""}
                                  onChange={(e) => setDest(k, e.target.value)}
                                  className="ifl-text-input"
                                >
                                  <option value="">—</option>
                                  {inTrade.filter((o) => o !== id).map((o) => (
                                    <option key={o} value={o}>{teamById[o].name}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Cap effect */}
      {inTrade.length > 0 && <h3 style={{ textAlign: "center", marginTop: "1.5rem" }}>Cap after the trade</h3>}
      <div className="tb-grid">
      {results.map((r) => (
        <section key={r.id} className="tb-card">
          <div className="ifl-nameplate"><span className="ifl-nameplate-name">{r.name}</span></div>
          <div className="tb-scroll">
          <table className="custom-table tb-table tb-cap">
            <thead>
              <tr><th></th>{years.map((y) => <th key={y}>{y}</th>)}</tr>
            </thead>
            <tbody>
              <tr><td>Spent now</td>{years.map((y) => <td key={y}>${r.byYear[y].before}</td>)}</tr>
              <tr><td>− Players sent</td>{years.map((y) => <td key={y}>{r.byYear[y].out ? `−$${r.byYear[y].out}` : ""}</td>)}</tr>
              <tr><td>+ Players received</td>{years.map((y) => <td key={y}>{r.byYear[y].inc ? `+$${r.byYear[y].inc}` : ""}</td>)}</tr>
              <tr><td><strong>Spent after</strong></td>{years.map((y) => <td key={y}><strong>${r.byYear[y].after}</strong></td>)}</tr>
              <tr>
                <td><strong>Remaining</strong></td>
                {years.map((y) => (
                  <td key={y} style={{ color: r.byYear[y].remaining < 0 ? "var(--flag)" : undefined }}>
                    <strong>{money(r.byYear[y].remaining)}</strong>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          </div>
        </section>
      ))}
      </div>

      {moves.length > 0 && (
        <p className="ifl-note" style={{ textAlign: "center" }}>
          The entire contract moves with each player. Costs are each player's current net cap hit, including any existing offset. Draft picks carry no cap cost.
        </p>
      )}
    </div>
  );
}