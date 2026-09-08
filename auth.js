/*  auth.js – JWT Authentication Middleware
 *  ────────────────────────────────────────
 *  verifyToken   – ensures a valid JWT is present in the Authorization header.
 *  authorise()   – factory that returns middleware restricting access to
 *                  one or more roles (e.g. authorise('Doctor','Admin')).
 */

const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';

/* ── Verify Token ───────────────────────────────────────────────── */
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];          // "Bearer <token>"
    const token      = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;   // { id, username, role, doctorId }
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

/* ── Role-based Authorisation ───────────────────────────────────── */
function authorise(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated.' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'You do not have permission for this action.' });
        }
        next();
    };
}

module.exports = { verifyToken, authorise };
