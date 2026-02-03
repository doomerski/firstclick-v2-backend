const API_BASE = 'http://localhost:3000/api';

// Stripe payment processing fees (2.9% + $0.30 CAD per transaction)
const STRIPE_FEES = {
  percentage: 0.029,
  fixedFee: 0.30,
  description: '2.9% + $0.30 CAD'
};

const CONTRACTOR_TIERS = {
  bronze: { platformFee: 0.20, color: '#cd7f32', label: 'Bronze' },
  silver: { platformFee: 0.15, color: '#c0c0c0', label: 'Silver' },
  gold: { platformFee: 0.10, color: '#ffd700', label: 'Gold' }
};

const state = {
  payouts: [],
  revenueJobs: [],
  paymentHistory: [],
  filteredRevenue: [],
  payoutSort: { key: 'completed_at', dir: 'desc' },
  revenueSort: { key: 'completed_at', dir: 'desc' },
  selectedJobIds: new Set()
};

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString();
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function getCurrentMonthLabel(date = new Date()) {
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function monthParam(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function clampMoney(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function getJobFinancials(job) {
  const finalPrice = clampMoney(job.final_price);
  const materialFees = clampMoney(job.material_fees);
  const tierKey = (job.contractor_tier || 'bronze').toLowerCase();
  const tier = CONTRACTOR_TIERS[tierKey] || CONTRACTOR_TIERS.bronze;

  const hasBackend = (
    job.contractor_payout != null &&
    job.platform_fee != null
  );

  // Calculate Stripe processing fees (2.9% + $0.30 per transaction)
  const stripeFee = (finalPrice * STRIPE_FEES.percentage) + STRIPE_FEES.fixedFee;

  if (hasBackend) {
    const netAmount = Math.max(0, finalPrice - materialFees);
    return {
      finalPrice,
      materialFees,
      stripeFee: clampMoney(job.stripe_fee || stripeFee),
      netAmount,
      platformFee: clampMoney(job.platform_fee),
      contractorPayout: clampMoney(job.contractor_payout),
      contractorTier: tierKey
    };
  }

  const netAmount = Math.max(0, finalPrice - materialFees);
  const platformFee = netAmount * tier.platformFee;
  // Contractor payout = net amount - stripe fees - platform fee
  const contractorPayout = Math.max(0, netAmount - stripeFee - platformFee);

  return {
    finalPrice,
    materialFees,
    stripeFee,
    netAmount,
    platformFee,
    contractorPayout,
    contractorTier: tierKey
  };
}

async function fetchJson(path) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  });
  if (!response.ok) {
    throw new Error('Request failed');
  }
  return response.json();
}

async function fetchMTDData(month) {
  return fetchJson(`/admin/revenue/mtd?month=${month}`);
}

async function fetchPayoutsPending() {
  return fetchJson('/admin/payouts/pending');
}

async function fetchPayoutsHistory() {
  return fetchJson('/admin/payouts/history');
}

async function fetchRevenueJobs(month) {
  return fetchJson(`/admin/revenue/jobs?month=${month}`);
}

