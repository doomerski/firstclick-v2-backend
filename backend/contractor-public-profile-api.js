// API Configuration for Public Contractor Profile
// Connects to your real backend server.js endpoints

const API_BASE_URL = 'http://localhost:3000/api'; // Change to your production URL

// Public API Helper
const profileApi = {
  async get(endpoint) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }
};

// ============================================================================
// NEW: Enhanced API Wrapper for Public Profiles
// ============================================================================
const ContractorPublicProfileAPI = {
  /**
   * Get public profile for a specific contractor
   * @param {string} contractorId - The contractor ID
   * @returns {Promise<Object>} Contractor public profile
   */
  async getProfileById(contractorId) {
    try {
      console.log(`📞 Fetching profile for contractor ${contractorId}...`);
      const response = await fetch(`${API_BASE_URL}/admin/contractors/${contractorId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.contractor) {
        throw new Error('Contractor not found');
      }

      // Check if contractor is approved for public viewing
      const contractor = data.contractor;
      if (contractor.vetting_status !== 'APPROVED_ACTIVE' && contractor.status !== 'approved') {
        throw new Error('Contractor profile not available');
      }

      console.log(`✅ Loaded profile for ${contractorId}`);
      return data;
    } catch (error) {
      console.error(`❌ Error fetching profile:`, error);
      throw error;
    }
  },

  /**
   * Get contractor reviews/ratings
   * @param {string} contractorId - The contractor ID
   * @returns {Promise<Object>} Reviews data
   */
  async getReviews(contractorId) {
    try {
      const response = await fetch(`${API_BASE_URL}/contractors/${contractorId}/reviews`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { reviews: [], averageRating: 0, totalReviews: 0 };
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Fetched reviews for ${contractorId}`);
      return data;
    } catch (error) {
      console.error(`❌ Error fetching reviews:`, error);
      return { reviews: [], averageRating: 0, totalReviews: 0 };
    }
  },

  /**
   * Submit a review for a contractor
   * @param {string} contractorId - The contractor ID
   * @param {Object} reviewData - Review information
   * @returns {Promise<Object>} Created review
   */
  async submitReview(contractorId, reviewData) {
    try {
      const payload = {
        rating: reviewData.rating || 5,
        comment: reviewData.comment || '',
        jobId: reviewData.jobId || null
      };

      const response = await fetch(`${API_BASE_URL}/contractors/${contractorId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._getToken()}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Review submitted for ${contractorId}`);
      return data;
    } catch (error) {
      console.error(`❌ Error submitting review:`, error);
      throw error;
    }
  },

  /**
   * Get contractor portfolio/completed jobs
   * @param {string} contractorId - The contractor ID
   * @returns {Promise<Object>} Portfolio data
   */
  async getPortfolio(contractorId) {
    try {
      const response = await fetch(`${API_BASE_URL}/contractors/${contractorId}/portfolio`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 404) {
        return { portfolio: [] };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ Error fetching portfolio:`, error);
      return { portfolio: [] };
    }
  },

  _getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  },

  setApiBaseUrl(newUrl) {
    window.API_BASE_URL = newUrl;
    console.log(`✅ API Base URL updated to: ${newUrl}`);
  }
};

console.log('✅ Contractor Public Profile API loaded - use ContractorPublicProfileAPI.* or profileApi.* for requests');

// ============================================================================
// End of Enhanced API Wrapper
// ============================================================================

// Get contractor ID from URL
const params = new URLSearchParams(window.location.search);
const contractorId = params.get('id');

// Trade name mapping
const tradeNames = {
  'plumbing': 'Plumbing',
  'electrical': 'Electrical',
  'hvac': 'HVAC',
  'appliance_repair': 'Appliance Repair',
  'appliance-repair': 'Appliance Repair',
  'construction': 'Construction & Renovation',
  'construction-renovation': 'Construction & Renovation',
  'roofing': 'Roofing & Exterior',
  'roofing-exterior': 'Roofing & Exterior',
  'landscaping': 'Outdoor & Property Services',
  'outdoor-property': 'Outdoor & Property Services',
  'security': 'Security & Smart Systems',
  'security-smart': 'Security & Smart Systems',
  'cleaning': 'Cleaning & Restoration',
  'cleaning-restoration': 'Cleaning & Restoration',
  'pest_control': 'Pest & Wildlife Control',
  'pest-wildlife': 'Pest & Wildlife Control',
  'moving': 'Moving & Junk Removal',
  'moving-junk': 'Moving & Junk Removal',
  'handyman': 'Handyman & Specialty',
  'handyman-specialty': 'Handyman & Specialty'
};

// Load contractor profile from real API
async function loadContractor() {
  if (!contractorId) {
    console.error('No contractor ID provided');
    window.location.href = 'contractor-directory.html';
    return;
  }

  try {
    // Call the real API endpoint: GET /api/admin/contractors/:contractorId
    const response = await profileApi.get(`/admin/contractors/${contractorId}`);
    const contractor = response.contractor;
    
    if (!contractor) {
      throw new Error('Contractor not found');
    }

    // Check if contractor is approved for public viewing
    if (contractor.vetting_status !== 'APPROVED_ACTIVE' && contractor.status !== 'approved') {
      throw new Error('Contractor profile not available');
    }

    renderContractor(contractor);
    
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('profileContent').style.display = 'block';
  } catch (error) {
    console.error('Error loading contractor:', error);
    notify.error('Error loading contractor profile: ' + error.message);
    window.location.href = 'contractor-directory.html';
  }
}

// Render contractor profile with real data
function renderContractor(contractor) {
  // Get contractor details with fallbacks for different field names
  const legalName = contractor.legal_name || contractor.legalName || 'Contractor';
  const businessName = contractor.business_name || contractor.businessName || 'Independent Contractor';
  const email = contractor.email || 'Not provided';
  const phone = contractor.phone || 'Not provided';
  const primaryTrade = contractor.primary_trade || contractor.primaryTrade || 'general';
  const experienceYears = contractor.experience_years || contractor.experienceYears || 0;
  
  // Header
  document.getElementById('contractorName').textContent = legalName;
  document.getElementById('businessName').textContent = businessName;
  document.getElementById('contractorEmail').textContent = email;
  document.getElementById('contractorPhone').textContent = phone;

  // Stats
  document.getElementById('experienceYears').textContent = experienceYears;
  
  // You can fetch job stats from the API if available
  // For now, we'll use placeholder or data from contractor object
  document.getElementById('completedJobs').textContent = contractor.completed_jobs || '0';
  document.getElementById('rating').textContent = contractor.rating ? contractor.rating.toFixed(1) : '5.0';

  // Bio - use from database or create default
  const bio = contractor.bio || 
    `Professional ${tradeNames[primaryTrade] || 'contractor'} with ${experienceYears} years of experience. ` +
    `Licensed and verified through the FirstClick platform.`;
  document.getElementById('contractorBio').textContent = bio;

  // Trades
  const tradesList = document.getElementById('tradesList');
  const tradeName = tradeNames[primaryTrade] || primaryTrade;
  tradesList.innerHTML = `<span class="trade-badge">${tradeName}</span>`;
  
  // Add secondary trades if available
  const secondaryTrades = contractor.secondary_trades || contractor.secondaryTrades || [];
  if (Array.isArray(secondaryTrades) && secondaryTrades.length > 0) {
    secondaryTrades.forEach(trade => {
      const secTradeName = tradeNames[trade] || trade;
      tradesList.innerHTML += `<span class="trade-badge">${secTradeName}</span>`;
    });
  }

  // Services - you can enhance this based on service_types in your database
  const servicesList = document.getElementById('servicesList');
  const services = contractor.services || [];
  
  if (services.length > 0) {
    servicesList.innerHTML = '<ul style="list-style: none; padding: 0;">' +
      services.map(service => 
        `<li style="padding: 0.5rem 0; border-bottom: 1px solid var(--slate-700);">✓ ${service}</li>`
      ).join('') +
      '</ul>';
  } else {
    // Default services based on trade
    const defaultServices = getDefaultServices(primaryTrade);
    servicesList.innerHTML = '<ul style="list-style: none; padding: 0;">' +
      defaultServices.map(service => 
        `<li style="padding: 0.5rem 0; border-bottom: 1px solid var(--slate-700);">✓ ${service}</li>`
      ).join('') +
      '</ul>';
  }

  // Contact info sidebar
  document.getElementById('emailValue').textContent = email;
  document.getElementById('phoneValue').textContent = phone;
  document.getElementById('primaryTradeValue').textContent = tradeName;
  document.getElementById('experienceValue').textContent = `${experienceYears} years`;

  // Contact button
  document.getElementById('contactBtn').href = `mailto:${email}?subject=FirstClick Service Request from ${legalName}`;
}

// Helper function to provide default services based on trade
function getDefaultServices(trade) {
  const servicesByTrade = {
    'plumbing': ['Emergency Repairs', 'Pipe Installation', 'Drain Cleaning', 'Water Heater Service'],
    'electrical': ['Panel Upgrades', 'Lighting Installation', 'Electrical Repairs', 'Code Compliance'],
    'hvac': ['AC Installation', 'Furnace Repair', 'Duct Cleaning', 'Maintenance Plans'],
    'appliance_repair': ['Refrigerator Repair', 'Washer/Dryer Repair', 'Oven Repair', 'Preventive Maintenance'],
    'construction': ['Renovations', 'Remodeling', 'Additions', 'Custom Building'],
    'roofing': ['Roof Repair', 'Roof Installation', 'Gutter Installation', 'Inspection Services'],
    'landscaping': ['Lawn Maintenance', 'Garden Design', 'Tree Services', 'Seasonal Cleanup'],
    'security': ['Security Systems', 'Camera Installation', 'Smart Home Integration', 'Access Control'],
    'cleaning': ['Deep Cleaning', 'Move-in/Move-out', 'Post-Construction', 'Regular Maintenance'],
    'pest_control': ['Pest Inspection', 'Treatment Services', 'Prevention Plans', 'Wildlife Removal'],
    'moving': ['Residential Moving', 'Junk Removal', 'Packing Services', 'Storage Solutions'],
    'handyman': ['General Repairs', 'Installation Services', 'Maintenance', 'Small Projects']
  };
  
  return servicesByTrade[trade] || ['Professional Services', 'Consultations', 'Repairs', 'Installations'];
}

// Load contractor when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadContractor();
});

