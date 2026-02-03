// admin-revenue.js
// Revenue MTD & Contractor Payouts Control Center

// ============================================================================
// CONFIGURATION
// ============================================================================

// Tier-based fee structure to incentivise reliable frequent work
const CONTRACTOR_TIERS = {
    bronze: {
        platformFee: 0.20,      // 20% platform fee
        color: '#cd7f32',
        label: 'Bronze'
    },
    silver: {
        platformFee: 0.15,      // 15% platform fee
        color: '#c0c0c0',
        label: 'Silver'
    },
    gold: {
        platformFee: 0.10,      // 10% platform fee
        color: '#ffd700',
        label: 'Gold'
    }
};

const API_BASE = '/api';
const CURRENCY = 'CAD';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let state = {
    mtdData: null,
    payoutsData: null,
    revenueJobs: [],
    filteredRevenueJobs: [],
    selectedJobs: new Set(),
    sortColumn: null,
    sortDirection: 'asc',
    filters: {
        dateStart: null,
        dateEnd: null,
        city: '',
        category: '',
        paymentStatus: '',
        payoutStatus: ''
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    initializeCurrentMonth();
    await loadAllData();
    setupEventListeners();
});

function initializeCurrentMonth() {
    const now = new Date();
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    document.getElementById('current-month').textContent = 
        `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    
    // Set default date range to current month
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    document.getElementById('filter-date-start').value = formatDateInput(firstDay);
    document.getElementById('filter-date-end').value = formatDateInput(lastDay);
    
    state.filters.dateStart = firstDay;
    state.filters.dateEnd = lastDay;
}

function formatDateInput(date) {
    return date.toISOString().split('T')[0];
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadAllData() {
    try {
        await Promise.all([
            loadMTDData(),
            loadPayoutsData(),
            loadRevenueJobs()
        ]);
        
        renderAll();
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data. Please refresh the page.');
    }
}

async function loadMTDData() {
    // Mock API call - replace with actual endpoint
    // GET /api/admin/revenue/mtd?month=YYYY-MM
    const month = getCurrentMonthString();
    
    try {
        // Simulated data for demonstration
        state.mtdData = await mockFetchMTDData(month);
    } catch (error) {
        console.error('Error loading MTD data:', error);
        throw error;
    }
}

async function loadPayoutsData() {
    // Mock API call - replace with actual endpoint
    // GET /api/admin/payouts/pending
    
    try {
        state.payoutsData = await mockFetchPayoutsData();
    } catch (error) {
        console.error('Error loading payouts data:', error);
        throw error;
    }
}

async function loadRevenueJobs() {
    // Mock API call - replace with actual endpoint
    // GET /api/admin/revenue/jobs?month=YYYY-MM
    
    try {
        state.revenueJobs = await mockFetchRevenueJobs();
        state.filteredRevenueJobs = [...state.revenueJobs];
        
        // Populate filter dropdowns
        populateFilterDropdowns();
    } catch (error) {
        console.error('Error loading revenue jobs:', error);
        throw error;
    }
}

function getCurrentMonthString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ============================================================================
// REVENUE CALCULATIONS
// ============================================================================

function calculateJobFinancials(finalPrice, materialFees = 0, contractorTier = 'bronze') {
    const price = parseFloat(finalPrice);
    const materials = parseFloat(materialFees) || 0;
    
    // Get tier configuration
    const tier = CONTRACTOR_TIERS[contractorTier] || CONTRACTOR_TIERS.bronze;
    
    // Calculate net amount after material fees
    const netAmount = price - materials;
    
    // Platform fee (percentage of net amount)
    const platformFee = netAmount * tier.platformFee;
    
    // Contractor payout = Net Amount - Platform Fee
    const contractorPayout = netAmount - platformFee;
    
    // Net platform revenue = Platform Fee
    const netPlatformRevenue = platformFee;
    
    return {
        finalPrice: price,
        materialFees: materials,
        netAmount: netAmount,
        platformFee: platformFee,
        platformFeePercent: tier.platformFee * 100,
        contractorPayout: contractorPayout,
        netPlatformRevenue: netPlatformRevenue,
        contractorTier: contractorTier,
        tierLabel: tier.label
    };
}

function calculateMTDTotals(jobs) {
    const totals = {
        grossRevenue: 0,
        materialFees: 0,
        platformFees: 0,
        contractorPayouts: 0,
        netPlatformRevenue: 0,
        completedJobs: jobs.length,
        averageJobValue: 0,
        tierBreakdown: {
            bronze: { count: 0, revenue: 0 },
            silver: { count: 0, revenue: 0 },
            gold: { count: 0, revenue: 0 }
        }
    };
    
    jobs.forEach(job => {
        const financials = calculateJobFinancials(
            job.final_price, 
            job.material_fees || 0,
            job.contractor_tier || 'bronze'
        );
        
        totals.grossRevenue += financials.finalPrice;
        totals.materialFees += financials.materialFees;
        totals.platformFees += financials.platformFee;
        totals.contractorPayouts += financials.contractorPayout;
        totals.netPlatformRevenue += financials.netPlatformRevenue;
        
        // Track tier breakdown
        const tier = job.contractor_tier || 'bronze';
        if (totals.tierBreakdown[tier]) {
            totals.tierBreakdown[tier].count++;
            totals.tierBreakdown[tier].revenue += financials.finalPrice;
        }
    });
    
    totals.averageJobValue = jobs.length > 0 ? 
        totals.grossRevenue / jobs.length : 0;
    
    return totals;
}

// ============================================================================
// RENDERING
// ============================================================================

function renderAll() {
    renderKPIs();
    renderPayoutsMetrics();
    renderPayoutsTable();
    renderRevenueTable();
    renderExceptions();
}

function renderKPIs() {
    const totals = calculateMTDTotals(state.revenueJobs);
    
    const kpiHTML = `
        <div class="kpi-card">
            <div class="kpi-label">Gross Revenue</div>
            <div class="kpi-value money money-positive">${formatCurrency(totals.grossRevenue)}</div>
            <div class="kpi-subtitle">Total customer payments</div>
        </div>
        
        <div class="kpi-card">
            <div class="kpi-label">Material Fees</div>
            <div class="kpi-value money money-negative">${formatCurrency(totals.materialFees)}</div>
            <div class="kpi-subtitle">Deducted from gross</div>
        </div>
        
        <div class="kpi-card">
            <div class="kpi-label">Platform Fees</div>
            <div class="kpi-value money money-positive">${formatCurrency(totals.platformFees)}</div>
            <div class="kpi-subtitle">Tier-based (10-20%)</div>
        </div>
        
        <div class="kpi-card">
            <div class="kpi-label">Contractor Payouts</div>
            <div class="kpi-value money money-negative">${formatCurrency(totals.contractorPayouts)}</div>
            <div class="kpi-subtitle">Total owed</div>
        </div>
        
        <div class="kpi-card">
            <div class="kpi-label">Net Platform Revenue</div>
            <div class="kpi-value money money-positive">${formatCurrency(totals.netPlatformRevenue)}</div>
            <div class="kpi-subtitle">After all deductions</div>
        </div>
        
        <div class="kpi-card">
            <div class="kpi-label">Completed Jobs</div>
            <div class="kpi-value">${totals.completedJobs}</div>
            <div class="kpi-subtitle">
                🥉${totals.tierBreakdown.bronze.count} 
                🥈${totals.tierBreakdown.silver.count} 
                🥇${totals.tierBreakdown.gold.count}
            </div>
        </div>
        
        <div class="kpi-card">
            <div class="kpi-label">Average Job Value</div>
            <div class="kpi-value money money-neutral">${formatCurrency(totals.averageJobValue)}</div>
            <div class="kpi-subtitle">Per completed job</div>
        </div>
    `;
    
    document.getElementById('kpi-grid').innerHTML = kpiHTML;
    document.getElementById('mtd-badge').textContent = `${totals.completedJobs} JOBS`;
}

function renderPayoutsMetrics() {
    if (!state.payoutsData) return;
    
    const metricsHTML = `
        <div class="metric-box">
            <div class="metric-value">${formatCurrency(state.payoutsData.total_pending)}</div>
            <div class="metric-label">Total Pending</div>
        </div>
        <div class="metric-box">
            <div class="metric-value">${state.payoutsData.jobs_ready}</div>
            <div class="metric-label">Jobs Ready</div>
        </div>
        <div class="metric-box">
            <div class="metric-value">${state.payoutsData.contractors_count || 0}</div>
            <div class="metric-label">Contractors Awaiting</div>
        </div>
    `;
    
    document.getElementById('payouts-metrics').innerHTML = metricsHTML;
    document.getElementById('payouts-badge').textContent = `${state.payoutsData.jobs_ready} READY`;
}

function renderPayoutsTable() {
    if (!state.payoutsData || !state.payoutsData.items) {
        document.getElementById('payouts-table').innerHTML = `
            <tr><td colspan="11" style="text-align: center; color: var(--slate-400);">No payouts pending</td></tr>
        `;
        return;
    }
    
    const rows = state.payoutsData.items.map(job => `
        <tr>
            <td class="checkbox-cell">
                <input type="checkbox" 
                       class="job-checkbox" 
                       data-job-id="${job.job_id}"
                       onchange="handleJobSelection(${job.job_id})">
            </td>
            <td><span class="money">#${job.job_id}</span></td>
            <td>${escapeHtml(job.contractor)}</td>
            <td>
                <span class="status-badge" style="background: ${CONTRACTOR_TIERS[job.contractor_tier || 'bronze'].color}20; color: ${CONTRACTOR_TIERS[job.contractor_tier || 'bronze'].color}; border: 1px solid ${CONTRACTOR_TIERS[job.contractor_tier || 'bronze'].color};">
                    ${job.contractor_tier ? job.contractor_tier.toUpperCase() : 'BRONZE'}
                </span>
            </td>
            <td>${escapeHtml(job.city)} / ${escapeHtml(job.category)}</td>
            <td class="money money-neutral">${formatCurrency(job.final_price)}</td>
            <td class="money money-negative">${formatCurrency(job.material_fees || 0)}</td>
            <td class="money money-positive">${formatCurrency(job.contractor_payout)}</td>
            <td>${formatDate(job.completed_at)}</td>
            <td>${renderStatusBadge(job.payment_status, 'payment')}</td>
            <td>${renderStatusBadge(job.payout_status, 'payout')}</td>
            <td>
                <button class="btn btn-primary btn-sm" 
                        onclick="markPayoutReady(${job.job_id})"
                        ${job.payout_status === 'ready' ? 'disabled' : ''}>
                    ${job.payout_status === 'ready' ? 'Ready' : 'Mark Ready'}
                </button>
            </td>
        </tr>
    `).join('');
    
    document.getElementById('payouts-table').innerHTML = rows;
}

function renderRevenueTable() {
    if (!state.filteredRevenueJobs || state.filteredRevenueJobs.length === 0) {
        document.getElementById('revenue-table').innerHTML = `
            <tr><td colspan="11" style="text-align: center; color: var(--slate-400);">No jobs found</td></tr>
        `;
        return;
    }
    
    const rows = state.filteredRevenueJobs.map(job => {
        const financials = calculateJobFinancials(
            job.final_price,
            job.material_fees || 0,
            job.contractor_tier || 'bronze'
        );
        
        return `
            <tr>
                <td><span class="money">#${job.job_id}</span></td>
                <td>
                    <span class="status-badge" style="background: ${CONTRACTOR_TIERS[job.contractor_tier || 'bronze'].color}20; color: ${CONTRACTOR_TIERS[job.contractor_tier || 'bronze'].color}; border: 1px solid ${CONTRACTOR_TIERS[job.contractor_tier || 'bronze'].color};">
                        ${financials.tierLabel.toUpperCase()}
                    </span>
                </td>
                <td>${escapeHtml(job.city)}</td>
                <td>${escapeHtml(job.category)}</td>
                <td class="money money-neutral">${formatCurrency(financials.finalPrice)}</td>
                <td class="money money-negative">${formatCurrency(financials.materialFees)}</td>
                <td class="money money-positive">${formatCurrency(financials.platformFee)} <small style="color: var(--slate-500);">(${financials.platformFeePercent}%)</small></td>
                <td class="money money-positive">${formatCurrency(financials.contractorPayout)}</td>
                <td>${renderStatusBadge(job.payment_status, 'payment')}</td>
                <td>${renderStatusBadge(job.payout_status, 'payout')}</td>
                <td>${formatDate(job.completed_at)}</td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('revenue-table').innerHTML = rows;
}

