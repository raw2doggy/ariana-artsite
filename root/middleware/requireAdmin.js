/**
 * middleware/requireAdmin.js
 *
 * Express middleware that blocks unauthenticated requests.
 * Admin routes use this to enforce server-side session auth.
 */

function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.status(401).json({ error: "Unauthorized" });
}

module.exports = requireAdmin;
