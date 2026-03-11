/**
 * routes/checkout.js — Stripe Checkout API
 *
 * POST /api/checkout — creates a Stripe Checkout Session and returns the URL
 */

const express      = require("express");
const router       = express.Router();
const path         = require("path");
const fs           = require("fs");
const { getPool }  = require("../db/init");

// ── Helper: move a shop item to portfolio if its quantity is 0 ──
async function moveToPortfolioIfEmpty(pool, itemId) {
    const [rows] = await pool.query("SELECT * FROM shop_items WHERE id = ?", [itemId]);
    if (!rows.length) return;
    const item = rows[0];
    if (item.quantity > 0) return;

    // Create portfolio entry with the shop item's name
    const [result] = await pool.query(
        "INSERT INTO portfolio_items (title) VALUES (?)",
        [item.name]
    );
    const portfolioId = result.insertId;

    // Copy all shop images to portfolio (files stay on disk, just new DB refs)
    const [imgs] = await pool.query(
        "SELECT * FROM shop_item_images WHERE shop_item_id = ? ORDER BY sort_order",
        [itemId]
    );
    for (const img of imgs) {
        await pool.query(
            "INSERT INTO portfolio_item_images (portfolio_item_id, image_path, sort_order) VALUES (?, ?, ?)",
            [portfolioId, img.image_path, img.sort_order]
        );
    }

    // Remove shop image records (keep files on disk since portfolio now references them)
    await pool.query("DELETE FROM shop_item_images WHERE shop_item_id = ?", [itemId]);
    // Remove the shop item itself
    await pool.query("DELETE FROM shop_items WHERE id = ?", [itemId]);

    console.log(`\u2714 Auto-moved shop item ${itemId} ("${item.name}") to portfolio item ${portfolioId}`);
}

router.post("/", async (req, res) => {
    // ── Verify Stripe is configured ─────────────────────────
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey.includes("XXXX")) {
        return res.status(503).json({
            error: "Stripe is not configured yet. Add your STRIPE_SECRET_KEY to .env"
        });
    }

    const stripe = require("stripe")(stripeKey);

    // Support both single itemId (legacy) and items array (cart)
    let cartItems = [];
    if (req.body.items && Array.isArray(req.body.items)) {
        cartItems = req.body.items.map(i => ({
            itemId:   parseInt(i.itemId, 10),
            quantity: parseInt(i.quantity, 10) || 1
        }));
    } else if (req.body.itemId) {
        cartItems = [{ itemId: parseInt(req.body.itemId, 10), quantity: 1 }];
    }

    const customerEmail    = req.body.email || null;
    const customerName     = req.body.customerName || null;
    const shippingAddress  = req.body.shippingAddress || null;

    if (!cartItems.length) {
        return res.status(400).json({ error: "No items provided." });
    }

    // Server-side validation
    if (!customerName || typeof customerName !== "string" || customerName.trim().length === 0 || customerName.length > 200) {
        return res.status(400).json({ error: "A valid name is required." });
    }
    if (!customerEmail || typeof customerEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        return res.status(400).json({ error: "A valid email is required." });
    }
    if (shippingAddress && (typeof shippingAddress !== "string" || shippingAddress.length > 1000)) {
        return res.status(400).json({ error: "Shipping address is too long." });
    }

    try {
        const pool = getPool();
        const line_items = [];
        const metaItems  = [];

        for (const ci of cartItems) {
            const [rows] = await pool.query("SELECT * FROM shop_items WHERE id = ?", [ci.itemId]);
            if (!rows.length) return res.status(404).json({ error: `Item ${ci.itemId} not found.` });

            const item = rows[0];
            if (item.price_cents <= 0) {
                return res.status(400).json({ error: `"${item.name}" has no price set.` });
            }
            if (item.quantity <= 0) {
                return res.status(400).json({ error: `"${item.name}" is out of stock.` });
            }
            if (ci.quantity > item.quantity) {
                return res.status(400).json({ error: `Only ${item.quantity} of "${item.name}" available.` });
            }

            // Optionally attach the first product image
            const [imgRows] = await pool.query(
                "SELECT image_path FROM shop_item_images WHERE shop_item_id = ? ORDER BY sort_order LIMIT 1",
                [ci.itemId]
            );
            const productImages = [];
            if (imgRows.length && process.env.SITE_URL) {
                productImages.push(process.env.SITE_URL + imgRows[0].image_path);
            }

            line_items.push({
                price_data: {
                    currency: "usd",
                    product_data: {
                        name:   item.name,
                        images: productImages
                    },
                    unit_amount: item.price_cents
                },
                quantity: ci.quantity
            });

            metaItems.push({ id: ci.itemId, qty: ci.quantity });
        }

        // ── Create Stripe Checkout Session ───────────────────
        const siteUrl = process.env.SITE_URL || "http://localhost:3000";

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items,
            mode: "payment",
            metadata: {
                cart_items: JSON.stringify(metaItems),
                customer_name: customerName ? customerName.trim() : "",
                shipping_address: shippingAddress || ""
            },
            ...(customerEmail ? { customer_email: customerEmail } : {}),
            success_url: `${siteUrl}/pages/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${siteUrl}/pages/shop.html`
        });

        res.json({ url: session.url });
    } catch (err) {
        console.error("Checkout error:", err.message);
        res.status(500).json({ error: "Failed to create checkout session." });
    }
});

