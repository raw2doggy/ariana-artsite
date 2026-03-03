/**
 * routes/auth.js — Admin Authentication API
 *
 * POST /api/auth/login   — validate credentials, create session
 * POST /api/auth/logout  — destroy session
 * GET  /api/auth/status  — check login state
 */

const express = require("express");
const router  = express.Router();
const crypto  = require("crypto");

function sha256(str) {
    return crypto.createHash("sha256").update(str).digest("hex");
}

// ── POST /login ─────────────────────────────────────────────
router.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res
            .status(400)
            .json({ success: false, message: "Username and password required." });
    }

    const expectedUser = process.env.ADMIN_USERNAME || "admin";
    const expectedHash =
        process.env.ADMIN_PASSWORD_HASH ||
        "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

    const hash = sha256(password);

    if (username === expectedUser && hash === expectedHash) {
        req.session.isAdmin = true;
        req.session.user    = username;
        return res.json({ success: true, message: "Login successful." });
    }

    return res
        .status(401)
        .json({ success: false, message: "Invalid credentials." });
});

// ── POST /logout ────────────────────────────────────────────
router.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: "Logout failed." });
        res.clearCookie("connect.sid");
        res.json({ success: true });
    });
});

// ── GET /status ─────────────────────────────────────────────
router.get("/status", (req, res) => {
    res.json({ loggedIn: !!(req.session && req.session.isAdmin) });
});

module.exports = router;
