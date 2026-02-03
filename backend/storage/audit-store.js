/**
 * Audit Store - JSONL-based audit log storage
 * 
 * Stores audit events as newline-delimited JSON for append-only writes
 * and efficient streaming reads.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const AUDIT_FILE = path.join(__dirname, '..', 'data', 'audit.jsonl');

/**
 * Ensure the data directory exists
 */
function ensureDataDir() {
  const dataDir = path.dirname(AUDIT_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Append a single audit event to the log
 * @param {Object} event - The audit event to append
 */
async function appendAuditEvent(event) {
  ensureDataDir();
  const line = JSON.stringify(event) + '\n';
  await fs.promises.appendFile(AUDIT_FILE, line, 'utf8');
}

/**
 * Read audit events with optional filtering
 * @param {Object} options - Filter options
 * @param {string} [options.entity_type] - Filter by entity type
 * @param {string} [options.entity_id] - Filter by entity ID
 * @param {number} [options.limit=200] - Maximum events to return
 * @returns {Promise<Array>} Array of audit events (newest first)
 */
async function readAuditEvents(options = {}) {
  const { entity_type, entity_id, limit = 200 } = options;
  
  // If file doesn't exist, return empty array
  if (!fs.existsSync(AUDIT_FILE)) {
    return [];
  }

  const events = [];
  
  const fileStream = fs.createReadStream(AUDIT_FILE, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      const event = JSON.parse(line);
      
      // Apply filters
      if (entity_type && event.entity_type !== entity_type) continue;
      if (entity_id && event.entity_id !== entity_id) continue;
      
      events.push(event);
    } catch (err) {
      // Skip malformed lines
      console.warn('Skipping malformed audit line:', line.substring(0, 50));
    }
  }

  // Return newest first, limited
  return events.reverse().slice(0, limit);
}

/**
 * Get count of audit events
 * @returns {Promise<number>} Total event count
 */
async function countAuditEvents() {
  if (!fs.existsSync(AUDIT_FILE)) {
    return 0;
  }

  let count = 0;
  const fileStream = fs.createReadStream(AUDIT_FILE, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) count++;
  }

  return count;
}

module.exports = {
  appendAuditEvent,
  readAuditEvents,
  countAuditEvents
};
