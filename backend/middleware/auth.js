const jwt = require('jsonwebtoken');
const { pool } = require('../mock-db');
const ENV = require('../config/env');

const JWT_SECRET = ENV.jwtSecret;

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return next();
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    if (payload.sid) {
      const sessionResult = await pool.query('SELECT * FROM sessions WHERE id = $1', [payload.sid]);
      const session = sessionResult.rows[0];
      const now = new Date();
      if (!session || session.revoked_at || (session.expires_at && new Date(session.expires_at) <= now)) {
        req.authError = new Error('Session revoked');
        req.user = null;
      }
    }
  } catch (error) {
    req.authError = error;
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (req.authError) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

function requireSuperAdmin(req, res, next) {
  if (req.authError) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  return next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireSuperAdmin
};
