# API Quick Reference

## Admin Contractor API

### Include in HTML
```html
<script src="admin-contractors-api.js"></script>
```

### Available Functions

#### Get All Contractors
```javascript
const result = await AdminContractorAPI.getAllContractors();
// Returns: { contractors: [...] }
```

#### Get Single Contractor
```javascript
const result = await AdminContractorAPI.getContractorById('contractor-001');
// Returns: { contractor: {...} }
```

#### Update Status
```javascript
const result = await AdminContractorAPI.updateContractorStatus('contractor-001', 'approved');
// Statuses: 'approved', 'rejected', 'suspended', 'pending'
```

#### Create New Contractor
```javascript
const result = await AdminContractorAPI.createContractor({
  legal_name: 'John Doe',
  business_name: 'Doe Plumbing',
  email: 'john@doe.com',
  phone: '+1 416-555-1234',
  primaryTrade: 'plumbing',
  experienceYears: 10
});
```

#### Search Contractors
```javascript
const result = await AdminContractorAPI.searchContractors('john');
// Searches by name, email, business name, phone
```

#### Filter by Status
```javascript
const result = await AdminContractorAPI.getContractorsByStatus('approved');
```

#### Filter by Trade
```javascript
const result = await AdminContractorAPI.getContractorsByTrade('plumbing');
```

#### Get Statistics
```javascript
const stats = await AdminContractorAPI.getContractorStats();
// Returns: { total, approved, pending, rejected, suspended }
```

---

## Public Contractor Directory API

### Include in HTML
```html
<script src="contractor-directory-api.js"></script>
```

### Available Functions

#### Get All Contractors (Public)
```javascript
const result = await ContractorDirectoryAPI.getAllContractors();
// Returns: { contractors: [...] } - Only approved contractors
```

#### Get by Specialty
```javascript
const result = await ContractorDirectoryAPI.getContractorsBySpecialty('plumbing');
```

#### Search Contractors
```javascript
const result = await ContractorDirectoryAPI.searchContractors('smith');
// Searches by name or business name
```

#### Sort by Rating
```javascript
const result = await ContractorDirectoryAPI.getContractorsSortedByRating(false);
// false = highest rated first, true = lowest rated first
```

#### Sort by Experience
```javascript
const result = await ContractorDirectoryAPI.getContractorsSortedByExperience(false);
// false = most experienced first
```

#### Get Featured Contractors
```javascript
const result = await ContractorDirectoryAPI.getFeaturedContractors(6);
// Returns top 6 contractors by rating + experience
```

#### Get Statistics
```javascript
const stats = await ContractorDirectoryAPI.getDirectoryStats();
// Returns: { total, averageRating, trades, averageExperience }
```

#### Get Available Specialties
```javascript
const specialties = await ContractorDirectoryAPI.getAvailableSpecialties();
// Returns: ['plumbing', 'electrical', 'hvac', ...]
```

---

## Public Contractor Profile API

### Include in HTML
```html
<script src="contractor-public-profile-api.js"></script>
```

### Available Functions

#### Get Public Profile
```javascript
const result = await ContractorPublicProfileAPI.getProfileById('contractor-001');
// Returns: { contractor: {...} }
```

#### Get Reviews
```javascript
const result = await ContractorPublicProfileAPI.getReviews('contractor-001');
// Returns: { reviews: [...], averageRating, totalReviews }
```

#### Submit Review
```javascript
const result = await ContractorPublicProfileAPI.submitReview('contractor-001', {
  rating: 5,
  comment: 'Great work!',
  jobId: 'job-123'
});
```

#### Get Portfolio
```javascript
const result = await ContractorPublicProfileAPI.getPortfolio('contractor-001', 10);
// Returns: { portfolio: [...] } - Recent completed jobs
```

#### Get Availability
```javascript
const result = await ContractorPublicProfileAPI.getAvailability('contractor-001');
// Returns: { available: true, nextOpenDate: '2026-02-05' }
```

