/**
 * server.js — Express Application Entry Point
 *
 * Serves the static art-site frontend,
 * exposes REST API routes backed by MySQL,
 * and handles Stripe Checkout sessions.
 */

require("dotenv").config();
const express       = require("express");
const session       = require("express-session");
const helmet        = require("helmet");
const path          = require("path");
const { initDb }    = require("./db/init");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security headers ───────────────────────────────────────────
app.use(
    helmet({
        contentSecurityPolicy: false,        // allow inline scripts in HTML
        crossOriginEmbedderPolicy: false
    })
);

// ── Body parsers (skip JSON parsing for Stripe webhook) ────────
app.use((req, res, next) => {
    if (req.originalUrl === "/api/checkout/webhook") return next();
    express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));

// ── Trust Nginx proxy (needed for secure cookies behind reverse proxy) ──
app.set("trust proxy", 1);

// ── Session middleware ─────────────────────────────────────────
const useSecureCookie = (process.env.SITE_URL || "").startsWith("https");
app.use(
    session({
        secret: process.env.SESSION_SECRET || "change-me-in-production",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: useSecureCookie,
            sameSite: "lax",
            maxAge: 30 * 60 * 1000 // 30 minutes
        }
    })
);

// ── Serve uploaded images ──────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Stripe webhook needs raw body — mount BEFORE json parser would strip it ──
const checkoutRoutes = require("./routes/checkout");
app.use("/api/checkout/webhook",
    express.raw({ type: "application/json" }),
    (req, _res, next) => { req._rawBodyParsed = true; next(); }
);

// ── API Routes ─────────────────────────────────────────────────
app.use("/api/auth",      require("./routes/auth"));
app.use("/api/content",   require("./routes/content"));
app.use("/api/shop",      require("./routes/shop"));
app.use("/api/portfolio", require("./routes/portfolio"));
app.use("/api/checkout",  checkoutRoutes);

// ── Serve static site files (HTML, CSS, JS, img) ──────────────
app.use(express.static(__dirname, {
    extensions: ["html"]          // allows /pages/shop → shop.html
}));

// ── Fallback: serve index.html for bare root ───────────────────
app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ── Start (async — must connect to MySQL first) ────────────────
(async () => {
    try {
        await initDb();
        console.log("✔ Database connected & tables ready");

        app.listen(PORT, () => {
            console.log(`✔ Server running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("✖ Failed to start:", err);
        process.exit(1);
    }
})();
