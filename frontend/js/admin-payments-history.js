const API_BASE = 'http://localhost:3000/api';

const CONTRACTOR_TIERS = {
  bronze: { platformFee: 0.20, color: '#cd7f32', label: 'Bronze' },
  silver: { platformFee: 0.15, color: '#c0c0c0', label: 'Silver' },
  gold: { platformFee: 0.10, color: '#ffd700', label: 'Gold' }
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

  if (hasBackend) {
    const netAmount = Math.max(0, finalPrice - materialFees);
    return {
      finalPrice,
      materialFees,
      netAmount,
      platformFee: clampMoney(job.platform_fee),
      contractorPayout: clampMoney(job.contractor_payout),
      contractorTier: tierKey
    };
  }

  const netAmount = Math.max(0, finalPrice - materialFees);
  const platformFee = netAmount * tier.platformFee;
  const contractorPayout = Math.max(0, netAmount - platformFee);

  return {
    finalPrice,
    materialFees,
    netAmount,
    platformFee,
    contractorPayout,
    contractorTier: tierKey
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
  return `<span class="tier-badge" style="background:${tier.color}20;color:${tier.color};border:1px solid ${tier.color};">${tier.label}</span>`;
}

async function fetchHistory() {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/admin/payouts/history`, {
    headers: {
      ...(token && { 'Authorization': `Bearer ${token}` })
    }
  });
  if (!response.ok) {
    throw new Error('Failed to load payments history');
  }
  return response.json();
}

function renderHistory(data) {
  const badge = document.getElementById('history-badge');
  const metrics = document.getElementById('history-metrics');
  const table = document.getElementById('history-table');
  const headerTotal = document.getElementById('history-total-header');
  if (!badge || !metrics || !table) return;

  const items = Array.isArray(data) ? data : (data.items || data.payouts || []);
  badge.textContent = `${items.length} PAID`;
  if (headerTotal) headerTotal.textContent = `Total: ${items.length}`;

  const totalPaid = items.reduce((sum, item) => {
    const f = getJobFinancials(item);
    return sum + (f.contractorPayout || 0);
  }, 0);

  const lastPaidAt = items.length
    ? formatDate(items[0].completed_at || items[0].updated_at || items[0].created_at)
    : '—';

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
}

async function init() {
  try {
    const data = await fetchHistory();
    renderHistory(data);
  } catch (error) {
    console.error(error);
    const table = document.getElementById('history-table');
    if (table) {
      table.innerHTML = '<tr><td colspan="10" class="loading">Failed to load payments history.</td></tr>';
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
