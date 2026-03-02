/**
 * auth.js — Authentication & Security Module
 *
 * Security features:
 *  - SHA-256 password hashing (no plaintext storage)
 *  - Input sanitization against XSS (HTML entity encoding)
 *  - Parameterised-style input validation against SQLi patterns
 *  - CSRF token generation per session
 *  - Rate-limited login attempts (lockout after 5 failures)
 *  - Session expiry (auto-logout after 30 min)
 */

const Auth = (() => {
    "use strict";

    // ── Constants ────────────────────────────────────────────
    const MAX_ATTEMPTS       = 5;
    const LOCKOUT_MS         = 2 * 60 * 1000;   // 2-minute lockout
    const SESSION_EXPIRY_MS  = 30 * 60 * 1000;  // 30-minute session

    // Default admin credentials (hash of "admin123" — change in production)
    // SHA-256 of "admin123"
    const DEFAULT_USER = "admin";
    const DEFAULT_HASH =
        "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

    // ── XSS Prevention ──────────────────────────────────────
    function sanitize(str) {
        if (typeof str !== "string") return "";
        const map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#x27;",
            "/": "&#x2F;",
            "`": "&#96;"
        };
        return str.replace(/[&<>"'/`]/g, ch => map[ch]);
    }

    // Sanitize before inserting into DOM — use this instead of innerHTML
    function safeSetText(element, text) {
        if (element) element.textContent = text;
    }

    function safeSetHTML(element, html) {
        if (element) element.innerHTML = sanitize(html);
    }

    // ── SQL Injection Prevention ────────────────────────────
    // Block common SQLi payloads in any user-supplied input
    const SQLI_PATTERNS = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b)/i,
        /(--|#|\/\*|\*\/)/,
        /('|")\s*(OR|AND)\s*('|"|\d)/i,
        /;\s*(DROP|DELETE|UPDATE|INSERT)/i,
        /\b(OR|AND)\b\s+\d+\s*=\s*\d+/i
    ];

    function containsSQLi(input) {
        if (typeof input !== "string") return false;
        return SQLI_PATTERNS.some(p => p.test(input));
    }

    function validateInput(input) {
        if (containsSQLi(input)) {
            console.warn("Blocked potential SQL injection attempt.");
            return { valid: false, reason: "Invalid characters detected." };
        }
        return { valid: true, value: sanitize(input) };
    }

    // ── Hashing (SHA-256 via SubtleCrypto) ──────────────────
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");
    }

    // ── CSRF Token ──────────────────────────────────────────
    function generateCSRFToken() {
        const arr = new Uint8Array(32);
        crypto.getRandomValues(arr);
        const token = Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
        sessionStorage.setItem("csrf_token", token);
        return token;
    }

    function getCSRFToken() {
        return sessionStorage.getItem("csrf_token") || generateCSRFToken();
    }

    function verifyCSRFToken(token) {
        return token === sessionStorage.getItem("csrf_token");
    }

    // ── Rate Limiting ───────────────────────────────────────
    function getAttempts() {
        const data = JSON.parse(localStorage.getItem("login_attempts") || "{}");
        // Reset if lockout has expired
        if (data.lockedUntil && Date.now() > data.lockedUntil) {
            localStorage.removeItem("login_attempts");
            return { count: 0, lockedUntil: null };
        }
        return { count: data.count || 0, lockedUntil: data.lockedUntil || null };
    }

    function recordFailedAttempt() {
        const data = getAttempts();
        data.count += 1;
        if (data.count >= MAX_ATTEMPTS) {
            data.lockedUntil = Date.now() + LOCKOUT_MS;
        }
        localStorage.setItem("login_attempts", JSON.stringify(data));
        return data;
    }

    function clearAttempts() {
        localStorage.removeItem("login_attempts");
    }

    // ── Session Management ──────────────────────────────────
    function createSession(username) {
        const session = {
            user: username,
            token: generateCSRFToken(),
            expiresAt: Date.now() + SESSION_EXPIRY_MS
        };
        sessionStorage.setItem("admin_session", JSON.stringify(session));
        return session;
    }

    function getSession() {
        const raw = sessionStorage.getItem("admin_session");
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (Date.now() > session.expiresAt) {
            destroySession();
            return null;
        }
        return session;
    }

    function destroySession() {
        sessionStorage.removeItem("admin_session");
        sessionStorage.removeItem("csrf_token");
    }

    function isLoggedIn() {
        return getSession() !== null;
    }

    // ── Login Flow ──────────────────────────────────────────
    async function login(username, password) {
        // Rate-limit check
        const attempts = getAttempts();
        if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
            const secsLeft = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
            return {
                success: false,
                message: `Too many attempts. Try again in ${secsLeft}s.`
            };
        }

        // Validate inputs
        const uCheck = validateInput(username);
        const pCheck = validateInput(password);
        if (!uCheck.valid) return { success: false, message: uCheck.reason };
        if (!pCheck.valid) return { success: false, message: pCheck.reason };

        // Hash & compare
        const hash = await sha256(password);
        if (username === DEFAULT_USER && hash === DEFAULT_HASH) {
            clearAttempts();
            createSession(username);
            return { success: true, message: "Login successful." };
        }

        // Failed
        const updated = recordFailedAttempt();
        const remaining = MAX_ATTEMPTS - updated.count;
        return {
            success: false,
            message:
                remaining > 0
                    ? `Invalid credentials. ${remaining} attempt(s) remaining.`
                    : "Account locked. Try again in 2 minutes."
        };
    }

    function logout() {
        destroySession();
    }

    // ── Public API ──────────────────────────────────────────
    return {
        sanitize,
        safeSetText,
        safeSetHTML,
        validateInput,
        containsSQLi,
        sha256,
        getCSRFToken,
        verifyCSRFToken,
        login,
        logout,
        isLoggedIn,
        getSession,
        createSession,
        destroySession
    };
})();
