const express = require('express');
const crypto = require('crypto');
const { pool } = require('../mock-db');

const router = express.Router();

function normalizeStatus(value, fallback = 'pending') {
  if (!value) return fallback;
  return String(value).toLowerCase();
}

function isPaidStatus(status) {
  return ['paid', 'completed', 'success'].includes(status);
}

function sumPayments(payments, statuses) {
  const allowed = new Set(statuses.map(s => s.toLowerCase()));
  return payments
    .filter(payment => allowed.has(String(payment.status || '').toLowerCase()))
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
}

function buildJobStatusCounts(jobs) {
  const statusCounts = {
    total: jobs.length,
    pending: 0,
    active: 0,
    completed: 0,
    cancelled: 0
  };
  jobs.forEach(job => {
    const status = String(job.status || '').toLowerCase();
    if (['completed'].includes(status)) statusCounts.completed += 1;
    else if (['cancelled', 'canceled'].includes(status)) statusCounts.cancelled += 1;
    else if (['assigned', 'en_route', 'on_site', 'in_progress'].includes(status)) statusCounts.active += 1;
    else statusCounts.pending += 1;
  });
  return statusCounts;
}

router.get('/stats', async (req, res) => {
  try {
    const customersResult = await pool.query('SELECT * FROM customers');
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const paymentsResult = await pool.query('SELECT * FROM payments');

    const customers = customersResult.rows || [];
    const jobs = jobsResult.rows || [];
    const payments = paymentsResult.rows || [];

    const jobCounts = buildJobStatusCounts(jobs);
    const paymentCounts = {
      total: payments.length,
      pending: payments.filter(p => normalizeStatus(p.status) === 'pending').length,
      completed: payments.filter(p => isPaidStatus(normalizeStatus(p.status))).length,
      failed: payments.filter(p => normalizeStatus(p.status) === 'failed').length
    };

    const revenueTotal = sumPayments(payments, ['paid', 'completed', 'success']);

    res.json({
      stats: {
        customers: customers.length,
        jobs: jobCounts,
        payments: paymentCounts,
        revenue: {
          total: Math.round(revenueTotal * 100) / 100
        }
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to load admin stats' });
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
      const completedPaymentsTotal = sumPayments(customerPayments, ['paid', 'completed', 'success']);
      const activeJobs = customerJobs.filter(job =>
        ['assigned', 'en_route', 'on_site', 'in_progress'].includes(String(job.status || '').toLowerCase())
      );
      const completedJobs = customerJobs.filter(job => String(job.status || '').toLowerCase() === 'completed');

      return {
        ...customer,
        stats: {
          jobs_total: customerJobs.length,
          jobs_active: activeJobs.length,
          jobs_completed: completedJobs.length,
          payments_total: customerPayments.length,
          payments_completed: customerPayments.filter(payment => isPaidStatus(normalizeStatus(payment.status))).length,
          revenue_total: Math.round(completedPaymentsTotal * 100) / 100
        }
      };
    });

    res.json({ customers: payload });
  } catch (error) {
    console.error('Admin customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.get('/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const customersResult = await pool.query('SELECT * FROM customers');
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const paymentsResult = await pool.query('SELECT * FROM payments');

    const customers = customersResult.rows || [];
    const jobs = jobsResult.rows || [];
    const payments = paymentsResult.rows || [];

    const customer = customers.find(row => String(row.id) === String(id));
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customerJobs = jobs.filter(job => String(job.customer_id) === String(id));
    const customerPayments = payments.filter(payment => String(payment.customer_id) === String(id));
    const completedPaymentsTotal = sumPayments(customerPayments, ['paid', 'completed', 'success']);

    res.json({
      customer,
      jobs: customerJobs,
      payments: customerPayments,
      stats: {
        jobs_total: customerJobs.length,
        jobs_completed: customerJobs.filter(job => String(job.status || '').toLowerCase() === 'completed').length,
        payments_total: customerPayments.length,
        payments_completed: customerPayments.filter(payment => isPaidStatus(normalizeStatus(payment.status))).length,
        revenue_total: Math.round(completedPaymentsTotal * 100) / 100
      }
    });
  } catch (error) {
    console.error('Admin customer detail error:', error);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM jobs');
    res.json({ jobs: result.rows || [] });
  } catch (error) {
    console.error('Admin jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.patch('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'status',
      'urgency',
      'time_window',
      'description',
      'service_category_id',
      'service_type_id',
      'contractor_id',
      'assignedContractorId',
      'payment_status',
      'payout_status',
      'address_id',
      'customer_id'
    ];

    const updates = Object.entries(req.body || {})
      .filter(([key, value]) => allowedFields.includes(key) && value !== undefined);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClauses = updates.map(([key], index) => `${key} = $${index + 1}`);
    const values = updates.map(([, value]) => value);
    values.push(id);

    const sql = `UPDATE jobs SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING * -- admin_update`;
    const result = await pool.query(sql, values);
    const job = result.rows[0];

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job });
  } catch (error) {
    console.error('Admin job update error:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payments');
    res.json({ payments: result.rows || [] });
  } catch (error) {
    console.error('Admin payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const {
      customer_id,
      job_id,
      amount,
      currency,
      status,
      payment_method,
      transaction_id,
      notes
    } = req.body || {};

    if (!customer_id || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'customer_id and amount are required' });
    }

    const normalizedStatus = normalizeStatus(status, 'pending');
    const paidAt = isPaidStatus(normalizedStatus) ? new Date().toISOString() : null;
    const paymentId = crypto.randomUUID();

    const result = await pool.query(
      'INSERT INTO payments (id, customer_id, job_id, amount, currency, status, payment_method, transaction_id, notes, paid_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
      [
        paymentId,
        customer_id,
        job_id || null,
        Number(amount),
        currency || 'USD',
        normalizedStatus,
        payment_method || null,
        transaction_id || null,
        notes || null,
        paidAt
      ]
    );

    res.status(201).json({ payment: result.rows[0] });
  } catch (error) {
    console.error('Admin payment create error:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

router.patch('/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'customer_id',
      'job_id',
      'amount',
      'currency',
      'status',
      'payment_method',
      'transaction_id',
      'notes'
    ];

    const updates = Object.entries(req.body || {})
      .filter(([key, value]) => allowedFields.includes(key) && value !== undefined);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const statusEntry = updates.find(([key]) => key === 'status');
    if (statusEntry) {
      const normalizedStatus = normalizeStatus(statusEntry[1], 'pending');
      statusEntry[1] = normalizedStatus;
      if (isPaidStatus(normalizedStatus)) {
        updates.push(['paid_at', new Date().toISOString()]);
      }
    }

    const setClauses = updates.map(([key], index) => `${key} = $${index + 1}`);
    const values = updates.map(([, value]) => value);
    values.push(id);

    const sql = `UPDATE payments SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING * -- admin_payment_update`;
    const result = await pool.query(sql, values);
    const payment = result.rows[0];

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ payment });
  } catch (error) {
    console.error('Admin payment update error:', error);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM payments WHERE id = $1 RETURNING *', [id]);
    const payment = result.rows[0];
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json({ success: true, payment });
  } catch (error) {
    console.error('Admin payment delete error:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

// ============================================================================
// REVENUE & PAYOUTS ENDPOINTS
// ============================================================================

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(parsed) ? null : parsed;
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

const CONTRACTOR_TIERS = {
  bronze: { platformFee: 0.20 },
  silver: { platformFee: 0.15 },
  gold: { platformFee: 0.10 }
};

function getTierRate(tierKey) {
  const key = String(tierKey || 'bronze').toLowerCase();
  return (CONTRACTOR_TIERS[key] || CONTRACTOR_TIERS.bronze).platformFee;
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
      platform_fee: null,
      contractor_payout: null,
      net_platform_revenue: null
    };
  }

  const materialFees = toNumber(job.material_fees)
    ?? toNumber(completionPayment.materials_cost)
    ?? toNumber(completionReport.material_costs)
    ?? 0;
  const netAmount = Math.max(0, finalPrice - materialFees);
  const tierRate = getTierRate(job.contractor_tier || job.contractorTier);
  const platformFee = netAmount * tierRate;
  const contractorPayout = netAmount - platformFee;
  const netPlatformRevenue = platformFee;

  return {
    final_price: Math.round(finalPrice * 100) / 100,
    material_fees: Math.round(materialFees * 100) / 100,
    platform_fee: Math.round(platformFee * 100) / 100,
    contractor_payout: Math.round(contractorPayout * 100) / 100,
    net_platform_revenue: Math.round(netPlatformRevenue * 100) / 100
  };
}