function renderKPIs(data) {
  const grid = document.getElementById('kpi-grid');
  const badge = document.getElementById('mtd-badge');
  if (!grid) return;

  const jobs = state.revenueJobs || [];
  let grossRevenue = 0;
  let materialFees = 0;
  let stripeFees = 0;
  let platformFees = 0;
  let contractorPayouts = 0;
  let netPlatformRevenue = 0;

  const tierBreakdown = {
    bronze: 0,
    silver: 0,
    gold: 0
  };

  jobs.forEach((job) => {
    const f = getJobFinancials(job);
    grossRevenue += f.finalPrice;
    materialFees += f.materialFees;
    stripeFees += f.stripeFee;
    platformFees += f.platformFee;
    contractorPayouts += f.contractorPayout;
    // Net platform revenue after paying Stripe
    netPlatformRevenue += f.platformFee;
    if (tierBreakdown[f.contractorTier] !== undefined) {
      tierBreakdown[f.contractorTier] += 1;
    }
  });

  const completedJobs = jobs.length;
  const avgJobValue = completedJobs ? grossRevenue / completedJobs : 0;

  badge.textContent = `${completedJobs} JOBS`;

  const kpis = [
    { label: 'Gross Revenue', value: formatCurrency(grossRevenue) },
    { label: 'Material Fees', value: formatCurrency(materialFees) },
    { label: 'Stripe Fees', value: formatCurrency(stripeFees), subtitle: STRIPE_FEES.description },
    { label: 'Platform Fees', value: formatCurrency(platformFees) },
    { label: 'Contractor Payouts', value: formatCurrency(contractorPayouts) },
    { label: 'Net Platform Revenue', value: formatCurrency(netPlatformRevenue) },
    { label: 'Completed Jobs', value: formatNumber(completedJobs) },
    { label: 'Avg Job Value', value: formatCurrency(avgJobValue) }
  ];

  grid.innerHTML = kpis.map((kpi) => `
    <div class="kpi-card">
      <div class="kpi-label">${kpi.label}</div>
      <div class="kpi-value">${kpi.value}</div>
      ${kpi.subtitle ? `<div class="kpi-subtitle">${kpi.subtitle}</div>` : ''}
    </div>
  `).join('');
}

function renderPayoutsMetrics(data) {
  const metrics = document.getElementById('payouts-metrics');
  const badge = document.getElementById('payouts-badge');
  if (!metrics) return;
  const items = normalizeItems(data);
  const fallbackMetrics = computePayoutMetrics(items, data);
  badge.textContent = `${fallbackMetrics.jobs_ready} READY`;

  metrics.innerHTML = `
    <div class="payout-metric">
      <div class="metric-label">Total Pending</div>
      <div class="metric-value">${formatCurrency(fallbackMetrics.total_pending)}</div>
    </div>
    <div class="payout-metric">
      <div class="metric-label">Jobs Ready</div>
      <div class="metric-value">${formatNumber(fallbackMetrics.jobs_ready)}</div>
    </div>
    <div class="payout-metric">
      <div class="metric-label">Contractors Awaiting</div>
      <div class="metric-value">${formatNumber(fallbackMetrics.contractors_count)}</div>
    </div>
  `;
}

function normalizeStatus(status) {
  return String(status || '').toLowerCase().replaceAll('_', '-');
}

