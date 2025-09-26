const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors()); // allow all origins (or restrict in production)
app.use(bodyParser.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Create table if it doesn’t exist
pool.query(`
CREATE TABLE IF NOT EXISTS trade_notes (
  transaction_id TEXT PRIMARY KEY,
  notes TEXT,
  updated_at TIMESTAMPTZ
);
`).catch(console.error);

// GET all notes
app.get("/api/trades/notes", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM trade_notes");
    const notesMap = {};
    result.rows.forEach((row) => {
      notesMap[row.transaction_id] = row.notes;
    });
    res.json(notesMap);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST single note
app.post("/api/trades/:transactionId/notes", async (req, res) => {
  const { transactionId } = req.params;
  const { notes } = req.body;

  try {
    await pool.query(
      `
      INSERT INTO trade_notes (transaction_id, notes, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (transaction_id)
      DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
      `,
      [transactionId, notes]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST batch notes
app.post("/api/trades/notes/batch", async (req, res) => {
  const { notes } = req.body;
  if (!notes || typeof notes !== "object") return res.status(400).json({ error: "Invalid notes" });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [transaction_id, note] of Object.entries(notes)) {
        await client.query(
          `
          INSERT INTO trade_notes (transaction_id, notes, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (transaction_id)
          DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
          `,
          [transaction_id, note]
        );
      }
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
