const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const pinoHttp = require('pino-http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ENV = require('./config/env');
const logger = require('./lib/logger');
const { pool: dbPool, closePool: closeDbPool } = require('./db/pool');
const { auditContext } = require('./middleware/audit-context');
const { authenticateToken, requireAdmin, requireSuperAdmin } = require('./middleware/auth');
const { auditLog } = require('./middleware/audit-log');
const auditRoutes = require('./routes/audit');
const adminRoutes = require('./routes/admin');
const superadminRoutes = require('./routes/superadmin');
const { logEvent } = require('./services/audit-service');
const { diffObjects } = require('./utils/diff');
const { initEmailService, sendApprovalEmail, sendRejectionEmail, sendNewApplicationNotification } = require('./email-service');

// Import PostgreSQL team applications service
const teamAppsDb = require('./services/team-applications-db');

// Import mock database
const { pool } = require('./mock-db');

const app = express();
const PORT = ENV.port;

// Initialize email service
initEmailService();

const SESSION_TTL_DAYS = ENV.sessionTtlDays;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

// Stripe payment processing fees (2.9% + $0.30 CAD per transaction)
const STRIPE_FEES = {
  percentage: 0.029,
  fixedFee: 0.30,
  description: '2.9% + $0.30 CAD'
};

function uuidv4() {
  return crypto.randomUUID();
}

async function createSession(user, role) {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await pool.query(
    'INSERT INTO sessions (id, user_id, user_role, created_at, expires_at, revoked_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [sessionId, user.id, role, now.toISOString(), expiresAt.toISOString(), null]
  );
  return { sessionId, expiresAt };
}

async function issueToken(user, role) {
  const { sessionId, expiresAt } = await createSession(user, role);
  const token = jwt.sign({ id: user.id, role, sid: sessionId, email: user.email }, ENV.jwtSecret, {
    expiresIn: ENV.jwtExpiresIn
  });
  return { token, sessionId, expiresAt };
}

// ---------------------------------------------------------------------------
// Production Hardening Middleware
// ---------------------------------------------------------------------------

// Trust proxy (nginx/load balancer) for correct client IP and secure cookies
app.set('trust proxy', ENV.trustProxy === '1');

// Remove X-Powered-By header
app.disable('x-powered-by');

// Structured request logging
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health' // Don't log health checks
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  }
}));

// Security headers (CSP, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: ENV.isProduction ? undefined : false // Disable CSP in dev for inline scripts
}));

