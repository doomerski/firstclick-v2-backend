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
  contractors: [],
  filtered: [],
  payoutSort: { key: 'total_pending', dir: 'desc' }
};

const FILTERS = [
  { key: 'all', label: 'All Contractors' },
  { key: 'ready', label: 'Ready to Pay' },
  { key: 'pending', label: 'Has Pending' }
];

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

function normalizeStatus(status) {
  return String(status || '').toLowerCase().replaceAll('_', '-');
}

function tierBadge(tierKey) {
  const key = (tierKey || 'bronze').toLowerCase();
  const tier = CONTRACTOR_TIERS[key] || CONTRACTOR_TIERS.bronze;
  return `<span class="tier-badge tier-${key}" style="background:${tier.color}20;color:${tier.color};border:1px solid ${tier.color};">${tier.label}</span>`;
}

function getContractorTotalPending(contractor) {
  if (Number.isFinite(Number(contractor.total_pending))) {
    return Number(contractor.total_pending);
  }
  const jobs = contractor.jobs || [];
  return jobs.reduce((sum, job) => sum + getJobFinancials(job).contractorPayout, 0);
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    throw new Error('Request failed');
  }
  return response.json();
}

async function loadContractorPayouts() {
  try {
    // Load contractor payouts from the existing endpoint
    const data = await fetchJson('/admin/contractors/payouts');
    
    // Build contractor list with pending payouts
    state.contractors = (Array.isArray(data) ? data : data.contractors || [])
      .filter(c => c.total_pending > 0)
      .map(c => ({
        ...c,
        total_pending: clampMoney(c.total_pending)
      }));
    
    applyFilter('all');
    renderSummary();
    renderContractorsTable();
  } catch (error) {
    console.error('Failed to load contractor payouts:', error);
    const table = document.getElementById('payouts-table');
    if (table) {
      table.innerHTML = '<tr><td colspan="6" class="loading">Failed to load payouts.</td></tr>';
    }
  }
}

function renderSummary() {
  const summary = document.getElementById('summary-grid');
  if (!summary) return;
  
  const totalPending = state.contractors.reduce((sum, c) => sum + (c.total_pending || 0), 0);
  const readyCount = state.contractors.filter(c => c.total_pending > 0).length;

  summary.innerHTML = `
    <div class="summary-card"><div class="summary-label">Total Pending</div><div class="summary-value">${formatCurrency(totalPending)}</div></div>
    <div class="summary-card"><div class="summary-label">Contractors with Pending</div><div class="summary-value">${readyCount}</div></div>
    <div class="summary-card"><div class="summary-label">Total Payouts Pending</div><div class="summary-value">${state.contractors.reduce((sum, c) => sum + (c.jobs?.length || 0), 0)}</div></div>
  `;
}

function renderFilters() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  
  const readyCount = state.contractors.filter(c => c.total_pending > 0).length;
  
  bar.innerHTML = FILTERS.map(filter => {
    let count = 0;
    if (filter.key === 'all') {
      count = state.contractors.length;
    } else if (filter.key === 'ready') {
      count = readyCount;
    } else if (filter.key === 'pending') {
      count = state.contractors.filter(c => c.total_pending > 0).length;
    }
    
    return `
      <button class="filter-chip" onclick="applyFilter('${filter.key}')">
        ${filter.label} <span>(${count})</span>
      </button>
    `;
  }).join('');
}

function applyFilter(filterKey) {
  if (filterKey === 'all') {
    state.filtered = [...state.contractors];
  } else if (filterKey === 'ready') {
    state.filtered = state.contractors.filter(c => c.total_pending > 0);
  } else if (filterKey === 'pending') {
    state.filtered = state.contractors.filter(c => c.total_pending > 0);
  }
  renderFilters();
  renderContractorsTable();
}

