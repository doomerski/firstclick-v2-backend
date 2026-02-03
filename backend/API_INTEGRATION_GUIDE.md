# API Integration Guide

## Overview

This guide walks you through connecting your ServiceHub system to the real backend API. Instead of using mock data, your frontend will now fetch real data from the server.

## Files Included

- **admin-contractors-api.js** - Admin contractor management API
- **contractor-directory-api.js** - Public contractor directory API
- **contractor-public-profile-api.js** - Individual contractor public profiles
- **API_QUICK_REFERENCE.md** - Quick endpoint reference

## Architecture

```
Frontend (HTML)
    ↓
API Integration Files (*.api.js)
    ↓
Express Backend (server.js)
    ↓
Database (mock-db.js / PostgreSQL)
```

## Step 1: Setup API Base URL

All API integration files use a configurable base URL. Update this in each `.js` file:

```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

For production, change to:
```javascript
const API_BASE_URL = 'https://your-domain.com/api';
```

## Step 2: Include Script Tags in HTML

Add the appropriate script tags to your HTML files:

### For Admin Pages

```html
<!-- admin-contractors.html -->
<script src="admin-contractors-api.js"></script>
```

### For Public Pages

```html
<!-- contractor-directory.html -->
<script src="contractor-directory-api.js"></script>

<!-- contractor-public-profile.html -->
<script src="contractor-public-profile-api.js"></script>
```

## Step 3: API Functions Available

### Admin Contractor Management

#### Get All Contractors
```javascript
// Returns all contractors with their details
const contractors = await AdminContractorAPI.getAllContractors();
```

**Response:**
```json
{
  "contractors": [
    {
      "id": "contractor-001",
      "legal_name": "John Smith",
      "business_name": "Smith Plumbing Co.",
      "email": "john@smithplumbing.com",
      "phone": "+1 416-555-1001",
      "status": "approved",
      "vetting_status": "APPROVED_ACTIVE",
      "primaryTrade": "plumbing",
      "experienceYears": 12
    }
  ]
}
```

#### Get Single Contractor
```javascript
// Get detailed info for one contractor
const contractor = await AdminContractorAPI.getContractorById('contractor-001');
```

**Response:**
```json
{
  "contractor": {
    "id": "contractor-001",
    "legal_name": "John Smith",
    "business_name": "Smith Plumbing Co.",
    "email": "john@smithplumbing.com",
    "phone": "+1 416-555-1001",
    "status": "approved",
    "vetting_status": "APPROVED_ACTIVE",
    "specialties": [1, 2, 3, 4, 5],
    "documents": {
      "license": { "filename": "plumbing_license_001.pdf" },
      "insurance": { "filename": "insurance_001.pdf" },
      "governmentId": { "filename": "drivers_license_001.pdf" }
    },
    "adminNotes": "Top performer",
    "auditLog": []
  }
}
```

#### Update Contractor Status
```javascript
// Approve, reject, or suspend a contractor
const result = await AdminContractorAPI.updateContractorStatus(
  'contractor-001',
  'approved'  // or 'rejected', 'suspended'
);
```

#### Create New Contractor
```javascript
const newContractor = await AdminContractorAPI.createContractor({
  legal_name: 'New Contractor',
  business_name: 'New Business',
  email: 'new@example.com',
  phone: '+1 416-555-9999',
  primaryTrade: 'plumbing',
  experienceYears: 5
});
```

### Public Directory

#### Get All Contractors for Directory
```javascript
const directory = await ContractorDirectoryAPI.getAllContractors();
```

**Response includes:**
- Name and business info
- Specialties
- Experience level
- Rating/reviews (if available)

#### Filter by Specialty
```javascript
const filtered = await ContractorDirectoryAPI.getContractorsBySpecialty('plumbing');
```

#### Get Public Profile
```javascript
const publicProfile = await ContractorPublicProfileAPI.getProfileById('contractor-001');
```

## Step 4: Authentication

The API uses JWT tokens from your auth system. Tokens are automatically handled by the middleware.

For protected endpoints, ensure your session is valid:
```javascript
// Your auth middleware automatically validates tokens
// If token is invalid, you'll get a 401 response
```

## Step 5: Error Handling

All API functions include error handling. Errors are returned as rejected promises:

```javascript
try {
  const contractors = await AdminContractorAPI.getAllContractors();
  console.log('Success:', contractors);
} catch (error) {
  console.error('Failed to fetch contractors:', error.message);
  // Show user-friendly error message
  showErrorNotification(error.message);
}
```

Common error codes:
- **200-299**: Success
- **400**: Bad request (invalid data)
- **401**: Unauthorized (invalid/expired token)
- **404**: Not found
- **500**: Server error

## Step 6: Test the Integration

1. Start the backend server:
```bash
cd /home/shrek/CODE/servicehub/V1.2/ServiceHub/backend
node server.js
```

2. Open your browser to:
```
http://localhost:3000/admin-contractors.html
```

3. Check the browser console for logs:
```javascript
// You'll see API calls logged
```

## Real vs Mock Data

### Before (Mock Data)
```javascript
const mockContractors = [
  { id: 'contractor-001', name: 'John Smith' }
];
```

### After (Real API)
```javascript
const response = await fetch('/api/admin/contractors');
const { contractors } = await response.json();
// contractors now contains real database data
```

## API Endpoints Reference

All endpoints require authentication and return JSON.

### Admin Endpoints
```
GET    /api/admin/contractors              - List all contractors
GET    /api/admin/contractors/:id          - Get single contractor
PATCH  /api/admin/contractors/:id/status   - Update contractor status
POST   /api/contractors/apply              - Create new contractor
```

### Public Endpoints
```
GET    /api/contractors                    - Public contractor list
GET    /api/contractors/:id/public-profile - Public profile info
```

## Troubleshooting

### CORS Errors
Make sure your backend has CORS enabled (it should by default).

### 401 Unauthorized
- Check that you're logged in
- Verify your JWT token hasn't expired
- Try logging out and back in

### 404 Not Found
- Verify the contractor ID exists
- Check the endpoint URL is correct

### Network Timeouts
- Make sure your backend server is running
- Check the API_BASE_URL is correct
- Look for server logs for errors

## Next Steps

1. ✅ Include the API integration scripts in your HTML
2. ✅ Update any hardcoded mock data to use the API
3. ✅ Test each endpoint in your browser console
4. ✅ Deploy when ready!

## Support

For issues or questions:
- Check the API_QUICK_REFERENCE.md for endpoint details
- Review the specific .api.js files for function signatures
- Check server.js for route implementations