function renderPaymentHistory() {
  const table = document.getElementById('payments-history-table');
  const metrics = document.getElementById('payments-history-metrics');
  const badge = document.getElementById('payments-history-badge');
  const cards = document.getElementById('payments-history-cards');
  if (!table || !metrics || !badge) return;

  const items = [...state.paymentHistory].sort((a, b) => {
    const aDate = new Date(a.completed_at || a.updated_at || a.created_at || 0);
    const bDate = new Date(b.completed_at || b.updated_at || b.created_at || 0);
    return bDate - aDate;
  });

  const totalPaid = items.reduce((sum, item) => {
    const f = getJobFinancials(item);
    return sum + (f.contractorPayout || 0);
  }, 0);

  const lastPaidAt = items.length
    ? formatDate(items[0].completed_at || items[0].updated_at || items[0].created_at)
    : '—';

  badge.textContent = `${items.length} PAID`;

  metrics.innerHTML = `
    <div class="payout-metric">
      <div class="metric-label">Total Paid Out</div>
      <div class="metric-value">${formatCurrency(totalPaid)}</div>
    </div>
    <div class="payout-metric">
      <div class="metric-label">Payments Count</div>
      <div class="metric-value">${formatNumber(items.length)}</div>
    </div>
    <div class="payout-metric">
      <div class="metric-label">Last Paid</div>
      <div class="metric-value">${lastPaidAt}</div>
    </div>
  `;

  if (items.length === 0) {
    table.innerHTML = '<tr><td colspan="10" class="loading">No completed payouts yet.</td></tr>';
    if (cards) {
      cards.innerHTML = '<div class="loading">No completed payouts yet.</div>';
    }
    return;
  }

  table.innerHTML = items.map(item => {
    const f = getJobFinancials(item);
    return `
      <tr>
        <td>#${String(item.job_id).substring(0, 8)}</td>
        <td>${item.contractor || item.contractor_name || '—'}</td>
        <td>${tierBadge(f.contractorTier)}</td>
        <td>${item.city || '—'} / ${item.category || '—'}</td>
        <td>${formatCurrency(f.finalPrice)}</td>
        <td>${formatCurrency(f.materialFees)}</td>
        <td>${formatCurrency(f.platformFee)}</td>
        <td>${formatCurrency(f.contractorPayout)}</td>
        <td>${formatDate(item.completed_at)}</td>
        <td>${statusBadge(item.payout_status || 'paid')}</td>
      </tr>
    `;
  }).join('');

  if (cards) {
    cards.innerHTML = items.map(item => {
      const f = getJobFinancials(item);
      return `
        <div class="data-card">
          <div class="card-row">
            <div>
              <div class="card-title">Job #${String(item.job_id).substring(0, 8)} • ${item.city || '—'}</div>
              <div class="card-meta">${item.category || '—'} • ${formatDate(item.completed_at)}</div>
            </div>
            <div>${statusBadge(item.payout_status || 'paid')}</div>
          </div>
          <div class="card-meta">${item.contractor || item.contractor_name || '—'} • ${tierBadge(f.contractorTier)}</div>
          <div class="card-kv">
            <div><span>Final</span><b>${formatCurrency(f.finalPrice)}</b></div>
            <div><span>Materials</span><b>${formatCurrency(f.materialFees)}</b></div>
            <div><span>Platform Fee</span><b>${formatCurrency(f.platformFee)}</b></div>
            <div><span>Payout</span><b>${formatCurrency(f.contractorPayout)}</b></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function normalizeItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload) return [];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.payouts)) return payload.payouts;
  return [];
}

function computePayoutMetrics(items, payload = {}) {
  const totalPending = Number(payload.total_pending);
  const jobsReady = Number(payload.jobs_ready);
  const contractorsCount = Number(payload.contractors_count);
  const hasBackendMetrics = Number.isFinite(totalPending)
    && Number.isFinite(jobsReady)
    && Number.isFinite(contractorsCount);

  if (hasBackendMetrics) {
    return {
      total_pending: totalPending,
      jobs_ready: jobsReady,
      contractors_count: contractorsCount
    };
  }

  const total_pending = items.reduce((sum, item) => {
    const f = getJobFinancials(item);
    return sum + (f.contractorPayout || 0);
  }, 0);
  const contractors = new Set(
    items.map(item => String(item.contractor_id || item.contractor || item.contractor_name || ''))
      .filter(Boolean)
  );

  return {
    total_pending,
    jobs_ready: items.length,
    contractors_count: contractors.size
  };
}

function statusBadge(status) {
  if (!status) return '';
  const normalized = String(status).replaceAll('_', '-');
  return `<span class="status-badge status-${normalized}">${status.replace('_', ' ')}</span>`;
}

function tierBadge(tierKey) {
  const key = (tierKey || 'bronze').toLowerCase();
  const tier = CONTRACTOR_TIERS[key] || CONTRACTOR_TIERS.bronze;
  return `<span class="tier-badge tier-${key}" style="background:${tier.color}20;color:${tier.color};border:1px solid ${tier.color};">${tier.label}</span>`;
}

function getPayoutSortValue(item, key) {
  const f = getJobFinancials(item);
  switch (key) {
    case 'final_price':
      return f.finalPrice;
    case 'material_fees':
      return f.materialFees;
    case 'stripe_fee':
      return f.stripeFee;
    case 'platform_fee':
      return f.platformFee;
    case 'contractor_payout':
      return f.contractorPayout;
    case 'contractor_tier':
      return f.contractorTier;
    default:
      return item[key] ?? '';
  }
}

function getRevenueSortValue(item, key) {
  const f = getJobFinancials(item);
  switch (key) {
    case 'final_price':
      return f.finalPrice;
    case 'material_fees':
      return f.materialFees;
    case 'stripe_fee':
      return f.stripeFee;
    case 'platform_fee':
      return f.platformFee;
    case 'contractor_payout':
      return f.contractorPayout;
    case 'contractor_tier':
      return f.contractorTier;
    default:
      return item[key] ?? '';
  }
}

function renderPayoutsTable() {
  const table = document.getElementById('payouts-table');
  const cards = document.getElementById('payouts-cards');
  if (!table) return;
  const items = [...state.payouts];

  items.sort((a, b) => {
    const key = state.payoutSort.key;
    const dir = state.payoutSort.dir === 'asc' ? 1 : -1;
    const aValue = getPayoutSortValue(a, key);
    const bValue = getPayoutSortValue(b, key);
    return aValue > bValue ? dir : aValue < bValue ? -dir : 0;
  });

  if (items.length === 0) {
    table.innerHTML = '<tr><td colspan="13" class="loading">No payouts pending.</td></tr>';
    if (cards) {
      cards.innerHTML = '<div class="loading">No payouts pending.</div>';
    }
    return;
  }

  table.innerHTML = items.map((item) => {
    const f = getJobFinancials(item);
    const selected = state.selectedJobIds.has(String(item.job_id));
    const canMarkReady = item.payment_status === 'paid' && item.payout_status === 'not_ready';
    return `
      <tr>
        <td class="checkbox-cell">
          <input type="checkbox" ${selected ? 'checked' : ''} onchange="toggleSelection('${item.job_id}')">
        </td>
        <td>#${String(item.job_id).substring(0, 8)}</td>
        <td>${item.contractor || '—'}</td>
        <td>${tierBadge(f.contractorTier)}</td>
        <td>${item.city || '—'} / ${item.category || '—'}</td>
        <td>${formatCurrency(f.finalPrice)}</td>
        <td>${formatCurrency(f.materialFees)}</td>
        <td>${formatCurrency(f.stripeFee)}</td>
        <td>${formatCurrency(f.platformFee)}</td>
        <td>${formatCurrency(f.contractorPayout)}</td>
        <td>${formatDate(item.completed_at)}</td>
        <td>${statusBadge(item.payment_status)}</td>
        <td>${statusBadge(item.payout_status)}</td>
        <td>
          ${canMarkReady ? `<button class="btn btn-secondary btn-sm" onclick="markReady('${item.job_id}')">Mark Ready</button>` : '—'}
        </td>
      </tr>
    `;
  }).join('');

  if (cards) {
    cards.innerHTML = items.map((item) => {
      const f = getJobFinancials(item);
      const selected = state.selectedJobIds.has(String(item.job_id));
      const canMarkReady = item.payment_status === 'paid' && item.payout_status === 'not_ready';
      return `
        <div class="data-card">
          <div class="card-row">
            <div>
              <div class="card-title">Job #${String(item.job_id).substring(0, 8)} • ${item.city || '—'}</div>
              <div class="card-meta">${item.category || '—'} • ${formatDate(item.completed_at)}</div>
            </div>
            <div class="card-actions">
              <label>
                <input type="checkbox" ${selected ? 'checked' : ''} onchange="toggleSelection('${item.job_id}')">
                Select
              </label>
            </div>
          </div>
          <div class="card-meta">${item.contractor || '—'} • ${tierBadge(f.contractorTier)}</div>
          <div class="card-kv">
            <div><span>Final</span><b>${formatCurrency(f.finalPrice)}</b></div>
            <div><span>Materials</span><b>${formatCurrency(f.materialFees)}</b></div>
            <div><span>Stripe Fee</span><b>${formatCurrency(f.stripeFee)}</b></div>
            <div><span>Platform Fee</span><b>${formatCurrency(f.platformFee)}</b></div>
            <div><span>Payout</span><b>${formatCurrency(f.contractorPayout)}</b></div>
          </div>
          <div class="card-footer">
            ${statusBadge(item.payment_status)}
            ${statusBadge(item.payout_status)}
            ${canMarkReady ? `<button class="btn btn-secondary btn-sm" onclick="markReady('${item.job_id}')">Mark Ready</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }
}

function updateBatchActions() {
  const batch = document.getElementById('batch-actions');
  const count = document.getElementById('selected-count');
  if (!batch || !count) return;
  const selected = state.selectedJobIds.size;
  count.textContent = selected;
  batch.style.display = selected > 0 ? 'flex' : 'none';
}

function toggleSelection(jobId) {
  if (state.selectedJobIds.has(jobId)) {
    state.selectedJobIds.delete(jobId);
  } else {
    state.selectedJobIds.add(jobId);
  }
  updateBatchActions();
}

function toggleSelectAll() {
  const selectAll = document.getElementById('select-all');
  if (!selectAll) return;
  if (selectAll.checked) {
    state.payouts.forEach((item) => state.selectedJobIds.add(String(item.job_id)));
  } else {
    state.selectedJobIds.clear();
  }
  renderPayoutsTable();
  updateBatchActions();
}

function clearSelection() {
  state.selectedJobIds.clear();
  const selectAll = document.getElementById('select-all');
  if (selectAll) selectAll.checked = false;
  renderPayoutsTable();
  updateBatchActions();
}

async function markReady(jobId) {
  await fetch(`${API_BASE}/jobs/${jobId}/payout-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payout_status: 'ready' })
  });
  await loadAll();
}