function renderContractorsTable() {
  const table = document.getElementById('payouts-table');
  const cards = document.getElementById('payouts-cards');
  if (!table) return;

  let items = [...state.filtered];
  
  // Sort items
  items.sort((a, b) => {
    const key = state.payoutSort.key;
    const dir = state.payoutSort.dir === 'asc' ? 1 : -1;
    const aValue = getSortValue(a, key);
    const bValue = getSortValue(b, key);
    return aValue > bValue ? dir : aValue < bValue ? -dir : 0;
  });

  if (items.length === 0) {
    table.innerHTML = '<tr><td colspan="6" class="loading">No contractors with pending payouts.</td></tr>';
    if (cards) cards.innerHTML = '<div class="loading">No contractors with pending payouts.</div>';
    document.getElementById('empty-state').style.display = 'block';
    return;
  }

  document.getElementById('empty-state').style.display = 'none';

  table.innerHTML = items.map((contractor) => {
    const tier = (contractor.contractor_tier || 'bronze').toLowerCase();
    const tierObj = CONTRACTOR_TIERS[tier] || CONTRACTOR_TIERS.bronze;
    
    return `
      <tr onclick="openContractorPayoutsProfile('${contractor.contractor_id}')" style="cursor: pointer;">
        <td>
          <div style="font-weight: 600;">${contractor.name || '—'}</div>
          <div style="font-size: 0.85rem; color: var(--slate-400);">${contractor.email || '—'}</div>
        </td>
        <td>${contractor.jobs?.length || 0}</td>
        <td>${formatCurrency(contractor.total_pending)}</td>
        <td>
          <span style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; background: ${tierObj.color}20; color: ${tierObj.color}; border: 1px solid ${tierObj.color};">
            ${tierObj.label}
          </span>
        </td>
        <td>${(contractor.payment_schedule || 'weekly').replace('_', ' ')}</td>
        <td>${formatDate(contractor.next_payment_date)}</td>
      </tr>
    `;
  }).join('');

  if (cards) {
    cards.innerHTML = items.map((contractor) => {
      const tier = (contractor.contractor_tier || 'bronze').toLowerCase();
      const tierObj = CONTRACTOR_TIERS[tier] || CONTRACTOR_TIERS.bronze;
      
      return `
        <div class="data-card" onclick="openContractorPayoutsProfile('${contractor.contractor_id}')" style="cursor: pointer;">
          <div class="card-row">
            <div>
              <div class="card-title">${contractor.name || '—'}</div>
              <div class="card-meta">${contractor.email || '—'}</div>
            </div>
          </div>
          <div class="card-kv">
            <div><span>Total Pending</span><b>${formatCurrency(contractor.total_pending)}</b></div>
            <div><span>Jobs Pending</span><b>${contractor.jobs?.length || 0}</b></div>
            <div><span>Tier</span><b style="background: ${tierObj.color}20; color: ${tierObj.color}; padding: 0.25rem 0.5rem; border-radius: 4px;">${tierObj.label}</b></div>
            <div><span>Schedule</span><b>${(contractor.payment_schedule || 'weekly').replace('_', ' ')}</b></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function getSortValue(item, key) {
  if (key === 'total_pending') {
    return Number(item[key] || 0);
  }
  if (key === 'next_payment_date') {
    return new Date(item[key] || 0).getTime();
  }
  return String(item[key] || '').toLowerCase();
}

function sortTable(key) {
  if (state.payoutSort.key === key) {
    state.payoutSort.dir = state.payoutSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.payoutSort.key = key;
    state.payoutSort.dir = 'asc';
  }
  renderContractorsTable();
}

function openContractorPayoutsProfile(contractorId) {
  window.location.href = `../contractor/contractor-payouts-profile.html?id=${contractorId}`;
}

window.applyFilter = applyFilter;
window.sortTable = sortTable;

document.addEventListener('DOMContentLoaded', () => {
  loadContractorPayouts().catch((error) => {
    console.error('Failed to load payouts:', error);
    const table = document.getElementById('payouts-table');
    if (table) {
      table.innerHTML = '<tr><td colspan="6" class="loading">Failed to load payouts.</td></tr>';
    }
  });
});
