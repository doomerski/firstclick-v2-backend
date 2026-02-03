// admin-payouts.js
// Contractor Payouts Management System

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

const PAYMENT_SCHEDULES = {
    'per-job': {
        label: 'Pay Per Job',
        description: 'Immediate payment after each completed job',
        frequency: 'immediate'
    },
    'weekly': {
        label: 'Weekly',
        description: 'Every Friday',
        frequency: 'weekly'
    },
    'biweekly': {
        label: 'Bi-Weekly',
        description: 'Every other Friday',
        frequency: 'biweekly'
    },
    'monthly': {
        label: 'Monthly',
        description: 'Last day of each month',
        frequency: 'monthly'
    }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let state = {
    contractors: [],
    filteredContractors: [],
    currentFilter: 'all',
    selectedContractor: null,
    selectedContractorId: null
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    initializeCurrentDate();
    await loadAllData();
});

function initializeCurrentDate() {
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('en-CA', options);
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadAllData() {
    try {
        await loadContractorPayouts();
        renderAll();
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load payout data. Please refresh the page.');
    }
}

async function loadContractorPayouts() {
    // Mock API call - replace with actual endpoint
    // GET /api/admin/contractors/payouts
    
    try {
        state.contractors = await mockFetchContractorPayouts();
        state.filteredContractors = [...state.contractors];
    } catch (error) {
        console.error('Error loading contractor payouts:', error);
        throw error;
    }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderAll() {
    renderSummary();
    renderContractors();
    updateBadges();
}

function renderSummary() {
    const totals = calculateTotals();
    
    const summaryHTML = `
        <div class="summary-card">
            <div class="summary-label">Total Pending Payouts</div>
            <div class="summary-value money-positive">${formatCurrency(totals.totalPending)}</div>
            <div class="summary-subtitle">Across all contractors</div>
        </div>
        
        <div class="summary-card">
            <div class="summary-label">Contractors with Pending</div>
            <div class="summary-value">${totals.contractorsWithPending}</div>
            <div class="summary-subtitle">Ready to be paid</div>
        </div>
        
        <div class="summary-card">
            <div class="summary-label">Total Jobs Pending</div>
            <div class="summary-value">${totals.totalJobs}</div>
            <div class="summary-subtitle">Completed & ready</div>
        </div>
        
        <div class="summary-card">
            <div class="summary-label">Scheduled This Week</div>
            <div class="summary-value money-positive">${formatCurrency(totals.scheduledThisWeek)}</div>
            <div class="summary-subtitle">${totals.contractorsScheduledThisWeek} contractors</div>
        </div>
    `;
    
    document.getElementById('summary-grid').innerHTML = summaryHTML;
}

function renderContractors() {
    if (!state.filteredContractors || state.filteredContractors.length === 0) {
        document.getElementById('contractor-grid').innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--slate-400);">
                No contractors found matching the current filter.
            </div>
        `;
        return;
    }
    
    const contractorsHTML = state.filteredContractors.map(contractor => {
        const pendingJobs = contractor.jobs.filter(j => j.payout_status === 'ready');
        const totalPending = pendingJobs.reduce((sum, job) => sum + job.contractor_payout, 0);
        const tierInfo = CONTRACTOR_TIERS[contractor.contractor_tier || 'bronze'];
        
        return `
            <div class="contractor-card" data-contractor-id="${contractor.contractor_id}">
                <div class="contractor-header">
                    <div class="contractor-info">
                        <div class="contractor-name">${escapeHtml(contractor.name)}</div>
                        <div class="contractor-meta">
                            <span>ID: ${contractor.contractor_id}</span>
                            <span>•</span>
                            <span>${escapeHtml(contractor.email)}</span>
                            <span>•</span>
                            <span>${escapeHtml(contractor.phone)}</span>
                        </div>
                        <div class="contractor-meta" style="margin-top: 0.5rem;">
                            <span class="${getScheduleBadgeClass(contractor.payment_schedule)}">
                                ${PAYMENT_SCHEDULES[contractor.payment_schedule].label}
                            </span>
                            <span>•</span>
                            <span style="background: ${tierInfo.color}20; color: ${tierInfo.color}; padding: 0.25rem 0.75rem; border-radius: 4px; border: 1px solid ${tierInfo.color};">
                                ${tierInfo.label.toUpperCase()} TIER (${tierInfo.platformFee * 100}% fee)
                            </span>
                            <span>•</span>
                            <span>${pendingJobs.length} jobs pending</span>
                        </div>
                    </div>
                    <div class="contractor-amount">
                        <div class="amount-label">Amount Owed</div>
                        <div class="amount-value">${formatCurrency(totalPending)}</div>
                    </div>
                </div>
                
                ${renderPaymentSettings(contractor)}
                
                <div class="jobs-section">
                    <div class="jobs-header">
                        <div class="jobs-title">Pending Jobs</div>
                        <div class="jobs-count">${pendingJobs.length} ${pendingJobs.length === 1 ? 'job' : 'jobs'}</div>
                    </div>
                    
                    ${renderJobsTable(pendingJobs)}
                </div>
                
                <div class="action-buttons">
                    <button class="btn btn-primary" 
                            onclick="openPaymentModal(${contractor.contractor_id})"
                            ${totalPending === 0 ? 'disabled' : ''}>
                        💰 Process Payment (${formatCurrency(totalPending)})
                    </button>
                    <button class="btn btn-outline" 
                            onclick="openSettingsModal(${contractor.contractor_id})">
                        ⚙️ Payment Settings
                    </button>
                    <button class="btn btn-outline" 
                            onclick="viewContractorHistory(${contractor.contractor_id})">
                        📊 View History
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('contractor-grid').innerHTML = contractorsHTML;
}

function renderPaymentSettings(contractor) {
    const schedule = PAYMENT_SCHEDULES[contractor.payment_schedule];
    const nextPaymentDate = calculateNextPaymentDate(contractor.payment_schedule);
    
    return `
        <div class="payment-settings">
            <span class="setting-label">Payment Schedule:</span>
            <span style="color: var(--slate-200); font-family: var(--font-mono); font-size: 0.875rem;">
                ${schedule.label} - ${schedule.description}
            </span>
            ${contractor.payment_schedule !== 'per-job' ? `
                <span style="color: var(--slate-500); font-size: 0.875rem;">
                    • Next: ${formatDate(nextPaymentDate)}
                </span>
            ` : ''}
        </div>
    `;
}

function renderJobsTable(jobs) {
    if (jobs.length === 0) {
        return `
            <div style="text-align: center; padding: 2rem; color: var(--slate-400); font-size: 0.875rem;">
                No pending jobs
            </div>
        `;
    }
    
    const rows = jobs.map(job => `
        <tr>
            <td><span class="money">#${job.job_id}</span></td>
            <td>${escapeHtml(job.city)} / ${escapeHtml(job.category)}</td>
            <td class="money money-positive">${formatCurrency(job.contractor_payout)}</td>
            <td>${formatDate(job.completed_at)}</td>
            <td><span class="status-badge status-${job.payout_status}">${job.payout_status}</span></td>
        </tr>
    `).join('');
    
    return `
        <table class="jobs-table">
            <thead>
                <tr>
                    <th>Job ID</th>
                    <th>Location / Category</th>
                    <th>Payout Amount</th>
                    <th>Completed</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

function updateBadges() {
    const totals = calculateTotals();
    document.getElementById('overview-badge').textContent = `${totals.contractorsWithPending} CONTRACTORS`;
    document.getElementById('contractors-badge').textContent = `${state.filteredContractors.length} SHOWING`;
}

// ============================================================================
// CALCULATIONS
// ============================================================================

function calculateTotals() {
    let totalPending = 0;
    let contractorsWithPending = 0;
    let totalJobs = 0;
    let scheduledThisWeek = 0;
    let contractorsScheduledThisWeek = 0;
    
    const today = new Date();
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay())); // Next Sunday
    
    state.contractors.forEach(contractor => {
        const pendingJobs = contractor.jobs.filter(j => j.payout_status === 'ready');
        const pending = pendingJobs.reduce((sum, job) => sum + job.contractor_payout, 0);
        
        if (pending > 0) {
            totalPending += pending;
            contractorsWithPending++;
            totalJobs += pendingJobs.length;
            
            // Check if scheduled for this week
            const nextPayment = calculateNextPaymentDate(contractor.payment_schedule);
            if (nextPayment <= endOfWeek) {
                scheduledThisWeek += pending;
                contractorsScheduledThisWeek++;
            }
        }
    });
    
    return {
        totalPending,
        contractorsWithPending,
        totalJobs,
        scheduledThisWeek,
        contractorsScheduledThisWeek
    };
}

function calculateNextPaymentDate(schedule) {
    const today = new Date();
    
    switch (schedule) {
        case 'per-job':
            return today;
        
        case 'weekly':
            // Next Friday
            const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
            const nextFriday = new Date(today);
            nextFriday.setDate(today.getDate() + daysUntilFriday);
            return nextFriday;
        
        case 'biweekly':
            // Next bi-weekly Friday (simplified - would need to track actual schedule)
            const daysUntilBiweekly = (5 - today.getDay() + 7) % 7 || 7;
            const nextBiweekly = new Date(today);
            nextBiweekly.setDate(today.getDate() + daysUntilBiweekly);
            return nextBiweekly;
        
        case 'monthly':
            // Last day of current month
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            return lastDay;
        
        default:
            return today;
    }
}

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
    
    return {
        finalPrice: price,
        materialFees: materials,
        netAmount: netAmount,
        platformFee: platformFee,
        contractorPayout: contractorPayout
    };
}

// ============================================================================
// FILTERING
// ============================================================================

function filterContractors(filterType) {
    state.currentFilter = filterType;
    
    // Update filter button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filterType) {
            btn.classList.add('active');
        }
    });
    
    // Apply filter
    if (filterType === 'all') {
        state.filteredContractors = [...state.contractors];
    } else if (filterType === 'ready') {
        state.filteredContractors = state.contractors.filter(c => {
            const pending = c.jobs.filter(j => j.payout_status === 'ready');
            return pending.length > 0;
        });
    } else {
        // Filter by payment schedule
        state.filteredContractors = state.contractors.filter(c => 
            c.payment_schedule === filterType
        );
    }
    
    renderContractors();
    updateBadges();
}

// ============================================================================
// PAYMENT MODAL
// ============================================================================

function openPaymentModal(contractorId) {
    const contractor = state.contractors.find(c => c.contractor_id === contractorId);
    if (!contractor) return;
    
    state.selectedContractor = contractor;
    state.selectedContractorId = contractorId;
    
    const pendingJobs = contractor.jobs.filter(j => j.payout_status === 'ready');
    const totalAmount = pendingJobs.reduce((sum, job) => sum + job.contractor_payout, 0);
    
    document.getElementById('modal-contractor-name').textContent = contractor.name;
    document.getElementById('modal-amount').textContent = formatCurrency(totalAmount);
    document.getElementById('modal-jobs').textContent = `${pendingJobs.length} ${pendingJobs.length === 1 ? 'job' : 'jobs'}`;
    document.getElementById('modal-schedule').textContent = PAYMENT_SCHEDULES[contractor.payment_schedule].label;
    
    document.getElementById('payment-modal').classList.add('active');
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.remove('active');
    state.selectedContractor = null;
    state.selectedContractorId = null;
}

async function confirmPayment() {
    if (!state.selectedContractor) return;
    
    const contractor = state.selectedContractor;
    const pendingJobs = contractor.jobs.filter(j => j.payout_status === 'ready');
    const totalAmount = pendingJobs.reduce((sum, job) => sum + job.contractor_payout, 0);
    
    try {
        // Mock payment processing - replace with actual API call
        // POST /api/admin/payouts/process
        await mockProcessPayment({
            contractor_id: contractor.contractor_id,
            amount: totalAmount,
            job_ids: pendingJobs.map(j => j.job_id),
            payment_schedule: contractor.payment_schedule
        });
        
        // Show success message
        console.log(`Payment processed successfully! Contractor: ${contractor.name}, Amount: ${formatCurrency(totalAmount)}, Jobs: ${pendingJobs.length}`);
        
        // Close modal
        closePaymentModal();
        
        // Reload data
        await loadAllData();
        
    } catch (error) {
        console.error('Error processing payment:', error);
        console.error('Failed to process payment. Please try again or contact support.');
    }
}

// ============================================================================
// SETTINGS MODAL
// ============================================================================

function openSettingsModal(contractorId) {
    const contractor = state.contractors.find(c => c.contractor_id === contractorId);
    if (!contractor) return;
    
    state.selectedContractor = contractor;
    state.selectedContractorId = contractorId;
    
    document.getElementById('settings-contractor-name').textContent = contractor.name;
    document.getElementById('settings-schedule').value = contractor.payment_schedule;
    
    document.getElementById('settings-modal').classList.add('active');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.remove('active');
    state.selectedContractor = null;
    state.selectedContractorId = null;
}

async function saveSettings() {
    if (!state.selectedContractor) return;
    
    const newSchedule = document.getElementById('settings-schedule').value;
    const contractor = state.selectedContractor;
    
    try {
        // Mock API call - replace with actual endpoint
        // PATCH /api/admin/contractors/:id/payment-schedule
        await mockUpdatePaymentSchedule(contractor.contractor_id, newSchedule);
        
        // Update local state
        contractor.payment_schedule = newSchedule;
        
        // Show success message
        console.log(`Payment schedule updated successfully! Contractor: ${contractor.name}, New Schedule: ${PAYMENT_SCHEDULES[newSchedule].label}`);
        
        // Close modal and re-render
        closeSettingsModal();
        renderAll();
        
    } catch (error) {
        console.error('Error updating payment schedule:', error);
        console.error('Failed to update payment schedule. Please try again.');
    }
}

// ============================================================================
// ADDITIONAL ACTIONS
// ============================================================================

function viewContractorHistory(contractorId) {
    const contractor = state.contractors.find(c => c.contractor_id === contractorId);
    if (!contractor) return;
    
    // This would navigate to a detailed history page
    console.log(`Payment History for Contractor: ${contractor.name}`);
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

function getScheduleBadgeClass(schedule) {
    const classMap = {
        'per-job': 'schedule-badge schedule-per-job',
        'weekly': 'schedule-badge schedule-weekly',
        'biweekly': 'schedule-badge schedule-biweekly',
        'monthly': 'schedule-badge schedule-monthly'
    };
    return classMap[schedule] || 'schedule-badge';
}

// ============================================================================
// MOCK API FUNCTIONS (Replace with real API calls)
// ============================================================================

async function mockFetchContractorPayouts() {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return [
        {
            contractor_id: 1,
            name: "John Doe",
            email: "john.doe@example.com",
            phone: "(416) 555-0123",
            payment_schedule: "weekly",
            contractor_tier: "gold",
            jobs: [
                {
                    job_id: 1234,
                    city: "Toronto",
                    category: "Plumbing",
                    final_price: 450.00,
                    material_fees: 85.00,
                    contractor_payout: calculateJobFinancials(450.00, 85.00, 'gold').contractorPayout,
                    completed_at: "2026-01-28",
                    payout_status: "ready"
                },
                {
                    job_id: 1235,
                    city: "Toronto",
                    category: "HVAC",
                    final_price: 920.00,
                    material_fees: 200.00,
                    contractor_payout: calculateJobFinancials(920.00, 200.00, 'gold').contractorPayout,
                    completed_at: "2026-01-27",
                    payout_status: "ready"
                },
                {
                    job_id: 1220,
                    city: "Mississauga",
                    category: "Plumbing",
                    final_price: 380.00,
                    material_fees: 60.00,
                    contractor_payout: calculateJobFinancials(380.00, 60.00, 'gold').contractorPayout,
                    completed_at: "2026-01-15",
                    payout_status: "paid"
                }
            ]
        },
        {
            contractor_id: 2,
            name: "Jane Smith",
            email: "jane.smith@example.com",
            phone: "(604) 555-0456",
            payment_schedule: "biweekly",
            contractor_tier: "silver",
            jobs: [
                {
                    job_id: 1236,
                    city: "Vancouver",
                    category: "Electrical",
                    final_price: 680.00,
                    material_fees: 120.00,
                    contractor_payout: calculateJobFinancials(680.00, 120.00, 'silver').contractorPayout,
                    completed_at: "2026-01-26",
                    payout_status: "ready"
                },
                {
                    job_id: 1237,
                    city: "Burnaby",
                    category: "Electrical",
                    final_price: 550.00,
                    material_fees: 95.00,
                    contractor_payout: calculateJobFinancials(550.00, 95.00, 'silver').contractorPayout,
                    completed_at: "2026-01-25",
                    payout_status: "ready"
                }
            ]
        },
        {
            contractor_id: 3,
            name: "Mike Johnson",
            email: "mike.johnson@example.com",
            phone: "(403) 555-0789",
            payment_schedule: "per-job",
            contractor_tier: "bronze",
            jobs: [
                {
                    job_id: 1238,
                    city: "Calgary",
                    category: "Carpentry",
                    final_price: 750.00,
                    material_fees: 150.00,
                    contractor_payout: calculateJobFinancials(750.00, 150.00, 'bronze').contractorPayout,
                    completed_at: "2026-01-30",
                    payout_status: "ready"
                }
            ]
        },
        {
            contractor_id: 4,
            name: "Sarah Williams",
            email: "sarah.williams@example.com",
            phone: "(514) 555-0321",
            payment_schedule: "monthly",
            contractor_tier: "silver",
            jobs: [
                {
                    job_id: 1239,
                    city: "Montreal",
                    category: "Painting",
                    final_price: 380.00,
                    material_fees: 45.00,
                    contractor_payout: calculateJobFinancials(380.00, 45.00, 'silver').contractorPayout,
                    completed_at: "2026-01-24",
                    payout_status: "ready"
                },
                {
                    job_id: 1240,
                    city: "Montreal",
                    category: "Painting",
                    final_price: 520.00,
                    material_fees: 70.00,
                    contractor_payout: calculateJobFinancials(520.00, 70.00, 'silver').contractorPayout,
                    completed_at: "2026-01-22",
                    payout_status: "ready"
                },
                {
                    job_id: 1241,
                    city: "Laval",
                    category: "Drywall",
                    final_price: 680.00,
                    material_fees: 120.00,
                    contractor_payout: calculateJobFinancials(680.00, 120.00, 'silver').contractorPayout,
                    completed_at: "2026-01-20",
                    payout_status: "ready"
                }
            ]
        },
        {
            contractor_id: 5,
            name: "David Brown",
            email: "david.brown@example.com",
            phone: "(613) 555-0654",
            payment_schedule: "weekly",
            contractor_tier: "gold",
            jobs: [
                {
                    job_id: 1242,
                    city: "Ottawa",
                    category: "HVAC",
                    final_price: 850.00,
                    material_fees: 180.00,
                    contractor_payout: calculateJobFinancials(850.00, 180.00, 'gold').contractorPayout,
                    completed_at: "2026-01-29",
                    payout_status: "ready"
                }
            ]
        },
        {
            contractor_id: 6,
            name: "Emily Davis",
            email: "emily.davis@example.com",
            phone: "(416) 555-0987",
            payment_schedule: "per-job",
            contractor_tier: "bronze",
            jobs: [
                {
                    job_id: 1243,
                    city: "Toronto",
                    category: "Electrical",
                    final_price: 620.00,
                    material_fees: 110.00,
                    contractor_payout: calculateJobFinancials(620.00, 110.00, 'bronze').contractorPayout,
                    completed_at: "2026-01-31",
                    payout_status: "ready"
                },
                {
                    job_id: 1244,
                    city: "North York",
                    category: "Electrical",
                    final_price: 450.00,
                    material_fees: 75.00,
                    contractor_payout: calculateJobFinancials(450.00, 75.00, 'bronze').contractorPayout,
                    completed_at: "2026-01-30",
                    payout_status: "ready"
                }
            ]
        },
        {
            contractor_id: 7,
            name: "Robert Taylor",
            email: "robert.taylor@example.com",
            phone: "(604) 555-0123",
            payment_schedule: "biweekly",
            contractor_tier: "silver",
            jobs: []
        },
        {
            contractor_id: 8,
            name: "Lisa Anderson",
            email: "lisa.anderson@example.com",
            phone: "(403) 555-0456",
            payment_schedule: "monthly",
            contractor_tier: "bronze",
            jobs: [
                {
                    job_id: 1245,
                    city: "Calgary",
                    category: "Plumbing",
                    final_price: 540.00,
                    material_fees: 85.00,
                    contractor_payout: calculateJobFinancials(540.00, 85.00, 'bronze').contractorPayout,
                    completed_at: "2026-01-18",
                    payout_status: "ready"
                }
            ]
        }
    ];
}

async function mockProcessPayment(paymentData) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Processing payment:', paymentData);
    
    // Simulate successful payment
    return {
        success: true,
        payment_id: Math.floor(Math.random() * 100000),
        contractor_id: paymentData.contractor_id,
        amount: paymentData.amount,
        processed_at: new Date().toISOString(),
        job_ids: paymentData.job_ids
    };
}

async function mockUpdatePaymentSchedule(contractorId, schedule) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`Updated contractor ${contractorId} payment schedule to ${schedule}`);
    
    return {
        success: true,
        contractor_id: contractorId,
        payment_schedule: schedule
    };
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Close modals when clicking outside
document.getElementById('payment-modal').addEventListener('click', (e) => {
    if (e.target.id === 'payment-modal') {
        closePaymentModal();
    }
});

document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') {
        closeSettingsModal();
    }
});

// Auto-refresh every 60 seconds
setInterval(async () => {
    await loadAllData();
}, 60000);
