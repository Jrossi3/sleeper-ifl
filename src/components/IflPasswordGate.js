import React, { useState } from "react";
import { checkIflPassword } from "../utils/iflAccess";

export default function IflPasswordGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setChecking(true);
    setError("");
    try {
      if (await checkIflPassword(value)) {
        onUnlock();
      } else {
        setError("Incorrect password.");
        setValue("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <form onSubmit={submit} className="ifl-gate" style={{ maxWidth: 380, margin: "2rem auto", textAlign: "center" }}>
      <h3>League members only</h3>
      <p className="ifl-note">Enter the league password to view this league.</p>
      <label className="ifl-input-label" htmlFor="ifl-password">Password</label>
      <div className="ifl-login-row">
        <input
          id="ifl-password"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="ifl-text-input"
          placeholder="League password"
          autoFocus
        />
        <button type="submit" className="ifl-submit-btn" disabled={checking || !value}>
          {checking ? "Checking…" : "Unlock"}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: "var(--flag)", marginTop: "0.6rem" }}>
          {error}
        </p>
      )}
    </form>
  );
}