#### Request Quote
```javascript
const result = await ContractorPublicProfileAPI.requestQuote('contractor-001', {
  description: 'Need plumbing repair',
  serviceType: 'pipe repair',
  budget: 500,
  urgency: 'normal',
  location: '123 Main St',
  preferredDate: '2026-02-08',
  contactName: 'Jane Customer',
  contactEmail: 'jane@customer.com',
  contactPhone: '+1 416-555-9999'
});
```

#### Bookmark Contractor
```javascript
const result = await ContractorPublicProfileAPI.bookmarkContractor('contractor-001');
```

#### Check if Bookmarked
```javascript
const isBookmarked = await ContractorPublicProfileAPI.isBookmarked('contractor-001');
// Returns: true or false
```

#### Get Service Areas
```javascript
const result = await ContractorPublicProfileAPI.getServiceAreas('contractor-001');
// Returns: { serviceAreas: [...], coverage: 'City-wide' }
```

---

## Common Response Formats

### Successful Response
```json
{
  "contractors": [...],
  "status": "success"
}
```

### Error Response
```json
{
  "error": "Failed to fetch contractors",
  "statusCode": 500
}
```

---

## Error Handling

```javascript
try {
  const contractors = await AdminContractorAPI.getAllContractors();
  console.log(contractors);
} catch (error) {
  console.error('Error:', error.message);
  
  // Common errors:
  // - 401: Not authenticated
  // - 404: Not found
  // - 500: Server error
}
```

---

## Authentication

All admin functions require a JWT token. Tokens are stored in `localStorage` or `sessionStorage`:

```javascript
// Token is automatically retrieved from storage
// Make sure user is logged in before calling admin functions

// Check authentication status
if (AdminContractorAPI.isAuthenticated()) {
  // User is logged in
} else {
  // User needs to log in
}
```

---

## Environment Configuration

### Development
```javascript
AdminContractorAPI.setApiBaseUrl('http://localhost:3000/api');
```

### Production
```javascript
AdminContractorAPI.setApiBaseUrl('https://your-domain.com/api');
```

---

## Real Data vs Mock Data

### Before (Mock)
```javascript
const mockContractors = [
  { id: 'contractor-001', name: 'John Smith' }
];
```

### After (Real API)
```javascript
const result = await AdminContractorAPI.getAllContractors();
const contractors = result.contractors;
// Actual data from database
```

---

## Live Examples

### Example 1: Display All Contractors
```javascript
async function displayAllContractors() {
  try {
    const result = await AdminContractorAPI.getAllContractors();
    
    result.contractors.forEach(contractor => {
      console.log(`${contractor.business_name} - ${contractor.status}`);
    });
  } catch (error) {
    console.error('Failed to load contractors:', error.message);
  }
}
```

### Example 2: Approve a Contractor
```javascript
async function approveContractor(contractorId) {
  try {
    const result = await AdminContractorAPI.updateContractorStatus(
      contractorId,
      'approved'
    );
    console.log('Contractor approved:', result);
  } catch (error) {
    console.error('Failed to approve:', error.message);
  }
}
```

### Example 3: Show Contractor Directory
```javascript
async function displayDirectory() {
  try {
    const result = await ContractorDirectoryAPI.getAllContractors();
    const stats = await ContractorDirectoryAPI.getDirectoryStats();
    
    console.log(`Total contractors: ${stats.total}`);
    console.log(`Average rating: ${stats.averageRating}`);
    
    result.contractors.forEach(contractor => {
      console.log(`${contractor.business_name} (${contractor.primaryTrade})`);
    });
  } catch (error) {
    console.error('Failed to load directory:', error.message);
  }
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 401 Unauthorized | User is not logged in. Redirect to login page. |
| 404 Not Found | Contractor ID doesn't exist or endpoint not available. |
| Network Error | Make sure backend is running and API_BASE_URL is correct. |
| CORS Error | Backend CORS settings may need adjustment. |
| Empty Results | Try different search query or check filters. |

---

## Additional Resources

- See **API_INTEGRATION_GUIDE.md** for detailed setup instructions
- Check **backend/server.js** for server-side route implementations
- Review **backend/routes/admin.js** for endpoint details