// CORS – strict origin in production
app.use(cors({
  origin: ENV.webOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting – basic abuse control
const limiter = rateLimit({
  windowMs: ENV.rateLimitWindowMs,
  max: ENV.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
  skip: (req) => req.url === '/health' // Don't rate limit health checks
});
app.use(limiter);

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Body parsing with size limits to prevent payload abuse
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Health check endpoint (for nginx/systemd/k8s monitoring)
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Serve static files from the frontend directory (before auth middleware)
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath, {
  dotfiles: 'ignore',
  etag: true,
  maxAge: ENV.isProduction ? '1d' : 0
}));

app.use(authenticateToken);
app.use(auditContext);
app.use('/api/audit', auditRoutes);
app.use('/api/admin', requireAdmin);
app.use('/api/admin', auditLog());
app.use('/api/admin', adminRoutes);
app.use('/api/superadmin', requireSuperAdmin);
app.use('/api/superadmin', superadminRoutes);

const expansionProposals = [];
const teamApplications = [];
const contractorAuditLog = new Map();
const contractorPayments = [];

const CONTRACTOR_TIERS = {
  bronze: { platformFee: 0.20 },
  silver: { platformFee: 0.15 },
  gold: { platformFee: 0.10 }
};

function getTierRate(tierKey) {
  const key = String(tierKey || 'bronze').toLowerCase();
  return (CONTRACTOR_TIERS[key] || CONTRACTOR_TIERS.bronze).platformFee;
}

function parseMonthParam(monthParam) {
  if (!monthParam) return null;
  const match = String(monthParam).match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  return new Date(year, month, 1);
}

function getMonthRange(monthParam) {
  const start = parseMonthParam(monthParam) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(parsed) ? null : parsed;
}

function attachContractorTier(jobs, contractors = []) {
  if (!Array.isArray(jobs) || jobs.length === 0) return jobs;
  const tierById = new Map(
    (contractors || []).map(contractor => [
      contractor.id,
      contractor.contractor_tier || contractor.contractorTier || 'bronze'
    ])
  );
  return jobs.map(job => {
    if (!job) return job;
    if (job.contractor_tier || job.contractorTier) return job;
    const tier = tierById.get(job.contractor_id);
    if (!tier) return job;
    return { ...job, contractor_tier: tier };
  });
}

function computeFinancials(job) {
  const completionPayment = job?.completion_report?.payment || {};
  const completionReport = job?.completion_report || {};
  const finalPrice = toNumber(completionPayment.final_price)
    ?? toNumber(job.final_price)
    ?? toNumber(job.estimate?.max)
    ?? toNumber(job.estimate?.min)
    ?? null;
  if (finalPrice === null) {
    return {
      final_price: null,
      material_fees: null,
      stripe_fee: null,
      platform_fee: null,
      contractor_payout: null,
      net_platform_revenue: null
    };
  }

  const materialFees = toNumber(job.material_fees)
    ?? toNumber(completionPayment.materials_cost)
    ?? toNumber(completionReport.material_costs)
    ?? 0;
  
  // Calculate Stripe processing fees (2.9% + $0.30 per transaction)
  const stripeFee = (finalPrice * STRIPE_FEES.percentage) + STRIPE_FEES.fixedFee;
  
  const netAmount = Math.max(0, finalPrice - materialFees);
  const tierRate = getTierRate(job.contractor_tier || job.contractorTier);
  const platformFee = netAmount * tierRate;
  
  // Contractor payout = net amount - stripe fees - platform fee
  const contractorPayout = Math.max(0, netAmount - stripeFee - platformFee);
  
  // Net platform revenue = platform fee (net platform revenue after paying stripe)
  const netPlatformRevenue = platformFee;

  return {
    final_price: Math.round(finalPrice * 100) / 100,
    material_fees: Math.round(materialFees * 100) / 100,
    stripe_fee: Math.round(stripeFee * 100) / 100,
    platform_fee: Math.round(platformFee * 100) / 100,
    contractor_payout: Math.round(contractorPayout * 100) / 100,
    net_platform_revenue: Math.round(netPlatformRevenue * 100) / 100
  };
}

function nextPaymentDate(schedule) {
  const now = new Date();
  const day = now.getDay();
  const date = new Date(now);
  if (schedule === 'per-job') return now;
  if (schedule === 'weekly') {
    const daysUntilFriday = (5 - day + 7) % 7 || 7;
    date.setDate(now.getDate() + daysUntilFriday);
    return date;
  }
  if (schedule === 'biweekly') {
    const daysUntilFriday = (5 - day + 7) % 7 || 7;
    date.setDate(now.getDate() + daysUntilFriday + 7);
    return date;
  }
  if (schedule === 'monthly') {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  return now;
}

const UPLOAD_ROOT = path.join(__dirname, 'uploads', 'contractor-documents');
const JOB_PHOTO_ROOT = path.join(__dirname, 'uploads', 'job-photos');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
fs.mkdirSync(JOB_PHOTO_ROOT, { recursive: true });

let servicePricing = null;
try {
  const pricingPath = path.join(__dirname, 'service-pricing.json');
  servicePricing = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
} catch (error) {
  console.warn('Service pricing not loaded:', error.message);
  servicePricing = { globalRules: { urgencyMultipliers: {} }, categories: [] };
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function sanitizeFilename(name) {
  return String(name || 'document')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

function saveContractorDocument(contractorId, docType, doc) {
  if (!doc) return null;
  const dataUrl = doc.dataUrl || doc.data_url || null;
  if (!dataUrl) {
    return {
      filename: doc.filename || doc,
      receivedAt: new Date().toISOString(),
      size: doc.size || 0,
      mime: doc.mime || null,
      path: null
    };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return {
      filename: doc.filename || docType,
      receivedAt: new Date().toISOString(),
      size: doc.size || 0,
      mime: doc.mime || null,
      path: null
    };
  }

  const contractorDir = path.join(UPLOAD_ROOT, contractorId);
  fs.mkdirSync(contractorDir, { recursive: true });

  const baseName = sanitizeFilename(doc.filename || `${docType}`);
  const fileName = `${docType}-${Date.now()}-${baseName}`;
  const filePath = path.join(contractorDir, fileName);

  fs.writeFileSync(filePath, parsed.buffer);

  return {
    filename: doc.filename || baseName,
    receivedAt: new Date().toISOString(),
    size: parsed.buffer.length,
    mime: parsed.mime,
    path: filePath
  };
}

function saveJobPhoto(jobId, photo) {
  if (!photo) return null;
  const dataUrl = photo.dataUrl || photo.data_url || null;
  if (!dataUrl) {
    return {
      filename: photo.filename || 'job-photo',
      receivedAt: new Date().toISOString(),
      size: photo.size || 0,
      mime: photo.mime || null,
      path: null
    };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return {
      filename: photo.filename || 'job-photo',
      receivedAt: new Date().toISOString(),
      size: photo.size || 0,
      mime: photo.mime || null,
      path: null
    };
  }

  const jobDir = path.join(JOB_PHOTO_ROOT, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const baseName = sanitizeFilename(photo.filename || 'job-photo');
  const fileName = `job-${Date.now()}-${baseName}`;
  const filePath = path.join(jobDir, fileName);

  fs.writeFileSync(filePath, parsed.buffer);

  return {
    filename: baseName,
    receivedAt: new Date().toISOString(),
    size: parsed.buffer.length,
    mime: parsed.mime,
    path: filePath
  };
}

function getUrgencyMultiplier(urgency, timeWindow) {
  const multipliers = (servicePricing && servicePricing.globalRules && servicePricing.globalRules.urgencyMultipliers) || {};
  const urgencyKeyMap = {
    'same-day': 'same_day',
    'same_day': 'same_day',
    'next-day': 'standard',
    'next_day': 'standard',
    'scheduled': 'standard',
    'emergency': 'emergency'
  };
  const mapped = urgencyKeyMap[urgency] || null;
  if (mapped && multipliers[mapped]) return multipliers[mapped];
  if (timeWindow === 'flexible' && multipliers.flexible) return multipliers.flexible;
  return multipliers.standard || 1.0;
}

function findServicePricing(serviceTypeId) {
  const categories = (servicePricing && servicePricing.categories) || [];
  for (const category of categories) {
    const match = category.services.find(service => service.id === serviceTypeId);
    if (match) return match.pricing;
  }
  return null;
}

function buildEstimate({ service_type_id, urgency, time_window }) {
  const pricing = findServicePricing(service_type_id);
  if (!pricing) {
    return { mode: 'unknown', reason: 'No pricing available' };
  }
  if (pricing.quote_only) {
    return { mode: 'quote_only' };
  }
  const multiplier = getUrgencyMultiplier(urgency, time_window);
  const min = pricing.min ? Math.round(pricing.min * multiplier) : null;
  const max = pricing.max ? Math.round(pricing.max * multiplier) : null;
  return {
    mode: 'fixed_range',
    min,
    max,
    multiplier
  };
}

function maskStreetNumber(addressLine1) {
  if (!addressLine1) return addressLine1;
  const trimmed = String(addressLine1).trim();
  const match = trimmed.match(/^(\d+[A-Za-z0-9\-\/]*)\s+(.*)$/);
  if (match && match[2]) {
    return match[2];
  }
  return trimmed;
}

// Service estimate
app.get('/api/services/estimate', async (req, res) => {
  try {
    const service_type_id = parseInt(req.query.service_type_id);
    const urgency = req.query.urgency || 'standard';
    const time_window = req.query.time_window || 'standard';

    if (!service_type_id || Number.isNaN(service_type_id)) {
      return res.status(400).json({ error: 'service_type_id is required' });
    }

    const estimate = buildEstimate({ service_type_id, urgency, time_window });
    res.json({ estimate });
  } catch (error) {
    console.error('Estimate error:', error);
    res.status(500).json({ error: 'Failed to calculate estimate' });
  }
});

// Admin login
app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = result.rows[0];
    
    if (!admin || !await bcrypt.compare(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is paused
    if (admin.status === 'paused') {
      return res.status(403).json({ error: 'Account temporarily disabled. Please contact support.' });
    }

    // Check if account is frozen (during termination)
    if (admin.status === 'frozen') {
      const now = new Date();
      const frozenAt = new Date(admin.terminated_at);
      const freezeEndDate = new Date(frozenAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (now < freezeEndDate) {
        const daysLeft = Math.ceil((freezeEndDate - now) / (24 * 60 * 60 * 1000));
        return res.status(403).json({ error: `Account has been terminated and is frozen for ${daysLeft} more days. Contact support to reverse.` });
      } else {
        await pool.query('DELETE FROM admins WHERE id = $1', [admin.id]);
        return res.status(401).json({ error: 'Account has been permanently deleted.' });
      }
    }
    
    const role = admin.role || 'admin';
    const { token } = await issueToken(admin, role);
    res.json({
      token,
      user: { id: admin.id, email: admin.email, full_name: admin.full_name, role, tier: admin.tier || null }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Customer auth - register
app.post('/api/auth/customer/register', async (req, res) => {
  try {
    const { email, password, full_name, phone } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await pool.query('SELECT * FROM customers WHERE LOWER(email) = $1', [normalizedEmail]);
    let customer = result.rows[0];

    if (customer && customer.password_hash) {
      return res.status(400).json({ error: 'Customer already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    if (customer) {
      const updateResult = await pool.query(
        'UPDATE customers SET password_hash = $1, full_name = $2, phone = $3 WHERE id = $4 RETURNING *',
        [
          passwordHash,
          full_name || customer.full_name || null,
          phone || customer.phone || null,
          customer.id
        ]
      );
      customer = updateResult.rows[0];
    } else {
      const createResult = await pool.query(
        'INSERT INTO customers (email, full_name, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
        [normalizedEmail, full_name || null, phone || null, passwordHash]
      );
      customer = createResult.rows[0];
    }

    const role = customer.role || 'customer';
    const { token } = await issueToken(customer, role);
    res.json({
      token,
      user: {
        id: customer.id,
        email: customer.email,
        full_name: customer.full_name,
        phone: customer.phone || null,
        role
      }
    });
  } catch (error) {
    console.error('Customer register error:', error);
    res.status(500).json({ error: 'Failed to register customer' });
  }
});

// Customer auth - login
app.post('/api/auth/customer/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await pool.query('SELECT * FROM customers WHERE LOWER(email) = $1', [normalizedEmail]);
    const customer = result.rows[0];

    if (!customer) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!customer.password_hash) {
      return res.status(400).json({ error: 'Account needs a password. Please create one on the request form.' });
    }

    const matches = await bcrypt.compare(password, customer.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is paused
    if (customer.status === 'paused') {
      return res.status(403).json({ error: 'Account temporarily disabled. Please contact support.' });
    }

    // Check if account is frozen (during termination)
    if (customer.status === 'frozen') {
      const now = new Date();
      const frozenAt = new Date(customer.terminated_at);
      const freezeEndDate = new Date(frozenAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (now < freezeEndDate) {
        const daysLeft = Math.ceil((freezeEndDate - now) / (24 * 60 * 60 * 1000));
        return res.status(403).json({ error: `Account has been terminated and is frozen for ${daysLeft} more days. Contact support to reverse.` });
      } else {
        await pool.query('DELETE FROM customers WHERE id = $1', [customer.id]);
        return res.status(401).json({ error: 'Account has been permanently deleted.' });
      }
    }

    const role = customer.role || 'customer';
    const { token } = await issueToken(customer, role);
    res.json({
      token,
      user: {
        id: customer.id,
        email: customer.email,
        full_name: customer.full_name,
        phone: customer.phone || null,
        role,
        tier: customer.tier || null
      }
    });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({ error: 'Failed to login customer' });
  }
});

// Customer auth - reset password (demo)
app.post('/api/auth/customer/reset-password', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and new password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await pool.query('SELECT * FROM customers WHERE LOWER(email) = $1', [normalizedEmail]);
    const customer = result.rows[0];

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE customers SET password_hash = $1 WHERE id = $2 RETURNING *', [passwordHash, customer.id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Customer reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Contractor login
app.post('/api/auth/contractor/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM contractors WHERE email = $1', [email]);
    const contractor = result.rows[0];
    
    if (!contractor || !await bcrypt.compare(password, contractor.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is paused
    if (contractor.status === 'paused') {
      return res.status(403).json({ error: 'Account temporarily disabled. Please contact support.' });
    }

    // Check if account is frozen (during termination)
    if (contractor.status === 'frozen') {
      const now = new Date();
      const frozenAt = new Date(contractor.terminated_at);
      const freezeEndDate = new Date(frozenAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (now < freezeEndDate) {
        const daysLeft = Math.ceil((freezeEndDate - now) / (24 * 60 * 60 * 1000));
        return res.status(403).json({ error: `Account has been terminated and is frozen for ${daysLeft} more days. Contact support to reverse.` });
      } else {
        await pool.query('DELETE FROM contractors WHERE id = $1', [contractor.id]);
        return res.status(401).json({ error: 'Account has been permanently deleted.' });
      }
    }
    
    const role = contractor.role || 'contractor';
    const { token } = await issueToken(contractor, role);
    res.json({
      token,
      user: {
        id: contractor.id,
        email: contractor.email,
        legal_name: contractor.legal_name,
        business_name: contractor.business_name,
        vetting_status: contractor.vetting_status,
        role,
        tier: contractor.tier || 'bronze'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

async function getQualifiedServiceTypeIds() {
  const contractorsResult = await pool.query('SELECT * FROM contractors');
  const approvedContractors = contractorsResult.rows.filter(
    c => c.vetting_status === 'APPROVED_ACTIVE'
  );

  if (approvedContractors.length === 0) {
    return new Set();
  }

  const specialtyResults = await Promise.all(
    approvedContractors.map(contractor =>
      pool.query('SELECT service_type_id FROM contractor_specialties WHERE contractor_id = $1', [contractor.id])
    )
  );

  const typeIds = new Set();
  specialtyResults.forEach(result => {
    result.rows.forEach(row => typeIds.add(row.service_type_id));
  });

  return typeIds;
}

// Service categories
app.get('/api/services/categories', async (req, res) => {
  const qualifiedOnly = req.query.qualifiedOnly === 'true' || req.query.qualifiedOnly === '1';
  const result = await pool.query('SELECT * FROM service_categories');
  let categories = result.rows;

  if (qualifiedOnly) {
    const qualifiedTypeIds = await getQualifiedServiceTypeIds();
    if (qualifiedTypeIds.size === 0) {
      return res.json({ categories: [] });
    }
    const typesResult = await pool.query('SELECT * FROM service_types');
    const qualifiedCategoryIds = new Set(
      typesResult.rows
        .filter(type => qualifiedTypeIds.has(type.id))
        .map(type => type.category_id)
    );
    categories = categories.filter(category => qualifiedCategoryIds.has(category.id));
  }

  res.json({ categories });
});

// Service types
app.get('/api/services/types', async (req, res) => {
  const { categoryId } = req.query;
  const qualifiedOnly = req.query.qualifiedOnly === 'true' || req.query.qualifiedOnly === '1';
  const result = categoryId
    ? await pool.query('SELECT * FROM service_types WHERE category_id = $1', [categoryId])
    : await pool.query('SELECT * FROM service_types');

  const qualifiedTypeIds = qualifiedOnly ? await getQualifiedServiceTypeIds() : null;
  const types = qualifiedOnly
    ? result.rows.filter(type => qualifiedTypeIds.has(type.id))
    : result.rows;

  res.json({ types });
});

// Create job
app.post('/api/jobs/create', async (req, res) => {
  try {
    const auditMeta = req.audit || {};
    const { service_category_id, service_type_id, description, property_type,
            address_line1, address_line2, address_number, address_street,
            city, province, postal_code, urgency, time_window, customer, problem_photo } = req.body;
    
    const customerEmail = String(customer?.email || '').trim().toLowerCase();
    const customerPassword = customer?.password ? String(customer.password) : '';
    let customerResult = await pool.query('SELECT * FROM customers WHERE email = $1', [customerEmail]);
    let customerRecord = customerResult.rows[0];
    
    if (!customerRecord) {
      if (customerPassword) {
        const passwordHash = await bcrypt.hash(customerPassword, 10);
        customerResult = await pool.query(
          'INSERT INTO customers (email, full_name, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
          [customerEmail, customer.full_name, customer.phone, passwordHash]
        );
      } else {
        customerResult = await pool.query(
          'INSERT INTO customers (email, full_name, phone) VALUES ($1, $2, $3) RETURNING *',
          [customerEmail, customer.full_name, customer.phone]
        );
      }
      customerRecord = customerResult.rows[0];
    } else if (customerPassword && !customerRecord.password_hash) {
      const passwordHash = await bcrypt.hash(customerPassword, 10);
      const updateResult = await pool.query(
        'UPDATE customers SET password_hash = $1 WHERE id = $2 RETURNING *',
        [passwordHash, customerRecord.id]
      );
      if (updateResult.rows[0]) {
        customerRecord = updateResult.rows[0];
      }
    }
    
    const normalizedAddressLine1 = (() => {
      if (address_line1) return String(address_line1).trim();
      const numberPart = address_number ? String(address_number).trim() : '';
      const streetPart = address_street ? String(address_street).trim() : '';
      return `${numberPart} ${streetPart}`.trim();
    })();

    const addressResult = await pool.query(
      'INSERT INTO addresses (address_line1, address_line2, city, province, postal_code, property_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [normalizedAddressLine1, address_line2, city, province, postal_code, property_type]
    );
    
    const jobResult = await pool.query(
      'INSERT INTO jobs (customer_id, service_category_id, service_type_id, address_id, description, urgency, time_window, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [customerRecord.id, service_category_id, service_type_id, addressResult.rows[0].id, description, urgency, time_window, 'submitted']
    );
    const job = jobResult.rows[0];
    if (job) {
      job.estimate = buildEstimate({
        service_type_id: job.service_type_id,
        urgency: job.urgency,
        time_window: job.time_window
      });
      if (problem_photo) {
        job.problem_photo = saveJobPhoto(job.id, problem_photo);
      }
    }
    
    const { token } = await issueToken(customerRecord, 'customer');

    await logEvent({
      action: 'job.created',
      entity_type: 'job',
      entity_id: job.id,
      actor: req.actor || { role: 'customer', id: customerRecord.id, email: customerRecord.email },
      after: job,
      meta: auditMeta
    });
    
    res.json({
      job,
      customer: { id: customerRecord.id, email: customerRecord.email, full_name: customerRecord.full_name, role: 'customer' },
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Get customer jobs
app.get('/api/customer/jobs/:customerId', async (req, res) => {
  const result = await pool.query('SELECT * FROM jobs WHERE customer_id = $1', [req.params.customerId]);
  res.json({ jobs: result.rows });
});

// Get customer jobs by email (no login required)
app.get('/api/customer/jobs-by-email', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const customerResult = await pool.query('SELECT * FROM customers WHERE LOWER(email) = $1', [String(email).trim().toLowerCase()]);
    const customer = customerResult.rows[0];
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const jobsResult = await pool.query('SELECT * FROM jobs WHERE customer_id = $1', [customer.id]);
    res.json({ customer, jobs: jobsResult.rows });
  } catch (error) {
    console.error('Error fetching customer jobs by email:', error);
    res.status(500).json({ error: 'Failed to fetch customer jobs' });
  }
});

// Mock customer payment (demo only)
app.post('/api/customer/jobs/:jobId/mock-pay', async (req, res) => {
  try {
    const { jobId } = req.params;
    const auditMeta = req.audit || {};

    const jobsResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    const job = jobsResult.rows[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Job must be completed before payment' });
    }

    const updated = await pool.query(
      'UPDATE jobs SET payment_status = $1, payout_status = $2 WHERE id = $3 RETURNING *',
      ['paid', 'ready', jobId]
    );
    const updatedJob = updated.rows[0];

    await logEvent({
      action: 'payment.mocked',
      entity_type: 'job',
      entity_id: jobId,
      actor: req.actor || { role: 'customer', id: job.customer_id || 'customer-unknown' },
      after: { payment_status: 'paid', payout_status: 'ready' },
      meta: auditMeta
    });

    res.json({ success: true, job: updatedJob });
  } catch (error) {
    console.error('Mock payment error:', error);
    res.status(500).json({ error: 'Failed to process mock payment' });
  }
});

// Get available jobs for contractors (filtered by their specialties)
app.get('/api/contractor/available-jobs', async (req, res) => {
  try {
    // Get contractor ID from auth token or query param
    const contractor_id = req.user?.id || req.query.contractor_id;
    
    if (!contractor_id) {
      return res.status(401).json({ error: 'Contractor ID required' });
    }
    
    // Use custom query to filter by specialties
    const result = await pool.query('SELECT * FROM jobs WHERE status IN ($1, $2) AND contractor_id IS NULL LIMIT 100 -- available jobs for contractor', 
      [contractor_id, 'submitted', 'ready_to_assign']);
    
    const jobs = (result.rows || []).map(job => ({
      ...job,
      estimate: buildEstimate({
        service_type_id: job.service_type_id,
        urgency: job.urgency,
        time_window: job.time_window
      })
    }));
    res.json({ jobs });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch available jobs' });
  }
});

// Accept job
app.post('/api/jobs/:jobId/accept', async (req, res) => {
  const result = await pool.query(
    'UPDATE jobs SET contractor_id = $1, status = $2 WHERE id = $3 RETURNING *',
    [req.body.contractor_id, 'assigned', req.params.jobId]
  );
  res.json({ job: result.rows[0] });
});

// Get contractor's jobs (accepted/assigned jobs)
app.get('/api/contractor/jobs/:contractorId', async (req, res) => {
  try {
    const { contractorId } = req.params;
    const result = await pool.query(
      'SELECT * FROM jobs WHERE contractor_id = $1 ORDER BY updated_at DESC',
      [contractorId]
    );
    const jobs = (result.rows || []).map(job => ({
      ...job,
      address_full: [job.address_line1, job.address_line2].filter(Boolean).join(', '),
      estimate: buildEstimate({
        service_type_id: job.service_type_id,
        urgency: job.urgency,
        time_window: job.time_window
      })
    }));
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching contractor jobs:', error);
    res.status(500).json({ error: 'Failed to fetch contractor jobs' });
  }
});

// Update job status
app.patch('/api/jobs/:jobId/status', async (req, res) => {
  const auditMeta = req.audit || {};
  const beforeResult = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.jobId]);
  const beforeJob = beforeResult.rows[0] || null;
  const result = await pool.query(
    'UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *',
    [req.body.status, req.params.jobId]
  );
  const afterJob = result.rows[0];
  if (afterJob) {
    await logEvent({
      action: 'job.status_changed',
      entity_type: 'job',
      entity_id: afterJob.id,
      actor: req.actor || { role: 'system', id: null },
      before: beforeJob ? { status: beforeJob.status } : null,
      after: { status: afterJob.status },
      reason: req.body.reason || null,
      meta: auditMeta
    });
  }
  res.json({ job: afterJob });
});

// ============================================================================
// CONTRACTOR JOB CANCELLATION
// ============================================================================

// Contractor ends a job with cause
app.post('/api/contractor/jobs/:jobId/end', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { causeCode, notes, end_photo } = req.body;
    const contractorId = req.body.contractorId || req.headers['x-contractor-id'];

    // Valid cause codes
    const validCauses = ['customer_unavailable', 'scope_mismatch', 'safety_concern'];
    if (!validCauses.includes(causeCode)) {
      return res.status(400).json({ error: 'Invalid cause code' });
    }

    // Find the job
    const jobs = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    const job = jobs.rows[0];

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Verify contractor is assigned to this job
    if (job.assignedContractorId !== contractorId && job.contractor_id !== contractorId) {
      return res.status(403).json({ error: 'Not assigned to this job' });
    }

    // Check if job is in a valid state to end
    const normalizedStatus = String(job.status || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (normalizedStatus !== 'onsite') {
      return res.status(400).json({ error: `Cannot end job with status ${job.status}` });
    }

    const updated = await pool.query(
      'UPDATE jobs SET status = $1, contractor_id = $2 WHERE id = $3 RETURNING * -- contractor_end',
      ['cancel_requested', null, jobId]
    );
    const updatedJob = updated.rows[0];

    if (!updatedJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Update job with cancellation info
    updatedJob.assignedContractorId = null;
    updatedJob.cancellation = {
      by: 'contractor',
      causeCode,
      notes,
      at: new Date(),
      photo: end_photo ? saveJobPhoto(jobId, end_photo) : null
    };
    if (Array.isArray(updatedJob.history)) {
      updatedJob.history.push({
        at: new Date(),
        actorType: 'contractor',
        actorId: contractorId,
        action: 'END_REQUESTED',
        details: `Contractor ended job: ${causeCode} - ${notes}`
      });
    }
    updatedJob.updated_at = new Date();

    console.log(`Contractor ${contractorId} requested to end job ${jobId}: ${causeCode}`);
    res.json({ job: updatedJob });
  } catch (error) {
    console.error('Error ending job:', error);
    res.status(500).json({ error: 'Failed to end job' });
  }
});

// Contractor starts job with before photos
app.post('/api/contractor/jobs/:jobId/start', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { notes, before_photos } = req.body;
    const contractorId = req.body.contractorId || req.headers['x-contractor-id'];

    const jobs = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    const job = jobs.rows[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.assignedContractorId !== contractorId && job.contractor_id !== contractorId) {
      return res.status(403).json({ error: 'Not assigned to this job' });
    }

    if (!['on_site', 'assigned', 'en_route'].includes(job.status)) {
      return res.status(400).json({ error: `Cannot start job with status ${job.status}` });
    }

    const updated = await pool.query(
      'UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *',
      ['in_progress', jobId]
    );
    const updatedJob = updated.rows[0];
    if (!updatedJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const startReport = {
      at: new Date().toISOString(),
      notes: notes || '',
      before_photos: before_photos || []
    };

    await pool.query(
      'UPDATE jobs SET start_report = $1 WHERE id = $2 RETURNING * -- job_start_report',
      [startReport, jobId]
    );

    if (Array.isArray(updatedJob.history)) {
      updatedJob.history.push({
        at: new Date(),
        actorType: 'contractor',
        actorId: contractorId,
        action: 'STARTED',
        details: notes || 'Job started'
      });
      updatedJob.updated_at = new Date();
    }

    res.json({ job: updatedJob });
  } catch (error) {
    console.error('Error starting job:', error);
    res.status(500).json({ error: 'Failed to start job' });
  }
});

// Contractor completes job with details/photos
app.post('/api/contractor/jobs/:jobId/complete', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { tasks, materials, material_costs, notes, photos, receipts } = req.body;
    const contractorId = req.body.contractorId || req.headers['x-contractor-id'];
    const auditMeta = req.audit || {};

    const jobs = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    const job = jobs.rows[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.assignedContractorId !== contractorId && job.contractor_id !== contractorId) {
      return res.status(403).json({ error: 'Not assigned to this job' });
    }

    if (job.status !== 'in_progress') {
      return res.status(400).json({ error: `Cannot complete job with status ${job.status}` });
    }

    const updated = await pool.query(
      'UPDATE jobs SET status = $1 WHERE id = $2 RETURNING *',
      ['completed', jobId]
    );
    const updatedJob = updated.rows[0];
    if (!updatedJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const estimate = buildEstimate({
      service_type_id: job.service_type_id,
      urgency: job.urgency,
      time_window: job.time_window
    });
    let payoutAmount = null;
    let materialCostValue = null;
    let netAmount = null;
    let companyAmount = null;
    let tierRate = getTierRate('bronze');
    try {
      const contractorResult = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
      const contractorRow = contractorResult.rows[0];
      tierRate = getTierRate(contractorRow?.contractor_tier || contractorRow?.contractorTier);
    } catch (error) {
      console.warn('Unable to resolve contractor tier, defaulting to bronze');
    }
    if (estimate && estimate.mode === 'fixed_range') {
      const finalPrice = estimate.max ?? estimate.min ?? null;
      const rawMaterialCost = typeof material_costs === 'string'
        ? material_costs.replace(/[^0-9.-]/g, '')
        : material_costs;
      materialCostValue = material_costs !== undefined && material_costs !== null && material_costs !== ''
        ? Number(rawMaterialCost)
        : 0;
      if (Number.isNaN(materialCostValue)) {
        materialCostValue = 0;
      }
      netAmount = finalPrice !== null ? Math.max(0, finalPrice - (materialCostValue || 0)) : null;
      payoutAmount = netAmount !== null ? Math.max(0, Math.round(netAmount * (1 - tierRate))) : null;
      companyAmount = netAmount !== null ? Math.max(0, Math.round(netAmount * tierRate)) : null;
    }

    const payment = {
      amount: payoutAmount,
      currency: 'USD',
      source: 'estimate',
      final_price: estimate && estimate.mode === 'fixed_range' ? (estimate.max ?? estimate.min ?? null) : null,
      materials_cost: materialCostValue,
      net_amount: netAmount,
      contractor_share: 1 - tierRate,
      company_share: tierRate,
      company_amount: companyAmount,
      issued_at: new Date().toISOString()
    };

    const completionReport = {
      at: new Date().toISOString(),
      tasks: tasks || '',
      materials: materials || '',
      material_costs: material_costs || '',
      notes: notes || '',
      photos: photos || [],
      receipts: receipts || [],
      payment
    };

    await pool.query(
      'UPDATE jobs SET completion_report = $1 WHERE id = $2 RETURNING * -- job_completion_report',
      [completionReport, jobId]
    );

    await pool.query(
      'UPDATE jobs SET material_fees = $1 WHERE id = $2 RETURNING * -- job_material_fees',
      [materialCostValue || 0, jobId]
    );

    if (Array.isArray(updatedJob.history)) {
      updatedJob.history.push({
        at: new Date(),
        actorType: 'contractor',
        actorId: contractorId,
        action: 'COMPLETED',
        details: notes || 'Job completed'
      });
      updatedJob.updated_at = new Date();
    }

    updatedJob.completion_report = completionReport;
    updatedJob.material_fees = materialCostValue || 0;
    await logEvent({
      action: 'job.completed',
      entity_type: 'job',
      entity_id: updatedJob.id,
      actor: req.actor || { role: 'contractor', id: contractorId },
      before: { status: job.status },
      after: { status: updatedJob.status, completion_report: completionReport },
      meta: auditMeta
    });
    res.json({ job: updatedJob, payment });
  } catch (error) {
    console.error('Error completing job:', error);
    res.status(500).json({ error: 'Failed to complete job' });
  }
});

// Contractor updates materials cost/receipts on a completed job
app.post('/api/contractor/jobs/:jobId/materials', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { material_costs, receipts } = req.body;
    const contractorId = req.body.contractorId || req.headers['x-contractor-id'];

    const jobs = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    const job = jobs.rows[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.assignedContractorId !== contractorId && job.contractor_id !== contractorId) {
      return res.status(403).json({ error: 'Not assigned to this job' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ error: `Job must be completed to update materials` });
    }

    const hasReceipts = Array.isArray(receipts) && receipts.length > 0;
    if (!hasReceipts) {
      return res.status(400).json({ error: 'Receipts are required to update materials cost' });
    }

    const rawMaterialCost = typeof material_costs === 'string'
      ? material_costs.replace(/[^0-9.-]/g, '')
      : material_costs;
    let materialCostValue = material_costs !== undefined && material_costs !== null && material_costs !== ''
      ? Number(rawMaterialCost)
      : 0;
    if (Number.isNaN(materialCostValue) || materialCostValue < 0) {
      return res.status(400).json({ error: 'Invalid material cost' });
    }

    const completionReport = job.completion_report || {};
    const updatedReport = {
      ...completionReport,
      material_costs: String(material_costs ?? materialCostValue),
      receipts
    };

    // Get contractor tier for payment calculations
    let tierRate = getTierRate('bronze');
    if (job.contractor_id) {
      const contractorRow = await pool.query(
        'SELECT contractor_tier AS tier FROM contractors WHERE id = $1',
        [job.contractor_id]
      );
      if (contractorRow.rows?.[0]?.tier) {
        tierRate = getTierRate(contractorRow.rows[0].tier);
      }
    }

    const estimate = buildEstimate({
      service_type_id: job.service_type_id,
      urgency: job.urgency,
      time_window: job.time_window
    });
    if (estimate && estimate.mode === 'fixed_range') {
      const finalPrice = estimate.max ?? estimate.min ?? null;
      const netAmount = finalPrice !== null ? Math.max(0, finalPrice - materialCostValue) : null;
      const payoutAmount = netAmount !== null ? Math.max(0, Math.round(netAmount * (1 - tierRate))) : null;
      const companyAmount = netAmount !== null ? Math.max(0, Math.round(netAmount * tierRate)) : null;
      updatedReport.payment = {
        amount: payoutAmount,
        currency: 'USD',
        source: 'estimate',
        final_price: finalPrice,
        materials_cost: materialCostValue,
        net_amount: netAmount,
        contractor_share: 1 - tierRate,
        company_share: tierRate,
        company_amount: companyAmount,
        issued_at: new Date().toISOString()
      };
    }

    await pool.query(
      'UPDATE jobs SET completion_report = $1 WHERE id = $2 RETURNING * -- job_completion_report',
      [updatedReport, jobId]
    );
    await pool.query(
      'UPDATE jobs SET material_fees = $1 WHERE id = $2 RETURNING * -- job_material_fees',
      [materialCostValue, jobId]
    );

    const refreshed = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    const updatedJob = refreshed.rows[0];
    if (updatedJob) {
      updatedJob.completion_report = updatedReport;
      updatedJob.material_fees = materialCostValue;
    }

    res.json({ job: updatedJob });
  } catch (error) {
    console.error('Update materials error:', error);
    res.status(500).json({ error: 'Failed to update materials' });
  }
});

// ============================================================================
// ADMIN JOB MANAGEMENT
// ============================================================================

// Admin relists a cancelled job back to available pool
app.post('/api/admin/jobs/:jobId/relist', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { notes } = req.body;
    const adminId = req.body.adminId || req.headers['x-admin-id'] || 'admin-001';

    const updated = await pool.query(
      'UPDATE jobs SET status = $1, contractor_id = $2 WHERE id = $3 RETURNING * -- relist',
      ['open', null, jobId]
    );
    const job = updated.rows[0];

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    job.assignedContractorId = null;
    job.cancellation = null;
    job.relistCount = (job.relistCount || 0) + 1;
    if (Array.isArray(job.history)) {
      job.history.push({
        at: new Date(),
        actorType: 'admin',
        actorId: adminId,
        action: 'RELISTED',
        details: `Admin relisted job: ${notes || 'No notes'}`
      });
    }
    job.updated_at = new Date();

    console.log(`Admin ${adminId} relisted job ${jobId}. Relist count: ${job.relistCount}`);
    res.json({ job });
  } catch (error) {
    console.error('Error relisting job:', error);
    res.status(500).json({ error: 'Failed to relist job' });
  }
});

// Admin cancels a job after contractor cancellation request
app.post('/api/admin/jobs/:jobId/cancel', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { notes } = req.body;
    const adminId = req.body.adminId || req.headers['x-admin-id'] || 'admin-001';

    const jobs = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    const job = jobs.rows[0];

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    job.status = 'cancelled';
    job.assignedContractorId = null;
    job.contractor_id = null;
    job.cancellation = {
      by: 'admin',
      notes: notes || 'No notes',
      at: new Date()
    };
    job.history.push({
      at: new Date(),
      actorType: 'admin',
      actorId: adminId,
      action: 'CANCELLED',
      details: `Admin cancelled job: ${notes || 'No notes'}`
    });
    job.updated_at = new Date();

    console.log(`Admin ${adminId} cancelled job ${jobId}`);
    res.json({ job });
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// Admin reassigns job to a specific contractor
app.post('/api/admin/jobs/:jobId/reassign', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { contractorId, notes } = req.body;
    const adminId = req.body.adminId || req.headers['x-admin-id'] || 'admin-001';

    // Verify contractor exists
    const contractors = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
    const contractor = contractors.rows[0];

    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    // Update job - reassign it in storage
    const updated = await pool.query(
      'UPDATE jobs SET contractor_id = $1, status = $2 WHERE id = $3 RETURNING *',
      [contractorId, 'accepted', jobId]
    );
    const job = updated.rows[0];

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (Array.isArray(job.history)) {
      job.history.push({
        at: new Date(),
        actorType: 'admin',
        actorId: adminId,
        action: 'REASSIGNED',
        details: `Admin reassigned job to ${contractor.business_name || contractor.legal_name}: ${notes || 'No notes'}`
      });
      job.updated_at = new Date();
    }

    console.log(`Admin ${adminId} reassigned job ${jobId} to contractor ${contractorId}`);
    res.json({ job });
  } catch (error) {
    console.error('Error reassigning job:', error);
    res.status(500).json({ error: 'Failed to reassign job' });
  }
});

// Contractor apply
app.post('/api/contractors/apply', async (req, res) => {
  try {
    const { legal_name, business_name, email, phone, password, primary_trade, experience_years, documents } = req.body;
    const existing = await pool.query('SELECT * FROM contractors WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO contractors (email, password_hash, legal_name, business_name, phone, vetting_status, primary_trade, experience_years, documents) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [email, password_hash, legal_name, business_name, phone, 'UNDER_REVIEW', primary_trade || null, experience_years || null, documents || null]
    );
    const contractor = result.rows[0];
    if (contractor) {
      contractor.status = contractor.status || 'pending_review';
      contractor.vetting_status = contractor.vetting_status || 'UNDER_REVIEW';
      if (documents) {
        const storedDocs = {
          license: saveContractorDocument(contractor.id, 'license', documents.license),
          insurance: saveContractorDocument(contractor.id, 'insurance', documents.insurance),
          governmentId: saveContractorDocument(contractor.id, 'governmentId', documents.government_id)
        };
        const updatedDocs = await pool.query(
          'UPDATE contractors SET documents = $1 WHERE id = $2 RETURNING *',
          [storedDocs, contractor.id]
        );
        if (updatedDocs.rows[0]) {
          contractor.documents = updatedDocs.rows[0].documents;
        } else {
          contractor.documents = storedDocs;
        }
      }
    }
    res.json({ contractor });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// Contractor profile (self-service)
app.get('/api/contractors/:contractorId/profile', async (req, res) => {
  try {
    const { contractorId } = req.params;
    const result = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    const contractor = result.rows[0];
    res.json({ contractor });
  } catch (error) {
    console.error('Contractor profile error:', error);
    res.status(500).json({ error: 'Failed to fetch contractor profile' });
  }
});

app.get('/api/contractors/:contractorId/audit-logs', async (req, res) => {
  try {
    const { contractorId } = req.params;
    // Fetch audit logs from the audit_logs table, ordered by timestamp descending, limited to last 3
    const result = await pool.query(
      'SELECT id, action, details, timestamp, created_at FROM audit_logs WHERE user_id = $1 OR entity_id = $1 ORDER BY created_at DESC LIMIT 3',
      [contractorId]
    );
    const logs = result.rows || [];
    res.json({ logs });
  } catch (error) {
    console.error('Audit logs error:', error);
    // Return empty logs on error instead of failing
    res.json({ logs: [] });
  }
});

app.patch('/api/contractors/:contractorId/profile', async (req, res) => {
  try {
    const { contractorId } = req.params;
    const auditMeta = req.audit || {};
    const {
      legal_name,
      business_name,
      email,
      phone,
      primary_trade,
      secondary_trades,
      service_types,
      experience_years
    } = req.body;

    const currentResult = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
    const currentContractor = currentResult.rows[0] || null;

    const result = await pool.query(
      'UPDATE contractors SET legal_name = $1, business_name = $2, email = $3, phone = $4, primary_trade = $5, secondary_trades = $6, service_types = $7, experience_years = $8 WHERE id = $9 RETURNING *',
      [legal_name, business_name, email, phone, primary_trade || null, secondary_trades || null, service_types || null, experience_years || null, contractorId]
    );

    const contractor = result.rows[0];
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    if (currentContractor) {
      const changes = [];
      const fields = [
        ['legal_name', 'Legal name'],
        ['business_name', 'Business name'],
        ['email', 'Email'],
        ['phone', 'Phone'],
        ['primary_trade', 'Primary trade'],
        ['secondary_trades', 'Secondary trades'],
        ['service_types', 'Service types'],
        ['experience_years', 'Experience years']
      ];

      fields.forEach(([field, label]) => {
        const before = currentContractor[field];
        const after = contractor[field];
        const beforeStr = Array.isArray(before) ? JSON.stringify(before) : String(before ?? '');
        const afterStr = Array.isArray(after) ? JSON.stringify(after) : String(after ?? '');
        if (beforeStr !== afterStr) {
          changes.push(`${label}: "${beforeStr || '—'}" → "${afterStr || '—'}"`);
        }
      });

      const diff = diffObjects(currentContractor, contractor);
      if (changes.length > 0) {
        const auditEntry = {
          at: new Date(),
          actorType: 'contractor',
          actorId: contractorId,
          action: 'PROFILE_UPDATED',
          details: changes.join(' | ')
        };

        contractor.auditLog = Array.isArray(contractor.auditLog) ? contractor.auditLog : [];
        contractor.auditLog.push(auditEntry);

        const existing = contractorAuditLog.get(contractorId) || [];
        existing.push(auditEntry);
        contractorAuditLog.set(contractorId, existing);
      }

      if (diff) {
        await logEvent({
          action: 'contractor.profile_updated',
          entity_type: 'contractor',
          entity_id: contractorId,
          actor: req.actor || { role: 'contractor', id: contractorId },
          before: currentContractor,
          after: contractor,
          diff,
          meta: auditMeta
        });
      }
    }

    if (Array.isArray(service_types)) {
      await pool.query('DELETE FROM contractor_specialties WHERE contractor_id = $1', [contractorId]);
      if (service_types.length > 0) {
        const values = service_types.map((_, idx) => `($1, $${idx + 2})`).join(',');
        await pool.query(
          `INSERT INTO contractor_specialties (contractor_id, service_type_id) VALUES ${values}`,
          [contractorId, ...service_types]
        );
      }
      contractor.specialties = service_types;
    }

    res.json({ contractor });
  } catch (error) {
    console.error('Contractor profile update error:', error);
    res.status(500).json({ error: 'Failed to update contractor profile' });
  }
});

app.get('/api/admin/contractors/:contractorId/documents/:docType', async (req, res) => {
  try {
    const adminId = req.headers['x-admin-id'];
    if (!adminId) {
      return res.status(401).json({ error: 'Admin access required' });
    }

    const { contractorId, docType } = req.params;
    const result = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
    const contractor = result.rows[0];
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    const doc = contractor.documents ? contractor.documents[docType] : null;
    if (!doc || !doc.path) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const resolved = path.resolve(doc.path);
    if (!resolved.startsWith(UPLOAD_ROOT)) {
      return res.status(400).json({ error: 'Invalid document path' });
    }

    return res.sendFile(resolved);
  } catch (error) {
    console.error('Document fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Admin dashboard
app.get('/api/admin/dashboard', async (req, res) => {
  const activeJobs = await pool.query('SELECT COUNT(*) FROM jobs WHERE status IN ($1, $2)', ['assigned', 'in_progress']);
  const pendingJobs = await pool.query('SELECT COUNT(*) FROM jobs WHERE status = $1', ['submitted']);
  const approvedContractors = await pool.query('SELECT COUNT(*) FROM contractors WHERE vetting_status = $1', ['APPROVED_ACTIVE']);
  const pendingContractors = await pool.query('SELECT COUNT(*) FROM contractors WHERE vetting_status IN ($1, $2)', ['APPLIED', 'UNDER_REVIEW']);
  
  res.json({
    stats: {
      active_jobs: parseInt(activeJobs.rows[0].count),
      pending_jobs: parseInt(pendingJobs.rows[0].count),
      approved_contractors: parseInt(approvedContractors.rows[0].count),
      pending_contractors: parseInt(pendingContractors.rows[0].count)
    }
  });
});

// Update payout status for a job
app.patch('/api/jobs/:jobId/payout-status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { payout_status } = req.body;
    const auditMeta = req.audit || {};
    const result = await pool.query(
      'UPDATE jobs SET payout_status = $1 WHERE id = $2 RETURNING *',
      [payout_status, jobId]
    );
    const job = result.rows[0];
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    await logEvent({
      action: payout_status === 'ready' ? 'payout.marked_ready' : 'payout.status_updated',
      entity_type: 'job',
      entity_id: jobId,
      actor: req.actor || { role: 'admin', id: 'admin-001' },
      after: { payout_status },
      meta: auditMeta
    });

    res.json({ success: true, job_id: jobId, payout_status });
  } catch (error) {
    console.error('Payout status update error:', error);
    res.status(500).json({ error: 'Failed to update payout status' });
  }
});

// Get all pending payouts (jobs ready for payment)
app.get('/api/admin/payouts/pending', async (req, res) => {
  try {
    const contractorsResult = await pool.query('SELECT * FROM contractors');
    const jobsResult = await pool.query('SELECT * FROM jobs WHERE payout_status != $1 ORDER BY completed_at DESC', ['paid']);
    
    const contractors = contractorsResult.rows || [];
    const jobs = attachContractorTier(jobsResult.rows || [], contractors);

    const payouts = jobs.map(job => {
      const contractor = contractors.find(c => c.id === job.contractor_id);
      const financials = computeFinancials(job);
      return {
        job_id: job.id,
        contractor_id: job.contractor_id,
        contractor: contractor?.business_name || contractor?.legal_name || contractor?.email || '—',
        contractor_tier: job.contractor_tier || 'bronze',
        city: job.city || '—',
        category: job.category_name || job.category || '—',
        final_price: job.final_price || 0,
        material_fees: job.material_fees || 0,
        stripe_fee: job.stripe_fee || financials.stripe_fee,
        platform_fee: job.platform_fee || financials.platform_fee,
        contractor_payout: job.contractor_payout || financials.contractor_payout,
        completed_at: job.completed_at || job.updated_at || job.created_at,
        payment_status: job.payment_status || 'unpaid',
        payout_status: job.payout_status || 'not_ready'
      };
    });

    res.json(payouts);
  } catch (error) {
    console.error('Get pending payouts error:', error);
    res.status(500).json({ error: 'Failed to fetch pending payouts' });
  }
});

// Get payouts history (completed/paid payouts)
app.get('/api/admin/payouts/history', async (req, res) => {
  try {
    const contractorsResult = await pool.query('SELECT * FROM contractors');
    const jobsResult = await pool.query('SELECT * FROM jobs WHERE payout_status = $1 ORDER BY completed_at DESC LIMIT 100', ['paid']);
    
    const contractors = contractorsResult.rows || [];
    const jobs = attachContractorTier(jobsResult.rows || [], contractors);

    const history = jobs.map(job => {
      const contractor = contractors.find(c => c.id === job.contractor_id);
      const financials = computeFinancials(job);
      return {
        job_id: job.id,
        contractor_id: job.contractor_id,
        contractor: contractor?.business_name || contractor?.legal_name || contractor?.email || '—',
        contractor_tier: job.contractor_tier || 'bronze',
        city: job.city || '—',
        category: job.category_name || job.category || '—',
        final_price: job.final_price || 0,
        material_fees: job.material_fees || 0,
        stripe_fee: job.stripe_fee || financials.stripe_fee,
        platform_fee: job.platform_fee || financials.platform_fee,
        contractor_payout: job.contractor_payout || financials.contractor_payout,
        completed_at: job.completed_at || job.updated_at || job.created_at,
        payment_status: job.payment_status || 'paid',
        payout_status: job.payout_status || 'paid'
      };
    });

    res.json(history);
  } catch (error) {
    console.error('Get payouts history error:', error);
    res.status(500).json({ error: 'Failed to fetch payouts history' });
  }
});

// Batch process payouts
app.post('/api/admin/payouts/batch-process', async (req, res) => {
  try {
    const { job_ids } = req.body;
    const auditMeta = req.audit || {};
    if (!Array.isArray(job_ids) || job_ids.length === 0) {
      return res.status(400).json({ error: 'job_ids is required' });
    }
    const processed = [];
    for (const jobId of job_ids) {
      const result = await pool.query(
        'UPDATE jobs SET payout_status = $1 WHERE id = $2 RETURNING *',
        ['paid', jobId]
      );
      if (result.rows[0]) processed.push(jobId);
    }

    await logEvent({
      action: 'payout.paid',
      entity_type: 'batch',
      entity_id: null,
      actor: req.actor || { role: 'admin', id: 'admin-001' },
      after: { job_ids: processed },
      meta: auditMeta
    });

    res.json({ success: true, processed: processed.length, job_ids: processed, payout_status: 'paid' });
  } catch (error) {
    console.error('Batch payout error:', error);
    res.status(500).json({ error: 'Failed to process payouts' });
  }
});

// Admin - Contractors payouts overview
app.get('/api/admin/contractors/payouts', async (req, res) => {
  try {
    const contractorsResult = await pool.query('SELECT * FROM contractors');
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const contractors = contractorsResult.rows || [];
    const jobs = attachContractorTier(jobsResult.rows || [], contractors);

    const payload = contractors.map(contractor => {
      const contractorJobs = jobs.filter(job => job.contractor_id === contractor.id && job.payout_status === 'ready');
      const jobItems = contractorJobs.map(job => {
        const financials = computeFinancials(job);
        return {
          job_id: job.id,
          city: job.city || '—',
          category: job.category_name || job.category || '—',
          contractor_payout: financials.contractor_payout,
          completed_at: job.completed_at || job.updated_at || job.created_at,
          payout_status: job.payout_status || 'not_ready'
        };
      });
      const totalPending = jobItems.reduce((sum, item) => sum + (item.contractor_payout || 0), 0);
      const schedule = contractor.payment_schedule || 'weekly';
      return {
        contractor_id: contractor.id,
        name: contractor.business_name || contractor.legal_name || contractor.email,
        email: contractor.email || null,
        phone: contractor.phone || null,
        payment_schedule: schedule,
        next_payment_date: nextPaymentDate(schedule).toISOString(),
        total_pending: Math.round(totalPending * 100) / 100,
        jobs: jobItems
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Contractor payouts error:', error);
    res.status(500).json({ error: 'Failed to fetch contractor payouts' });
  }
});

// Admin - Process contractor payouts
app.post('/api/admin/payouts/process', async (req, res) => {
  try {
    const { contractor_id, amount, job_ids, payment_schedule, payment_method } = req.body || {};
    const auditMeta = req.audit || {};
    if (!contractor_id || !Array.isArray(job_ids) || job_ids.length === 0) {
      return res.status(400).json({ error: 'contractor_id and job_ids are required' });
    }

    const paymentId = crypto.randomUUID();
    const payment = {
      payment_id: paymentId,
      contractor_id,
      amount: Number(amount) || 0,
      job_ids,
      payment_schedule: payment_schedule || 'weekly',
      payment_method: payment_method || 'bank_transfer',
      status: 'processing',
      initiated_at: new Date().toISOString()
    };
    contractorPayments.push(payment);

    for (const jobId of job_ids) {
      await pool.query(
        'UPDATE jobs SET payout_status = $1 WHERE id = $2 RETURNING *',
        ['paid', jobId]
      );
    }

    await logEvent({
      action: 'payout.paid',
      entity_type: 'contractor',
      entity_id: contractor_id,
      actor: req.actor || { role: 'admin', id: 'admin-001' },
      after: payment,
      meta: auditMeta
    });

    res.json({
      success: true,
      payment_id: paymentId,
      contractor_id,
      amount: payment.amount,
      processed_at: payment.initiated_at,
      job_ids,
      status: 'paid'
    });
  } catch (error) {
    console.error('Process payout error:', error);
    res.status(500).json({ error: 'Failed to process payout' });
  }
});

// Admin - Update contractor payment schedule
app.patch('/api/admin/contractors/:contractorId/payment-schedule', async (req, res) => {
  try {
    const { contractorId } = req.params;
    const { payment_schedule } = req.body;
    const auditMeta = req.audit || {};
    const result = await pool.query(
      'UPDATE contractors SET payment_schedule = $1 WHERE id = $2 RETURNING *',
      [payment_schedule, contractorId]
    );
    const contractor = result.rows[0];
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    await logEvent({
      action: 'contractor.payment_schedule_updated',
      entity_type: 'contractor',
      entity_id: contractorId,
      actor: req.actor || { role: 'admin', id: 'admin-001' },
      after: { payment_schedule },
      meta: auditMeta
    });

    res.json({
      success: true,
      contractor_id: contractorId,
      payment_schedule,
      next_payment_date: nextPaymentDate(payment_schedule).toISOString()
    });
  } catch (error) {
    console.error('Payment schedule update error:', error);
    res.status(500).json({ error: 'Failed to update payment schedule' });
  }
});

// Admin - Contractor payment history
app.get('/api/admin/contractors/:contractorId/payment-history', async (req, res) => {
  try {
    const { contractorId } = req.params;
    const payments = contractorPayments.filter(payment => String(payment.contractor_id) === String(contractorId));
    const totalPaid = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    res.json({
      contractor_id: contractorId,
      total_paid: Math.round(totalPaid * 100) / 100,
      payments
    });
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Admin - get contractor payouts summary and details
app.get('/api/admin/contractors/:contractorId/payouts', async (req, res) => {
  try {
    const { contractorId } = req.params;
    
    // Get contractor info
    const contractorResult = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
    if (contractorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    
    const contractor = contractorResult.rows[0];
    
    // Get pending payouts for this contractor
    const pendingResult = await pool.query(
      'SELECT * FROM jobs WHERE contractor_id = $1 AND payout_status != $2 ORDER BY completed_at DESC',
      [contractorId, 'paid']
    );
    
    // Get paid payouts for this contractor
    const paidResult = await pool.query(
      'SELECT * FROM jobs WHERE contractor_id = $1 AND payout_status = $2 ORDER BY completed_at DESC LIMIT 50',
      [contractorId, 'paid']
    );
    
    const pendingJobs = pendingResult.rows || [];
    const paidJobs = paidResult.rows || [];
    
    // Calculate totals
    const totalPending = pendingJobs.reduce((sum, job) => sum + (job.contractor_payout || 0), 0);
    const totalPaid = paidJobs.reduce((sum, job) => sum + (job.contractor_payout || 0), 0);
    const readyCount = pendingJobs.filter(job => job.payout_status === 'ready').length;
    
    res.json({
      contractor: {
        id: contractor.id,
        name: contractor.business_name || contractor.legal_name || contractor.email,
        email: contractor.email,
        phone: contractor.phone,
        tier: contractor.contractor_tier || 'bronze',
        payment_schedule: contractor.payment_schedule || 'weekly',
        next_payment_date: contractor.next_payment_date
      },
      payouts: {
        pending: {
          total_amount: Math.round(totalPending * 100) / 100,
          job_count: pendingJobs.length,
          ready_count: readyCount,
          jobs: pendingJobs.map(job => ({
            job_id: job.id,
            category: job.category_name || job.category,
            city: job.city,
            final_price: job.final_price,
            material_fees: job.material_fees,
            stripe_fee: job.stripe_fee,
            platform_fee: job.platform_fee,
            contractor_payout: job.contractor_payout,
            completed_at: job.completed_at,
            status: job.payout_status
          }))
        },
        history: {
          total_amount: Math.round(totalPaid * 100) / 100,
          job_count: paidJobs.length,
          jobs: paidJobs.map(job => ({
            job_id: job.id,
            category: job.category_name || job.category,
            city: job.city,
            final_price: job.final_price,
            material_fees: job.material_fees,
            contractor_payout: job.contractor_payout,
            completed_at: job.completed_at,
            paid_at: job.updated_at
          }))
        }
      }
    });
  } catch (error) {
    console.error('Contractor payouts error:', error);
    res.status(500).json({ error: 'Failed to fetch contractor payouts' });
  }
});

// Admin - all jobs
app.get('/api/admin/jobs', async (req, res) => {
  const result = await pool.query('SELECT * FROM jobs');
  res.json({ jobs: result.rows });
});

// Admin - all contractors
app.get('/api/admin/contractors', async (req, res) => {
  const result = await pool.query('SELECT * FROM contractors');
  res.json({ contractors: result.rows });
});

// Admin - assign job
app.post('/api/admin/jobs/:jobId/assign', async (req, res) => {
  const result = await pool.query(
    'UPDATE jobs SET contractor_id = $1, status = $2 WHERE id = $3 RETURNING *',
    [req.body.contractor_id, 'assigned', req.params.jobId]
  );
  res.json({ job: result.rows[0] });
});

// Admin - update contractor status
app.patch('/api/admin/contractors/:contractorId/status', async (req, res) => {
  const result = await pool.query(
    'UPDATE contractors SET vetting_status = $1 WHERE id = $2 RETURNING *',
    [req.body.vetting_status, req.params.contractorId]
  );
  res.json({ contractor: result.rows[0] });
});

// Admin - update contractor tier
app.patch('/api/admin/contractors/:contractorId/tier', async (req, res) => {
  try {
    const { contractorId } = req.params;
    const { contractor_tier } = req.body;
    const tier = String(contractor_tier || '').toLowerCase();
    if (!['bronze', 'silver', 'gold'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid contractor tier' });
    }

    const result = await pool.query(
      'UPDATE contractors SET contractor_tier = $1 WHERE id = $2 RETURNING *',
      [tier, contractorId]
    );

    const contractor = result.rows[0];
    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    await logEvent({
      action: 'contractor.tier_updated',
      entity_type: 'contractor',
      entity_id: contractorId,
      actor: req.actor || { role: 'admin', id: 'admin-001' },
      after: { contractor_tier: tier }
    });

    res.json({ contractor });
  } catch (error) {
    console.error('Update contractor tier error:', error);
    res.status(500).json({ error: 'Failed to update contractor tier' });
  }
});

// ============================================================================
// ADMIN DASHBOARD ENDPOINTS
// ============================================================================

// Admin Dashboard Metrics
app.get('/api/admin/metrics/dashboard', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM admin_dashboard_metrics');
    const metrics = result.rows[0] || {};

    // Ensure pending payouts align with Contractor Payouts page (ready only)
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const contractorsResult = await pool.query('SELECT * FROM contractors');
    const jobs = attachContractorTier(jobsResult.rows || [], contractorsResult.rows || []);
    const readyJobs = jobs.filter(job => job.status === 'completed' && (job.payout_status || 'not_ready') === 'ready');
    const pendingPayouts = readyJobs.reduce((sum, job) => {
      const financials = computeFinancials(job);
      return sum + (financials.contractor_payout || 0);
    }, 0);

    metrics.pending_payouts = Math.round(pendingPayouts * 100) / 100;

    res.json({
      metrics,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

// Admin - Get Jobs with Filters
app.get('/api/admin/jobs/filtered', async (req, res) => {
  try {
    const { status, urgency, service_type, has_dispute } = req.query;
    
    let jobs = [];
    
    if (status) {
      const statuses = status.split(',');
      const result = await pool.query(
        'SELECT * FROM jobs WHERE status IN ($1, $2, $3, $4, $5)',
        statuses.slice(0, 5) // Max 5 statuses
      );
      jobs = result.rows;
    } else {
      const result = await pool.query('SELECT * FROM jobs');
      jobs = result.rows;
    }
    
    // Apply additional filters
    if (urgency) {
      jobs = jobs.filter(j => j.urgency === urgency);
    }
    if (service_type) {
      jobs = jobs.filter(j => j.service_type_id === parseInt(service_type));
    }
    if (has_dispute === 'true') {
      jobs = jobs.filter(j => j.has_dispute === true);
    }
    
    res.json({ jobs, count: jobs.length });
  } catch (error) {
    console.error('Filtered jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch filtered jobs' });
  }
});

// Admin - Get Contractors with Filters
app.get('/api/admin/contractors/filtered', async (req, res) => {
  try {
    const { status, docs_expiring } = req.query;
    
    let contractors = [];
    
    if (status) {
      const statuses = status.split(',');
      const result = await pool.query(
        'SELECT * FROM contractors WHERE vetting_status IN ($1, $2, $3)',
        statuses.slice(0, 3)
      );
      contractors = result.rows;
    } else {
      const result = await pool.query('SELECT * FROM contractors');
      contractors = result.rows;
    }
    
    if (docs_expiring === 'true') {
      const docsResult = await pool.query('SELECT * FROM contractor_documents WHERE expiry < NOW()');
      const contractorIds = [...new Set(docsResult.rows.map(d => d.contractor_id))];
      contractors = contractors.filter(c => contractorIds.includes(c.id));
    }
    
    res.json({ contractors, count: contractors.length });
  } catch (error) {
    console.error('Filtered contractors error:', error);
    res.status(500).json({ error: 'Failed to fetch filtered contractors' });
  }
});

// Admin - Get Job Detail
app.get('/api/admin/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({ job: result.rows[0] });
  } catch (error) {
    console.error('Job detail error:', error);
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
});

// Admin - Get Contractor Detail
app.get('/api/admin/contractors/:contractorId', async (req, res) => {
  try {
    const { contractorId } = req.params;
    const result = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contractor not found' });
    }
    
    // Get contractor specialties
    const specialtiesResult = await pool.query(
      'SELECT service_type_id FROM contractor_specialties WHERE contractor_id = $1',
      [contractorId]
    );
    
    const contractor = result.rows[0];
    contractor.primary_trade = contractor.primary_trade || contractor.primaryTrade || null;
    const combinedSecondary = []
      .concat(contractor.secondary_trades || [])
      .concat(contractor.secondaryTrades || [])
      .filter(Boolean);
    contractor.secondary_trades = combinedSecondary.length > 0 ? Array.from(new Set(combinedSecondary)) : null;
    const combinedServices = []
      .concat(contractor.service_types || [])
      .concat(contractor.serviceTypes || [])
      .filter(v => v !== null && v !== undefined);
    contractor.service_types = combinedServices.length > 0 ? Array.from(new Set(combinedServices.map(Number))) : null;
    contractor.experience_years = contractor.experience_years || contractor.experienceYears || null;
    contractor.specialties = specialtiesResult.rows.map(r => r.service_type_id);
    const logFromProfile = Array.isArray(contractor.auditLog) ? contractor.auditLog : [];
    const logFromStore = contractorAuditLog.get(contractorId) || [];
    contractor.auditLog = [...logFromProfile, ...logFromStore].sort((a, b) => new Date(b.at) - new Date(a.at));
    if (!contractor.status && contractor.vetting_status) {
      const vs = String(contractor.vetting_status).toLowerCase();
      if (['applied', 'under_review', 'pending_documents'].includes(vs)) {
        contractor.status = 'pending_review';
      } else if (vs === 'approved_active') {
        contractor.status = 'approved';
      } else if (vs === 'rejected') {
        contractor.status = 'rejected';
      }
    }
    
    res.json({ contractor });
  } catch (error) {
    console.error('Contractor detail error:', error);
    res.status(500).json({ error: 'Failed to fetch contractor details' });
  }
});

// Admin - Update Contractor Status
app.post('/api/admin/contractors/:contractorId/status', async (req, res) => {
  try {
    const { contractorId } = req.params;
    const { status, reason } = req.body;
    const auditMeta = req.audit || {};
    
    const result = await pool.query(
      'UPDATE contractors SET status = $1, vetting_status = $2 WHERE id = $3 RETURNING *',
      [status, status.toUpperCase(), contractorId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    const contractor = result.rows[0];
    
    // Add audit log entry
    const auditEntry = {
      at: new Date().toISOString(),
      actorId: 'admin-001',
      action: status.toUpperCase(),
      details: reason || ''
    };
    
    if (!contractor.auditLog) {
      contractor.auditLog = [];
    }
    contractor.auditLog.push(auditEntry);

    const existing = contractorAuditLog.get(contractorId) || [];
    existing.push(auditEntry);
    contractorAuditLog.set(contractorId, existing);

    await logEvent({
      action: 'contractor.status_updated',
      entity_type: 'contractor',
      entity_id: contractorId,
      actor: req.actor || { role: 'admin', id: 'admin-001' },
      before: null,
      after: { status, vetting_status: status.toUpperCase() },
      reason: reason || null,
      meta: auditMeta
    });
    
    // Log the status change
    console.log(`Admin changed contractor ${contractorId} status to ${status}. Reason: ${reason}`);
    
    res.json({ contractor });
  } catch (error) {
    console.error('Update contractor status error:', error);
    res.status(500).json({ error: 'Failed to update contractor status' });
  }
});

// Admin - Add Internal Note to Contractor
app.post('/api/admin/contractors/:contractorId/notes', async (req, res) => {
  try {
    const { contractorId } = req.params;
    const { note } = req.body;
    
    // In production, this would insert into contractor_notes table
    console.log(`Admin added note to contractor ${contractorId}: ${note}`);
    
    res.json({ 
      success: true,
      note: {
        id: crypto.randomUUID(),
        contractor_id: contractorId,
        note,
        created_at: new Date(),
        created_by: 'admin'
      }
    });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Admin - Revenue Dashboard
app.get('/api/admin/revenue/dashboard', async (req, res) => {
  try {
    const { range = 'mtd' } = req.query;
    
    // Mock revenue data
    const revenueData = {
      mtd_revenue: 45600,
      ytd_revenue: 425000,
      pending_payouts: 12400,
      completed_jobs_mtd: 130,
      by_city: [
        { city: 'Toronto', revenue: 28000, jobs: 80 },
        { city: 'Mississauga', revenue: 12600, jobs: 36 },
        { city: 'Brampton', revenue: 5000, jobs: 14 }
      ],
      by_service: [
        { service: 'Plumbing', revenue: 18500, jobs: 53 },
        { service: 'Electrical', revenue: 15200, jobs: 43 },
        { service: 'HVAC', revenue: 11900, jobs: 34 }
      ],
      daily_trend: Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        revenue: Math.floor(Math.random() * 3000) + 1000,
        jobs: Math.floor(Math.random() * 10) + 3
      }))
    };
    
    res.json(revenueData);
  } catch (error) {
    console.error('Revenue dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// ============================================================================
// EXPANSION / JOIN TEAM ENDPOINT
// ============================================================================

app.post('/api/expansion/proposals', async (req, res) => {
  try {
    const auditMeta = req.audit || {};
    const proposal = {
      id: uuidv4(),
      ...req.body,
      status: 'pending_review',
      reviewed: false,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    // In production: INSERT INTO expansion_proposals
    console.log('📍 New Expansion Proposal:', proposal.location?.city, proposal.location?.region);
    console.log('👤 Contact:', proposal.contact?.name, proposal.contact?.email);
    console.log('🎯 Commitment:', proposal.commitment_level);
    console.log('🔧 Trades in demand:', proposal.trades_in_demand);
    
    // Store in mock database
    expansionProposals.unshift(proposal);
    
    res.json({
      success: true,
      proposal_id: proposal.id,
      message: 'Proposal submitted successfully'
    });

    await logEvent({
      action: 'proposal.created',
      entity_type: 'proposal',
      entity_id: proposal.id,
      actor: req.actor || { role: 'customer', id: null, email: proposal.contact?.email || null },
      after: proposal,
      meta: auditMeta
    });
  } catch (error) {
    console.error('Expansion proposal error:', error);
    res.status(500).json({ error: 'Failed to submit proposal' });
  }
});

// Admin - View Expansion Proposals
app.get('/api/admin/expansion/proposals', async (req, res) => {
  try {
    // In production: SELECT * FROM expansion_proposals ORDER BY created_at DESC
    const proposals = [...expansionProposals];
    
    res.json({ proposals, count: proposals.length });
  } catch (error) {
    console.error('Error fetching proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// Team Applications (Join Existing City)
app.post('/api/team/applications', async (req, res) => {
  try {
    const application = {
      city_id: req.body.city_id,
      city_name: req.body.city_name,
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone || null,
      roles: req.body.roles || [],
      why: req.body.why || null,
      resume: req.body.resume || null
    };
    
    console.log('👥 New Team Application:', application.city_name);
    console.log('📋 Roles:', application.roles);
    console.log('👤 Applicant:', application.name, application.email);
    if (application.resume) {
      console.log('📄 Resume attached:', application.resume.filename);
    }
    
    // Create application in PostgreSQL or fallback to mock DB
    let result;
    try {
      result = await teamAppsDb.createApplication(application);
    } catch (dbError) {
      console.warn('⚠️  PostgreSQL failed, using mock DB:', dbError.message);
      // Fallback to mock DB for development
      result = {
        id: uuidv4(),
        ...application,
        status: 'pending_review',
        reviewed: false,
        created_at: new Date(),
        updated_at: new Date()
      };
      teamApplications.unshift(result);
    }
    
    // Send notification email to superadmin if configured
    if (ENV.superadminEmail) {
      const adminDashboardLink = `${ENV.webOrigin}/superadmin/superadmin-team-applications.html`;
      await sendNewApplicationNotification(
        application.name,
        application.email,
        application.city_name,
        application.roles || [],
        ENV.superadminEmail,
        adminDashboardLink
      );
    }
    
    res.json({
      success: true,
      application_id: result.id,
      message: 'Application submitted successfully'
    });
  } catch (error) {
    console.error('Team application error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// Admin - View Team Applications
app.get('/api/admin/team/applications', async (req, res) => {
  try {
    const { city_id, status } = req.query;
    
    // Try PostgreSQL first, fallback to mock DB
    let applications = [];
    try {
      const filters = {};
      if (city_id) filters.city_id = parseInt(city_id);
      if (status) filters.status = status;
      
      applications = await teamAppsDb.getApplications(filters);
    } catch (dbError) {
      console.warn('⚠️  PostgreSQL failed, using mock DB:', dbError.message);
      // Fallback to mock DB for development
      applications = [...teamApplications];
      if (city_id) {
        applications = applications.filter(a => String(a.city_id) === String(city_id));
      }
      if (status) {
        applications = applications.filter(a => a.status === status);
      }
    }
    
    res.json({ applications, count: applications.length });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Admin - Approve Team Application
app.patch('/api/admin/team/applications/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    // Try PostgreSQL first
    let application;
    try {
      application = await teamAppsDb.approveApplication(id, notes || '');
    } catch (dbError) {
      console.warn('⚠️  PostgreSQL failed, using mock DB:', dbError.message);
      // Fallback to mock DB for development
      const appIndex = teamApplications.findIndex(a => a.id === id);
      if (appIndex === -1) {
        return res.status(404).json({ error: 'Application not found' });
      }
      
      application = teamApplications[appIndex];
      teamApplications[appIndex].status = 'approved';
      teamApplications[appIndex].reviewed_at = new Date();
      teamApplications[appIndex].reviewer_notes = notes || '';
      teamApplications[appIndex].updated_at = new Date();
    }
    
    console.log(`✅ Approved application ${id} from ${application.name}`);
    
    // Send approval email to applicant
    if (application.email) {
      await sendApprovalEmail(
        application.email,
        application.name,
        application.city_name,
        notes || ''
      );
    }
    
    res.json({
      success: true,
      message: 'Application approved and email sent',
      application: application
    });
  } catch (error) {
    console.error('Error approving application:', error);
    res.status(500).json({ error: 'Failed to approve application' });
  }
});

// Admin - Reject Team Application
app.patch('/api/admin/team/applications/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    // Try PostgreSQL first
    let application;
    try {
      application = await teamAppsDb.rejectApplication(id, notes || '');
    } catch (dbError) {
      console.warn('⚠️  PostgreSQL failed, using mock DB:', dbError.message);
      // Fallback to mock DB for development
      const appIndex = teamApplications.findIndex(a => a.id === id);
      if (appIndex === -1) {
        return res.status(404).json({ error: 'Application not found' });
      }
      
      application = teamApplications[appIndex];
      teamApplications[appIndex].status = 'rejected';
      teamApplications[appIndex].reviewed_at = new Date();
      teamApplications[appIndex].reviewer_notes = notes || '';
      teamApplications[appIndex].updated_at = new Date();
    }
    
    console.log(`❌ Rejected application ${id} from ${application.name}`);
    
    // Send rejection email to applicant
    if (application.email) {
      await sendRejectionEmail(
        application.email,
        application.name,
        application.city_name,
        notes || ''
      );
    }
    
    res.json({
      success: true,
      message: 'Application rejected and email sent',
      application: application
    });
  } catch (error) {
    console.error('Error rejecting application:', error);
    res.status(500).json({ error: 'Failed to reject application' });
  }
});

// ============================================================================
// CONTRACTOR PROFILE PAGE RENDERING (Dynamic HTML per Contractor)
// ============================================================================

// Serve individualized contractor profile HTML pages
app.get('/admin/contractor-profile/:contractorId', async (req, res) => {
  try {
    const { contractorId } = req.params;
    console.log(`📄 Rendering profile for contractor ID: ${contractorId}`);
    
    // Fetch contractor from database
    const result = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
    console.log(`   Query returned ${result.rows.length} row(s)`);
    
    if (result.rows.length === 0) {
      console.log(`   ❌ Contractor not found`);
      return res.status(404).send('<h1>Contractor not found</h1>');
    }
    
    const contractor = result.rows[0];
    console.log(`   ✅ Found: ${contractor.business_name} (${contractor.id})`);
    
    // Generate HTML page specific to this contractor
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${contractor.business_name || contractor.legal_name} - Admin Profile</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        header { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 10px; }
        .status-badge { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .status-approved { background: #d4edda; color: #155724; }
        .status-pending { background: #fff3cd; color: #856404; }
        .status-rejected { background: #f8d7da; color: #721c24; }
        
        .profile-content { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h2 { color: #333; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-weight: bold; color: #666; }
        .info-value { color: #333; }
        
        .action-buttons { margin-top: 20px; display: flex; gap: 10px; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        .btn-primary { background: #007bff; color: white; }
        .btn-success { background: #28a745; color: white; }
        .btn-danger { background: #dc3545; color: white; }
        .btn-back { background: #6c757d; color: white; }
        .btn:hover { opacity: 0.9; }
        
        .full-width { grid-column: 1 / -1; }
        .details { background: #f9f9f9; padding: 10px; border-radius: 4px; margin-top: 10px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>${contractor.business_name || contractor.legal_name}</h1>
            <span class="status-badge status-${(contractor.vetting_status || '').toLowerCase().replace(/_/g, '-')}">${contractor.vetting_status || 'UNKNOWN'}</span>
            <button class="btn btn-back" onclick="window.history.back();">← Back</button>
        </header>
        
        <div class="profile-content">
            <!-- Basic Information -->
            <div class="card">
                <h2>Basic Information</h2>
                <div class="info-row">
                    <span class="info-label">Legal Name:</span>
                    <span class="info-value">${contractor.legal_name || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Business Name:</span>
                    <span class="info-value">${contractor.business_name || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Email:</span>
                    <span class="info-value">${contractor.email || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Phone:</span>
                    <span class="info-value">${contractor.phone || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Contractor ID:</span>
                    <span class="info-value">${contractor.id || 'N/A'}</span>
                </div>
            </div>
            
            <!-- Professional Details -->
            <div class="card">
                <h2>Professional Details</h2>
                <div class="info-row">
                    <span class="info-label">Primary Trade:</span>
                    <span class="info-value">${contractor.primary_trade || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Experience:</span>
                    <span class="info-value">${contractor.experience_years || 'N/A'} years</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Vetting Status:</span>
                    <span class="info-value">${contractor.vetting_status || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Contractor Tier:</span>
                    <span class="info-value">${(contractor.contractor_tier || 'bronze').toUpperCase()}</span>
                </div>
            </div>
            
            <!-- Admin Notes -->
            <div class="card full-width">
                <h2>Admin Notes</h2>
                <div class="details" id="adminNotes">${contractor.admin_notes || 'No notes'}</div>
                <textarea id="notesInput" style="width: 100%; height: 80px; margin-top: 10px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Add admin notes..."></textarea>
                <button class="btn btn-primary" onclick="saveNotes()" style="margin-top: 10px;">Save Notes</button>
            </div>
            
            <!-- Action Buttons -->
            <div class="card full-width">
                <h2>Actions</h2>
                <div class="action-buttons">
                    <button class="btn btn-success" onclick="updateStatus('APPROVED_ACTIVE')">Approve</button>
                    <button class="btn btn-danger" onclick="updateStatus('REJECTED')">Reject</button>
                    <button class="btn btn-primary" onclick="location.reload()">Refresh</button>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        const contractorId = '${contractor.id}';
        const contractorName = '${contractor.business_name || contractor.legal_name}';
        
        console.log('✅ Loaded profile for:', contractorName, '(ID:', contractorId + ')');
        
        async function saveNotes() {
            const notes = document.getElementById('notesInput').value;
            try {
                const response = await fetch(\`/api/admin/contractors/\${contractorId}/notes\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note: notes })
                });
                if (response.ok) {
                    notify.success('Notes saved successfully!');
                    document.getElementById('adminNotes').textContent = notes || 'No notes';
                    document.getElementById('notesInput').value = '';
                }
            } catch (error) {
                console.error('Error saving notes:', error);
                notify.error('Failed to save notes');
            }
        }
        
        async function updateStatus(newStatus) {
            const confirmUpdate = confirm(\`Update contractor status to: \${newStatus}?\`);
            if (!confirmUpdate) return;
            
            try {
                const response = await fetch(\`/api/admin/contractors/\${contractorId}/status\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus })
                });
                if (response.ok) {
                    notify.info('Status updated successfully!');
                    location.reload();
                }
            } catch (error) {
                console.error('Error updating status:', error);
                notify.error('Failed to update status');
            }
        }
    </script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error rendering contractor profile:', error);
    res.status(500).send('<h1>Error loading profile</h1><p>Check server logs for details.</p>');
  }
});

// Public contractor profile pages (non-admin)
app.get('/contractor-profile/:contractorId', async (req, res) => {
  try {
    const { contractorId } = req.params;
    
    const result = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractorId]);
    if (result.rows.length === 0) {
      return res.status(404).send('<h1>Contractor not found</h1>');
    }
    
    const contractor = result.rows[0];
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${contractor.business_name || contractor.legal_name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
        .container { max-width: 900px; margin: 0 auto; padding: 20px; }
        header { background: linear-gradient(135deg, #007bff, #0056b3); color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px; }
        h1 { font-size: 32px; margin-bottom: 10px; }
        .subtitle { font-size: 16px; opacity: 0.9; }
        
        .card { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .card h2 { color: #007bff; margin-bottom: 15px; font-size: 20px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        .info-item { }
        .info-label { font-weight: bold; color: #666; font-size: 14px; }
        .info-value { color: #333; font-size: 16px; margin-top: 5px; }
        
        .btn { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; }
        .btn:hover { background: #0056b3; }
        .btn-back { background: #6c757d; }
        .btn-back:hover { background: #5a6268; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>${contractor.business_name || contractor.legal_name}</h1>
            <div class="subtitle">${contractor.primary_trade || 'Contractor'} • ${contractor.experience_years || '?'} years experience</div>
        </header>
        
        <div class="card">
            <h2>Contact Information</h2>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Email</div>
                    <div class="info-value">${contractor.email || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Phone</div>
                    <div class="info-value">${contractor.phone || 'N/A'}</div>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h2>About</h2>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Specialty</div>
                    <div class="info-value">${contractor.primary_trade || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Experience</div>
                    <div class="info-value">${contractor.experience_years || 'N/A'} years</div>
                </div>
            </div>
        </div>
        
        <a href="javascript:history.back();" class="btn btn-back">← Back</a>
        <a href="mailto:${contractor.email}" class="btn">Contact Contractor</a>
    </div>
    
    <script>
        console.log('✅ Public profile loaded for:', '${contractor.business_name || contractor.legal_name}');
    </script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Error rendering public profile:', error);
    res.status(500).send('<h1>Error loading profile</h1>');
  }
});

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------------------------------------------------------------------
// Global Error Handler (don't leak internals in production)
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  req.log?.error({ err }, 'Unhandled error');
  const message = ENV.isProduction ? 'Server error' : err.message;
  res.status(err.status || 500).json({ error: message });
});

// ---------------------------------------------------------------------------
// Server Startup
// ---------------------------------------------------------------------------
const server = app.listen(PORT, async () => {
  logger.info({ port: PORT, env: ENV.nodeEnv, origin: ENV.webOrigin }, 'Server started');
  
  // Initialize PostgreSQL connection pool
  try {
    teamAppsDb.initializePool();
    logger.info('PostgreSQL connection pool initialized');
  } catch (error) {
    logger.warn({ err: error }, 'PostgreSQL connection failed (using mock DB fallback)');
  }
});

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------
const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutdown signal received, closing connections...');
  
  server.close(async () => {
    try {
      await Promise.all([
        teamAppsDb.closePool(),
        closeDbPool()
      ]);
      logger.info('All connections closed, exiting');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });
  
  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
