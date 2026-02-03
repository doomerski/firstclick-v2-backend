const crypto = require('crypto');
const { appendAuditEvent } = require('../storage/audit-store');

async function logEvent({
  action,
  entity_type,
  entity_id,
  actor = null,
  before = null,
  after = null,
  diff = null,
  reason = null,
  meta = {}
}) {
  if (!action || !entity_type) {
    throw new Error('logEvent requires action and entity_type');
  }

  const event = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    action,
    entity_type,
    entity_id: entity_id ?? null,
    actor,
    reason,
    before,
    after,
    diff,
    meta
  };

  await appendAuditEvent(event);
  return event;
}

module.exports = {
  logEvent
};
