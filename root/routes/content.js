/**
 * routes/content.js — Site Content API
 *
 * GET  /api/content              — public: read all key-value pairs
 * PUT  /api/content              — admin:  update key-value pairs
 * POST /api/content/about-image  — admin:  upload about-page photo
 */

const express      = require("express");
const router       = express.Router();
const multer       = require("multer");
const path         = require("path");
const { getPool }  = require("../db/init");
const requireAdmin = require("../middleware/requireAdmin");

// ── Multer config for about photo ───────────────────────────
const storage = multer.diskStorage({
    destination: path.join(__dirname, "..", "uploads"),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, "about-" + Date.now() + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        file.mimetype.startsWith("image/")
            ? cb(null, true)
            : cb(new Error("Only image files are allowed."));
    }
});

// ── GET / ───────────────────────────────────────────────────
router.get("/", async (_req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query("SELECT `key`, value FROM site_content");
        const out = {};
        rows.forEach((r) => { out[r.key] = r.value; });
        res.json(out);
    } catch (err) {
        console.error("GET /api/content error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── PUT / ───────────────────────────────────────────────────
const ALLOWED_KEYS = [
    "siteTitle", "welcomeText",
    "aboutTitle", "aboutName",
    "aboutBio1",  "aboutBio2",
    "aboutImage"
];

router.put("/", requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        for (const [key, value] of Object.entries(req.body)) {
            if (ALLOWED_KEYS.includes(key) && typeof value === "string") {
                await pool.query(
                    "INSERT INTO site_content (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
                    [key, value]
                );
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error("PUT /api/content error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── POST /about-image ───────────────────────────────────────
router.post("/about-image", requireAdmin, upload.single("image"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image uploaded." });
    }

    try {
        const pool      = getPool();
        const imagePath = "/uploads/" + req.file.filename;

        await pool.query(
            "INSERT INTO site_content (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
            ["aboutImage", imagePath]
        );

        res.json({ success: true, imagePath });
    } catch (err) {
        console.error("POST /api/content/about-image error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

module.exports = router;