async function batchProcessPayouts() {
  const jobIds = Array.from(state.selectedJobIds);
  if (jobIds.length === 0) return;
  await fetch(`${API_BASE}/admin/payouts/batch-process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_ids: jobIds })
  });
  clearSelection();
  await loadAll();
}

function renderRevenueTable() {
  const table = document.getElementById('revenue-table');
  const cards = document.getElementById('revenue-cards');
  if (!table) return;
  const rows = [...state.filteredRevenue];
  rows.sort((a, b) => {
    const key = state.revenueSort.key;
    const dir = state.revenueSort.dir === 'asc' ? 1 : -1;
    const aValue = getRevenueSortValue(a, key);
    const bValue = getRevenueSortValue(b, key);
    return aValue > bValue ? dir : aValue < bValue ? -dir : 0;
  });

  if (rows.length === 0) {
    table.innerHTML = '<tr><td colspan="11" class="loading">No jobs match the filters.</td></tr>';
    if (cards) {
      cards.innerHTML = '<div class="loading">No jobs match the filters.</div>';
    }
    return;
  }

  table.innerHTML = rows.map((job) => {
    const f = getJobFinancials(job);
    return `
      <tr>
        <td>#${String(job.job_id).substring(0, 8)}</td>
        <td>${tierBadge(f.contractorTier)}</td>
        <td>${job.city || '—'}</td>
        <td>${job.category || '—'}</td>
        <td>${formatCurrency(f.finalPrice)}</td>
        <td>${formatCurrency(f.materialFees)}</td>
        <td>${formatCurrency(f.stripeFee)}</td>
        <td>${formatCurrency(f.platformFee)}</td>
        <td>${formatCurrency(f.contractorPayout)}</td>
        <td>${statusBadge(job.payment_status)}</td>
        <td>${statusBadge(job.payout_status)}</td>
        <td>${formatDate(job.completed_at)}</td>
      </tr>
    `;
  }).join('');

  if (cards) {
    cards.innerHTML = rows.map((job) => {
      const f = getJobFinancials(job);
      return `
        <div class="data-card">
          <div class="card-row">
            <div>
              <div class="card-title">Job #${String(job.job_id).substring(0, 8)} • ${job.city || '—'}</div>
              <div class="card-meta">${job.category || '—'} • ${formatDate(job.completed_at)}</div>
            </div>
            <div>${tierBadge(f.contractorTier)}</div>
          </div>
          <div class="card-kv">
            <div><span>Final</span><b>${formatCurrency(f.finalPrice)}</b></div>
            <div><span>Materials</span><b>${formatCurrency(f.materialFees)}</b></div>
            <div><span>Stripe Fee</span><b>${formatCurrency(f.stripeFee)}</b></div>
            <div><span>Platform Fee</span><b>${formatCurrency(f.platformFee)}</b></div>
            <div><span>Payout</span><b>${formatCurrency(f.contractorPayout)}</b></div>
          </div>
          <div class="card-footer">
            ${statusBadge(job.payment_status)}
            ${statusBadge(job.payout_status)}
          </div>
        </div>
      `;
    }).join('');
  }
}

function populateFilters() {
  const citySelect = document.getElementById('filter-city');
  const categorySelect = document.getElementById('filter-category');
  if (!citySelect || !categorySelect) return;

  const cities = Array.from(new Set(state.revenueJobs.map(job => job.city).filter(Boolean))).sort();
  const categories = Array.from(new Set(state.revenueJobs.map(job => job.category).filter(Boolean))).sort();

  citySelect.innerHTML = '<option value="">All Cities</option>' + cities.map(city => `<option value="${city}">${city}</option>`).join('');
  categorySelect.innerHTML = '<option value="">All Categories</option>' + categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function applyFilters() {
  const start = document.getElementById('filter-date-start').value;
  const end = document.getElementById('filter-date-end').value;
  const city = document.getElementById('filter-city').value;
  const category = document.getElementById('filter-category').value;
  const paymentStatus = document.getElementById('filter-payment-status').value;
  const payoutStatus = document.getElementById('filter-payout-status').value;

  state.filteredRevenue = state.revenueJobs.filter((job) => {
    if (start && new Date(job.completed_at) < new Date(start)) return false;
    if (end && new Date(job.completed_at) > new Date(end)) return false;
    if (city && job.city !== city) return false;
    if (category && job.category !== category) return false;
    if (paymentStatus && job.payment_status !== paymentStatus) return false;
    if (payoutStatus && job.payout_status !== payoutStatus) return false;
    return true;
  });

  renderRevenueTable();
}

function resetFilters() {
  document.getElementById('filter-date-start').value = '';
  document.getElementById('filter-date-end').value = '';
  document.getElementById('filter-city').value = '';
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-payment-status').value = '';
  document.getElementById('filter-payout-status').value = '';
  state.filteredRevenue = [...state.revenueJobs];
  renderRevenueTable();
}

function renderExceptions() {
  const panel = document.getElementById('exceptions-panel');
  if (!panel) return;
  const missingFinal = state.revenueJobs.filter(job => !job.final_price);
  const paidNoPayout = state.revenueJobs.filter(job => job.payment_status === 'paid' && job.payout_status === 'not_ready');
  const refunded = state.revenueJobs.filter(job => job.payment_status === 'refunded');

  panel.innerHTML = `
    <div class="exception-item">
      <div class="exception-title">Missing Final Price</div>
      <div class="exception-value">${missingFinal.length}</div>
    </div>
    <div class="exception-item">
      <div class="exception-title">Paid, Not Ready for Payout</div>
      <div class="exception-value">${paidNoPayout.length}</div>
    </div>
    <div class="exception-item">
      <div class="exception-title">Refunded Jobs</div>
      <div class="exception-value">${refunded.length}</div>
    </div>
  `;
}

function exportCSV(filename, rows) {
  const csv = rows.map(row => row.map((cell) => {
    const value = cell === null || cell === undefined ? '' : String(cell);
    if (value.includes(',') || value.includes('"')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }).join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

function exportRevenueMTD() {
  const rows = [
    ['Job ID', 'Tier', 'City', 'Category', 'Final Price', 'Material Fees', 'Platform Fee', 'Contractor Payout', 'Payment Status', 'Payout Status', 'Completed At'],
    ...state.filteredRevenue.map(job => {
      const f = getJobFinancials(job);
      return [
      job.job_id,
      f.contractorTier,
      job.city,
      job.category,
      f.finalPrice,
      f.materialFees,
      f.platformFee,
      f.contractorPayout,
      job.payment_status,
      job.payout_status,
      job.completed_at
      ];
    })
  ];
  exportCSV('revenue-mtd.csv', rows);
}

function exportPayoutsPending() {
  const rows = [
    ['Job ID', 'Contractor', 'Tier', 'City', 'Category', 'Final Price', 'Material Fees', 'Platform Fee', 'Contractor Payout', 'Completed At', 'Payment Status', 'Payout Status'],
    ...state.payouts.map(item => {
      const f = getJobFinancials(item);
      return [
      item.job_id,
      item.contractor,
      f.contractorTier,
      item.city,
      item.category,
      f.finalPrice,
      f.materialFees,
      f.platformFee,
      f.contractorPayout,
      item.completed_at,
      item.payment_status,
      item.payout_status
      ];
    })
  ];
  exportCSV('payouts-pending.csv', rows);
}

function exportKPISnapshot() {
  const rows = [
    ['Metric', 'Value'],
    ['Gross Revenue', document.querySelector('.kpi-grid .kpi-card:nth-child(1) .kpi-value')?.textContent || ''],
    ['Material Fees', document.querySelector('.kpi-grid .kpi-card:nth-child(2) .kpi-value')?.textContent || ''],
    ['Platform Fees', document.querySelector('.kpi-grid .kpi-card:nth-child(3) .kpi-value')?.textContent || ''],
    ['Contractor Payouts', document.querySelector('.kpi-grid .kpi-card:nth-child(4) .kpi-value')?.textContent || ''],
    ['Net Platform Revenue', document.querySelector('.kpi-grid .kpi-card:nth-child(5) .kpi-value')?.textContent || ''],
    ['Completed Jobs', document.querySelector('.kpi-grid .kpi-card:nth-child(6) .kpi-value')?.textContent || ''],
    ['Avg Job Value', document.querySelector('.kpi-grid .kpi-card:nth-child(7) .kpi-value')?.textContent || '']
  ];
  exportCSV('kpi-snapshot.csv', rows);
}

function sortTable(key) {
  if (state.payoutSort.key === key) {
    state.payoutSort.dir = state.payoutSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.payoutSort.key = key;
    state.payoutSort.dir = 'asc';
  }
  renderPayoutsTable();
}

function sortRevenueTable(key) {
  if (state.revenueSort.key === key) {
    state.revenueSort.dir = state.revenueSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.revenueSort.key = key;
    state.revenueSort.dir = 'asc';
  }
  renderRevenueTable();
}

async function loadAll() {
  const month = monthParam();
  document.getElementById('current-month').textContent = getCurrentMonthLabel();

  const [mtd, payouts, revenueJobs, payoutHistory] = await Promise.all([
    fetchMTDData(month),
    fetchPayoutsPending(),
    fetchRevenueJobs(month),
    fetchPayoutsHistory()
  ]);

  state.payouts = normalizeItems(payouts);
  renderPayoutsMetrics(payouts);
  renderPayoutsTable();
  updateBatchActions();

  state.revenueJobs = revenueJobs || [];
  state.filteredRevenue = [...state.revenueJobs];
  state.paymentHistory = normalizeItems(payoutHistory);
  renderKPIs(mtd);
  populateFilters();
  renderRevenueTable();
  renderExceptions();
  renderPaymentHistory();
}

document.addEventListener('DOMContentLoaded', () => {
  loadAll().catch((error) => {
    console.error(error);
  });
});

window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.sortTable = sortTable;
window.sortRevenueTable = sortRevenueTable;
window.toggleSelectAll = toggleSelectAll;
window.toggleSelection = toggleSelection;
window.clearSelection = clearSelection;
window.batchProcessPayouts = batchProcessPayouts;
window.markReady = markReady;
window.exportRevenueMTD = exportRevenueMTD;
window.exportPayoutsPending = exportPayoutsPending;
window.exportKPISnapshot = exportKPISnapshot;
