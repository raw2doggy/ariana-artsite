/**
 * routes/portfolio.js — Portfolio Items API
 *
 * GET    /api/portfolio                — public: list all items with images
 * POST   /api/portfolio                — admin:  create item
 * PUT    /api/portfolio/:id            — admin:  update item title
 * DELETE /api/portfolio/:id            — admin:  delete item + its images
 * POST   /api/portfolio/:id/images     — admin:  upload an image for an item
 * DELETE /api/portfolio/images/:imgId  — admin:  delete a single image
 */

const express      = require("express");
const router       = express.Router();
const multer       = require("multer");
const path         = require("path");
const fs           = require("fs");
const { getPool }  = require("../db/init");
const requireAdmin = require("../middleware/requireAdmin");

// ── Multer config ───────────────────────────────────────────
const storage = multer.diskStorage({
    destination: path.join(__dirname, "..", "uploads"),
    filename: (_req, file, cb) => {
        const ext  = path.extname(file.originalname);
        const rand = Math.random().toString(36).slice(2, 8);
        cb(null, `portfolio-${Date.now()}-${rand}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        file.mimetype.startsWith("image/")
            ? cb(null, true)
            : cb(new Error("Only image files are allowed."));
    }
});

// ── GET / ───────────────────────────────────────────────────
router.get("/", async (_req, res) => {
    try {
        const pool  = getPool();
        const [items] = await pool.query("SELECT * FROM portfolio_items ORDER BY created_at DESC");

        for (const item of items) {
            const [imgs] = await pool.query(
                "SELECT * FROM portfolio_item_images WHERE portfolio_item_id = ? ORDER BY sort_order",
                [item.id]
            );
            item.images = imgs;
        }

        res.json(items);
    } catch (err) {
        console.error("GET /api/portfolio error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── POST / ──────────────────────────────────────────────────
router.post("/", requireAdmin, async (req, res) => {
    try {
        const { title } = req.body;
        const pool = getPool();

        const [result] = await pool.query(
            "INSERT INTO portfolio_items (title) VALUES (?)",
            [title || "New Piece"]
        );

        const [rows] = await pool.query("SELECT * FROM portfolio_items WHERE id = ?", [result.insertId]);
        const item   = rows[0];
        item.images  = [];
        res.json(item);
    } catch (err) {
        console.error("POST /api/portfolio error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── PUT /:id ────────────────────────────────────────────────
router.put("/:id", requireAdmin, async (req, res) => {
    try {
        const { title } = req.body;
        const pool = getPool();

        await pool.query(
            "UPDATE portfolio_items SET title = ? WHERE id = ?",
            [title || "Untitled", req.params.id]
        );

        const [rows] = await pool.query("SELECT * FROM portfolio_items WHERE id = ?", [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: "Item not found." });

        const item = rows[0];
        const [imgs] = await pool.query(
            "SELECT * FROM portfolio_item_images WHERE portfolio_item_id = ? ORDER BY sort_order",
            [item.id]
        );
        item.images = imgs;

        res.json(item);
    } catch (err) {
        console.error("PUT /api/portfolio error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── DELETE /:id ─────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        const [images] = await pool.query(
            "SELECT image_path FROM portfolio_item_images WHERE portfolio_item_id = ?",
            [req.params.id]
        );

        images.forEach((img) => {
            const filePath = path.join(__dirname, "..", img.image_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });

        await pool.query("DELETE FROM portfolio_items WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/portfolio error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── POST /:id/images ────────────────────────────────────────
router.post("/:id/images", requireAdmin, upload.single("image"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    try {
        const pool = getPool();
        const [rows] = await pool.query("SELECT id FROM portfolio_items WHERE id = ?", [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: "Item not found." });

        const imagePath = "/uploads/" + req.file.filename;
        const [maxRows] = await pool.query(
            "SELECT COALESCE(MAX(sort_order), -1) AS m FROM portfolio_item_images WHERE portfolio_item_id = ?",
            [req.params.id]
        );
        const nextOrder = maxRows[0].m + 1;

        const [result] = await pool.query(
            "INSERT INTO portfolio_item_images (portfolio_item_id, image_path, sort_order) VALUES (?, ?, ?)",
            [req.params.id, imagePath, nextOrder]
        );

        res.json({
            id:                result.insertId,
            portfolio_item_id: parseInt(req.params.id),
            image_path:        imagePath,
            sort_order:        nextOrder
        });
    } catch (err) {
        console.error("POST /api/portfolio/:id/images error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── DELETE /images/:imgId ───────────────────────────────────
router.delete("/images/:imgId", requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query("SELECT * FROM portfolio_item_images WHERE id = ?", [req.params.imgId]);
        if (!rows.length) return res.status(404).json({ error: "Image not found." });

        const img = rows[0];
        const filePath = path.join(__dirname, "..", img.image_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await pool.query("DELETE FROM portfolio_item_images WHERE id = ?", [req.params.imgId]);
        res.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/portfolio/images error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

module.exports = router;
