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
  contractorId: null,
  contractor: null,
  pendingPayouts: [],
  payoutHistory: [],
  pendingSort: { key: 'completed_at', dir: 'desc' },
  historySort: { key: 'completed_at', dir: 'desc' }
};

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
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

function tierBadge(tierKey) {
  const key = (tierKey || 'bronze').toLowerCase();
  const tier = CONTRACTOR_TIERS[key] || CONTRACTOR_TIERS.bronze;
  return `<span class="tier-badge tier-${key}">${tier.label}</span>`;
}

function statusBadge(status) {
  if (!status) return '';
  const normalized = String(status).replaceAll('_', '-');
  return `<span class="status-badge status-${normalized}">${status.replace('_', ' ')}</span>`;
}

async function fetchJson(path) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return response.json();
}

async function loadContractorPayouts() {
  const contractorId = new URLSearchParams(window.location.search).get('id');
  if (!contractorId) {
    notify.error('Contractor ID not provided');
    window.location.href = '../admin/admin-payouts.html';
    return;
  }

  state.contractorId = contractorId;

  try {
    // Fetch contractor details
    const contractorResult = await fetchJson(`/admin/contractors/${contractorId}`);
    state.contractor = contractorResult;

    // Fetch pending and history payouts
    const [pending, history] = await Promise.all([
      fetchJson('/admin/payouts/pending'),
      fetchJson('/admin/payouts/history')
    ]);

    // Filter to only this contractor's payouts
    state.pendingPayouts = (Array.isArray(pending) ? pending : pending.payouts || [])
      .filter(p => String(p.contractor_id) === String(contractorId));
    
    state.payoutHistory = (Array.isArray(history) ? history : history.payouts || [])
      .filter(p => String(p.contractor_id) === String(contractorId));

    renderHeader();
    renderMetrics();
    renderContractorInfo();
    renderPendingPayouts();
    renderPayoutHistory();
  } catch (error) {
    console.error('Error loading contractor payouts:', error);
    notify.error('Failed to load contractor payouts: ' + error.message);
  }
}

function renderHeader() {
  if (!state.contractor) return;
  
  const name = state.contractor.business_name || state.contractor.legal_name || state.contractor.email || 'Contractor';
  const tier = (state.contractor.contractor_tier || 'bronze').toLowerCase();
  
  document.getElementById('contractor-name').textContent = name;
  document.getElementById('contractor-tier').innerHTML = tierBadge(tier);
}

function renderMetrics() {
  const totalPending = state.pendingPayouts.reduce((sum, p) => {
    const f = getJobFinancials(p);
    return sum + (f.contractorPayout || 0);
  }, 0);

  const readyCount = state.pendingPayouts.filter(p => p.payout_status === 'ready').length;

  const totalPaid = state.payoutHistory.reduce((sum, p) => {
    const f = getJobFinancials(p);
    return sum + (f.contractorPayout || 0);
  }, 0);

  const nextPaymentDate = new Date(state.contractor.next_payment_date || Date.now());
  const schedule = state.contractor.payment_schedule || 'weekly';

  document.getElementById('total-pending').textContent = formatCurrency(totalPending);
  document.getElementById('pending-count').textContent = `${state.pendingPayouts.length} jobs`;
  document.getElementById('ready-count').textContent = readyCount;
  document.getElementById('total-paid').textContent = formatCurrency(totalPaid);
  document.getElementById('paid-count').textContent = `${state.payoutHistory.length} completed`;
  document.getElementById('next-payment').textContent = formatDate(nextPaymentDate);
  document.getElementById('payment-schedule').textContent = schedule.replace('_', ' ');
}