// Admin - Revenue MTD summary
router.get('/revenue/mtd', async (req, res) => {
  try {
    const { month } = req.query;
    const { start, end } = getMonthRange(month);
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const contractorsResult = await pool.query('SELECT * FROM contractors');
    const jobs = attachContractorTier(jobsResult.rows || [], contractorsResult.rows || []);
    const completedJobs = jobs.filter(job => {
      if (job.status !== 'completed') return false;
      const completedAt = new Date(job.completed_at || job.updated_at || job.created_at);
      return completedAt >= start && completedAt <= end;
    });

    let gross = 0;
    let platformFees = 0;
    let contractorPayouts = 0;
    completedJobs.forEach(job => {
      const financials = computeFinancials(job);
      if (financials.final_price != null) {
        gross += financials.final_price;
        platformFees += financials.platform_fee || 0;
        contractorPayouts += financials.contractor_payout || 0;
      }
    });

    res.json({
      month: month || `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      gross_revenue: Math.round(gross * 100) / 100,
      platform_fees: Math.round(platformFees * 100) / 100,
      contractor_payouts: Math.round(contractorPayouts * 100) / 100,
      net_platform_revenue: Math.round(platformFees * 100) / 100,
      completed_jobs: completedJobs.length
    });
  } catch (error) {
    console.error('Revenue MTD error:', error);
    res.status(500).json({ error: 'Failed to fetch MTD revenue' });
  }
});

// Admin - Revenue jobs list
router.get('/revenue/jobs', async (req, res) => {
  try {
    const { month } = req.query;
    const { start, end } = getMonthRange(month);
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const contractorsResult = await pool.query('SELECT * FROM contractors');
    const jobs = attachContractorTier(jobsResult.rows || [], contractorsResult.rows || []);
    const completedJobs = jobs.filter(job => {
      if (job.status !== 'completed') return false;
      const completedAt = new Date(job.completed_at || job.updated_at || job.created_at);
      return completedAt >= start && completedAt <= end;
    });

    const payload = completedJobs.map(job => {
      const financials = computeFinancials(job);
      return {
        job_id: job.id,
        city: job.city || '—',
        category: job.category_name || job.category || '—',
        final_price: financials.final_price,
        material_fees: financials.material_fees ?? job.material_fees ?? 0,
        completed_at: job.completed_at || job.updated_at || job.created_at,
        payment_status: job.payment_status || (job.status === 'completed' ? 'paid' : 'unpaid'),
        payout_status: job.payout_status || 'not_ready',
        contractor_id: job.contractor_id || null,
        contractor_name: job.contractor_name || null,
        contractor_tier: job.contractor_tier || job.contractorTier || 'bronze',
        platform_fee: financials.platform_fee,
        contractor_payout: financials.contractor_payout
      };
    });

    res.json(payload);
  } catch (error) {
    console.error('Revenue jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue jobs' });
  }
});

// Admin - Payouts pending
router.get('/payouts/pending', async (req, res) => {
  try {
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const contractorsResult = await pool.query('SELECT * FROM contractors');
    const jobs = attachContractorTier(jobsResult.rows || [], contractorsResult.rows || []);
    const readyJobs = jobs.filter(job => job.status === 'completed' && ['ready', 'processing'].includes(job.payout_status || 'not_ready'));
    const items = readyJobs.map(job => {
      const financials = computeFinancials(job);
      return {
        job_id: job.id,
        contractor: job.contractor_name || 'Unassigned',
        city: job.city || '—',
        category: job.category_name || job.category || '—',
        final_price: financials.final_price,
        material_fees: financials.material_fees ?? job.material_fees ?? 0,
        contractor_payout: financials.contractor_payout,
        completed_at: job.completed_at || job.updated_at || job.created_at,
        payment_status: job.payment_status || 'paid',
        payout_status: job.payout_status || 'not_ready',
        contractor_tier: job.contractor_tier || job.contractorTier || 'bronze'
      };
    });

    res.json({ payouts: items, count: items.length });
  } catch (error) {
    console.error('Payouts pending error:', error);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

// Admin - Payouts history
router.get('/payouts/history', async (req, res) => {
  try {
    const jobsResult = await pool.query('SELECT * FROM jobs');
    const contractorsResult = await pool.query('SELECT * FROM contractors');
    const jobs = attachContractorTier(jobsResult.rows || [], contractorsResult.rows || []);
    const completedJobs = jobs.filter(job => job.status === 'completed');
    const items = completedJobs.map(job => {
      const financials = computeFinancials(job);
      return {
        job_id: job.id,
        contractor: job.contractor_name || 'Unassigned',
        city: job.city || '—',
        category: job.category_name || job.category || '—',
        final_price: financials.final_price,
        material_fees: financials.material_fees ?? job.material_fees ?? 0,
        contractor_payout: financials.contractor_payout,
        completed_at: job.completed_at || job.updated_at || job.created_at,
        payment_status: job.payment_status || 'paid',
        payout_status: job.payout_status || 'not_ready',
        contractor_tier: job.contractor_tier || job.contractorTier || 'bronze'
      };
    });

    res.json({ payouts: items, count: items.length });
  } catch (error) {
    console.error('Payouts history error:', error);
    res.status(500).json({ error: 'Failed to fetch payouts history' });
  }
});

module.exports = router;
