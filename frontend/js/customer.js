/**
 * Customer Job Intake Logic
 */

let currentStep = 1;
let serviceCategories = [];
let serviceTypes = [];
let currentEstimate = null;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read the photo.'));
    reader.readAsDataURL(file);
  });
}

async function getProblemPhotoPayload() {
  const input = document.getElementById('problemPhoto');
  const file = input?.files?.[0];
  if (!file) return null;
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    notify.warning('Please upload a photo smaller than 5MB.');
    throw new Error('Photo too large');
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    dataUrl
  };
}

// Load service categories on page load
async function loadServiceCategories() {
  try {
    const response = await api.get('/services/categories?qualifiedOnly=1');
    serviceCategories = response.categories || [];
    
    const select = document.getElementById('serviceCategory');
    if (serviceCategories.length === 0) {
      select.disabled = true;
      select.innerHTML = '<option value="">No categories available</option>';
      const typeSelect = document.getElementById('serviceType');
      if (typeSelect) {
        typeSelect.disabled = true;
        typeSelect.innerHTML = '<option value="">No qualified contractors available</option>';
      }
      return;
    }

    select.disabled = false;
    select.innerHTML = '<option value="">Select a category...</option>' +
      serviceCategories.map(cat =>
        `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`
      ).join('');
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// Load service types when category changes
document.getElementById('serviceCategory')?.addEventListener('change', async (e) => {
  const categoryId = e.target.value;
  const typeSelect = document.getElementById('serviceType');
  
  if (!categoryId) {
    typeSelect.disabled = true;
    typeSelect.innerHTML = '<option value="">First select a category...</option>';
    return;
  }
  
  try {
    const response = await api.get(`/services/types?categoryId=${categoryId}&qualifiedOnly=1`);
    serviceTypes = response.types || [];
    if (serviceTypes.length === 0) {
      typeSelect.disabled = true;
      typeSelect.innerHTML = '<option value="">No qualified contractors available</option>';
      return;
    }

    typeSelect.disabled = false;
    typeSelect.innerHTML = '<option value="">Select a service...</option>' +
      serviceTypes.map(type => {
        const badges = [];
        if (type.is_quote_only) badges.push('📋 Quote Only');
        if (type.is_emergency_supported) badges.push('🚨 Emergency Available');
        if (type.requires_license) badges.push('✅ Licensed');
        
        const badgeText = badges.length > 0 ? ` (${badges.join(', ')})` : '';
        
        return `<option value="${type.id}">${type.name}${badgeText}</option>`;
      }).join('');
    resetEstimate();
  } catch (error) {
    console.error('Error loading service types:', error);
  }
});

document.getElementById('serviceType')?.addEventListener('change', async () => {
  await fetchEstimate();
});

document.getElementById('urgency')?.addEventListener('change', async () => {
  await fetchEstimate();
});

document.getElementById('timeWindow')?.addEventListener('change', async () => {
  await fetchEstimate();
});

function resetEstimate() {
  currentEstimate = null;
  const estimateValue = document.getElementById('estimateValue');
  if (estimateValue) {
    estimateValue.textContent = 'Select a service type and urgency to see an estimate.';
  }
}

async function fetchEstimate() {
  const serviceTypeId = parseInt(document.getElementById('serviceType')?.value);
  const urgency = document.getElementById('urgency')?.value || 'standard';
  const timeWindow = document.getElementById('timeWindow')?.value || 'standard';
  const estimateValue = document.getElementById('estimateValue');

  if (!serviceTypeId || Number.isNaN(serviceTypeId)) {
    resetEstimate();
    return;
  }

  try {
    const response = await api.get(`/services/estimate?service_type_id=${serviceTypeId}&urgency=${encodeURIComponent(urgency)}&time_window=${encodeURIComponent(timeWindow)}`);
    currentEstimate = response.estimate || null;
    if (!estimateValue) return;

    if (!currentEstimate || currentEstimate.mode === 'unknown') {
      estimateValue.textContent = 'Estimate unavailable for this service.';
      return;
    }
    if (currentEstimate.mode === 'quote_only') {
      estimateValue.textContent = 'Quote required — a contractor will provide pricing.';
      return;
    }
    const min = currentEstimate.min?.toLocaleString() || '—';
    const max = currentEstimate.max?.toLocaleString() || '—';
    estimateValue.textContent = `$${min} - $${max}`;
  } catch (error) {
    console.error('Error loading estimate:', error);
    if (estimateValue) {
      estimateValue.textContent = 'Estimate unavailable for this service.';
    }
  }
}

// Step navigation
function nextStep(step) {
  // Validate current step
  const currentStepEl = document.getElementById(`step${currentStep}`);
  const inputs = currentStepEl.querySelectorAll('input[required], select[required], textarea[required]');
  
  let valid = true;
  inputs.forEach(input => {
    if (!input.value) {
      input.style.borderColor = 'red';
      valid = false;
    } else {
      input.style.borderColor = '';
    }
  });
  
  if (!valid) {
    notify.warning('Please fill in all required fields');
    return;
  }
  
  // Hide current step
  document.getElementById(`step${currentStep}`).classList.remove('active');
  
  // Show next step
  currentStep = step;
  document.getElementById(`step${currentStep}`).classList.add('active');
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prevStep(step) {
  document.getElementById(`step${currentStep}`).classList.remove('active');
  currentStep = step;
  document.getElementById(`step${currentStep}`).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let authMode = 'login';

function setFieldRequired(id, required) {
  const field = document.getElementById(id);
  if (field) {
    field.required = required;
  }
}

function syncAuthModeUI() {
  const user = getUser();
  const authStatus = document.getElementById('authStatus');
  const loginFields = document.getElementById('authLoginFields');
  const registerFields = document.getElementById('authRegisterFields');
  const loginBtn = document.getElementById('authModeLogin');
  const registerBtn = document.getElementById('authModeRegister');
  const loggedIn = user && user.role === 'customer';

  if (loggedIn) {
    if (authStatus) {
      authStatus.textContent = `Signed in as ${user.email}`;
      authStatus.style.display = 'block';
    }
    if (loginFields) loginFields.style.display = 'none';
    if (registerFields) registerFields.style.display = 'none';
    if (loginBtn) loginBtn.disabled = true;
    if (registerBtn) registerBtn.disabled = true;
    setFieldRequired('loginEmail', false);
    setFieldRequired('loginPassword', false);
    setFieldRequired('registerFullName', false);
    setFieldRequired('registerEmail', false);
    setFieldRequired('registerPhone', false);
    setFieldRequired('registerPassword', false);
    setFieldRequired('registerPasswordConfirm', false);
    return;
  }

  if (authStatus) authStatus.style.display = 'none';
  if (loginBtn) loginBtn.disabled = false;
  if (registerBtn) registerBtn.disabled = false;

  const showLogin = authMode === 'login';
  if (loginFields) loginFields.style.display = showLogin ? 'block' : 'none';
  if (registerFields) registerFields.style.display = showLogin ? 'none' : 'block';

  if (loginBtn) {
    loginBtn.classList.toggle('btn-primary', showLogin);
    loginBtn.classList.toggle('btn-secondary', !showLogin);
  }
  if (registerBtn) {
    registerBtn.classList.toggle('btn-primary', !showLogin);
    registerBtn.classList.toggle('btn-secondary', showLogin);
  }

  setFieldRequired('loginEmail', showLogin);
  setFieldRequired('loginPassword', showLogin);
  setFieldRequired('registerFullName', !showLogin);
  setFieldRequired('registerEmail', !showLogin);
  setFieldRequired('registerPhone', !showLogin);
  setFieldRequired('registerPassword', !showLogin);
  setFieldRequired('registerPasswordConfirm', !showLogin);
}

function setAuthMode(mode) {
  authMode = mode;
  syncAuthModeUI();
}

document.getElementById('authModeLogin')?.addEventListener('click', () => setAuthMode('login'));
document.getElementById('authModeRegister')?.addEventListener('click', () => setAuthMode('register'));
setAuthMode(authMode);

// Handle form submission
document.getElementById('jobForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  let problemPhoto = null;
  try {
    problemPhoto = await getProblemPhotoPayload();
  } catch (error) {
    console.error('Photo upload error:', error);
    return;
  }

  let user = getUser();
  if (!user || user.role !== 'customer') {
    if (authMode === 'login') {
      const email = document.getElementById('loginEmail')?.value?.trim();
      const password = document.getElementById('loginPassword')?.value || '';
      if (!email || !password) {
        notify.warning('Please sign in to continue.');
        return;
      }
      try {
        const response = await api.post('/auth/customer/login', { email, password });
        if (response.user && response.token) {
          saveUser(response.user, response.token);
          user = response.user;
          syncAuthModeUI();
        }
      } catch (error) {
        notify.error('Login failed: ' + (error.message || 'Please check your credentials.'));
        return;
      }
    } else {
      const fullName = document.getElementById('registerFullName')?.value?.trim();
      const email = document.getElementById('registerEmail')?.value?.trim();
      const phone = document.getElementById('registerPhone')?.value?.trim();
      const password = document.getElementById('registerPassword')?.value || '';
      const confirm = document.getElementById('registerPasswordConfirm')?.value || '';

      if (!fullName || !email || !phone || !password) {
        notify.warning('Please complete all account fields to continue.');
        return;
      }
      if (password !== confirm) {
        notify.error('Passwords do not match. Please re-enter and try again.');
        return;
      }

      try {
        const response = await api.post('/auth/customer/register', {
          email,
          password,
          full_name: fullName,
          phone
        });
        if (response.user && response.token) {
          saveUser(response.user, response.token);
          user = response.user;
          syncAuthModeUI();
        }
      } catch (error) {
        notify.info('Account creation failed: ' + (error.message || 'Please try again.'));
        return;
      }
    }
  }

  if (!user || user.role !== 'customer') {
    notify.warning('Please sign in to continue.');
    return;
  }

  const formData = {
    service_category_id: parseInt(document.getElementById('serviceCategory').value),
    service_type_id: parseInt(document.getElementById('serviceType').value),
    description: document.getElementById('description').value,
    property_type: document.getElementById('propertyType').value,
    address_number: document.getElementById('addressNumber').value,
    address_street: document.getElementById('addressStreet').value,
    address_line2: document.getElementById('addressLine2').value || null,
    city: document.getElementById('city').value,
    province: document.getElementById('province').value,
    postal_code: document.getElementById('postalCode').value,
    urgency: document.getElementById('urgency').value,
    time_window: document.getElementById('timeWindow').value,
    problem_photo: problemPhoto,
    customer: {
      full_name: user.full_name || document.getElementById('registerFullName')?.value?.trim() || '',
      email: user.email,
      phone: user.phone || document.getElementById('registerPhone')?.value?.trim() || ''
    }
  };
  
  try {
    const response = await api.post('/jobs/create', formData);
    
    // Save customer info for dashboard access
    if (response.customer && response.token) {
      saveUser(response.customer, response.token);
      syncAuthModeUI();
    }

    // Show success message
    document.getElementById('jobForm').style.display = 'none';
    document.getElementById('successMessage').style.display = 'block';
  } catch (error) {
    notify.info('Error submitting request: ' + error.message);
  }
});

// Initialize
if (document.getElementById('serviceCategory')) {
  loadServiceCategories();
}
