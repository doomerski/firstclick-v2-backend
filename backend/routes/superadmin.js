const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { pool, db } = require('../mock-db');
const { auditLog } = require('../middleware/audit-log');

const router = express.Router();

router.use(auditLog());

function normalizeRole(role) {
  const value = String(role || '').toLowerCase();
  if (['super_admin', 'superadmin', 'super-admin'].includes(value)) return 'super_admin';
  if (value === 'admin') return 'admin';
  if (value === 'contractor') return 'contractor';
  return 'customer';
}

function mapUser(record, role) {
  return {
    id: record.id,
    email: record.email,
    full_name: record.full_name || record.legal_name || record.business_name || null,
    legal_name: record.legal_name || null,
    business_name: record.business_name || null,
    phone: record.phone || null,
    role,
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}

async function fetchAllUsers() {
  const [customersResult, contractorsResult, adminsResult] = await Promise.all([
    pool.query('SELECT * FROM customers'),
    pool.query('SELECT * FROM contractors'),
    pool.query('SELECT * FROM admins')
  ]);

  const customers = (customersResult.rows || []).map(row => mapUser(row, row.role || 'customer'));
  const contractors = (contractorsResult.rows || []).map(row => mapUser(row, row.role || 'contractor'));
  const admins = (adminsResult.rows || []).map(row => mapUser(row, row.role || 'admin'));

  return [...customers, ...contractors, ...admins];
}

async function findUserById(id) {
  const [customersResult, contractorsResult, adminsResult] = await Promise.all([
    pool.query('SELECT * FROM customers'),
    pool.query('SELECT * FROM contractors'),
    pool.query('SELECT * FROM admins')
  ]);

  const customer = (customersResult.rows || []).find(row => String(row.id) === String(id));
  if (customer) return { user: customer, role: customer.role || 'customer', table: 'customers' };

  const contractor = (contractorsResult.rows || []).find(row => String(row.id) === String(id));
  if (contractor) return { user: contractor, role: contractor.role || 'contractor', table: 'contractors' };

  const admin = (adminsResult.rows || []).find(row => String(row.id) === String(id));
  if (admin) return { user: admin, role: admin.role || 'admin', table: 'admins' };

  return null;
}

async function revokeSessionsByUser(userId) {
  const sessions = db.sessions.filter(session => String(session.user_id) === String(userId));
  sessions.forEach(session => {
    session.revoked_at = new Date().toISOString();
    session.updated_at = new Date();
  });
  await pool.query('UPDATE sessions SET revoked_at = $1 WHERE user_id = $2 RETURNING *', [new Date().toISOString(), userId]);
  return sessions;
}

router.get('/stats', async (req, res) => {
  try {
    const users = await fetchAllUsers();
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const paymentsResult = await pool.query('SELECT * FROM payments');
    const auditResult = await pool.query('SELECT * FROM audit_logs');
    const sessionsResult = await pool.query('SELECT * FROM sessions');

    const jobs = jobsResult.rows || [];
    const payments = paymentsResult.rows || [];
    const auditLogs = auditResult.rows || [];
    const sessions = sessionsResult.rows || [];

    const roleCounts = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    const revenueTotal = payments
      .filter(payment => ['paid', 'completed', 'success'].includes(String(payment.status || '').toLowerCase()))
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

    res.json({
      stats: {
        users: {
          total: users.length,
          by_role: roleCounts
        },
        jobs: {
          total: jobs.length
        },
        payments: {
          total: payments.length
        },
        audit_logs: auditLogs.length,
        sessions: sessions.length,
        revenue: Math.round(revenueTotal * 100) / 100
      }
    });
  } catch (error) {
    console.error('Superadmin stats error:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

router.get('/database/stats', async (req, res) => {
  try {
    const customers = (await pool.query('SELECT * FROM customers')).rows || [];
    const contractors = (await pool.query('SELECT * FROM contractors')).rows || [];
    const admins = (await pool.query('SELECT * FROM admins')).rows || [];
    const jobs = (await pool.query('SELECT * FROM jobs')).rows || [];
    const payments = (await pool.query('SELECT * FROM payments')).rows || [];
    const auditLogs = (await pool.query('SELECT * FROM audit_logs')).rows || [];
    const sessions = (await pool.query('SELECT * FROM sessions')).rows || [];

    res.json({
      tables: {
        customers: customers.length,
        contractors: contractors.length,
        admins: admins.length,
        jobs: jobs.length,
        payments: payments.length,
        audit_logs: auditLogs.length,
        sessions: sessions.length
      }
    });
  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({ error: 'Failed to load database stats' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions');
    res.json({ sessions: result.rows || [] });
  } catch (error) {
    console.error('Sessions list error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await fetchAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findUserById(id);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    const auditLogsResult = await pool.query('SELECT * FROM audit_logs');
    const auditLogs = (auditLogsResult.rows || []).filter(log =>
      String(log.user_id) === String(id) || String(log.user_email || '').toLowerCase() === String(found.user.email || '').toLowerCase()
    );

    res.json({
      user: mapUser(found.user, found.role),
      role: found.role,
      table: found.table,
      audit_logs: auditLogs
    });
  } catch (error) {
    console.error('User detail error:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { email, password, role, full_name, phone, legal_name, business_name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const normalizedRole = normalizeRole(role);
    const passwordHash = await bcrypt.hash(password, 10);

    if (normalizedRole === 'admin' || normalizedRole === 'super_admin') {
      const result = await pool.query(
        'INSERT INTO admins (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [email, passwordHash, full_name || null, normalizedRole]
      );
      return res.status(201).json({ user: mapUser(result.rows[0], normalizedRole) });
    }

    if (normalizedRole === 'contractor') {
      const contractorResult = await pool.query(
        'INSERT INTO contractors (email, password_hash, legal_name, business_name, phone, vetting_status, primary_trade, experience_years, documents) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [
          email,
          passwordHash,
          legal_name || full_name || null,
          business_name || null,
          phone || null,
          'APPLIED',
          null,
          null,
          null
        ]
      );
      return res.status(201).json({ user: mapUser(contractorResult.rows[0], 'contractor') });
    }

    const customerResult = await pool.query(
      'INSERT INTO customers (email, full_name, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, full_name || null, phone || null, passwordHash]
    );
    return res.status(201).json({ user: mapUser(customerResult.rows[0], 'customer') });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, role, full_name, phone, legal_name, business_name } = req.body || {};
    const found = await findUserById(id);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (req.user && req.user.role === 'super_admin' && String(req.user.id) === String(id) && role && normalizeRole(role) !== 'super_admin') {
      return res.status(400).json({ error: 'Cannot change your own super admin role' });
    }

    const updates = [];
    const values = [];
    const pushUpdate = (field, value) => {
      updates.push(`${field} = $${updates.length + 1}`);
      values.push(value);
    };

    if (email) pushUpdate('email', email);
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      pushUpdate('password_hash', hashed);
    }

    const requestedRole = role ? normalizeRole(role) : found.role;

    if (found.table === 'admins') {
      if (role) pushUpdate('role', requestedRole);
      if (full_name) pushUpdate('full_name', full_name);
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      values.push(id);
      const sql = `UPDATE admins SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING * -- superadmin_update`;
      const result = await pool.query(sql, values);
      return res.json({ user: mapUser(result.rows[0], requestedRole) });
    }

    if (found.table === 'customers') {
      if (role) pushUpdate('role', requestedRole);
      if (full_name) pushUpdate('full_name', full_name);
      if (phone) pushUpdate('phone', phone);
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      values.push(id);
      const sql = `UPDATE customers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING * -- superadmin_update`;
      const result = await pool.query(sql, values);
      return res.json({ user: mapUser(result.rows[0], requestedRole) });
    }

    if (found.table === 'contractors') {
      if (role) pushUpdate('role', requestedRole);
      if (legal_name || full_name) pushUpdate('legal_name', legal_name || full_name);
      if (business_name) pushUpdate('business_name', business_name);
      if (phone) pushUpdate('phone', phone);
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      values.push(id);
      const sql = `UPDATE contractors SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING * -- superadmin_update`;
      const result = await pool.query(sql, values);
      return res.json({ user: mapUser(result.rows[0], requestedRole) });
    }

    return res.status(400).json({ error: 'Unsupported user type' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findUserById(id);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (req.user && String(req.user.id) === String(id) && found.role === 'super_admin') {
      return res.status(400).json({ error: 'Cannot delete your own super admin account' });
    }

    await revokeSessionsByUser(id);

    if (found.table === 'customers') {
      db.jobs = db.jobs.filter(job => String(job.customer_id) !== String(id));
      db.payments = db.payments.filter(payment => String(payment.customer_id) !== String(id));
      const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [id]);
      return res.json({ deleted: true, user: mapUser(result.rows[0], found.role) });
    }

    if (found.table === 'contractors') {
      db.jobs.forEach(job => {
        if (String(job.contractor_id) === String(id)) {
          job.contractor_id = null;
          job.assignedContractorId = null;
          job.status = 'ready_to_assign';
        }
      });
      db.contractor_specialties = db.contractor_specialties.filter(cs => String(cs.contractor_id) !== String(id));
      const result = await pool.query('DELETE FROM contractors WHERE id = $1 RETURNING *', [id]);
      return res.json({ deleted: true, user: mapUser(result.rows[0], found.role) });
    }

    if (found.table === 'admins') {
      const result = await pool.query('DELETE FROM admins WHERE id = $1 RETURNING *', [id]);
      return res.json({ deleted: true, user: mapUser(result.rows[0], found.role) });
    }

    res.status(400).json({ error: 'Unsupported user type' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.post('/reset-password/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findUserById(id);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (req.user && String(req.user.id) === String(id) && found.role === 'super_admin') {
      return res.status(400).json({ error: 'Cannot reset your own password from this endpoint' });
    }

    const tempPassword = crypto.randomBytes(6).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    if (found.table === 'admins') {
      await pool.query(
        'UPDATE admins SET password_hash = $1 WHERE id = $2 RETURNING * -- superadmin_update',
        [passwordHash, id]
      );
    } else if (found.table === 'customers') {
      await pool.query(
        'UPDATE customers SET password_hash = $1 WHERE id = $2 RETURNING * -- superadmin_update',
        [passwordHash, id]
      );
    } else if (found.table === 'contractors') {
      await pool.query(
        'UPDATE contractors SET password_hash = $1 WHERE id = $2 RETURNING * -- superadmin_update',
        [passwordHash, id]
      );
    }

    await revokeSessionsByUser(id);

    res.json({ success: true, temporary_password: tempPassword });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('UPDATE sessions SET revoked_at = $1 WHERE id = $2 RETURNING *', [
      new Date().toISOString(),
      id
    ]);
    const session = result.rows[0];
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ success: true, session });
  } catch (error) {
    console.error('Terminate session error:', error);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

router.post('/sessions/cleanup', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL -- cleanup', []);
    res.json({ success: true, deleted: result.deleted || 0 });
  } catch (error) {
    console.error('Cleanup sessions error:', error);
    res.status(500).json({ error: 'Failed to cleanup sessions' });
  }
});

router.get('/audit-logs', async (req, res) => {
  try {
    const { action, user } = req.query;
    const result = await pool.query('SELECT * FROM audit_logs');
    let logs = result.rows || [];

    if (action) {
      logs = logs.filter(log => String(log.action) === String(action));
    }
    if (user) {
      const query = String(user).toLowerCase();
      logs = logs.filter(log =>
        String(log.user_id || '').toLowerCase().includes(query) ||
        String(log.user_email || '').toLowerCase().includes(query)
      );
    }

    res.json({ logs });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

router.get('/audit-logs/actions', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT action FROM audit_logs');
    const actions = (result.rows || []).map(row => row.action);
    res.json({ actions });
  } catch (error) {
    console.error('Audit actions error:', error);
    res.status(500).json({ error: 'Failed to load audit actions' });
  }
});

router.get('/customers', async (req, res) => {
  try {
    const customersResult = await pool.query('SELECT * FROM customers');
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const paymentsResult = await pool.query('SELECT * FROM payments');

    const customers = customersResult.rows || [];
    const jobs = jobsResult.rows || [];
    const payments = paymentsResult.rows || [];

    const payload = customers.map(customer => {
      const customerJobs = jobs.filter(job => String(job.customer_id) === String(customer.id));
      const customerPayments = payments.filter(payment => String(payment.customer_id) === String(customer.id));
      const revenueTotal = customerPayments
        .filter(payment => ['paid', 'completed', 'success'].includes(String(payment.status || '').toLowerCase()))
        .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

      return {
        ...customer,
        stats: {
          jobs_total: customerJobs.length,
          jobs_completed: customerJobs.filter(job => String(job.status || '').toLowerCase() === 'completed').length,
          payments_total: customerPayments.length,
          revenue_total: Math.round(revenueTotal * 100) / 100
        }
      };
    });

    res.json({ customers: payload });
  } catch (error) {
    console.error('Superadmin customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Team Applications endpoints
router.get('/team/applications', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM team_applications 
      ORDER BY submitted_at DESC
    `);
    
    const applications = (result.rows || []).map(app => ({
      ...app,
      resume: app.resume ? JSON.parse(app.resume) : null,
      location: app.location ? JSON.parse(app.location) : null,
      roles: app.roles ? JSON.parse(app.roles) : [],
      market_insights: app.market_insights ? JSON.parse(app.market_insights) : null,
      trades_in_demand: app.trades_in_demand ? JSON.parse(app.trades_in_demand) : [],
      contact: app.contact ? JSON.parse(app.contact) : null
    }));

    res.json({ applications });
  } catch (error) {
    console.error('Error fetching team applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

router.post('/team/applications', async (req, res) => {
  try {
    const {
      city_id,
      city_name,
      roles,
      contractor_trade,
      trades_in_demand,
      commitment_level,
      market_insights,
      location,
      contact,
      resume,
      why,
      submitted_at
    } = req.body;

    const result = await pool.query(`
      INSERT INTO team_applications (
        city_id, city_name, roles, contractor_trade, trades_in_demand,
        commitment_level, market_insights, location, contact, resume,
        why, submitted_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
      RETURNING *
    `, [
      city_id,
      city_name,
      JSON.stringify(roles || []),
      contractor_trade,
      JSON.stringify(trades_in_demand || []),
      commitment_level,
      JSON.stringify(market_insights || {}),
      JSON.stringify(location || {}),
      JSON.stringify(contact || {}),
      JSON.stringify(resume || null),
      why,
      submitted_at
    ]);

    res.status(201).json({ 
      success: true,
      application: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating team application:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

router.patch('/team/applications/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await pool.query(`
      UPDATE team_applications 
      SET status = 'approved', 
          reviewed_at = NOW(),
          reviewer_notes = $1
      WHERE id = $2
      RETURNING *
    `, [notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ 
      success: true,
      application: result.rows[0]
    });
  } catch (error) {
    console.error('Error approving application:', error);
    res.status(500).json({ error: 'Failed to approve application' });
  }
});

router.patch('/team/applications/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await pool.query(`
      UPDATE team_applications 
      SET status = 'rejected', 
          reviewed_at = NOW(),
          reviewer_notes = $1
      WHERE id = $2
      RETURNING *
    `, [notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    res.json({ 
      success: true,
      application: result.rows[0]
    });
  } catch (error) {
    console.error('Error rejecting application:', error);
    res.status(500).json({ error: 'Failed to reject application' });
  }
});

// Pause user account
router.post('/users/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findUserById(id);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (req.user && String(req.user.id) === String(id) && found.role === 'super_admin') {
      return res.status(400).json({ error: 'Cannot pause your own super admin account' });
    }

    const pausedAt = new Date().toISOString();

    if (found.table === 'customers') {
      const result = await pool.query(
        'UPDATE customers SET status = $1, paused_at = $2, updated_at = NOW() WHERE id = $3 RETURNING * -- superadmin_pause',
        ['paused', pausedAt, id]
      );
      await revokeSessionsByUser(id);
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Customer account paused'
      });
    }

    if (found.table === 'contractors') {
      const result = await pool.query(
        'UPDATE contractors SET status = $1, paused_at = $2, updated_at = NOW() WHERE id = $3 RETURNING * -- superadmin_pause',
        ['paused', pausedAt, id]
      );
      await revokeSessionsByUser(id);
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Contractor account paused'
      });
    }

    if (found.table === 'admins') {
      const result = await pool.query(
        'UPDATE admins SET status = $1, paused_at = $2, updated_at = NOW() WHERE id = $3 RETURNING * -- superadmin_pause',
        ['paused', pausedAt, id]
      );
      await revokeSessionsByUser(id);
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Admin account paused'
      });
    }

    res.status(400).json({ error: 'Unsupported user type' });
  } catch (error) {
    console.error('Pause user error:', error);
    res.status(500).json({ error: 'Failed to pause user account' });
  }
});

// Resume/Unpause user account
router.post('/users/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findUserById(id);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }

    const resumedAt = new Date().toISOString();

    if (found.table === 'customers') {
      const result = await pool.query(
        'UPDATE customers SET status = $1, paused_at = NULL, resumed_at = $2, updated_at = NOW() WHERE id = $3 RETURNING * -- superadmin_resume',
        ['active', resumedAt, id]
      );
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Customer account resumed'
      });
    }

    if (found.table === 'contractors') {
      const result = await pool.query(
        'UPDATE contractors SET status = $1, paused_at = NULL, resumed_at = $2, updated_at = NOW() WHERE id = $3 RETURNING * -- superadmin_resume',
        ['active', resumedAt, id]
      );
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Contractor account resumed'
      });
    }

    if (found.table === 'admins') {
      const result = await pool.query(
        'UPDATE admins SET status = $1, paused_at = NULL, resumed_at = $2, updated_at = NOW() WHERE id = $3 RETURNING * -- superadmin_resume',
        ['active', resumedAt, id]
      );
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Admin account resumed'
      });
    }

    res.status(400).json({ error: 'Unsupported user type' });
  } catch (error) {
    console.error('Resume user error:', error);
    res.status(500).json({ error: 'Failed to resume user account' });
  }
});

// Terminate user account (freezes for 30 days)
router.post('/users/:id/terminate', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const found = await findUserById(id);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (req.user && String(req.user.id) === String(id) && found.role === 'super_admin') {
      return res.status(400).json({ error: 'Cannot terminate your own super admin account' });
    }

    const terminatedAt = new Date().toISOString();

    if (found.table === 'customers') {
      const result = await pool.query(
        'UPDATE customers SET status = $1, terminated_at = $2, termination_reason = $3, updated_at = NOW() WHERE id = $4 RETURNING * -- superadmin_terminate',
        ['frozen', terminatedAt, reason || null, id]
      );
      await revokeSessionsByUser(id);
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Customer account terminated and frozen for 30 days. It can be reversed during this period.'
      });
    }

    if (found.table === 'contractors') {
      const result = await pool.query(
        'UPDATE contractors SET status = $1, terminated_at = $2, termination_reason = $3, updated_at = NOW() WHERE id = $4 RETURNING * -- superadmin_terminate',
        ['frozen', terminatedAt, reason || null, id]
      );
      await revokeSessionsByUser(id);
      db.jobs.forEach(job => {
        if (String(job.contractor_id) === String(id)) {
          job.contractor_id = null;
          job.assignedContractorId = null;
          job.status = 'ready_to_assign';
        }
      });
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Contractor account terminated and frozen for 30 days. It can be reversed during this period.'
      });
    }

    if (found.table === 'admins') {
      const result = await pool.query(
        'UPDATE admins SET status = $1, terminated_at = $2, termination_reason = $3, updated_at = NOW() WHERE id = $4 RETURNING * -- superadmin_terminate',
        ['frozen', terminatedAt, reason || null, id]
      );
      await revokeSessionsByUser(id);
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Admin account terminated and frozen for 30 days. It can be reversed during this period.'
      });
    }

    res.status(400).json({ error: 'Unsupported user type' });
  } catch (error) {
    console.error('Terminate user error:', error);
    res.status(500).json({ error: 'Failed to terminate user account' });
  }
});

// Unfreeze/Reverse termination
router.post('/users/:id/unfreeze', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findUserById(id);
    if (!found) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (found.status !== 'frozen') {
      return res.status(400).json({ error: 'Account is not frozen' });
    }

    const now = new Date();
    const frozenAt = new Date(found.user.terminated_at);
    const freezeEndDate = new Date(frozenAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    if (now >= freezeEndDate) {
      return res.status(400).json({ error: 'Freeze period has expired. Account has been permanently deleted.' });
    }

    const unfrozenAt = new Date().toISOString();

    if (found.table === 'customers') {
      const result = await pool.query(
        'UPDATE customers SET status = $1, terminated_at = NULL, termination_reason = NULL, updated_at = NOW() WHERE id = $2 RETURNING * -- superadmin_unfreeze',
        ['active', id]
      );
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Customer account has been unfrozen and restored'
      });
    }

    if (found.table === 'contractors') {
      const result = await pool.query(
        'UPDATE contractors SET status = $1, terminated_at = NULL, termination_reason = NULL, updated_at = NOW() WHERE id = $2 RETURNING * -- superadmin_unfreeze',
        ['active', id]
      );
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Contractor account has been unfrozen and restored'
      });
    }

    if (found.table === 'admins') {
      const result = await pool.query(
        'UPDATE admins SET status = $1, terminated_at = NULL, termination_reason = NULL, updated_at = NOW() WHERE id = $2 RETURNING * -- superadmin_unfreeze',
        ['active', id]
      );
      return res.json({ 
        success: true, 
        user: mapUser(result.rows[0], found.role),
        message: 'Admin account has been unfrozen and restored'
      });
    }

    res.status(400).json({ error: 'Unsupported user type' });
  } catch (error) {
    console.error('Unfreeze user error:', error);
    res.status(500).json({ error: 'Failed to unfreeze user account' });
  }
});

// Update contractor tier level
router.patch('/contractors/:id/tier', async (req, res) => {
  try {
    const { id } = req.params;
    const { tier } = req.body;

    // Validate tier
    const validTiers = ['bronze', 'silver', 'gold', 'platinum', 'elite'];
    if (!tier || !validTiers.includes(tier.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid tier. Must be one of: ' + validTiers.join(', ') 
      });
    }

    const found = await findUserById(id);
    if (!found || found.table !== 'contractors') {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    const result = await pool.query(
      'UPDATE contractors SET tier = $1, updated_at = NOW() WHERE id = $2 RETURNING * -- superadmin_tier_update',
      [tier.toLowerCase(), id]
    );

    res.json({ 
      success: true, 
      contractor: {
        ...mapUser(result.rows[0], 'contractor'),
        tier: tier.toLowerCase()
      },
      message: `Contractor tier updated to ${tier}`
    });
  } catch (error) {
    console.error('Update contractor tier error:', error);
    res.status(500).json({ error: 'Failed to update contractor tier' });
  }
});

module.exports = router;
