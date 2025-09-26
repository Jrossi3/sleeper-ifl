// server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = 5001;

app.use(cors());
app.use(bodyParser.json());

// Initialize SQLite database
const db = new sqlite3.Database("./trades.db", (err) => {
  if (err) return console.error(err.message);
  console.log("Connected to the trades database.");
});

// Create table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS trade_notes (
    transaction_id TEXT PRIMARY KEY,
    notes TEXT
  )
`);

// Get all notes
app.get("/api/trades/notes", (req, res) => {
  db.all("SELECT * FROM trade_notes", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const notesMap = {};
    rows.forEach((row) => {
      notesMap[row.transaction_id] = row.notes;
    });
    res.json(notesMap);
  });
});

// Save single trade note
app.post("/api/trades/:transactionId/notes", (req, res) => {
  const { transactionId } = req.params;
  const { notes } = req.body;

  db.run(
    `
    INSERT INTO trade_notes (transaction_id, notes)
    VALUES (?, ?)
    ON CONFLICT(transaction_id) DO UPDATE SET notes=excluded.notes
    `,
    [transactionId, notes],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Save multiple trade notes at once
app.post("/api/trades/notes/batch", (req, res) => {
  const { notes } = req.body; // { transaction_id: note, ... }

  if (!notes || typeof notes !== "object") {
    return res.status(400).json({ error: "Invalid notes format" });
  }

  const placeholders = Object.entries(notes).map(
    ([transaction_id, note]) => `('${transaction_id}', '${note.replace(/'/g, "''")}')`
  );

  if (placeholders.length === 0) return res.json({ success: true });

  const sql = `
    INSERT INTO trade_notes (transaction_id, notes)
    VALUES ${placeholders.join(",")}
    ON CONFLICT(transaction_id) DO UPDATE SET notes=excluded.notes
  `;

  db.run(sql, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
