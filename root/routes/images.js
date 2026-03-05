/**
 * routes/images.js — Uploaded Images API
 *
 * GET    /api/images          — admin: list all uploaded images from all tables
 * DELETE /api/images/:id      — admin: delete an image by table + id
 */

const express      = require("express");
const router       = express.Router();
const path         = require("path");
const fs           = require("fs");
const { getPool }  = require("../db/init");
const requireAdmin = require("../middleware/requireAdmin");

// ── GET / — list every image stored in the database ─────────
router.get("/", requireAdmin, async (_req, res) => {
    try {
        const pool = getPool();

        const [shopImages] = await pool.query(
            `SELECT si.id, si.image_path, si.shop_item_id AS parent_id, s.name AS parent_name,
                    'shop' AS source
             FROM shop_item_images si
             LEFT JOIN shop_items s ON s.id = si.shop_item_id
             ORDER BY si.id ASC`
        );

        const [portfolioImages] = await pool.query(
            `SELECT pi.id, pi.image_path, pi.portfolio_item_id AS parent_id, p.title AS parent_name,
                    'portfolio' AS source
             FROM portfolio_item_images pi
             LEFT JOIN portfolio_items p ON p.id = pi.portfolio_item_id
             ORDER BY pi.id ASC`
        );

        // About-page image (stored in site_content)
        const [aboutRows] = await pool.query(
            "SELECT value FROM site_content WHERE `key` = 'aboutImage'"
        );
        const aboutImages = aboutRows.length
            ? [{ id: null, image_path: aboutRows[0].value, parent_id: null, parent_name: "About Page", source: "about" }]
            : [];

        res.json([...shopImages, ...portfolioImages, ...aboutImages]);
    } catch (err) {
        console.error("GET /api/images error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── DELETE /:source/:id — delete a specific image ───────────
router.delete("/:source/:id", requireAdmin, async (req, res) => {
    try {
        const pool   = getPool();
        const { source, id } = req.params;

        let imagePath;

        if (source === "shop") {
            const [rows] = await pool.query("SELECT * FROM shop_item_images WHERE id = ?", [id]);
            if (!rows.length) return res.status(404).json({ error: "Image not found." });
            imagePath = rows[0].image_path;
            await pool.query("DELETE FROM shop_item_images WHERE id = ?", [id]);
        } else if (source === "portfolio") {
            const [rows] = await pool.query("SELECT * FROM portfolio_item_images WHERE id = ?", [id]);
            if (!rows.length) return res.status(404).json({ error: "Image not found." });
            imagePath = rows[0].image_path;
            await pool.query("DELETE FROM portfolio_item_images WHERE id = ?", [id]);
        } else if (source === "about") {
            const [rows] = await pool.query("SELECT value FROM site_content WHERE `key` = 'aboutImage'");
            if (!rows.length) return res.status(404).json({ error: "Image not found." });
            imagePath = rows[0].value;
            await pool.query("DELETE FROM site_content WHERE `key` = 'aboutImage'");
        } else {
            return res.status(400).json({ error: "Unknown image source." });
        }

        // Remove file from disk
        if (imagePath) {
            const filePath = path.join(__dirname, "..", imagePath);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/images error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

module.exports = router;
