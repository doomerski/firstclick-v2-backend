const crypto = require('crypto');

function auditContext(req, res, next) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? String(forwarded).split(',')[0].trim() : req.socket?.remoteAddress;

  req.audit = {
    requestId: crypto.randomUUID(),
    ip: ip || null,
    userAgent: req.headers['user-agent'] || null
  };

  if (req.user) {
    req.actor = {
      role: req.user.role,
      id: req.user.id,
      email: req.user.email || null
    };
  }

  next();
}

module.exports = {
  auditContext
};
