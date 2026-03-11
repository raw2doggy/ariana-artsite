const express      = require("express");
const router       = express.Router();
const { getPool }  = require("../db/init");
const requireAdmin = require("../middleware/requireAdmin");

/**
 * POST /api/support
 * Saves a support message to the database.
 */
router.post("/", async (req, res) => {
    const { email, message } = req.body;

    if (!email || !message) {
        return res.status(400).json({ error: "Email and message are required." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Invalid email address." });
    }

    try {
        const pool = getPool();
        await pool.query(
            "INSERT INTO support_messages (email, message) VALUES (?, ?)",
            [email, message]
        );
        res.json({ sent: true });
    } catch (err) {
        console.error("Support save error:", err);
        res.status(500).json({ error: "Failed to send message. Please try again later." });
    }
});

/**
 * GET /api/support  (admin only)
 * Returns all support messages.
 */
router.get("/", requireAdmin, async (_req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query(
            "SELECT * FROM support_messages ORDER BY created_at DESC"
        );
        res.json(rows);
    } catch (err) {
        console.error("Support fetch error:", err);
        res.status(500).json({ error: "Failed to load messages." });
    }
});

/**
 * DELETE /api/support/:id  (admin only)
 * Deletes a support message.
 */
router.delete("/:id", requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        await pool.query("DELETE FROM support_messages WHERE id = ?", [req.params.id]);
        res.json({ deleted: true });
    } catch (err) {
        console.error("Support delete error:", err);
        res.status(500).json({ error: "Failed to delete message." });
    }
});

module.exports = router;
