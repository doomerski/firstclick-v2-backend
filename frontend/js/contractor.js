/**
 * Contractor Signup & Onboarding Logic
 */

// Handle contractor signup form
document.getElementById('contractorSignupForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Validate checkboxes
  const checkboxes = ['declaration1', 'declaration2', 'declaration3'];
  for (const id of checkboxes) {
    if (!document.getElementById(id).checked) {
      notify.warning('Please accept all declarations to continue');
      return;
    }
  }
  
  // Create FormData for file uploads
  const formData = new FormData();
  
  // Add text fields
  formData.append('legal_name', document.getElementById('legalName').value);
  formData.append('business_name', document.getElementById('businessName').value || '');
  formData.append('email', document.getElementById('email').value);
  formData.append('phone', document.getElementById('phone').value);
  formData.append('password', document.getElementById('password').value);
  formData.append('primary_trade', document.getElementById('primaryTrade').value);
  formData.append('experience_years', document.getElementById('experience').value);
  
  // Add files (mock - in real app these would be uploaded to S3)
  const licenseFile = document.getElementById('license').files[0];
  const insuranceFile = document.getElementById('insurance').files[0];
  const idFile = document.getElementById('governmentId').files[0];
  
  if (licenseFile) formData.append('license', licenseFile);
  if (insuranceFile) formData.append('insurance', insuranceFile);
  if (idFile) formData.append('government_id', idFile);

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({
      filename: file.name,
      dataUrl: reader.result,
      size: file.size,
      mime: file.type
    });
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
  
  try {
    // For demo purposes, we'll convert FormData to JSON
    // In production, this would upload actual files
    const [licenseDoc, insuranceDoc, idDoc] = await Promise.all([
      readFileAsDataUrl(licenseFile),
      readFileAsDataUrl(insuranceFile),
      readFileAsDataUrl(idFile)
    ]);

    const data = {
      legal_name: formData.get('legal_name'),
      business_name: formData.get('business_name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      password: formData.get('password'),
      primary_trade: parseInt(formData.get('primary_trade')),
      experience_years: parseInt(formData.get('experience_years')),
      documents: {
        license: licenseDoc,
        insurance: insuranceDoc,
        government_id: idDoc
      }
    };
    
    const response = await api.post('/contractors/apply', data);
    
    // Show success message
    document.getElementById('contractorSignupForm').style.display = 'none';
    document.getElementById('successMessage').style.display = 'block';
  } catch (error) {
    notify.info('Error submitting application: ' + error.message);
  }
});
