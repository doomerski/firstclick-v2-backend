// API Configuration and Helper Functions for Contractor Management
// This file connects to your real backend server.js endpoints

const API_BASE_URL = 'http://localhost:3000/api'; // Change this to your production URL

// API Helper with authentication
const api = {
  async get(endpoint) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  },

  async post(endpoint, data) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  },

  async patch(endpoint, data) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    return response.json();
  }
};

// ============================================================================
// NEW: Enhanced API Wrapper Object for Consistent Interface
// ============================================================================
const AdminContractorAPI = {
  /**
   * Get all contractors with full details
   * @returns {Promise<Object>} Contractor list data
   */
  async getAllContractors() {
    console.log('📞 Fetching all contractors from API...');
    try {
      const response = await fetch(`${API_BASE_URL}/admin/contractors`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._getToken()}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Fetched all contractors:', data.contractors?.length || 0, 'contractors');
      return data;
    } catch (error) {
      console.error('❌ Error fetching contractors:', error);
      throw error;
    }
  },

  /**
   * Get a single contractor by ID
   * @param {string} contractorId - The contractor ID
   * @returns {Promise<Object>} Contractor details
   */
  async getContractorById(contractorId) {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/contractors/${contractorId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._getToken()}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Fetched contractor ${contractorId}`);
      return data;
    } catch (error) {
      console.error(`❌ Error fetching contractor ${contractorId}:`, error);
      throw error;
    }
  },

  /**
   * Update contractor status (approve, reject, suspend)
   * @param {string} contractorId - The contractor ID
   * @param {string} status - New status ('approved', 'rejected', 'suspended', 'pending')
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Updated contractor
   */
  async updateContractorStatus(contractorId, status, options = {}) {
    try {
      const payload = {
        status: status.toLowerCase(),
        ...options
      };

      const response = await fetch(`${API_BASE_URL}/admin/contractors/${contractorId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._getToken()}`
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Updated contractor ${contractorId} status to ${status}`);
      return data;
    } catch (error) {
      console.error(`❌ Error updating contractor status:`, error);
      throw error;
    }
  },

  /**
   * Create a new contractor
   * @param {Object} contractorData - Contractor information
   * @returns {Promise<Object>} Created contractor
   */
  async createContractor(contractorData) {
    try {
      const payload = {
        legal_name: contractorData.legal_name || contractorData.legalName || '',
        business_name: contractorData.business_name || contractorData.businessName || '',
        email: contractorData.email || '',
        phone: contractorData.phone || '',
        primaryTrade: contractorData.primaryTrade || 'general',
        experienceYears: contractorData.experienceYears || 0,
        specialties: contractorData.specialties || [],
        ...contractorData
      };

      const response = await fetch(`${API_BASE_URL}/contractors/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._getToken()}`
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Created new contractor');
      return data;
    } catch (error) {
      console.error('❌ Error creating contractor:', error);
      throw error;
    }
  },

  /**
   * Filter contractors by status
   * @param {string} status - Status to filter
   * @returns {Promise<Object>} Filtered list
   */
  async getContractorsByStatus(status) {
    try {
      const allContractors = await this.getAllContractors();
      
      if (!allContractors.contractors || !Array.isArray(allContractors.contractors)) {
        return { contractors: [] };
      }

      const filtered = allContractors.contractors.filter(contractor =>
        contractor.status && contractor.status.toLowerCase() === status.toLowerCase()
      );

      console.log(`✅ Found ${filtered.length} contractors with status "${status}"`);
      return { contractors: filtered };
    } catch (error) {
      console.error('❌ Error filtering contractors:', error);
      throw error;
    }
  },

  /**
   * Get contractor statistics
   * @returns {Promise<Object>} Stats data
   */
  async getContractorStats() {
    try {
      const allContractors = await this.getAllContractors();
      
      if (!allContractors.contractors || !Array.isArray(allContractors.contractors)) {
        return { total: 0, approved: 0, pending: 0, rejected: 0 };
      }

      const stats = {
        total: allContractors.contractors.length,
        approved: 0,
        pending: 0,
        rejected: 0,
        suspended: 0
      };

      allContractors.contractors.forEach(contractor => {
        const status = contractor.status ? contractor.status.toLowerCase() : 'pending';
        if (status in stats) {
          stats[status]++;
        }
      });

      console.log('✅ Contractor statistics calculated');
      return stats;
    } catch (error) {
      console.error('❌ Error getting contractor stats:', error);
      throw error;
    }
  },

  _getToken() {
    let token = localStorage.getItem('token');
    if (!token) {
      token = sessionStorage.getItem('token');
    }
    return token || '';
  },

  isAuthenticated() {
    return !!this._getToken();
  },

  setApiBaseUrl(newUrl) {
    window.API_BASE_URL = newUrl;
    console.log(`✅ API Base URL updated to: ${newUrl}`);
  }
};

