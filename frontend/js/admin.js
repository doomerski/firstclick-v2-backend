/**
 * Admin Dashboard Logic
 */

let allJobs = [];
let allContractors = [];
let currentTab = 'jobs';
let selectedJob = null;

// Check admin auth on load
window.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  if (!user || user.role !== 'admin') {
    window.location.href = 'admin-login.html';
    return;
  }

  document.getElementById('adminName').textContent = user.full_name;
  loadDashboard();
});

// Load dashboard data
async function loadDashboard() {
  try {
    const statsResponse = await api.get('/admin/dashboard');
    
    // Update stats
    document.getElementById('statActiveJobs').textContent = 
      statsResponse.stats.active_jobs || 0;
    document.getElementById('statPendingJobs').textContent = 
      statsResponse.stats.pending_jobs || 0;
    document.getElementById('statContractors').textContent = 
      statsResponse.stats.approved_contractors || 0;
    document.getElementById('statPendingContractors').textContent = 
      statsResponse.stats.pending_contractors || 0;
    
    // Load jobs and contractors
    await loadJobs();
    await loadContractors();
  } catch (error) {
    console.error('Error loading dashboard:', error);
    notify.info('Error loading dashboard data. Please refresh the page.');
  }
}

async function loadJobs() {
  try {
    const response = await api.get('/admin/jobs');
    allJobs = response.jobs || [];
    renderJobs();
  } catch (error) {
    console.error('Error loading jobs:', error);
  }
}

async function loadContractors() {
  try {
    const response = await api.get('/admin/contractors');
    allContractors = response.contractors || [];
    renderContractors();
  } catch (error) {
    console.error('Error loading contractors:', error);
  }
}

function renderJobs() {
  const container = document.getElementById('jobsList');
  
  if (allJobs.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No jobs yet</p></div>';
    return;
  }
  
  container.innerHTML = allJobs.map(job => `
    <div class="job-card">
      <div class="job-header">
        <div>
          <h3 class="job-title">${job.category_name || 'Unknown'} - ${job.type_name || 'Unknown'}</h3>
          <p class="job-meta">
            Customer: ${job.customer_email || 'N/A'} | ${job.address_line1 || 'N/A'}, ${job.city || 'N/A'}
          </p>
        </div>
        <span class="status-badge status-${job.status}">${formatStatus(job.status)}</span>
      </div>
      
      <p class="job-description">${job.description || 'No description provided'}</p>
      
      <div class="job-details">
        <div class="detail-item">
          <span class="detail-label">Urgency:</span>
          <span class="detail-value">${formatUrgency(job.urgency)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Created:</span>
          <span class="detail-value">${new Date(job.created_at).toLocaleString()}</span>
        </div>
        ${job.contractor_name ? `
          <div class="detail-item">
            <span class="detail-label">Contractor:</span>
            <span class="detail-value">${job.contractor_name}</span>
          </div>
        ` : ''}
      </div>
      
      <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
        ${job.status === 'submitted' || job.status === 'ready_to_assign' ? `
          <button onclick="showAssignModal('${job.id}')" class="btn btn-primary btn-small">
            Assign Contractor
          </button>
        ` : ''}
        <button onclick="showJobDetails('${job.id}')" class="btn btn-secondary btn-small">
          View Details
        </button>
      </div>
    </div>
  `).join('');
}

