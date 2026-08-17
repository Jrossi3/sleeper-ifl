import React, { useState } from "react";

export default function TextInput({ onSubmitValue }) {
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmitValue(inputValue); // Send the value back to the parent
    setInputValue("");
  };

  return (
    <form onSubmit={handleSubmit}>
      <label className="ifl-input-label" htmlFor="ifl-username">
        Sleeper Username
      </label>
      <div className="ifl-login-row">
        <input
          id="ifl-username"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Sleeper Username"
          className="ifl-text-input"
        />
        <button type="submit" className="ifl-submit-btn">
          Enter the League
        </button>
      </div>
    </form>
  );
}