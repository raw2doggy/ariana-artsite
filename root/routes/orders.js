const express      = require("express");
const router       = express.Router();
const { getPool }  = require("../db/init");
const requireAdmin = require("../middleware/requireAdmin");

/**
 * GET /api/orders  (admin only)
 * Returns all orders with their line items.
 */
router.get("/", requireAdmin, async (_req, res) => {
    try {
        const pool = getPool();
        const [orders] = await pool.query(
            "SELECT * FROM orders ORDER BY created_at DESC"
        );

        // Fetch items for each order
        for (const order of orders) {
            const [items] = await pool.query(
                "SELECT * FROM order_items WHERE order_id = ?",
                [order.id]
            );
            order.items = items;
        }

        res.json(orders);
    } catch (err) {
        console.error("Orders fetch error:", err);
        res.status(500).json({ error: "Failed to load orders." });
    }
});

/**
 * DELETE /api/orders/:id  (admin only)
 * Deletes an order and its items.
 */
router.delete("/:id", requireAdmin, async (req, res) => {
    try {
        const pool = getPool();
        await pool.query("DELETE FROM orders WHERE id = ?", [req.params.id]);
        res.json({ deleted: true });
    } catch (err) {
        console.error("Order delete error:", err);
        res.status(500).json({ error: "Failed to delete order." });
    }
});

module.exports = router;
