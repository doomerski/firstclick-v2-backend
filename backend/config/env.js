/**
 * Environment Configuration – Fail-Fast Loader
 *
 * Loads the correct .env file based on NODE_ENV:
 *   production  → .env.production
 *   test        → .env.test
 *   development → .env.development (or .env as fallback)
 *
 * Required variables crash the process immediately if missing.
 */

const path = require('path');
const dotenv = require('dotenv');

// ---------------------------------------------------------------------------
// Determine which .env file to load
// ---------------------------------------------------------------------------
const nodeEnv = process.env.NODE_ENV || 'development';

const envFile =
  nodeEnv === 'production'
    ? '.env.production'
    : nodeEnv === 'test'
    ? '.env.test'
    : '.env.development';

// Attempt environment-specific file first, fall back to .env
const rootDir = path.join(__dirname, '..');
const loaded = dotenv.config({ path: path.join(rootDir, envFile) });
if (loaded.error && nodeEnv === 'development') {
  dotenv.config({ path: path.join(rootDir, '.env') });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name, fallback = undefined) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

// ---------------------------------------------------------------------------
// Exported ENV object (crash on missing required vars)
// ---------------------------------------------------------------------------
const ENV = {
  // Runtime
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: toInt(optional('PORT', '3000'), 3000),

  // Public origin (CORS, links)
  webOrigin: required('WEB_ORIGIN'),

  // Database
  databaseUrl: required('DATABASE_URL'),
  pgPoolMax: toInt(optional('PG_POOL_MAX', '10'), 10),
  pgIdleTimeoutMs: toInt(optional('PG_IDLE_TIMEOUT_MS', '30000'), 30000),

  // Auth
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),
  sessionTtlDays: toInt(optional('SESSION_TTL_DAYS', '30'), 30),

  // Rate limiting
  rateLimitWindowMs: toInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 60000),
  rateLimitMax: toInt(optional('RATE_LIMIT_MAX', '120'), 120),

  // Logging
  logLevel: optional('LOG_LEVEL', 'info'),

  // Proxy (behind nginx)
  trustProxy: optional('TRUST_PROXY', '0'),

  // Email (optional in dev, required if EMAIL_MODE=smtp)
  emailMode: optional('EMAIL_MODE', nodeEnv === 'production' ? 'smtp' : 'console'),
  emailService: optional('EMAIL_SERVICE', 'gmail'),
  emailHost: optional('EMAIL_HOST', 'localhost'),
  emailPort: toInt(optional('EMAIL_PORT'), nodeEnv === 'production' ? 587 : 1025),
  emailSecure: toBool(optional('EMAIL_SECURE'), nodeEnv === 'production'),
  emailUser: optional('EMAIL_USER', ''),
  emailPassword: optional('EMAIL_PASSWORD', ''),
  emailFrom: optional('EMAIL_FROM', 'noreply@firstclick.local'),
  superadminEmail: optional('SUPERADMIN_EMAIL', '')
};

// ---------------------------------------------------------------------------
// Post-load validation for conditional requirements
// ---------------------------------------------------------------------------
if (ENV.emailMode === 'smtp' && (!ENV.emailUser || !ENV.emailPassword)) {
  throw new Error('EMAIL_MODE=smtp requires EMAIL_USER and EMAIL_PASSWORD');
}

if (!ENV.superadminEmail) {
  console.warn('⚠️  SUPERADMIN_EMAIL not configured; admin notifications will be skipped.');
}

module.exports = ENV;
