/**
 * auth.js — Authentication Module
 *
 * Handles admin login/logout via the server API.
 * Session management is handled server-side with express-session.
 * A sessionStorage flag provides a fast synchronous check for UI redirects.
 */

const Auth = (() => {
    "use strict";

    // ── Session Helpers ─────────────────────────────────────

    /** Synchronous check — used for quick UI redirects. */
    function isLoggedIn() {
        return sessionStorage.getItem("admin_logged_in") === "true";
    }

    /** POST credentials to the server; sets local flag on success. */
    async function login(username, password) {
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.success) {
                sessionStorage.setItem("admin_logged_in", "true");
            }
            return data;
        } catch (e) {
            return { success: false, message: "Network error. Please try again." };
        }
    }

    /** Destroy server session and clear local flag. */
    async function logout() {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch (_) {
            /* ignore network errors on logout */
        }
        sessionStorage.removeItem("admin_logged_in");
    }

    /** Verify the session is still valid on the server. */
    async function checkSession() {
        try {
            const res  = await fetch("/api/auth/status");
            const data = await res.json();
            if (data.loggedIn) {
                sessionStorage.setItem("admin_logged_in", "true");
            } else {
                sessionStorage.removeItem("admin_logged_in");
            }
            return data.loggedIn;
        } catch {
            return false;
        }
    }

    // ── Sanitization (kept for admin.js / display compatibility) ─

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

    function validateInput(input) {
        return { valid: true, value: sanitize(input) };
    }

    // ── Public API ──────────────────────────────────────────
    return {
        isLoggedIn,
        login,
        logout,
        checkSession,
        sanitize,
        validateInput
    };
})();