function renderContractors() {
  const container = document.getElementById('contractorsList');
  
  if (allContractors.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No contractors yet</p></div>';
    return;
  }
  
  container.innerHTML = allContractors.map(contractor => `
    <div class="contractor-card">
      <div class="contractor-header">
        <div>
          <h3 class="contractor-name">${contractor.business_name || contractor.legal_name || 'Unknown'}</h3>
          <p class="contractor-email">${contractor.email || 'N/A'} | ${contractor.phone || 'No phone'}</p>
        </div>
        <span class="vetting-badge vetting-${contractor.vetting_status}">
          ${formatVettingStatus(contractor.vetting_status)}
        </span>
      </div>
      
      <div class="job-details">
        <div class="detail-item">
          <span class="detail-label">Applied:</span>
          <span class="detail-value">${new Date(contractor.created_at).toLocaleDateString()}</span>
        </div>
        ${contractor.approved_at ? `
          <div class="detail-item">
            <span class="detail-label">Approved:</span>
            <span class="detail-value">${new Date(contractor.approved_at).toLocaleDateString()}</span>
          </div>
        ` : ''}
      </div>
      
      ${contractor.vetting_status === 'APPLIED' || contractor.vetting_status === 'UNDER_REVIEW' ? `
        <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
          <button onclick="approveContractor('${contractor.id}')" class="btn btn-success btn-small">
            Approve
          </button>
          <button onclick="rejectContractor('${contractor.id}')" class="btn btn-danger btn-small">
            Reject
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

async function approveContractor(contractorId) {
  if (!confirm('Approve this contractor?')) return;
  
  try {
    await api.patch(`/admin/contractors/${contractorId}/status`, {
      vetting_status: 'APPROVED_ACTIVE'
    });
    notify.success('Contractor approved!');
    await loadContractors();
    await loadDashboard();
  } catch (error) {
    notify.info('Error approving contractor: ' + error.message);
  }
}

async function rejectContractor(contractorId) {
  if (!confirm('Reject this contractor application?')) return;
  
  try {
    await api.patch(`/admin/contractors/${contractorId}/status`, {
      vetting_status: 'REJECTED'
    });
    notify.success('Action completed');
    await loadContractors();
    await loadDashboard();
  } catch (error) {
    notify.info('Error rejecting contractor: ' + error.message);
  }
}

function showAssignModal(jobId) {
  selectedJob = allJobs.find(j => j.id === jobId);
  
  const approvedContractors = allContractors.filter(
    c => c.vetting_status === 'APPROVED_ACTIVE'
  );
  
  const modal = document.getElementById('jobModal');
  const content = document.getElementById('jobModalContent');
  
  if (approvedContractors.length === 0) {
    content.innerHTML = `
      <h2>Assign Contractor</h2>
      <div class="alert alert-warning">
        <p>No approved contractors available. Please approve contractors first in the Contractors tab.</p>
      </div>
      <button onclick="closeModal()" class="btn btn-secondary" style="margin-top: 1rem;">Close</button>
    `;
    modal.style.display = 'flex';
    return;
  }
  
  content.innerHTML = `
    <h2>Assign Contractor</h2>
    <p><strong>Job:</strong> ${selectedJob.category_name} - ${selectedJob.type_name}</p>
    <p><strong>Location:</strong> ${selectedJob.address_line1}, ${selectedJob.city}</p>
    
    <div class="form-group" style="margin-top: 1.5rem;">
      <label class="label">Select Contractor:</label>
      <select id="assignContractorSelect" class="input">
        <option value="">Choose a contractor...</option>
        ${approvedContractors.map(c => `
          <option value="${c.id}">${c.business_name || c.legal_name} (${c.email})</option>
        `).join('')}
      </select>
    </div>
    
    <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
      <button onclick="assignContractor()" class="btn btn-primary">Assign</button>
      <button onclick="closeModal()" class="btn btn-secondary">Cancel</button>
    </div>
  `;
  
  modal.style.display = 'flex';
}

async function assignContractor() {
  const contractorId = document.getElementById('assignContractorSelect').value;
  
  if (!contractorId) {
    notify.warning('Please select a contractor');
    return;
  }
  
  try {
    await api.post(`/admin/jobs/${selectedJob.id}/assign`, {
      contractor_id: contractorId
    });
    notify.info('Contractor assigned successfully!');
    closeModal();
    await loadJobs();
    await loadDashboard();
  } catch (error) {
    notify.info('Error assigning contractor: ' + error.message);
  }
}

function showJobDetails(jobId) {
  const job = allJobs.find(j => j.id === jobId);
  if (!job) {
    notify.info('Job not found');
    return;
  }
  
  const modal = document.getElementById('jobModal');
  const content = document.getElementById('jobModalContent');
  
  content.innerHTML = `
    <h2>Job Details</h2>
    
    <div class="job-details" style="grid-template-columns: 1fr;">
      <div class="detail-item">
        <span class="detail-label">Service:</span>
        <span class="detail-value">${job.category_name} - ${job.type_name}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Status:</span>
        <span class="detail-value">${formatStatus(job.status)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Customer:</span>
        <span class="detail-value">${job.customer_email || 'N/A'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Address:</span>
        <span class="detail-value">${job.address_line1 || 'N/A'}, ${job.city || 'N/A'}, ${job.province || 'N/A'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Description:</span>
        <span class="detail-value">${job.description || 'No description'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Urgency:</span>
        <span class="detail-value">${formatUrgency(job.urgency)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Time Window:</span>
        <span class="detail-value">${formatTimeWindow(job.time_window)}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">Created:</span>
        <span class="detail-value">${new Date(job.created_at).toLocaleString()}</span>
      </div>
      ${job.contractor_name ? `
        <div class="detail-item">
          <span class="detail-label">Assigned Contractor:</span>
          <span class="detail-value">${job.contractor_name}</span>
        </div>
      ` : ''}
    </div>
    
    <button onclick="closeModal()" class="btn btn-secondary" style="margin-top: 1.5rem;">
      Close
    </button>
  `;
  
  modal.style.display = 'flex';
}

function closeModal() {
  document.getElementById('jobModal').style.display = 'none';
  selectedJob = null;
}

function switchTab(tab) {
  currentTab = tab;
  
  // Get the button that was clicked
  const clickedButton = event.target;
  
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  clickedButton.classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  if (tab === 'jobs') {
    document.getElementById('jobsTab').classList.add('active');
  } else {
    document.getElementById('contractorsTab').classList.add('active');
  }
}

// Utility functions
function formatStatus(status) {
  const map = {
    'draft': 'Draft',
    'submitted': 'Submitted',
    'ready_to_assign': 'Ready to Assign',
    'assigned': 'Assigned',
    'in_progress': 'In Progress',
    'completed': 'Completed',
    'cancelled': 'Cancelled'
  };
  return map[status] || status;
}

function formatVettingStatus(status) {
  const map = {
    'APPLIED': 'Applied',
    'PENDING_DOCUMENTS': 'Pending Documents',
    'UNDER_REVIEW': 'Under Review',
    'APPROVED_ACTIVE': 'Approved',
    'APPROVED_LIMITED': 'Approved (Limited)',
    'REJECTED': 'Rejected',
    'SUSPENDED': 'Suspended',
    'REMOVED': 'Removed'
  };
  return map[status] || status;
}

function formatUrgency(urgency) {
  const map = {
    'emergency': '🚨 Emergency',
    'same-day': '⚡ Same-day',
    'next-day': '📅 Next-day',
    'scheduled': '🗓️ Scheduled'
  };
  return map[urgency] || urgency;
}

function formatTimeWindow(window) {
  const map = {
    'morning': 'Morning (8am-12pm)',
    'afternoon': 'Afternoon (12pm-5pm)',
    'evening': 'Evening (5pm-8pm)',
    'flexible': 'Flexible'
  };
  return map[window] || window;
}