// ── GET /confirm — verify session & decrement quantity once ─────
router.get("/confirm", async (req, res) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey.includes("XXXX")) {
        return res.status(503).json({ error: "Stripe not configured." });
    }

    const stripe    = require("stripe")(stripeKey);
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: "Missing session_id." });

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ["customer_details"]
        });

        if (session.payment_status !== "paid") {
            return res.json({ confirmed: false, reason: "Not paid." });
        }

        const itemId = session.metadata && session.metadata.shop_item_id;
        const cartItemsJson = session.metadata && session.metadata.cart_items;

        // Build list of items to decrement
        let itemsToDecrement = [];
        if (cartItemsJson) {
            try {
                itemsToDecrement = JSON.parse(cartItemsJson);
            } catch (_) {}
        } else if (itemId) {
            // Legacy single-item fallback
            itemsToDecrement = [{ id: parseInt(itemId, 10), qty: 1 }];
        }

        if (!itemsToDecrement.length) {
            return res.json({ confirmed: true, decremented: false });
        }

        const pool = getPool();

        // Prevent double-decrement: check if this session was already processed
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS processed_sessions (
                    session_id VARCHAR(255) PRIMARY KEY,
                    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } catch (_) { /* table exists */ }

        const [existing] = await pool.query(
            "SELECT session_id FROM processed_sessions WHERE session_id = ?",
            [sessionId]
        );

        if (existing.length > 0) {
            return res.json({ confirmed: true, decremented: false, reason: "Already processed." });
        }

        // Mark as processed and decrement each item
        await pool.query("INSERT INTO processed_sessions (session_id) VALUES (?)", [sessionId]);

        // Save the order to the database
        let totalCents = 0;
        const orderItemsData = [];
        for (const ci of itemsToDecrement) {
            const [itemRows] = await pool.query("SELECT name, price_cents FROM shop_items WHERE id = ?", [ci.id]);
            if (itemRows.length) {
                const item = itemRows[0];
                totalCents += item.price_cents * ci.qty;
                orderItemsData.push({ name: item.name, price_cents: item.price_cents, qty: ci.qty });
            }
        }

        const customerEmail = (session.customer_details && session.customer_details.email)
            || session.customer_email || null;
        const customerName = (session.metadata && session.metadata.customer_name) || null;
        const shippingAddr = (session.metadata && session.metadata.shipping_address) || null;

        const [orderResult] = await pool.query(
            "INSERT INTO orders (stripe_session, customer_name, customer_email, shipping_address, total_cents) VALUES (?, ?, ?, ?, ?)",
            [sessionId, customerName, customerEmail, shippingAddr, totalCents]
        );
        const orderId = orderResult.insertId;
        for (const oi of orderItemsData) {
            await pool.query(
                "INSERT INTO order_items (order_id, item_name, price_cents, quantity) VALUES (?, ?, ?, ?)",
                [orderId, oi.name, oi.price_cents, oi.qty]
            );
        }

        for (const ci of itemsToDecrement) {
            await pool.query(
                "UPDATE shop_items SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?",
                [ci.qty, ci.id]
            );
            console.log(`✔ Confirmed & decremented quantity by ${ci.qty} for shop item ${ci.id} (session ${sessionId})`);

            // Auto-move to portfolio if quantity reached 0
            try {
                await moveToPortfolioIfEmpty(pool, ci.id);
            } catch (err) {
                console.error("Auto-move to portfolio failed:", err.message);
            }
        }

        res.json({ confirmed: true, decremented: true });
    } catch (err) {
        console.error("Confirm error:", err.message);
        res.status(500).json({ error: "Failed to confirm order." });
    }
});

