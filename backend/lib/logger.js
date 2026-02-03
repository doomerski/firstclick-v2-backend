/**
 * Pino Logger – Centralized, Structured Logging
 *
 * Usage:
 *   const logger = require('./lib/logger');
 *   logger.info({ userId: 123 }, 'User signed in');
 *   logger.error({ err }, 'Something broke');
 *
 * In development: pipe output through pino-pretty for readability
 *   node server.js | npx pino-pretty
 */

const pino = require('pino');
const ENV = require('../config/env');

const logger = pino({
  level: ENV.logLevel,
  // Redact sensitive fields from logs
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token'],
    censor: '[REDACTED]'
  },
  // In production, use default JSON; in dev, allow pretty-printing via pipe
  ...(ENV.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      })
});

module.exports = logger;