function renderExceptions() {
    const exceptions = [];
    
    // Find jobs without final_price
    const missingPrice = state.revenueJobs.filter(j => !j.final_price || j.final_price <= 0);
    if (missingPrice.length > 0) {
        exceptions.push({
            text: 'Completed jobs missing final price',
            count: missingPrice.length
        });
    }
    
    // Find paid jobs not ready for payout
    const paidNotReady = state.revenueJobs.filter(j => 
        j.payment_status === 'paid' && j.payout_status === 'not_ready'
    );
    if (paidNotReady.length > 0) {
        exceptions.push({
            text: 'Paid jobs not marked for payout',
            count: paidNotReady.length
        });
    }
    
    // Refunded jobs
    const refunded = state.revenueJobs.filter(j => j.payment_status === 'refunded');
    if (refunded.length > 0) {
        exceptions.push({
            text: 'Refunded jobs (MTD)',
            count: refunded.length
        });
    }
    
    if (exceptions.length === 0) {
        document.getElementById('exceptions-panel').innerHTML = `
            <div style="text-align: center; color: var(--slate-400);">
                ✓ No exceptions or alerts
            </div>
        `;
        return;
    }
    
    const exceptionsHTML = exceptions.map(ex => `
        <div class="exception-item">
            <span class="exception-text">${ex.text}</span>
            <span class="exception-count">${ex.count}</span>
        </div>
    `).join('');
    
    document.getElementById('exceptions-panel').innerHTML = exceptionsHTML;
}

