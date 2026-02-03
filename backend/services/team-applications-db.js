/**
 * PostgreSQL Team Applications Service
 * Handles all database operations for team applications
 * 
 * This module provides an abstraction layer for team application queries,
 * allowing easy switching between mock DB and real PostgreSQL.
 */

const { Pool } = require('pg');
const ENV = require('../config/env');

let pool = null;

/**
 * Initialize PostgreSQL connection pool
 * Called once at application startup
 */
function initializePool() {
  if (pool) {
    return pool; // Already initialized
  }

  const poolConfig = {
    connectionString: ENV.databaseUrl,
    ssl: ENV.isProduction ? { rejectUnauthorized: false } : false,
    max: ENV.pgPoolMax,
    idleTimeoutMillis: ENV.pgIdleTimeoutMs,
    connectionTimeoutMillis: 2000
  };

  pool = new Pool(poolConfig);

  pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
  });

  return pool;
}

/**
 * Create a new team application
 * @param {Object} application - Application data
 * @returns {Promise<Object>} Created application with ID
 */
async function createApplication(application) {
  const client = pool || initializePool();
  
  const query = `
    INSERT INTO team_applications 
    (city_id, city_name, name, email, phone, roles, why, resume, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    RETURNING *
  `;

  const values = [
    application.city_id,
    application.city_name,
    application.name,
    application.email,
    application.phone || null,
    application.roles || [],
    application.why || null,
    application.resume ? JSON.stringify(application.resume) : null,
    'pending_review'
  ];

  try {
    const result = await client.query(query, values);
    const row = result.rows[0];
    
    return {
      id: row.id,
      city_id: row.city_id,
      city_name: row.city_name,
      name: row.name,
      email: row.email,
      phone: row.phone,
      roles: row.roles,
      why: row.why,
      resume: row.resume ? JSON.parse(row.resume) : null,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  } catch (error) {
    console.error('❌ Error creating application:', error.message);
    throw error;
  }
}

/**
 * Get all team applications with optional filters
 * @param {Object} filters - Query filters { city_id, status }
 * @returns {Promise<Array>} Array of applications
 */
async function getApplications(filters = {}) {
  const client = pool || initializePool();
  
  let query = 'SELECT * FROM team_applications WHERE 1=1';
  const values = [];
  let paramCount = 1;

  if (filters.city_id) {
    query += ` AND city_id = $${paramCount}`;
    values.push(filters.city_id);
    paramCount++;
  }

  if (filters.status) {
    query += ` AND status = $${paramCount}`;
    values.push(filters.status);
    paramCount++;
  }

  query += ' ORDER BY created_at DESC';

  try {
    const result = await client.query(query, values);
    
    return result.rows.map(row => ({
      id: row.id,
      city_id: row.city_id,
      city_name: row.city_name,
      name: row.name,
      email: row.email,
      phone: row.phone,
      roles: row.roles,
      why: row.why,
      resume: row.resume ? JSON.parse(row.resume) : null,
      status: row.status,
      reviewed_at: row.reviewed_at,
      reviewer_notes: row.reviewer_notes,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  } catch (error) {
    console.error('❌ Error fetching applications:', error.message);
    throw error;
  }
}

/**
 * Get a single application by ID
 * @param {string} id - Application ID (UUID)
 * @returns {Promise<Object|null>} Application object or null if not found
 */
async function getApplicationById(id) {
  const client = pool || initializePool();
  
  const query = 'SELECT * FROM team_applications WHERE id = $1';

  try {
    const result = await client.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      city_id: row.city_id,
      city_name: row.city_name,
      name: row.name,
      email: row.email,
      phone: row.phone,
      roles: row.roles,
      why: row.why,
      resume: row.resume ? JSON.parse(row.resume) : null,
      status: row.status,
      reviewed_at: row.reviewed_at,
      reviewer_notes: row.reviewer_notes,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  } catch (error) {
    console.error('❌ Error fetching application:', error.message);
    throw error;
  }
}

/**
 * Update application status to approved
 * @param {string} id - Application ID
 * @param {string} notes - Reviewer notes
 * @returns {Promise<Object>} Updated application
 */
async function approveApplication(id, notes = '') {
  const client = pool || initializePool();
  
  const query = `
    UPDATE team_applications 
    SET status = $1, reviewed_at = NOW(), reviewer_notes = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `;

  try {
    const result = await client.query(query, ['approved', notes, id]);
    
    if (result.rows.length === 0) {
      throw new Error('Application not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      city_id: row.city_id,
      city_name: row.city_name,
      name: row.name,
      email: row.email,
      phone: row.phone,
      roles: row.roles,
      why: row.why,
      resume: row.resume ? JSON.parse(row.resume) : null,
      status: row.status,
      reviewed_at: row.reviewed_at,
      reviewer_notes: row.reviewer_notes,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  } catch (error) {
    console.error('❌ Error approving application:', error.message);
    throw error;
  }
}

/**
 * Update application status to rejected
 * @param {string} id - Application ID
 * @param {string} notes - Reviewer notes
 * @returns {Promise<Object>} Updated application
 */
async function rejectApplication(id, notes = '') {
  const client = pool || initializePool();
  
  const query = `
    UPDATE team_applications 
    SET status = $1, reviewed_at = NOW(), reviewer_notes = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `;

  try {
    const result = await client.query(query, ['rejected', notes, id]);
    
    if (result.rows.length === 0) {
      throw new Error('Application not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      city_id: row.city_id,
      city_name: row.city_name,
      name: row.name,
      email: row.email,
      phone: row.phone,
      roles: row.roles,
      why: row.why,
      resume: row.resume ? JSON.parse(row.resume) : null,
      status: row.status,
      reviewed_at: row.reviewed_at,
      reviewer_notes: row.reviewer_notes,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  } catch (error) {
    console.error('❌ Error rejecting application:', error.message);
    throw error;
  }
}

/**
 * Get count of applications by status
 * @returns {Promise<Object>} Counts { pending_review, approved, rejected, total }
 */
async function getApplicationStats() {
  const client = pool || initializePool();
  
  const query = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pending_review,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM team_applications
  `;

  try {
    const result = await client.query(query);
    const row = result.rows[0];
    
    return {
      total: parseInt(row.total) || 0,
      pending_review: parseInt(row.pending_review) || 0,
      approved: parseInt(row.approved) || 0,
      rejected: parseInt(row.rejected) || 0
    };
  } catch (error) {
    console.error('❌ Error fetching statistics:', error.message);
    throw error;
  }
}

/**
 * Close the database connection pool
 * Called when shutting down the application
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Database pool closed');
  }
}

module.exports = {
  initializePool,
  createApplication,
  getApplications,
  getApplicationById,
  approveApplication,
  rejectApplication,
  getApplicationStats,
  closePool,
  // For direct access if needed
  getPool: () => pool || initializePool()
};
