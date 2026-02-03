// API Configuration for Public Contractor Directory
// Connects to your real backend server.js endpoints

const API_BASE_URL = 'http://localhost:3000/api'; // Change to your production URL

// Public API Helper (no authentication required for public contractor list)
const publicApi = {
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
// NEW: Enhanced API Wrapper for Public Directory
// ============================================================================
const ContractorDirectoryAPI = {
  /**
   * Get all contractors for the public directory
   * @returns {Promise<Object>} Approved contractors list
   */
  async getAllContractors() {
    try {
      console.log('📞 Fetching public contractor directory...');
      const response = await fetch(`${API_BASE_URL}/admin/contractors`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Filter only approved contractors
      const approved = (data.contractors || []).filter(c => 
        c.vetting_status === 'APPROVED_ACTIVE' || c.status === 'approved'
      );

      console.log(`✅ Loaded ${approved.length} approved contractors`);
      return { contractors: approved };
    } catch (error) {
      console.error('❌ Error fetching directory:', error);
      throw error;
    }
  },

  /**
   * Get contractors by specialty/trade
   * @param {string} specialty - The specialty to filter by
   * @returns {Promise<Object>} Contractors in that specialty
   */
  async getContractorsBySpecialty(specialty) {
    try {
      const allContractors = await this.getAllContractors();
      
      if (!allContractors.contractors) {
        return { contractors: [] };
      }

      const filtered = allContractors.contractors.filter(contractor =>
        (contractor.primaryTrade && contractor.primaryTrade.toLowerCase() === specialty.toLowerCase()) ||
        (contractor.primary_trade && contractor.primary_trade.toLowerCase() === specialty.toLowerCase())
      );

      console.log(`✅ Found ${filtered.length} contractors in specialty "${specialty}"`);
      return { contractors: filtered };
    } catch (error) {
      console.error('❌ Error filtering by specialty:', error);
      throw error;
    }
  },

  /**
   * Search contractors by name or business
   * @param {string} query - Search query
   * @returns {Promise<Object>} Matching contractors
   */
  async searchContractors(query) {
    try {
      const allContractors = await this.getAllContractors();
      
      if (!allContractors.contractors) {
        return { contractors: [] };
      }

      const filtered = allContractors.contractors.filter(contractor =>
        (contractor.legal_name && contractor.legal_name.toLowerCase().includes(query.toLowerCase())) ||
        (contractor.business_name && contractor.business_name.toLowerCase().includes(query.toLowerCase())) ||
        (contractor.primaryTrade && contractor.primaryTrade.toLowerCase().includes(query.toLowerCase()))
      );

      console.log(`✅ Found ${filtered.length} contractors matching "${query}"`);
      return { contractors: filtered };
    } catch (error) {
      console.error('❌ Error searching:', error);
      throw error;
    }
  },

  /**
   * Get featured contractors (top by experience and rating)
   * @param {number} limit - Number of contractors to return
   * @returns {Promise<Object>} Top contractors
   */
  async getFeaturedContractors(limit = 6) {
    try {
      const allContractors = await this.getAllContractors();
      
      if (!allContractors.contractors) {
        return { contractors: [] };
      }

      const featured = allContractors.contractors
        .sort((a, b) => (b.experienceYears || 0) - (a.experienceYears || 0))
        .slice(0, limit);

      console.log(`✅ Loaded ${featured.length} featured contractors`);
      return { contractors: featured };
    } catch (error) {
      console.error('❌ Error getting featured:', error);
      throw error;
    }
  },

  /**
   * Get directory statistics
   * @returns {Promise<Object>} Directory stats
   */
  async getDirectoryStats() {
    try {
      const allContractors = await this.getAllContractors();
      
      if (!allContractors.contractors) {
        return { total: 0, trades: [] };
      }

      const contractors = allContractors.contractors;
      const trades = [...new Set(contractors
        .map(c => c.primaryTrade || c.primary_trade)
        .filter(Boolean)
      )];

      const stats = {
        total: contractors.length,
        trades: trades,
        averageExperience: contractors.length > 0
          ? Math.round(contractors.reduce((sum, c) => sum + (c.experienceYears || 0), 0) / contractors.length)
          : 0
      };

      console.log('✅ Directory stats calculated');
      return stats;
    } catch (error) {
      console.error('❌ Error getting stats:', error);
      throw error;
    }
  },

  setApiBaseUrl(newUrl) {
    window.API_BASE_URL = newUrl;
    console.log(`✅ API Base URL updated to: ${newUrl}`);
  }
};

console.log('✅ Contractor Directory API loaded - use ContractorDirectoryAPI.* or publicApi.* for requests');

// ============================================================================
// End of Enhanced API Wrapper
// ============================================================================

// Load All Approved Contractors from Real API
async function loadContractors() {
  try {
    // Call the real API endpoint: GET /api/admin/contractors
    const response = await publicApi.get('/admin/contractors');
    
    // Filter only approved and active contractors for public display
    allContractors = (response.contractors || []).filter(c => 
      c.vetting_status === 'APPROVED_ACTIVE' || 
      c.status === 'approved'
    );
    
    filteredContractors = [...allContractors];
    
    renderContractors();
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('contractorsGrid').style.display = 'grid';
  } catch (error) {
    console.error('Error loading contractors:', error);
    document.getElementById('loadingState').innerHTML = 
      '<p>Error loading contractors. Please try again later.</p>';
  }
}

// Render contractors (uses real data from API)
function renderContractors() {
  const grid = document.getElementById('contractorsGrid');
  const count = document.getElementById('contractorCount');
  const emptyState = document.getElementById('emptyState');

  count.textContent = `${filteredContractors.length} Contractors`;

  if (filteredContractors.length === 0) {
    grid.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  grid.style.display = 'grid';

  grid.innerHTML = filteredContractors.map(contractor => {
    // Map primary_trade or primaryTrade field
    const trade = contractor.primary_trade || contractor.primaryTrade || 'general';
    const tradeName = tradeNames[trade] || trade || 'General';
    
    // Get contractor name and business
    const name = contractor.legal_name || contractor.legalName || 'Contractor';
    const business = contractor.business_name || contractor.businessName || 'Independent';
    
    // Get experience years
    const experience = contractor.experience_years || contractor.experienceYears || 0;
    
    return `
      <a href="contractor-public-profile.html?id=${contractor.id}" class="contractor-card">
        <div class="contractor-header">
          <div>
            <div class="contractor-name">${name}</div>
            <div class="contractor-business">${business}</div>
          </div>
          <span class="trade-badge">${tradeName}</span>
        </div>
        
        <div class="contractor-details">
          <div class="detail-row">
            <span class="detail-label">Experience</span>
            <span class="detail-value">${experience} years</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${contractor.phone || 'Contact via email'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Email</span>
            <span class="detail-value">${contractor.email}</span>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

// Trade name mapping
const tradeNames = {
  'plumbing': 'Plumbing',
  'electrical': 'Electrical',
  'hvac': 'HVAC',
  'appliance_repair': 'Appliance Repair',
  'construction': 'Construction',
  'roofing': 'Roofing',
  'landscaping': 'Landscaping',
  'security': 'Security Systems',
  'cleaning': 'Cleaning',
  'pest_control': 'Pest Control',
  'moving': 'Moving',
  'handyman': 'Handyman'
};

// Filter and search functionality
function filterByTrade(trade) {
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  currentFilter = trade;
  applyFiltersAndSearch();
}

function applySearch() {
  applyFiltersAndSearch();
}

function applyFiltersAndSearch() {
  const searchQuery = document.getElementById('searchInput').value.toLowerCase();
  
  filteredContractors = allContractors.filter(contractor => {
    // Apply trade filter
    const contractorTrade = contractor.primary_trade || contractor.primaryTrade || '';
    if (currentFilter !== 'all' && contractorTrade !== currentFilter) {
      return false;
    }

    // Apply search filter
    if (searchQuery) {
      const name = contractor.legal_name || contractor.legalName || '';
      const business = contractor.business_name || contractor.businessName || '';
      const trade = contractorTrade;
      
      const searchableText = `${name} ${business} ${trade}`.toLowerCase();
      
      if (!searchableText.includes(searchQuery)) {
        return false;
      }
    }

    return true;
  });

  renderContractors();
}

// Load contractors when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadContractors();
});