function renderStatusBadge(status, type) {
    const statusMap = {
        payment: {
            paid: 'status-paid',
            unpaid: 'status-unpaid',
            refunded: 'status-refunded'
        },
        payout: {
            ready: 'status-ready',
            processing: 'status-processing',
            paid: 'status-paid',
            not_ready: 'status-not-ready'
        }
    };
    
    const className = statusMap[type][status] || 'status-not-ready';
    return `<span class="status-badge ${className}">${status.replace('_', ' ')}</span>`;
}

// ============================================================================
// FILTERING & SORTING
// ============================================================================

function populateFilterDropdowns() {
    // Cities
    const cities = [...new Set(state.revenueJobs.map(j => j.city))].sort();
    const citySelect = document.getElementById('filter-city');
    cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        citySelect.appendChild(option);
    });
    
    // Categories
    const categories = [...new Set(state.revenueJobs.map(j => j.category))].sort();
    const categorySelect = document.getElementById('filter-category');
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
}

function applyFilters() {
    // Get filter values
    const dateStart = document.getElementById('filter-date-start').value;
    const dateEnd = document.getElementById('filter-date-end').value;
    const city = document.getElementById('filter-city').value;
    const category = document.getElementById('filter-category').value;
    const paymentStatus = document.getElementById('filter-payment-status').value;
    const payoutStatus = document.getElementById('filter-payout-status').value;
    
    // Apply filters
    state.filteredRevenueJobs = state.revenueJobs.filter(job => {
        if (dateStart && new Date(job.completed_at) < new Date(dateStart)) return false;
        if (dateEnd && new Date(job.completed_at) > new Date(dateEnd)) return false;
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
    
    state.filteredRevenueJobs = [...state.revenueJobs];
    renderRevenueTable();
}

function sortTable(column) {
    // Sorting for payouts table
    if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
    }
    
    if (!state.payoutsData || !state.payoutsData.items) return;
    
    state.payoutsData.items.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (state.sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    renderPayoutsTable();
}

function sortRevenueTable(column) {
    if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
    }
    
    state.filteredRevenueJobs.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (state.sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    renderRevenueTable();
}

// ============================================================================
// BATCH PAYOUT ACTIONS
// ============================================================================

function handleJobSelection(jobId) {
    const checkbox = document.querySelector(`input[data-job-id="${jobId}"]`);
    
    if (checkbox.checked) {
        state.selectedJobs.add(jobId);
    } else {
        state.selectedJobs.delete(jobId);
    }
    
    updateBatchActions();
}

function toggleSelectAll() {
    const selectAll = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('.job-checkbox');
    
    checkboxes.forEach(cb => {
        cb.checked = selectAll.checked;
        const jobId = parseInt(cb.dataset.jobId);
        
        if (selectAll.checked) {
            state.selectedJobs.add(jobId);
        } else {
            state.selectedJobs.delete(jobId);
        }
    });
    
    updateBatchActions();
}

function updateBatchActions() {
    const batchActionsDiv = document.getElementById('batch-actions');
    const selectedCount = document.getElementById('selected-count');
    
    if (state.selectedJobs.size > 0) {
        batchActionsDiv.style.display = 'flex';
        selectedCount.textContent = state.selectedJobs.size;
    } else {
        batchActionsDiv.style.display = 'none';
    }
}

function clearSelection() {
    state.selectedJobs.clear();
    
    const checkboxes = document.querySelectorAll('.job-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    
    document.getElementById('select-all').checked = false;
    updateBatchActions();
}

async function batchProcessPayouts() {
    if (state.selectedJobs.size === 0) {
        console.warn('No jobs selected');
        return;
    }
    
    const confirmed = confirm(
        `Process payouts for ${state.selectedJobs.size} jobs?\n\n` +
        `This will mark these jobs as "processing" and generate audit logs.`
    );
    
    if (!confirmed) return;
    
    try {
        // Mock API call - replace with actual endpoint
        // POST /api/admin/payouts/batch-process
        await mockBatchProcessPayouts(Array.from(state.selectedJobs));
        
        // Log audit event
        await logAuditEvent('payout.processing_started', {
            job_ids: Array.from(state.selectedJobs),
            count: state.selectedJobs.size
        });
        
        console.log(`Successfully processed ${state.selectedJobs.size} payouts`);
        
        // Reload data
        await loadAllData();
        clearSelection();
        
    } catch (error) {
        console.error('Error processing payouts:', error);
        console.error('Failed to process payouts. Please try again.');
    }
}

// ============================================================================
// INDIVIDUAL PAYOUT ACTIONS
// ============================================================================

async function markPayoutReady(jobId) {
    try {
        // Mock API call - replace with actual endpoint
        // PATCH /api/jobs/:id/payout-status
        await mockUpdatePayoutStatus(jobId, 'ready');
        
        // Log audit event
        await logAuditEvent('payout.marked_ready', { job_id: jobId });
        
        // Reload data
        await loadAllData();
        
    } catch (error) {
        console.error('Error marking payout ready:', error);
        console.error('Failed to update payout status. Please try again.');
    }
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

function exportRevenueMTD() {
    const totals = calculateMTDTotals(state.filteredRevenueJobs);
    
    const headers = [
        'Job ID', 'Contractor Tier', 'City', 'Category', 'Final Price', 
        'Material Fees', 'Platform Fee', 'Platform Fee %',
        'Contractor Payout', 'Payment Status', 'Payout Status', 'Completed Date'
    ];
    
    const rows = state.filteredRevenueJobs.map(job => {
        const financials = calculateJobFinancials(
            job.final_price,
            job.material_fees || 0,
            job.contractor_tier || 'bronze'
        );
        return [
            job.job_id,
            financials.tierLabel,
            job.city,
            job.category,
            financials.finalPrice.toFixed(2),
            financials.materialFees.toFixed(2),
            financials.platformFee.toFixed(2),
            financials.platformFeePercent + '%',
            financials.contractorPayout.toFixed(2),
            job.payment_status,
            job.payout_status,
            job.completed_at
        ];
    });
    
    downloadCSV('revenue-mtd.csv', headers, rows);
}

function exportPayoutsPending() {
    if (!state.payoutsData || !state.payoutsData.items) {
        console.warn('No payouts data to export');
        return;
    }
    
    const headers = [
        'Job ID', 'Contractor', 'Tier', 'City', 'Category', 'Final Price',
        'Material Fees', 'Contractor Payout', 'Completed Date', 'Payment Status', 'Payout Status'
    ];
    
    const rows = state.payoutsData.items.map(job => [
        job.job_id,
        job.contractor,
        job.contractor_tier ? job.contractor_tier.toUpperCase() : 'BRONZE',
        job.city,
        job.category,
        job.final_price.toFixed(2),
        (job.material_fees || 0).toFixed(2),
        job.contractor_payout.toFixed(2),
        job.completed_at,
        job.payment_status,
        job.payout_status
    ]);
    
    downloadCSV('payouts-pending.csv', headers, rows);
}

function exportKPISnapshot() {
    const totals = calculateMTDTotals(state.revenueJobs);
    
    const data = [
        ['Metric', 'Value'],
        ['Gross Revenue (MTD)', formatCurrency(totals.grossRevenue)],
        ['Material Fees (MTD)', formatCurrency(totals.materialFees)],
        ['Platform Fees (MTD)', formatCurrency(totals.platformFees)],
        ['Contractor Payouts Owed (MTD)', formatCurrency(totals.contractorPayouts)],
        ['Net Platform Revenue (MTD)', formatCurrency(totals.netPlatformRevenue)],
        ['Completed Jobs (MTD)', totals.completedJobs],
        ['Average Job Value (MTD)', formatCurrency(totals.averageJobValue)],
        ['', ''],
        ['Tier Breakdown', ''],
        ['Bronze Jobs', totals.tierBreakdown.bronze.count],
        ['Bronze Revenue', formatCurrency(totals.tierBreakdown.bronze.revenue)],
        ['Silver Jobs', totals.tierBreakdown.silver.count],
        ['Silver Revenue', formatCurrency(totals.tierBreakdown.silver.revenue)],
        ['Gold Jobs', totals.tierBreakdown.gold.count],
        ['Gold Revenue', formatCurrency(totals.tierBreakdown.gold.revenue)],
        ['', ''],
        ['Payouts Pending', formatCurrency(state.payoutsData?.total_pending || 0)],
        ['Jobs Ready for Payout', state.payoutsData?.jobs_ready || 0],
        ['', ''],
        ['Export Date', new Date().toISOString()]
    ];
    
    downloadCSV('kpi-snapshot.csv', [], data);
}

function downloadCSV(filename, headers, rows) {
    let csv = '';
    
    if (headers.length > 0) {
        csv += headers.join(',') + '\n';
    }
    
    rows.forEach(row => {
        csv += row.map(cell => {
            // Escape cells containing commas or quotes
            if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
                return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
        }).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: CURRENCY,
        minimumFractionDigits: 2
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateFormat('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    console.error('Error:', message);
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

async function logAuditEvent(eventType, data) {
    try {
        // Mock API call - replace with actual endpoint
        // POST /api/audit
        await mockLogAudit(eventType, data);
    } catch (error) {
        console.error('Error logging audit event:', error);
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Auto-refresh every 60 seconds
    setInterval(async () => {
        await loadAllData();
    }, 60000);
}

// ============================================================================
// MOCK API FUNCTIONS (Replace with real API calls)
// ============================================================================

async function mockFetchMTDData(month) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
        month: month,
        gross_revenue: 25680.00,
        platform_fees: 3852.00,
        contractor_payouts: 21053.78,
        net_platform_revenue: 3852.00,
        completed_jobs: 42
    };
}

async function mockFetchPayoutsData() {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
        total_pending: 4200.50,
        jobs_ready: 8,
        contractors_count: 6,
        items: [
            {
                job_id: 1234,
                contractor: "John Doe",
                contractor_tier: "gold",
                city: "Toronto",
                category: "Plumbing",
                final_price: 450.00,
                material_fees: 85.00,
                contractor_payout: calculateJobFinancials(450.00, 85.00, 'gold').contractorPayout,
                completed_at: "2026-01-28",
                payment_status: "paid",
                payout_status: "ready"
            },
            {
                job_id: 1235,
                contractor: "Jane Smith",
                contractor_tier: "silver",
                city: "Vancouver",
                category: "Electrical",
                final_price: 680.00,
                material_fees: 120.00,
                contractor_payout: calculateJobFinancials(680.00, 120.00, 'silver').contractorPayout,
                completed_at: "2026-01-27",
                payment_status: "paid",
                payout_status: "ready"
            },
            {
                job_id: 1236,
                contractor: "Mike Johnson",
                contractor_tier: "bronze",
                city: "Toronto",
                category: "HVAC",
                final_price: 920.00,
                material_fees: 200.00,
                contractor_payout: calculateJobFinancials(920.00, 200.00, 'bronze').contractorPayout,
                completed_at: "2026-01-26",
                payment_status: "paid",
                payout_status: "processing"
            },
            {
                job_id: 1237,
                contractor: "Sarah Williams",
                contractor_tier: "silver",
                city: "Calgary",
                category: "Carpentry",
                final_price: 550.00,
                material_fees: 75.00,
                contractor_payout: calculateJobFinancials(550.00, 75.00, 'silver').contractorPayout,
                completed_at: "2026-01-25",
                payment_status: "unpaid",
                payout_status: "not_ready"
            },
            {
                job_id: 1238,
                contractor: "David Brown",
                contractor_tier: "gold",
                city: "Montreal",
                category: "Painting",
                final_price: 380.00,
                material_fees: 45.00,
                contractor_payout: calculateJobFinancials(380.00, 45.00, 'gold').contractorPayout,
                completed_at: "2026-01-24",
                payment_status: "paid",
                payout_status: "ready"
            }
        ]
    };
}

async function mockFetchRevenueJobs() {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate sample data with tiers and material fees
    const jobs = [];
    const cities = ["Toronto", "Vancouver", "Calgary", "Montreal", "Ottawa"];
    const categories = ["Plumbing", "Electrical", "HVAC", "Carpentry", "Painting"];
    const paymentStatuses = ["paid", "unpaid", "refunded"];
    const payoutStatuses = ["ready", "processing", "paid", "not_ready"];
    const tiers = ["bronze", "silver", "gold"];
    
    for (let i = 1; i <= 42; i++) {
        const finalPrice = Math.floor(Math.random() * 800) + 200;
        const materialFees = Math.floor(Math.random() * (finalPrice * 0.3)); // 0-30% of final price
        const completedDate = new Date(2026, 0, Math.floor(Math.random() * 30) + 1);
        const tier = tiers[Math.floor(Math.random() * tiers.length)];
        
        jobs.push({
            job_id: 1200 + i,
            city: cities[Math.floor(Math.random() * cities.length)],
            category: categories[Math.floor(Math.random() * categories.length)],
            final_price: finalPrice,
            material_fees: materialFees,
            contractor_tier: tier,
            completed_at: completedDate.toISOString().split('T')[0],
            payment_status: paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)],
            payout_status: payoutStatuses[Math.floor(Math.random() * payoutStatuses.length)],
            contractor_id: Math.floor(Math.random() * 20) + 1
        });
    }
    
    return jobs.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
}

async function mockUpdatePayoutStatus(jobId, status) {
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log(`Updated job ${jobId} payout status to ${status}`);
    return { success: true };
}

async function mockBatchProcessPayouts(jobIds) {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`Batch processed payouts for jobs:`, jobIds);
    return { success: true, processed: jobIds.length };
}

async function mockLogAudit(eventType, data) {
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`Audit log: ${eventType}`, data);
    return { success: true };
}
