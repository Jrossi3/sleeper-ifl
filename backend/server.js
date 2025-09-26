// backend/server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Ensure table exists
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trade_notes (
        transaction_id TEXT PRIMARY KEY,
        notes TEXT
      );
    `);
    console.log("✅ trade_notes table ready");
  } catch (err) {
    console.error("Error creating table:", err);
  }
})();

// Routes

// Get all notes
app.get("/api/trades/notes", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM trade_notes");
    const notesMap = {};
    result.rows.forEach((row) => {
      notesMap[row.transaction_id] = row.notes;
    });
    res.json(notesMap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save single note
app.post("/api/trades/:transactionId/notes", async (req, res) => {
  const { transactionId } = req.params;
  const { notes } = req.body;

  try {
    await pool.query(
      `
      INSERT INTO trade_notes (transaction_id, notes)
      VALUES ($1, $2)
      ON CONFLICT (transaction_id) DO UPDATE SET notes = EXCLUDED.notes
      `,
      [transactionId, notes]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save multiple notes
app.post("/api/trades/notes/batch", async (req, res) => {
  const { notes } = req.body; // { transaction_id: note }

  if (!notes || typeof notes !== "object") {
    return res.status(400).json({ error: "Invalid notes format" });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const [transactionId, note] of Object.entries(notes)) {
        await client.query(
          `
          INSERT INTO trade_notes (transaction_id, notes)
          VALUES ($1, $2)
          ON CONFLICT (transaction_id) DO UPDATE SET notes = EXCLUDED.notes
          `,
          [transactionId, note]
        );
      }

      await client.query("COMMIT");
      res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
