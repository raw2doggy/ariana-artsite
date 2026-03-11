/**
 * db/init.js — MySQL Database Initialization
 *
 * Creates a connection pool to DigitalOcean Managed MySQL,
 * creates tables on first run, and seeds default content.
 */

const mysql = require("mysql2/promise");
const fs    = require("fs");
const path  = require("path");

let pool;

function getPool() {
    if (!pool) {
        const caPath = path.join(__dirname, "ca-certificate.crt");
        pool = mysql.createPool({
            host:     process.env.DB_HOST,
            port:     parseInt(process.env.DB_PORT) || 25060,
            user:     process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || "defaultdb",
            ssl: {
                ca: fs.readFileSync(caPath)
            },
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return pool;
}

// ── Schema ──────────────────────────────────────────────────

async function createTables() {
    const p = getPool();

    await p.query(`
        CREATE TABLE IF NOT EXISTS site_content (
            \`key\`   VARCHAR(100) PRIMARY KEY,
            value   TEXT NOT NULL
        )
    `);

    await p.query(`
        CREATE TABLE IF NOT EXISTS shop_items (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            name        VARCHAR(255) NOT NULL,
            price_cents INT NOT NULL DEFAULT 0,
            quantity    INT NOT NULL DEFAULT 0,
            item_type   ENUM('physical','digital') NOT NULL DEFAULT 'physical',
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migration: add quantity column if it doesn't exist (for existing databases)
    try {
        await p.query(`ALTER TABLE shop_items ADD COLUMN quantity INT NOT NULL DEFAULT 0 AFTER price_cents`);
    } catch (_) {
        // Column already exists — ignore
    }

    // Migration: add item_type column if it doesn't exist
    try {
        await p.query(`ALTER TABLE shop_items ADD COLUMN item_type ENUM('physical','digital') NOT NULL DEFAULT 'physical' AFTER quantity`);
    } catch (_) {
        // Column already exists — ignore
    }

    await p.query(`
        CREATE TABLE IF NOT EXISTS shop_item_images (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            shop_item_id INT NOT NULL,
            image_path   VARCHAR(500) NOT NULL,
            sort_order   INT DEFAULT 0,
            FOREIGN KEY (shop_item_id) REFERENCES shop_items(id) ON DELETE CASCADE
        )
    `);

    await p.query(`
        CREATE TABLE IF NOT EXISTS portfolio_items (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            title      VARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await p.query(`
        CREATE TABLE IF NOT EXISTS portfolio_item_images (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            portfolio_item_id INT NOT NULL,
            image_path        VARCHAR(500) NOT NULL,
            sort_order        INT DEFAULT 0,
            FOREIGN KEY (portfolio_item_id) REFERENCES portfolio_items(id) ON DELETE CASCADE
        )
    `);

    await p.query(`
        CREATE TABLE IF NOT EXISTS support_messages (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            email      VARCHAR(255) NOT NULL,
            message    TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await p.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            stripe_session   VARCHAR(255) NOT NULL,
            customer_name    VARCHAR(200) DEFAULT NULL,
            customer_email   VARCHAR(255) DEFAULT NULL,
            shipping_address TEXT DEFAULT NULL,
            total_cents      INT NOT NULL DEFAULT 0,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migration: add customer_name column if it doesn't exist
    try {
        await p.query(`ALTER TABLE orders ADD COLUMN customer_name VARCHAR(200) DEFAULT NULL AFTER stripe_session`);
    } catch (_) {
        // Column already exists — ignore
    }

    // Migration: add customer_email column if it doesn't exist (for existing databases)
    try {
        await p.query(`ALTER TABLE orders ADD COLUMN customer_email VARCHAR(255) DEFAULT NULL AFTER customer_name`);
    } catch (_) {
        // Column already exists — ignore
    }

    // Migration: add shipping_address column if it doesn't exist
    try {
        await p.query(`ALTER TABLE orders ADD COLUMN shipping_address TEXT DEFAULT NULL AFTER customer_email`);
    } catch (_) {
        // Column already exists — ignore
    }

    await p.query(`
        CREATE TABLE IF NOT EXISTS order_items (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            order_id    INT NOT NULL,
            item_name   VARCHAR(255) NOT NULL,
            price_cents INT NOT NULL DEFAULT 0,
            quantity    INT NOT NULL DEFAULT 1,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
    `);
}

// ── Seed Defaults ───────────────────────────────────────────

async function seedDefaults() {
    const p = getPool();
    const [rows] = await p.query("SELECT COUNT(*) AS c FROM site_content");
    if (rows[0].c > 0) return; // already seeded

    const defaults = {
        siteTitle:   "Ariana's Art Site",
        welcomeText: "Welcome! Explore original artwork by Ariana. Browse the portfolio to see the full collection, or check out the shop to bring a piece home.",
        aboutTitle:  "About the Artist",
        aboutName:   "Ariana",
        aboutBio1:   "Welcome to my art site! I'm a passionate artist who loves creating pieces that capture emotion and tell stories. Browse my portfolio to see my work, or visit the shop to purchase original pieces.",
        aboutBio2:   "Feel free to reach out if you have any questions or would like to commission a custom piece.",
        aboutImage:  ""
    };

    const insertSql = "INSERT INTO site_content (`key`, value) VALUES (?, ?)";
    for (const [key, value] of Object.entries(defaults)) {
        await p.query(insertSql, [key, value]);
    }

    // Seed shop items
    await p.query("INSERT INTO shop_items (name, price_cents) VALUES (?, ?)", ["Art Piece 1", 5000]);
    await p.query("INSERT INTO shop_items (name, price_cents) VALUES (?, ?)", ["Art Piece 2", 7500]);

    // Seed portfolio items
    for (let i = 0; i < 6; i++) {
        await p.query("INSERT INTO portfolio_items (title) VALUES (?)", ["Piece Title"]);
    }

    console.log("Database seeded with default content.");
}

// ── Initialize (called once at server start) ────────────────

async function initDb() {
    await createTables();
    await seedDefaults();
    console.log("MySQL connected & tables ready.");
}

module.exports = { getPool, initDb };
