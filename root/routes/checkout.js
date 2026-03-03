/**
 * routes/checkout.js — Stripe Checkout API
 *
 * POST /api/checkout — creates a Stripe Checkout Session and returns the URL
 */

const express      = require("express");
const router       = express.Router();
const { getPool }  = require("../db/init");

router.post("/", async (req, res) => {
    // ── Verify Stripe is configured ─────────────────────────
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey.includes("XXXX")) {
        return res.status(503).json({
            error: "Stripe is not configured yet. Add your STRIPE_SECRET_KEY to .env"
        });
    }

    const stripe     = require("stripe")(stripeKey);
    const { itemId } = req.body;

    if (!itemId) {
        return res.status(400).json({ error: "Item ID required." });
    }

    try {
        // ── Look up the item ────────────────────────────────
        const pool = getPool();
        const [rows] = await pool.query("SELECT * FROM shop_items WHERE id = ?", [itemId]);
        if (!rows.length) return res.status(404).json({ error: "Item not found." });

        const item = rows[0];
        if (item.price_cents <= 0) {
            return res.status(400).json({ error: "Item has no price set." });
        }

        // ── Optionally attach the first product image ───────
        const [imgRows] = await pool.query(
            "SELECT image_path FROM shop_item_images WHERE shop_item_id = ? ORDER BY sort_order LIMIT 1",
            [itemId]
        );

        const productImages = [];
        if (imgRows.length && process.env.SITE_URL) {
            productImages.push(process.env.SITE_URL + imgRows[0].image_path);
        }

        // ── Create Stripe Checkout Session ───────────────────
        const siteUrl = process.env.SITE_URL || "http://localhost:3000";

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name:   item.name,
                            images: productImages
                        },
                        unit_amount: item.price_cents
                    },
                    quantity: 1
                }
            ],
            mode: "payment",
            success_url: `${siteUrl}/pages/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${siteUrl}/pages/shop.html`
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error("Checkout error:", err.message);
        res.status(500).json({ error: "Failed to create checkout session." });
    }
});

module.exports = router;
