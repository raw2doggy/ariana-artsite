/**
 * routes/images.js — Uploaded Images API
 *
 * GET    /api/images              — admin: list all uploaded images (DB + unused on disk)
 * DELETE /api/images/:source/:id  — admin: delete an image by source + id
 * DELETE /api/images/unused       — admin: delete all unused images from disk
 */

const express      = require("express");
const router       = express.Router();
const path         = require("path");
const fs           = require("fs");
const { getPool }  = require("../db/init");
const requireAdmin = require("../middleware/requireAdmin");

const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

// ── GET / — list every image (DB + unused files on disk) ────
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

        // Combine all DB images
        const dbImages = [...shopImages, ...portfolioImages, ...aboutImages];

        // Build a set of filenames tracked in the DB
        const dbFilenames = new Set(
            dbImages.map(img => img.image_path.replace(/^\/uploads\//, ""))
        );

        // Scan the uploads directory for files not in the DB
        let unusedImages = [];
        if (fs.existsSync(UPLOADS_DIR)) {
            const files = fs.readdirSync(UPLOADS_DIR);
            unusedImages = files
                .filter(f => {
                    // Only include image-like files, skip directories
                    const filePath = path.join(UPLOADS_DIR, f);
                    if (!fs.statSync(filePath).isFile()) return false;
                    if (dbFilenames.has(f)) return false;
                    return /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(f);
                })
                .map(f => ({
                    id: null,
                    image_path: "/uploads/" + f,
                    parent_id: null,
                    parent_name: "—",
                    source: "unused"
                }));
        }

        res.json([...dbImages, ...unusedImages]);
    } catch (err) {
        console.error("GET /api/images error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── DELETE /unused — delete all unused images from disk ──────
router.delete("/unused", requireAdmin, async (_req, res) => {
    try {
        const pool = getPool();

        // Gather all DB image paths
        const [shopImgs]      = await pool.query("SELECT image_path FROM shop_item_images");
        const [portfolioImgs] = await pool.query("SELECT image_path FROM portfolio_item_images");
        const [aboutRows]     = await pool.query("SELECT value AS image_path FROM site_content WHERE `key` = 'aboutImage'");

        const dbFilenames = new Set(
            [...shopImgs, ...portfolioImgs, ...aboutRows]
                .map(r => r.image_path.replace(/^\/uploads\//, ""))
        );

        let deletedCount = 0;
        if (fs.existsSync(UPLOADS_DIR)) {
            const files = fs.readdirSync(UPLOADS_DIR);
            for (const f of files) {
                const filePath = path.join(UPLOADS_DIR, f);
                if (!fs.statSync(filePath).isFile()) continue;
                if (dbFilenames.has(f)) continue;
                if (!/\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(f)) continue;
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }

        res.json({ success: true, deletedCount });
    } catch (err) {
        console.error("DELETE /api/images/unused error:", err);
        res.status(500).json({ error: "Database error." });
    }
});

// ── DELETE /:source/:id — delete a specific image ───────────
router.delete("/:source/:id", requireAdmin, async (req, res) => {
    try {
        const pool   = getPool();
        const { source, id } = req.params;

        let imagePath;

        if (source === "unused") {
            // Unused file — just delete from disk, not in any DB table
            imagePath = "/uploads/" + id; // id is the filename for unused
            const filePath = path.join(UPLOADS_DIR, id);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found." });
            fs.unlinkSync(filePath);
            return res.json({ success: true });
        } else if (source === "shop") {
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
