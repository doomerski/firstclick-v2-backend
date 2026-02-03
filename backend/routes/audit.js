const express = require('express');
const { readAuditEvents } = require('../storage/audit-store');
const { logEvent } = require('../services/audit-service');

const router = express.Router();

// TODO: protect admin-only access
router.get('/', async (req, res) => {
  try {
    const { entity_type, entity_id, limit } = req.query;
    const events = await readAuditEvents({
      entity_type,
      entity_id,
      limit: limit ? Number(limit) : 200
    });
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

router.get('/recent', async (req, res) => {
  try {
    const { limit } = req.query;
    const events = await readAuditEvents({ limit: limit ? Number(limit) : 100 });
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { event_type, entity_type, entity_id, data, user_id, timestamp } = req.body || {};
    const event = await logEvent({
      action: event_type,
      entity_type,
      entity_id,
      actor: user_id ? { role: 'admin', id: user_id } : null,
      after: data || null,
      meta: { ...(req.audit || {}), override_ts: timestamp || null }
    });
    res.json({ event });
  } catch (error) {
    res.status(500).json({ error: 'Failed to log audit event' });
  }
});

module.exports = router;
