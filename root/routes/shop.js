/**
 * routes/shop.js — Shop Items API
 *
 * GET    /api/shop                — public: list all items with images
 * POST   /api/shop                — admin:  create item
 * PUT    /api/shop/:id            — admin:  update item name / price
 * DELETE /api/shop/:id            — admin:  delete item + its images
 * POST   /api/shop/:id/images     — admin:  upload an image for an item
 * DELETE /api/shop/images/:imgId  — admin:  delete a single image
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
        cb(null, `shop-${Date.now()}-${rand}${ext}`);
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
        const [items] = await pool.query("SELECT * FROM shop_items ORDER BY created_at DESC");

        for (const item of items) {
            const [imgs] = await pool.query(
                "SELECT * FROM shop_item_images WHERE shop_item_id = ? ORDER BY sort_order",
                [item.id]
            );
            item.images = imgs;
        }

        res.json(items);
    } catch (err) {
        console.error("GET /api/shop error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── POST / ──────────────────────────────────────────────────
router.post("/", requireAdmin, async (req, res) => {
    try {
        const { name, price_cents } = req.body;
        const pool = getPool();

        const [result] = await pool.query(
            "INSERT INTO shop_items (name, price_cents) VALUES (?, ?)",
            [name || "New Item", parseInt(price_cents) || 0]
        );

        const [rows] = await pool.query("SELECT * FROM shop_items WHERE id = ?", [result.insertId]);
        const item   = rows[0];
        item.images  = [];
        res.json(item);
    } catch (err) {
        console.error("POST /api/shop error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── PUT /:id ────────────────────────────────────────────────
router.put("/:id", requireAdmin, async (req, res) => {
    try {
        const { name, price_cents } = req.body;
        const pool = getPool();

        await pool.query(
            "UPDATE shop_items SET name = ?, price_cents = ? WHERE id = ?",
            [name || "Untitled", parseInt(price_cents) || 0, req.params.id]
        );

        const [rows] = await pool.query("SELECT * FROM shop_items WHERE id = ?", [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: "Item not found." });

        const item = rows[0];
        const [imgs] = await pool.query(
            "SELECT * FROM shop_item_images WHERE shop_item_id = ? ORDER BY sort_order",
            [item.id]
        );
        item.images = imgs;

        res.json(item);
    } catch (err) {
        console.error("PUT /api/shop error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── DELETE /:id ─────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        const [images] = await pool.query(
            "SELECT image_path FROM shop_item_images WHERE shop_item_id = ?",
            [req.params.id]
        );

        images.forEach((img) => {
            const filePath = path.join(__dirname, "..", img.image_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });

        await pool.query("DELETE FROM shop_items WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/shop error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── POST /:id/images ────────────────────────────────────────
router.post("/:id/images", requireAdmin, upload.single("image"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    try {
        const pool = getPool();
        const [rows] = await pool.query("SELECT id FROM shop_items WHERE id = ?", [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: "Item not found." });

        const imagePath = "/uploads/" + req.file.filename;
        const [maxRows] = await pool.query(
            "SELECT COALESCE(MAX(sort_order), -1) AS m FROM shop_item_images WHERE shop_item_id = ?",
            [req.params.id]
        );
        const nextOrder = maxRows[0].m + 1;

        const [result] = await pool.query(
            "INSERT INTO shop_item_images (shop_item_id, image_path, sort_order) VALUES (?, ?, ?)",
            [req.params.id, imagePath, nextOrder]
        );

        res.json({
            id:           result.insertId,
            shop_item_id: parseInt(req.params.id),
            image_path:   imagePath,
            sort_order:   nextOrder
        });
    } catch (err) {
        console.error("POST /api/shop/:id/images error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── DELETE /images/:imgId ───────────────────────────────────
router.delete("/images/:imgId", requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.query("SELECT * FROM shop_item_images WHERE id = ?", [req.params.imgId]);
        if (!rows.length) return res.status(404).json({ error: "Image not found." });

        const img = rows[0];
        const filePath = path.join(__dirname, "..", img.image_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await pool.query("DELETE FROM shop_item_images WHERE id = ?", [req.params.imgId]);
        res.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/shop/images error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

module.exports = router;