function renderContractorInfo() {
  if (!state.contractor) return;

  const info = document.getElementById('contractor-info');
  info.innerHTML = `
    <div class="info-item">
      <div class="info-label">Business Name</div>
      <div class="info-value">${state.contractor.business_name || '—'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Legal Name</div>
      <div class="info-value">${state.contractor.legal_name || '—'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Email</div>
      <div class="info-value">${state.contractor.email || '—'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Phone</div>
      <div class="info-value">${state.contractor.phone || '—'}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Tier</div>
      <div class="info-value">${tierBadge(state.contractor.contractor_tier || 'bronze')}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Payment Schedule</div>
      <div class="info-value">${(state.contractor.payment_schedule || 'weekly').replace('_', ' ')}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Account Status</div>
      <div class="info-value">${statusBadge(state.contractor.status || 'active')}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Member Since</div>
      <div class="info-value">${formatDate(state.contractor.created_at)}</div>
    </div>
  `;
}

function renderPendingPayouts() {
  const table = document.getElementById('pending-payouts-table');
  if (!table) return;

  let items = [...state.pendingPayouts];

  // Sort items
  items.sort((a, b) => {
    const key = state.pendingSort.key;
    const dir = state.pendingSort.dir === 'asc' ? 1 : -1;
    const aValue = getSortValue(a, key);
    const bValue = getSortValue(b, key);
    return aValue > bValue ? dir : aValue < bValue ? -dir : 0;
  });

  if (items.length === 0) {
    table.innerHTML = '<tr><td colspan="10" class="loading">No pending payouts.</td></tr>';
    return;
  }

  table.innerHTML = items.map((item) => {
    const f = getJobFinancials(item);
    return `
      <tr>
        <td>#${String(item.job_id).substring(0, 8)}</td>
        <td>${item.category || '—'}</td>
        <td>${item.city || '—'}</td>
        <td>${formatCurrency(f.finalPrice)}</td>
        <td>${formatCurrency(f.materialFees)}</td>
        <td>${formatCurrency(f.stripeFee)}</td>
        <td>${formatCurrency(f.platformFee)}</td>
        <td>${formatCurrency(f.contractorPayout)}</td>
        <td>${formatDate(item.completed_at)}</td>
        <td>${statusBadge(item.payout_status)}</td>
      </tr>
    `;
  }).join('');
}

function renderPayoutHistory() {
  const table = document.getElementById('history-table');
  if (!table) return;

  let items = [...state.payoutHistory];

  // Sort items
  items.sort((a, b) => {
    const key = state.historySort.key;
    const dir = state.historySort.dir === 'asc' ? 1 : -1;
    const aValue = getSortValue(a, key);
    const bValue = getSortValue(b, key);
    return aValue > bValue ? dir : aValue < bValue ? -dir : 0;
  });

  if (items.length === 0) {
    table.innerHTML = '<tr><td colspan="9" class="loading">No payout history.</td></tr>';
    return;
  }

  table.innerHTML = items.map((item) => {
    const f = getJobFinancials(item);
    return `
      <tr>
        <td>#${String(item.job_id).substring(0, 8)}</td>
        <td>${item.category || '—'}</td>
        <td>${item.city || '—'}</td>
        <td>${formatCurrency(f.finalPrice)}</td>
        <td>${formatCurrency(f.materialFees)}</td>
        <td>${formatCurrency(f.contractorPayout)}</td>
        <td>${formatDate(item.completed_at)}</td>
        <td>${formatDate(item.updated_at)}</td>
        <td>${statusBadge(item.payout_status)}</td>
      </tr>
    `;
  }).join('');
}

function getSortValue(item, key) {
  if (key === 'completed_at' || key === 'created_at' || key === 'paid_at') {
    return new Date(item[key] || 0).getTime();
  }
  if (key === 'final_price' || key === 'materials' || key === 'stripe_fee' || key === 'platform_fee' || key === 'payout') {
    return Number(item[key] || 0);
  }
  return String(item[key] || '').toLowerCase();
}

function sortPendingTable(key) {
  if (state.pendingSort.key === key) {
    state.pendingSort.dir = state.pendingSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.pendingSort.key = key;
    state.pendingSort.dir = 'asc';
  }
  renderPendingPayouts();
}

function sortHistoryTable(key) {
  if (state.historySort.key === key) {
    state.historySort.dir = state.historySort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.historySort.key = key;
    state.historySort.dir = 'asc';
  }
  renderPayoutHistory();
}

document.addEventListener('DOMContentLoaded', loadContractorPayouts);
