const { pool } = require('../mock-db');

function scrubPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(scrubPayload);
  const cleaned = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (key.toLowerCase().includes('password')) {
      cleaned[key] = '[redacted]';
    } else {
      cleaned[key] = scrubPayload(value);
    }
  });
  return cleaned;
}

function auditLog() {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', async () => {
      try {
        const user = req.user || {};
        const action = `${req.method} ${req.baseUrl}${req.path}`;
        const details = {
          params: req.params || {},
          query: req.query || {},
          body: scrubPayload(req.body || {}),
          status: res.statusCode,
          duration_ms: Date.now() - start
        };
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;
        await pool.query(
          'INSERT INTO audit_logs (user_id, user_email, user_role, action, resource_type, resource_id, details, ip_address, user_agent, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
          [
            user.id || null,
            user.email || null,
            user.role || null,
            action,
            req.baseUrl.includes('users') ? 'user' : null,
            req.params?.id || null,
            details,
            ip,
            userAgent,
            new Date().toISOString()
          ]
        );
      } catch (error) {
        // Non-blocking logging
      }
    });
    next();
  };
}

module.exports = {
  auditLog
};
