/**
 * Admin Metrics Manager - Shared data and state across admin pages
 */

const AdminMetrics = (() => {
  const STORAGE_KEY = 'admin_metrics_cache';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Local cache for metrics
  let metricsCache = {
    dashboard: {},
    jobs: {},
    contractors: {},
    revenue: {},
    payouts: {},
    lastUpdated: {}
  };

  // Load from localStorage on initialization
  function initCache() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        metricsCache = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load metrics cache:', e);
    }
  }

  // Save to localStorage
  function saveCache() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(metricsCache));
    } catch (e) {
      console.warn('Failed to save metrics cache:', e);
    }
  }

  // Check if data is stale
  function isStale(key) {
    const lastUpdate = metricsCache.lastUpdated[key];
    if (!lastUpdate) return true;
    return Date.now() - new Date(lastUpdate).getTime() > CACHE_TTL;
  }

  // Get metrics with fallback to API
  async function getMetrics(endpoint, key, transform = null) {
    try {
      // Return cached data if fresh
      if (!isStale(key) && metricsCache[key] && Object.keys(metricsCache[key]).length > 0) {
        return metricsCache[key];
      }

      // Fetch from API
      const response = await api.get(endpoint);
      const data = transform ? transform(response) : response;

      // Update cache
      metricsCache[key] = data;
      metricsCache.lastUpdated[key] = new Date().toISOString();
      saveCache();

      return data;
    } catch (error) {
      console.error(`Error fetching metrics from ${endpoint}:`, error);
      // Return cached data even if stale
      return metricsCache[key] || {};
    }
  }

  // Dashboard metrics
  async function getDashboardMetrics() {
    return getMetrics(
      '/admin/dashboard',
      'dashboard',
      (response) => ({
        stats: response.stats || {},
        activeJobs: response.stats?.active_jobs || 0,
        pendingJobs: response.stats?.pending_jobs || 0,
        approvedContractors: response.stats?.approved_contractors || 0,
        pendingContractors: response.stats?.pending_contractors || 0,
        totalRevenue: response.stats?.total_revenue || 0,
        platformFees: response.stats?.platform_fees || 0
      })
    );
  }

  // Jobs metrics
  async function getJobsMetrics() {
    return getMetrics(
      '/admin/jobs',
      'jobs',
      (response) => ({
        jobs: response.jobs || [],
        totalJobs: (response.jobs || []).length,
        activeJobs: (response.jobs || []).filter(j => ['assigned', 'in_progress', 'on_site'].includes(j.status)).length,
        pendingJobs: (response.jobs || []).filter(j => j.status === 'pending').length,
        completedJobs: (response.jobs || []).filter(j => j.status === 'completed').length,
        cancelledJobs: (response.jobs || []).filter(j => j.status === 'cancelled').length
      })
    );
  }

  // Contractors metrics
  async function getContractorsMetrics() {
    return getMetrics(
      '/admin/contractors',
      'contractors',
      (response) => ({
        contractors: response.contractors || [],
        totalContractors: (response.contractors || []).length,
        approvedContractors: (response.contractors || []).filter(c => c.vetting_status === 'APPROVED_ACTIVE').length,
        pendingContractors: (response.contractors || []).filter(c => c.vetting_status === 'PENDING').length,
        activeContractors: (response.contractors || []).filter(c => c.status === 'approved').length
      })
    );
  }

  // Revenue metrics
  async function getRevenueMetrics() {
    return getMetrics(
      '/admin/revenue',
      'revenue',
      (response) => ({
        totalRevenue: response.totalRevenue || 0,
        platformFees: response.platformFees || 0,
        contractorPayments: response.contractorPayments || 0,
        netRevenue: (response.totalRevenue || 0) - (response.contractorPayments || 0),
        monthlyBreakdown: response.monthlyBreakdown || {}
      })
    );
  }

  // Payouts metrics
  async function getPayoutsMetrics() {
    return getMetrics(
      '/admin/payouts',
      'payouts',
      (response) => ({
        totalPending: response.totalPending || 0,
        totalProcessed: response.totalProcessed || 0,
        failedPayouts: response.failedPayouts || 0,
        upcomingPayouts: response.upcomingPayouts || []
      })
    );
  }

  // Update specific page metrics
  function updatePageMetrics(pageKey, data) {
    metricsCache[pageKey] = data;
    metricsCache.lastUpdated[pageKey] = new Date().toISOString();
    saveCache();
    
    // Dispatch event for other pages to listen to
    window.dispatchEvent(new CustomEvent('adminMetricsUpdated', {
      detail: { page: pageKey, data }
    }));
  }

  // Clear specific cache or all
  function clearCache(key = null) {
    if (key) {
      metricsCache[key] = {};
      delete metricsCache.lastUpdated[key];
    } else {
      metricsCache = {
        dashboard: {},
        jobs: {},
        contractors: {},
        revenue: {},
        payouts: {},
        lastUpdated: {}
      };
    }
    saveCache();
  }

  // Format number as currency
  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value || 0);
  }

  // Format number with commas
  function formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(value || 0);
  }

  // Format percentage
  function formatPercent(value, decimals = 1) {
    return (value || 0).toFixed(decimals) + '%';
  }

  // Get change indicator (positive/negative)
  function getChangeClass(current, previous) {
    if (!previous || previous === 0) return 'neutral';
    return current > previous ? 'positive' : current < previous ? 'negative' : 'neutral';
  }

  // Get change percentage
  function getChangePercent(current, previous) {
    if (!previous || previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  // Render KPI card
  function renderKpiCard(container, value, label, change = null, format = 'number') {
    let formattedValue = value;
    if (format === 'currency') {
      formattedValue = formatCurrency(value);
    } else if (format === 'number') {
      formattedValue = formatNumber(value);
    } else if (format === 'percent') {
      formattedValue = formatPercent(value);
    }

    let changeHtml = '';
    if (change !== null && change !== undefined) {
      const changeClass = change >= 0 ? 'positive' : 'negative';
      const changeSymbol = change >= 0 ? '↑' : '↓';
      changeHtml = `<div class="admin-kpi-change ${changeClass}">${changeSymbol} ${Math.abs(change)}% vs prev</div>`;
    }

    container.innerHTML = `
      <div class="admin-kpi-value">${formattedValue}</div>
      <div class="admin-kpi-label">${label}</div>
      ${changeHtml}
    `;
  }

  // Listen for metric updates from other pages
  function onMetricsUpdate(callback) {
    window.addEventListener('adminMetricsUpdated', (event) => {
      callback(event.detail.page, event.detail.data);
    });
  }

  // Initialize on load
  initCache();

  // Public API
  return {
    getDashboardMetrics,
    getJobsMetrics,
    getContractorsMetrics,
    getRevenueMetrics,
    getPayoutsMetrics,
    updatePageMetrics,
    clearCache,
    formatCurrency,
    formatNumber,
    formatPercent,
    getChangeClass,
    getChangePercent,
    renderKpiCard,
    onMetricsUpdate
  };
})();