// ── Stripe Webhook — decrement quantity on successful payment ──
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(503).send();

    const stripe = require("stripe")(stripeKey);
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        if (webhookSecret) {
            const sig = req.headers["stripe-signature"];
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            // No webhook secret configured — parse the event directly
            event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        }
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const itemId = session.metadata && session.metadata.shop_item_id;
        const cartItemsJson = session.metadata && session.metadata.cart_items;

        let itemsToDecrement = [];
        if (cartItemsJson) {
            try { itemsToDecrement = JSON.parse(cartItemsJson); } catch (_) {}
        } else if (itemId) {
            itemsToDecrement = [{ id: parseInt(itemId, 10), qty: 1 }];
        }

        if (itemsToDecrement.length) {
            try {
                const pool = getPool();

                // Save order to database
                let totalCents = 0;
                const orderItemsData = [];
                for (const ci of itemsToDecrement) {
                    const [itemRows] = await pool.query("SELECT name, price_cents FROM shop_items WHERE id = ?", [ci.id]);
                    if (itemRows.length) {
                        const item = itemRows[0];
                        totalCents += item.price_cents * ci.qty;
                        orderItemsData.push({ name: item.name, price_cents: item.price_cents, qty: ci.qty });
                    }
                }

                const stripeSessionId = session.id || "";
                const customerEmail = (session.customer_details && session.customer_details.email)
                    || session.customer_email || null;
                const customerName = (session.metadata && session.metadata.customer_name) || null;
                const shippingAddress = (session.metadata && session.metadata.shipping_address) || null;

                const [orderResult] = await pool.query(
                    "INSERT INTO orders (stripe_session, customer_name, customer_email, shipping_address, total_cents) VALUES (?, ?, ?, ?, ?)",
                    [stripeSessionId, customerName, customerEmail, shippingAddress, totalCents]
                );
                const orderId = orderResult.insertId;
                for (const oi of orderItemsData) {
                    await pool.query(
                        "INSERT INTO order_items (order_id, item_name, price_cents, quantity) VALUES (?, ?, ?, ?)",
                        [orderId, oi.name, oi.price_cents, oi.qty]
                    );
                }

                for (const ci of itemsToDecrement) {
                    await pool.query(
                        "UPDATE shop_items SET quantity = GREATEST(quantity - ?, 0) WHERE id = ?",
                        [ci.qty, ci.id]
                    );
                    console.log(`✔ Decremented quantity by ${ci.qty} for shop item ${ci.id}`);
                    await moveToPortfolioIfEmpty(pool, ci.id);
                }
            } catch (err) {
                console.error("Webhook DB error:", err.message);
            }
        }
    }

    res.json({ received: true });
});

module.exports = router;