// ============================================================================
// End of Enhanced API Wrapper
// ============================================================================

console.log('✅ Admin Contractor API loaded - use AdminContractorAPI.* or api.* for requests');


// Updated Create Contractor Form Handler
document.getElementById('createContractorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const newContractor = {
    legal_name: document.getElementById('newLegalName').value.trim(),
    business_name: document.getElementById('newBusinessName').value.trim(),
    email: document.getElementById('newEmail').value.trim(),
    phone: document.getElementById('newPhone').value.trim(),
    primary_trade: document.getElementById('newPrimaryTrade').value,
    experience_years: parseInt(document.getElementById('newExperience').value, 10),
    vetting_status: document.getElementById('newVettingStatus').value,
    password: 'TempPassword123!' // Temporary password - contractor should change on first login
  };

  try {
    // Use the real API endpoint from server.js
    const response = await api.post('/contractors/apply', newContractor);
    
    console.log('Contractor created successfully! ID: ' + response.contractor.id);
    closeCreateModal();
    
    // Reload contractors list
    await loadContractors();
  } catch (error) {
    console.error('Error creating contractor:', error);
    console.error('Create contractor error:', error);
  }
});

// Updated Load Contractors Function
async function loadContractors() {
  try {
    // Call the real API endpoint: GET /api/admin/contractors
    const response = await api.get('/admin/contractors');
    allContractors = response.contractors || [];
    filteredContractors = [...allContractors];
    applySearch();
  } catch (error) {
    console.error('Error loading contractors:', error);
    console.error('Failed to load contractors:', error);
  }
}

// Updated Approve Contractor Function
async function approveContractor(id) {
  if (!confirm('Approve this contractor?')) return;
  
  try {
    // Call the real API endpoint: PATCH /api/admin/contractors/:id/status
    await api.patch(`/admin/contractors/${id}/status`, { 
      vetting_status: 'APPROVED_ACTIVE' 
    });
    
    console.log('Contractor approved!');
    await loadContractors();
  } catch (error) {
    notify.error('Error: ' + error.message);
    console.error('Approve contractor error:', error);
  }
}

// Updated Reject Contractor Function
async function rejectContractor(id) {
  if (!confirm('Reject this contractor?')) return;
  
  try {
    // Call the real API endpoint: PATCH /api/admin/contractors/:id/status
    await api.patch(`/admin/contractors/${id}/status`, { 
      vetting_status: 'REJECTED' 
    });
    
    console.log('Contractor rejected');
    await loadContractors();
  } catch (error) {
    notify.error('Error: ' + error.message);
    console.error('Reject contractor error:', error);
  }
}

// View Contractor Profile (redirects to existing admin profile page)
function viewContractor(target) {
  const id = typeof target === 'string'
    ? target
    : target?.dataset?.contractorId;
  
  if (!id) {
    notify.info('Missing contractor ID.');
    return;
  }
  
  localStorage.setItem('admin_last_contractor_id', id);
  
  // This uses your existing admin-contractor-profile.html which already has API integration
  window.location.href = `admin-contractor-profile.html?id=${encodeURIComponent(id)}`;
}

// Authentication Helper
function getUser() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'admin-login.html';
}

// Check authentication on page load
const user = getUser();
if (!user || user.role !== 'admin') {
  window.location.href = 'admin-login.html';
}
