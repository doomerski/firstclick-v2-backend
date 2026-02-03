const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function uuidv4() {
  return crypto.randomUUID();
}

// Load full taxonomy from JSON file
let fullTaxonomy = { categories: [], serviceTypes: [] };
try {
  const taxonomyPath = path.join(__dirname, 'service-taxonomy.json');
  const taxonomyData = fs.readFileSync(taxonomyPath, 'utf8');
  fullTaxonomy = JSON.parse(taxonomyData);
  console.log(`✅ Loaded ${fullTaxonomy.categories.length} categories and ${fullTaxonomy.serviceTypes.length} service types`);
} catch (error) {
  console.warn('⚠️  Could not load service-taxonomy.json, using minimal dataset');
}

// MOCK CONTRACTORS WITH REALISTIC SPECIALTIES
const MOCK_CONTRACTORS = [
  {
    id: 'contractor-001',
    email: 'john@smithplumbing.com',
    password: 'password123',
    legal_name: 'John Smith',
    business_name: 'Smith Plumbing Co.',
    phone: '+1 416-555-1001',
    vetting_status: 'APPROVED_ACTIVE',
    status: 'approved',
    specialties: [1, 2, 3, 4, 5, 6, 7, 9, 10],
    skills: [1, 2, 3, 4, 5, 6, 7, 9, 10],
    primaryTrade: 'plumbing',
    experienceYears: 12,
    documents: {
      license: { filename: 'plumbing_license_001.pdf', mime: 'application/pdf', size: 245000, receivedAt: '2024-01-10' },
      insurance: { filename: 'insurance_001.pdf', mime: 'application/pdf', size: 187000, receivedAt: '2024-01-10' },
      governmentId: { filename: 'drivers_license_001.pdf', mime: 'application/pdf', size: 156000, receivedAt: '2024-01-10' }
    },
    adminNotes: 'Top performer, excellent customer reviews',
    auditLog: [
      { at: '2024-01-15', actorId: 'admin-001', action: 'APPROVED', details: 'Documents verified' },
      { at: '2024-01-10', actorId: 'admin-001', action: 'SUBMITTED', details: 'Application received' }
    ]
  },
  {
    id: 'contractor-002',
    email: 'sarah@sparkselectric.com',
    password: 'password123',
    legal_name: 'Sarah Johnson',
    business_name: 'Sparks Electric',
    phone: '+1 416-555-1002',
    vetting_status: 'APPROVED_ACTIVE',
    status: 'approved',
    specialties: [20, 22, 23, 24, 26],
    skills: [20, 22, 23, 24, 26],
    primaryTrade: 'electrical',
    experienceYears: 8,
    documents: {
      license: { filename: 'electrical_license_002.pdf', mime: 'application/pdf', size: 267000, receivedAt: '2024-01-12' },
      insurance: { filename: 'insurance_002.pdf', mime: 'application/pdf', size: 192000, receivedAt: '2024-01-12' },
      governmentId: { filename: 'passport_002.pdf', mime: 'application/pdf', size: 134000, receivedAt: '2024-01-12' }
    },
    adminNotes: 'Licensed electrician, responds quickly to jobs',
    auditLog: [
      { at: '2024-01-15', actorId: 'admin-001', action: 'APPROVED', details: 'All documents verified' },
      { at: '2024-01-12', actorId: 'admin-001', action: 'SUBMITTED', details: 'Application received' }
    ]
  },
  {
    id: 'contractor-003',
    email: 'mike@comforthvac.com',
    password: 'password123',
    legal_name: 'Mike Chen',
    business_name: 'Comfort HVAC Solutions',
    phone: '+1 416-555-1003',
    vetting_status: 'APPROVED_ACTIVE',
    status: 'approved',
    specialties: [40, 42, 44, 45, 46],
    skills: [40, 42, 44, 45, 46],
    primaryTrade: 'hvac',
    experienceYears: 15,
    documents: {
      license: { filename: 'hvac_license_003.pdf', mime: 'application/pdf', size: 289000, receivedAt: '2024-01-08' },
      insurance: { filename: 'insurance_003.pdf', mime: 'application/pdf', size: 201000, receivedAt: '2024-01-08' },
      governmentId: { filename: 'drivers_license_003.pdf', mime: 'application/pdf', size: 145000, receivedAt: '2024-01-08' }
    },
    adminNotes: 'Most experienced HVAC contractor, high ratings',
    auditLog: [
      { at: '2024-01-15', actorId: 'admin-001', action: 'APPROVED', details: 'Excellent credentials' },
      { at: '2024-01-08', actorId: 'admin-001', action: 'SUBMITTED', details: 'Application received' }
    ]
  },
  {
    id: 'contractor-004',
    email: 'lisa@fixitappliances.com',
    password: 'password123',
    legal_name: 'Lisa Martinez',
    business_name: 'Fix-It Appliance Repair',
    phone: '+1 416-555-1004',
    vetting_status: 'APPROVED_ACTIVE',
    status: 'approved',
    specialties: [60, 61, 62, 63, 64],
    skills: [60, 61, 62, 63, 64],
    primaryTrade: 'appliance-repair',
    experienceYears: 6,
    documents: {
      license: { filename: 'appliance_cert_004.pdf', mime: 'application/pdf', size: 201000, receivedAt: '2024-01-14' },
      insurance: { filename: 'insurance_004.pdf', mime: 'application/pdf', size: 178000, receivedAt: '2024-01-14' },
      governmentId: { filename: 'drivers_license_004.pdf', mime: 'application/pdf', size: 142000, receivedAt: '2024-01-14' }
    },
    adminNotes: 'Certified appliance technician, reliable',
    auditLog: [
      { at: '2024-01-15', actorId: 'admin-001', action: 'APPROVED', details: 'Documents verified' },
      { at: '2024-01-14', actorId: 'admin-001', action: 'SUBMITTED', details: 'Application received' }
    ]
  },
  {
    id: 'contractor-005',
    email: 'dave@handydave.com',
    password: 'password123',
    legal_name: 'Dave Wilson',
    business_name: 'Handy Dave Services',
    phone: '+1 416-555-1005',
    vetting_status: 'APPROVED_ACTIVE',
    status: 'approved',
    specialties: [100, 101, 102, 103, 5, 6, 23, 24],
    skills: [100, 101, 102, 103, 5, 6, 23, 24],
    primaryTrade: 'handyman',
    experienceYears: 10,
    documents: {
      license: { filename: 'general_license_005.pdf', mime: 'application/pdf', size: 223000, receivedAt: '2024-01-13' },
      insurance: { filename: 'insurance_005.pdf', mime: 'application/pdf', size: 189000, receivedAt: '2024-01-13' },
      governmentId: { filename: 'passport_005.pdf', mime: 'application/pdf', size: 138000, receivedAt: '2024-01-13' }
    },
    adminNotes: 'Versatile handyman, good for mixed jobs',
    auditLog: [
      { at: '2024-01-15', actorId: 'admin-001', action: 'APPROVED', details: 'All docs verified' },
      { at: '2024-01-13', actorId: 'admin-001', action: 'SUBMITTED', details: 'Application received' }
    ]
  },
  {
    id: 'contractor-006',
    email: 'emma@emergencyplumbing.com',
    password: 'password123',
    legal_name: 'Emma Davis',
    business_name: '24/7 Emergency Plumbing',
    phone: '+1 416-555-1006',
    vetting_status: 'APPROVED_ACTIVE',
    status: 'approved',
    specialties: [1, 2, 3, 4, 7, 10],
    skills: [1, 2, 3, 4, 7, 10],
    primaryTrade: 'plumbing',
    experienceYears: 9,
    documents: {
      license: { filename: 'plumbing_license_006.pdf', mime: 'application/pdf', size: 256000, receivedAt: '2024-01-11' },
      insurance: { filename: 'insurance_006.pdf', mime: 'application/pdf', size: 195000, receivedAt: '2024-01-11' },
      governmentId: { filename: 'drivers_license_006.pdf', mime: 'application/pdf', size: 151000, receivedAt: '2024-01-11' }
    },
    adminNotes: '24/7 availability, specializes in emergency calls',
    auditLog: [
      { at: '2024-01-15', actorId: 'admin-001', action: 'APPROVED', details: 'Documents verified' },
      { at: '2024-01-11', actorId: 'admin-001', action: 'SUBMITTED', details: 'Application received' }
    ]
  },
  {
    id: 'contractor-007',
    email: 'alex@roofingpro.com',
    password: 'password123',
    legal_name: 'Alex Thompson',
    business_name: 'Roofing Pro Services',
    phone: '+1 416-555-1007',
    vetting_status: 'PENDING_DOCUMENTS',
    status: 'pending_review',
    specialties: [],
    skills: [],
    primaryTrade: 'roofing',
    experienceYears: 5,
    documents: {
      license: { filename: 'roofing_license_007.pdf', mime: 'application/pdf', size: 234000, receivedAt: '2024-01-25' },
      insurance: null,
      governmentId: null
    },
    adminNotes: 'Awaiting insurance certificate and government ID',
    auditLog: [
      { at: '2024-01-25', actorId: 'admin-001', action: 'SUBMITTED', details: 'Application received - missing docs' }
    ]
  },
  {
    id: 'contractor-008',
    email: 'james@pipeworksplumbing.com',
    password: 'password123',
    legal_name: 'James Rodriguez',
    business_name: 'PipeWorks Plumbing',
    phone: '+1 416-555-1008',
    vetting_status: 'PENDING_DOCUMENTS',
    status: 'pending_review',
    specialties: [],
    skills: [],
    primaryTrade: 'plumbing',
    experienceYears: 7,
    documents: {
      license: { filename: 'plumbing_license_008.pdf', mime: 'application/pdf', size: 251000, receivedAt: '2024-01-28' },
      insurance: null,
      governmentId: null
    },
    adminNotes: 'Pending verification - waiting for insurance and ID',
    auditLog: [
      { at: '2024-01-28', actorId: 'admin-001', action: 'SUBMITTED', details: 'Application received' }
    ]
  }
];

const db = {
  customers: [
    {
      id: uuidv4(),
      email: 'customer@firstclick.com',
      full_name: 'Test Customer',
      phone: '+1 555-000-0000',
      role: 'customer',
      password_hash: bcrypt.hashSync('customer123', 10),
      created_at: new Date(),
      updated_at: new Date()
    }
  ],
  
  // Pre-seed contractors with specialties
  contractors: MOCK_CONTRACTORS.map(c => ({
    id: c.id,
    email: c.email,
    password_hash: bcrypt.hashSync(c.password, 10),
    legal_name: c.legal_name,
    business_name: c.business_name,
    phone: c.phone,
    role: 'contractor',
    vetting_status: c.vetting_status,
    status: c.status,
    skills: c.skills,
    primaryTrade: c.primaryTrade,
    experienceYears: c.experienceYears,
    payment_schedule: 'weekly',
    documents: c.documents,
    adminNotes: c.adminNotes,
    auditLog: c.auditLog,
    approved_at: new Date('2024-01-15'),
    application_submitted_at: new Date('2024-01-01'),
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-15')
  })),
  
  // Contractor specialties (junction table)
  contractor_specialties: MOCK_CONTRACTORS.flatMap(c =>
    c.specialties.map(service_type_id => ({
      contractor_id: c.id,
      service_type_id: service_type_id,
      is_verified: true,
      created_at: new Date('2024-01-01')
    }))
  ),
  
  admins: [
    {
      id: uuidv4(),
      email: 'admin@firstclick.com',
      password_hash: bcrypt.hashSync('admin123', 10),
      full_name: 'System Admin',
      role: 'admin',
      is_active: true,
      created_at: new Date()
    },
    {
      id: uuidv4(),
      email: 'robert1',
      password_hash: bcrypt.hashSync('Imaging-Unbeaten-Fiddle-Tuition-Courier-Pants1', 10),
      full_name: 'Robert Super Admin',
      role: 'super_admin',
      is_active: true,
      created_at: new Date()
    }
  ],
  jobs: [
    // Test jobs for payout demo
    {
      id: 'job-001',
      customer_id: 'cust-001',
      contractor_id: 'contractor-001',
      service_category_id: 1,
      service_type_id: 1,
      address_id: 'addr-001',
      description: 'Emergency plumbing repair - burst pipe',
      urgency: 'same-day',
      time_window: 'flexible',
      status: 'completed',
      payment_status: 'paid',
      payout_status: 'ready',
      final_price: 450,
      material_fees: 125,
      contractor_tier: 'bronze',
      completed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    },
    {
      id: 'job-002',
      customer_id: 'cust-002',
      contractor_id: 'contractor-002',
      service_category_id: 2,
      service_type_id: 20,
      address_id: 'addr-002',
      description: 'Electrical outlet installation (4 outlets)',
      urgency: 'standard',
      time_window: 'flexible',
      status: 'completed',
      payment_status: 'paid',
      payout_status: 'ready',
      final_price: 320,
      material_fees: 80,
      contractor_tier: 'silver',
      completed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    },
    {
      id: 'job-003',
      customer_id: 'cust-003',
      contractor_id: 'contractor-003',
      service_category_id: 3,
      service_type_id: 40,
      address_id: 'addr-003',
      description: 'HVAC system maintenance and filter replacement',
      urgency: 'standard',
      time_window: 'flexible',
      status: 'completed',
      payment_status: 'paid',
      payout_status: 'ready',
      final_price: 280,
      material_fees: 45,
      contractor_tier: 'gold',
      completed_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    },
    {
      id: 'job-004',
      customer_id: 'cust-004',
      contractor_id: 'contractor-001',
      service_category_id: 1,
      service_type_id: 2,
      address_id: 'addr-004',
      description: 'Water heater replacement',
      urgency: 'standard',
      time_window: 'flexible',
      status: 'completed',
      payment_status: 'paid',
      payout_status: 'ready',
      final_price: 650,
      material_fees: 300,
      contractor_tier: 'bronze',
      completed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    }
  ],
  addresses: [
    { id: 'addr-001', address_line1: '123 Main St', city: 'Toronto', province: 'ON', postal_code: 'M5H 2N2', property_type: 'house', created_at: new Date() },
    { id: 'addr-002', address_line1: '456 Queen St', city: 'Toronto', province: 'ON', postal_code: 'M5H 3A1', property_type: 'condo', created_at: new Date() },
    { id: 'addr-003', address_line1: '789 King St', city: 'Mississauga', province: 'ON', postal_code: 'L5B 4A1', property_type: 'house', created_at: new Date() },
    { id: 'addr-004', address_line1: '321 Dundas St', city: 'Toronto', province: 'ON', postal_code: 'M5T 1G1', property_type: 'condo', created_at: new Date() }
  ],
  
  // Use full taxonomy if loaded
  service_categories: fullTaxonomy.categories.length > 0 
    ? fullTaxonomy.categories 
    : [],
  
  service_types: fullTaxonomy.serviceTypes.length > 0
    ? fullTaxonomy.serviceTypes
    : [],
  
  contractor_documents: [],
  contractor_payments: [],
  payments: [],
  sessions: [],
  audit_logs: [],
  job_status_events: []
};

class MockPool {
  async query(sql, params = []) {
    const sqlLower = sql.toLowerCase().trim();
    
    // Customer queries
    if (sqlLower.includes('select * from customers where lower(email)')) {
      const email = String(params[0] || '').toLowerCase();
      const customer = db.customers.find(c => String(c.email || '').toLowerCase() === email);
      return { rows: customer ? [customer] : [] };
    }

    if (sqlLower.includes('select * from customers where email')) {
      const email = String(params[0] || '').toLowerCase();
      const customer = db.customers.find(c => String(c.email || '').toLowerCase() === email);
      return { rows: customer ? [customer] : [] };
    }

    if (sqlLower.includes('select * from customers where id')) {
      const id = params[0];
      const customer = db.customers.find(c => c.id === id);
      return { rows: customer ? [customer] : [] };
    }

    if (sqlLower.includes('select * from customers')) {
      return { rows: db.customers };
    }
    
    if (sqlLower.includes('insert into customers')) {
      const [email, full_name, phone, password_hash] = params;
      const customer = {
        id: uuidv4(),
        email,
        full_name,
        phone,
        role: 'customer',
        password_hash: password_hash || null,
        created_at: new Date(),
        updated_at: new Date()
      };
      db.customers.push(customer);
      return { rows: [customer] };
    }

    if (sqlLower.includes('update customers set password_hash')) {
      const [password_hash, full_name, phone, id] = params;
      const targetId = params.length === 2 ? params[1] : id;
      const nextFullName = params.length === 2 ? undefined : full_name;
      const nextPhone = params.length === 2 ? undefined : phone;
      const customer = db.customers.find(c => c.id === targetId);
      if (!customer) return { rows: [] };
      customer.password_hash = password_hash;
      if (nextFullName !== undefined) {
        customer.full_name = nextFullName ?? customer.full_name;
      }
      if (nextPhone !== undefined) {
        customer.phone = nextPhone ?? customer.phone;
      }
      customer.updated_at = new Date();
      return { rows: [customer] };
    }
    
    // Contractor queries
    // Contractor queries - CHECK ID/EMAIL FIRST BEFORE GENERIC QUERY
    if (sqlLower.includes('select * from contractors where id')) {
      const contractorId = params[0];
      const contractor = db.contractors.find(c => c.id === contractorId);
      return { rows: contractor ? [contractor] : [] };
    }

    if (sqlLower.includes('select * from contractors where email')) {
      const email = params[0];
      const contractor = db.contractors.find(c => c.email === email);
      return { rows: contractor ? [contractor] : [] };
    }

    if (sqlLower.includes('select * from contractors') && !sqlLower.includes('where')) {
      return { rows: db.contractors };
    }
    
    // Admin queries
    if (sqlLower.includes('select * from admins where email')) {
      const email = params[0];
      const admin = db.admins.find(a => a.email === email);
      return { rows: admin ? [admin] : [] };
    }

    if (sqlLower.includes('select * from admins')) {
      return { rows: db.admins };
    }

    if (sqlLower.includes('insert into admins')) {
      const [email, password_hash, full_name, role] = params;
      const admin = {
        id: uuidv4(),
        email,
        password_hash,
        full_name: full_name || null,
        role: role || 'admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };
      db.admins.push(admin);
      return { rows: [admin] };
    }

    if (sqlLower.includes('update admins set') && sqlLower.includes('superadmin_update')) {
      const setSegment = sqlLower.split('set')[1].split('where')[0];
      const fieldTokens = setSegment.split(',').map(token => token.trim());
      const fields = fieldTokens
        .map(token => token.split('=')[0].trim())
        .filter(field => field && field !== 'updated_at');
      const adminId = params[params.length - 1];
      const admin = db.admins.find(a => a.id === adminId);
      if (!admin) return { rows: [] };
      fields.forEach((field, index) => {
        admin[field] = params[index];
      });
      admin.updated_at = new Date();
      return { rows: [admin] };
    }

    if (sqlLower.includes('delete from admins')) {
      const adminId = params[0];
      const index = db.admins.findIndex(a => a.id === adminId);
      if (index === -1) return { rows: [] };
      const [removed] = db.admins.splice(index, 1);
      return { rows: [removed] };
    }

    if (sqlLower.includes('update customers set') && sqlLower.includes('superadmin_update')) {
      const setSegment = sqlLower.split('set')[1].split('where')[0];
      const fieldTokens = setSegment.split(',').map(token => token.trim());
      const fields = fieldTokens
        .map(token => token.split('=')[0].trim())
        .filter(field => field && field !== 'updated_at');
      const customerId = params[params.length - 1];
      const customer = db.customers.find(c => c.id === customerId);
      if (!customer) return { rows: [] };
      fields.forEach((field, index) => {
        customer[field] = params[index];
      });
      customer.updated_at = new Date();
      return { rows: [customer] };
    }

    if (sqlLower.includes('delete from customers')) {
      const customerId = params[0];
      const index = db.customers.findIndex(c => c.id === customerId);
      if (index === -1) return { rows: [] };
      const [removed] = db.customers.splice(index, 1);
      return { rows: [removed] };
    }

    if (sqlLower.includes('update contractors set') && sqlLower.includes('superadmin_update')) {
      const setSegment = sqlLower.split('set')[1].split('where')[0];
      const fieldTokens = setSegment.split(',').map(token => token.trim());
      const fields = fieldTokens
        .map(token => token.split('=')[0].trim())
        .filter(field => field && field !== 'updated_at');
      const contractorId = params[params.length - 1];
      const contractor = db.contractors.find(c => c.id === contractorId);
      if (!contractor) return { rows: [] };
      fields.forEach((field, index) => {
        contractor[field] = params[index];
      });
      contractor.updated_at = new Date();
      return { rows: [contractor] };
    }

    if (sqlLower.includes('delete from contractors')) {
      const contractorId = params[0];
      const index = db.contractors.findIndex(c => c.id === contractorId);
      if (index === -1) return { rows: [] };
      const [removed] = db.contractors.splice(index, 1);
      return { rows: [removed] };
    }
    
    // SERVICE CATALOG QUERIES
    if (sqlLower.includes('select * from service_categories')) {
      return { rows: db.service_categories.filter(c => c.is_active !== false) };
    }
    
    if (sqlLower.includes('select * from service_types where category_id')) {
      const categoryId = params[0];
      const types = db.service_types.filter(t => 
        t.category_id === parseInt(categoryId) && t.is_active !== false
      );
      return { rows: types };
    }
    
    if (sqlLower.includes('select * from service_types')) {
      return { rows: db.service_types.filter(t => t.is_active !== false) };
    }
    
    // CONTRACTOR SPECIALTIES QUERIES
    if (sqlLower.includes('select service_type_id from contractor_specialties where contractor_id')) {
      const contractor_id = params[0];
      const specialties = db.contractor_specialties
        .filter(cs => cs.contractor_id === contractor_id)
        .map(cs => ({ service_type_id: cs.service_type_id }));
      return { rows: specialties };
    }

    if (sqlLower.includes('delete from contractor_specialties where contractor_id')) {
      const contractor_id = params[0];
      const before = db.contractor_specialties.length;
      db.contractor_specialties = db.contractor_specialties.filter(cs => cs.contractor_id !== contractor_id);
      const deleted = before - db.contractor_specialties.length;
      return { rows: [], rowCount: deleted };
    }

    if (sqlLower.includes('insert into contractor_specialties')) {
      const [contractor_id, ...serviceTypeIds] = params;
      const timestamp = new Date();
      const existingKeys = new Set(
        db.contractor_specialties.map(cs => `${cs.contractor_id}:${cs.service_type_id}`)
      );
      const values = serviceTypeIds.length ? serviceTypeIds : (params.length >= 2 ? [params[1]] : []);
      const newRows = [];
      values.forEach(service_type_id => {
        if (service_type_id == null) return;
        const key = `${contractor_id}:${service_type_id}`;
        if (existingKeys.has(key)) {
          return;
        }
        existingKeys.add(key);
        const entry = {
          contractor_id,
          service_type_id,
          is_verified: true,
          created_at: timestamp
        };
        db.contractor_specialties.push(entry);
        newRows.push(entry);
      });
      return { rows: newRows };
    }
    
    // Address queries
    if (sqlLower.includes('insert into addresses')) {
      const [address_line1, address_line2, city, province, postal_code, property_type] = params;
      const address = {
        id: uuidv4(),
        address_line1,
        address_line2,
        city,
        province,
        postal_code,
        property_type,
        created_at: new Date()
      };
      db.addresses.push(address);
      return { rows: [address] };
    }
    
    // Job queries
    if (sqlLower.includes('insert into jobs') && sqlLower.includes('returning')) {
      const [customer_id, service_category_id, service_type_id, address_id, description, urgency, time_window, status] = params;
      
      const serviceType = db.service_types.find(st => st.id === service_type_id);
      
      const job = {
        id: uuidv4(),
        customer_id,
        service_category_id,
        service_type_id,
        address_id,
        description,
        urgency: urgency || 'scheduled',
        time_window: time_window || 'flexible',
        status: status || 'submitted',
        payment_status: 'unpaid',
        payout_status: 'not_ready',
        final_price: null,
        assignedContractorId: null,
        taxonomy_snapshot: {
          category_id: service_category_id,
          service_type_id: service_type_id,
          service_type_name: serviceType?.name,
          is_emergency_supported: serviceType?.is_emergency_supported,
          requires_license: serviceType?.requires_license,
          is_quote_only: serviceType?.is_quote_only,
          taxonomy_version: '1.0'
        },
        cancellation: null,
        relistCount: 0,
        history: [
          { at: new Date(), actorType: 'system', actorId: null, action: 'CREATED', details: 'Job created by customer' }
        ],
        created_at: new Date(),
        updated_at: new Date()
      };
      db.jobs.push(job);
      return { rows: [job] };
    }
    
    // Get jobs with contractor matching
    if (sqlLower.includes('from jobs') && sqlLower.includes('where') && params.length === 1 && !sqlLower.includes('count(')) {
      const param = params[0];
      let jobs = [];
      
      // Check if looking for customer jobs or contractor jobs
      if (sqlLower.includes('customer_id')) {
        jobs = db.jobs
          .filter(j => j.customer_id === param)
          .map(j => this._enrichJobData(j));
      } else if (sqlLower.includes('contractor_id')) {
        jobs = db.jobs
          .filter(j => j.contractor_id === param)
          .map(j => this._enrichJobData(j));
      } else if (sqlLower.includes('where id')) {
        jobs = db.jobs
          .filter(j => j.id === param)
          .map(j => this._enrichJobData(j));
      }
      return { rows: jobs };
    }
    
    if (sqlLower.includes('select * from jobs') && !sqlLower.includes('where')) {
      const jobs = db.jobs.map(j => this._enrichJobData(j));
      return { rows: jobs };
    }
    
    // GET AVAILABLE JOBS FOR CONTRACTOR (filtered by their specialties)
    if (sqlLower.includes('available jobs for contractor')) {
      const contractor_id = params[0];
      const contractorSpecialties = db.contractor_specialties
        .filter(cs => cs.contractor_id === contractor_id)
        .map(cs => cs.service_type_id);
      
      const availableJobs = db.jobs
        .filter(j => 
          (j.status === 'submitted' || j.status === 'ready_to_assign' || j.status === 'open') &&
          !j.assignedContractorId &&
          !j.contractor_id &&
          contractorSpecialties.includes(j.service_type_id)
        )
        .map(j => this._enrichJobData(j));
      
      return { rows: availableJobs };
    }
    
    // Update job queries
    if (sqlLower.includes('update jobs set contractor_id')) {
      const [contractor_id, status, jobId] = params;
      const job = db.jobs.find(j => j.id === jobId);
      if (job) {
        job.assignedContractorId = contractor_id;
        job.contractor_id = contractor_id;
        job.status = status;
        job.updated_at = new Date();
        job.history.push({
          at: new Date(),
          actorType: 'system',
          actorId: contractor_id,
          action: 'ACCEPTED',
          details: `Job accepted by contractor ${contractor_id}`
        });
      }
      return { rows: job ? [job] : [] };
    }
    
    if (sqlLower.includes('update jobs set status') && sqlLower.includes('contractor_id') && sqlLower.includes('contractor_end')) {
      const [status, contractor_id, jobId] = params;
      const job = db.jobs.find(j => j.id === jobId);
      if (job) {
        job.status = status;
        job.assignedContractorId = contractor_id;
        job.contractor_id = contractor_id;
        job.updated_at = new Date();
      }
      return { rows: job ? [job] : [] };
    }

    if (sqlLower.includes('update jobs set status') && sqlLower.includes('contractor_id') && sqlLower.includes('relist')) {
      const [status, contractor_id, jobId] = params;
      const job = db.jobs.find(j => j.id === jobId);
      if (job) {
        job.status = status;
        job.assignedContractorId = contractor_id;
        job.contractor_id = contractor_id;
        job.updated_at = new Date();
      }
      return { rows: job ? [job] : [] };
    }

    if (sqlLower.includes('update jobs set status')) {
      const [status, jobId] = params;
      const job = db.jobs.find(j => j.id === jobId);
      if (job) {
        job.status = status;
        if (status === 'completed') {
          job.completed_at = new Date();
        }
        job.updated_at = new Date();
      }
      return { rows: job ? [job] : [] };
    }

    if (sqlLower.includes('update jobs set payout_status')) {
      const [payout_status, jobId] = params;
      const job = db.jobs.find(j => j.id === jobId);
      if (job) {
        job.payout_status = payout_status;
        job.updated_at = new Date();
      }
      return { rows: job ? [job] : [] };
    }

    if (sqlLower.includes('update jobs set') && sqlLower.includes('admin_update')) {
      const setSegment = sqlLower.split('set')[1].split('where')[0];
      const fieldTokens = setSegment.split(',').map(token => token.trim());
      const fields = fieldTokens
        .map(token => token.split('=')[0].trim())
        .filter(field => field && field !== 'updated_at');
      const jobId = params[params.length - 1];
      const job = db.jobs.find(j => j.id === jobId);
      if (!job) return { rows: [] };
      fields.forEach((field, index) => {
        job[field] = params[index];
      });
      job.updated_at = new Date();
      return { rows: [job] };
    }

    if (sqlLower.includes('update jobs set payment_status')) {
      const [payment_status, payout_status, jobId] = params;
      const job = db.jobs.find(j => j.id === jobId);
      if (job) {
        job.payment_status = payment_status;
        if (payout_status) {
          job.payout_status = payout_status;
        }
        job.updated_at = new Date();
      }
      return { rows: job ? [job] : [] };
    }

    if (sqlLower.includes('insert into contractor_payments')) {
      const [payment_id, contractor_id, amount, job_ids, payment_schedule, payment_method, status] = params;
      const payment = {
        payment_id,
        contractor_id,
        amount,
        job_ids,
        payment_schedule,
        payment_method,
        status,
        initiated_at: new Date()
      };
      db.contractor_payments.push(payment);
      return { rows: [payment] };
    }

    if (sqlLower.includes('select * from payments where id')) {
      const id = params[0];
      const payment = db.payments.find(p => p.id === id);
      return { rows: payment ? [payment] : [] };
    }

    if (sqlLower.includes('select * from payments where customer_id')) {
      const customerId = params[0];
      const payments = db.payments.filter(p => p.customer_id === customerId);
      return { rows: payments };
    }

    if (sqlLower.includes('select * from payments')) {
      return { rows: db.payments };
    }

    if (sqlLower.includes('insert into payments')) {
      const [
        id,
        customer_id,
        job_id,
        amount,
        currency,
        status,
        payment_method,
        transaction_id,
        notes,
        paid_at
      ] = params;
      const payment = {
        id,
        customer_id,
        job_id,
        amount,
        currency,
        status,
        payment_method,
        transaction_id,
        notes,
        paid_at: paid_at || null,
        created_at: new Date(),
        updated_at: new Date()
      };
      db.payments.push(payment);
      return { rows: [payment] };
    }

    if (sqlLower.includes('update payments set') && sqlLower.includes('admin_payment_update')) {
      const setSegment = sqlLower.split('set')[1].split('where')[0];
      const fieldTokens = setSegment.split(',').map(token => token.trim());
      const fields = fieldTokens
        .map(token => token.split('=')[0].trim())
        .filter(field => field && field !== 'updated_at');
      const paymentId = params[params.length - 1];
      const payment = db.payments.find(p => p.id === paymentId);
      if (!payment) return { rows: [] };
      fields.forEach((field, index) => {
        payment[field] = params[index];
      });
      payment.updated_at = new Date();
      return { rows: [payment] };
    }

    if (sqlLower.includes('delete from payments')) {
      const id = params[0];
      const index = db.payments.findIndex(p => p.id === id);
      if (index === -1) return { rows: [] };
      const [removed] = db.payments.splice(index, 1);
      return { rows: [removed] };
    }

    if (sqlLower.includes('select * from sessions where id')) {
      const id = params[0];
      const session = db.sessions.find(s => s.id === id);
      return { rows: session ? [session] : [] };
    }

    if (sqlLower.includes('select * from sessions')) {
      return { rows: db.sessions };
    }

    if (sqlLower.includes('insert into sessions')) {
      const [id, user_id, user_role, created_at, expires_at, revoked_at] = params;
      const session = {
        id,
        user_id,
        user_role,
        created_at: created_at || new Date(),
        expires_at: expires_at || null,
        revoked_at: revoked_at || null
      };
      db.sessions.push(session);
      return { rows: [session] };
    }

    if (sqlLower.includes('update sessions set revoked_at')) {
      const [revoked_at, idOrUser] = params;
      const sessions = db.sessions.filter(s => s.id === idOrUser || s.user_id === idOrUser);
      if (sessions.length === 0) return { rows: [] };
      sessions.forEach(session => {
        session.revoked_at = revoked_at || new Date().toISOString();
        session.updated_at = new Date();
      });
      return { rows: sessions };
    }

    if (sqlLower.includes('delete from sessions') && sqlLower.includes('cleanup')) {
      const now = new Date();
      const before = db.sessions.length;
      db.sessions = db.sessions.filter(session => {
        const expired = session.expires_at && new Date(session.expires_at) <= now;
        return !(expired || session.revoked_at);
      });
      return { rows: [], deleted: before - db.sessions.length };
    }

    if (sqlLower.includes('delete from sessions')) {
      const id = params[0];
      const index = db.sessions.findIndex(s => s.id === id);
      if (index === -1) return { rows: [] };
      const [removed] = db.sessions.splice(index, 1);
      return { rows: [removed] };
    }

    if (sqlLower.includes('insert into audit_logs')) {
      const [user_id, user_email, user_role, action, resource_type, resource_id, details, ip_address, user_agent, created_at] = params;
      const log = {
        id: db.audit_logs.length + 1,
        user_id,
        user_email,
        user_role,
        action,
        resource_type,
        resource_id,
        entity_id: resource_id,
        details,
        ip_address,
        user_agent,
        created_at: created_at || new Date().toISOString()
      };
      db.audit_logs.push(log);
      return { rows: [log] };
    }

    if (
      sqlLower.includes('select id, action') &&
      sqlLower.includes('from audit_logs') &&
      sqlLower.includes('where user_id')
    ) {
      const targetId = params[0];
      const matchesTarget = (log) => {
        const idStr = targetId != null ? String(targetId) : null;
        if (!idStr) return false;
        if (log.user_id && String(log.user_id) === idStr) return true;
        if (log.entity_id && String(log.entity_id) === idStr) return true;
        if (log.resource_id && String(log.resource_id) === idStr) return true;
        return false;
      };
      const rows = db.audit_logs
        .filter(matchesTarget)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 3)
        .map(log => ({
          id: log.id,
          action: log.action,
          details: log.details,
          timestamp: log.created_at,
          created_at: log.created_at
        }));
      return { rows };
    }

    if (sqlLower.includes('select distinct action from audit_logs')) {
      const actions = Array.from(new Set(db.audit_logs.map(log => log.action))).map(action => ({ action }));
      return { rows: actions };
    }

    if (sqlLower.includes('select * from audit_logs')) {
      return { rows: db.audit_logs };
    }

    if (sqlLower.includes('update jobs set start_report')) {
      const [start_report, jobId] = params;
      const job = db.jobs.find(j => j.id === jobId);
      if (job) {
        job.start_report = start_report;
        job.updated_at = new Date();
      }
      return { rows: job ? [job] : [] };
    }

    if (sqlLower.includes('update jobs set completion_report')) {
      const [completion_report, jobId] = params;
      const job = db.jobs.find(j => j.id === jobId);
      if (job) {
        job.completion_report = completion_report;
        job.updated_at = new Date();
      }
      return { rows: job ? [job] : [] };
    }

    if (sqlLower.includes('update jobs set material_fees')) {
      const [material_fees, jobId] = params;
      const job = db.jobs.find(j => j.id === jobId);
      if (job) {
        job.material_fees = material_fees;
        job.updated_at = new Date();
      }
      return { rows: job ? [job] : [] };
    }
    
    // Contractor queries
    if (sqlLower.includes('insert into contractors')) {
      const buildDoc = (doc) => {
        if (!doc) return null;
        if (typeof doc === 'string') {
          return {
            filename: doc,
            receivedAt: new Date().toISOString(),
            size: 0,
            mime: null,
            dataUrl: null
          };
        }
        return {
          filename: doc.filename || 'document',
          receivedAt: new Date().toISOString(),
          size: doc.size || 0,
          mime: doc.mime || null,
          dataUrl: doc.dataUrl || null
        };
      };
      const docsParam = params[8] || {};
      const contractor = {
        id: uuidv4(),
        email: params[0],
        password_hash: params[1],
        legal_name: params[2],
        business_name: params[3],
        phone: params[4],
        role: 'contractor',
        vetting_status: params[5] || 'UNDER_REVIEW',
        status: 'pending_review',
        primaryTrade: params[6] || null,
        experienceYears: params[7] || null,
        documents: {
          license: buildDoc(docsParam.license),
          insurance: buildDoc(docsParam.insurance),
          governmentId: buildDoc(docsParam.government_id)
        },
        application_submitted_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };
      db.contractors.push(contractor);
      return { rows: [contractor] };
    }

    // Check ID query FIRST before generic contractors query
    if (sqlLower.includes('select * from contractors where id')) {
      const contractorId = params[0];
      const contractor = db.contractors.find(c => c.id === contractorId);
      console.log(`🔍 [MockPool] Query for contractor ID: ${contractorId} -> Found: ${contractor ? contractor.business_name : 'NOT FOUND'}`);
      return { rows: contractor ? [contractor] : [] };
    }
    
    if (sqlLower.includes('select * from contractors where email')) {
      const email = params[0];
      const contractor = db.contractors.find(c => c.email === email);
      return { rows: contractor ? [contractor] : [] };
    }
    
    if (sqlLower.includes('select * from contractors') && !sqlLower.includes('where')) {
      return { rows: db.contractors };
    }
    
    if (sqlLower.includes('update contractors set vetting_status')) {
      const [vetting_status, contractorId] = params;
      const contractor = db.contractors.find(c => c.id === contractorId);
      if (contractor) {
        contractor.vetting_status = vetting_status;
        contractor.updated_at = new Date();
        if (vetting_status === 'APPROVED_ACTIVE') {
          contractor.approved_at = new Date();
        }
      }
      return { rows: contractor ? [contractor] : [] };
    }

    if (sqlLower.includes('update contractors set contractor_tier')) {
      const [contractor_tier, contractorId] = params;
      const contractor = db.contractors.find(c => c.id === contractorId);
      if (contractor) {
        contractor.contractor_tier = contractor_tier;
        contractor.updated_at = new Date();
      }
      return { rows: contractor ? [contractor] : [] };
    }

    if (sqlLower.includes('update contractors set status')) {
      const [status, vetting_status, contractorId] = params;
      const contractor = db.contractors.find(c => c.id === contractorId);
      if (contractor) {
        contractor.status = status;
        contractor.vetting_status = vetting_status;
        contractor.updated_at = new Date();
      }
      return { rows: contractor ? [contractor] : [] };
    }

    if (sqlLower.includes('update contractors set payment_schedule')) {
      const [payment_schedule, contractorId] = params;
      const contractor = db.contractors.find(c => c.id === contractorId);
      if (contractor) {
        contractor.payment_schedule = payment_schedule;
        contractor.updated_at = new Date();
      }
      return { rows: contractor ? [contractor] : [] };
    }

    if (sqlLower.includes('update contractors set documents')) {
      const [documents, contractorId] = params;
      const contractor = db.contractors.find(c => c.id === contractorId);
      if (contractor) {
        contractor.documents = documents;
        contractor.updated_at = new Date();
      }
      return { rows: contractor ? [contractor] : [] };
    }

    if (sqlLower.includes('update contractors set legal_name')) {
      const [legal_name, business_name, email, phone, primary_trade, secondary_trades, service_types, experience_years, contractorId] = params;
      const contractor = db.contractors.find(c => c.id === contractorId);
      if (contractor) {
        contractor.legal_name = legal_name;
        contractor.business_name = business_name;
        contractor.email = email;
        contractor.phone = phone;
        contractor.primaryTrade = primary_trade || null;
        contractor.secondaryTrades = Array.isArray(secondary_trades) ? secondary_trades : secondary_trades ? [secondary_trades] : null;
        contractor.serviceTypes = Array.isArray(service_types) ? service_types : service_types ? [service_types] : null;
        contractor.experienceYears = experience_years || null;
        contractor.updated_at = new Date();
      }
      return { rows: contractor ? [contractor] : [] };
    }
    // ADMIN DASHBOARD METRICS
    if (sqlLower.includes('select * from admin_dashboard_metrics')) {
      const jobMetrics = this.getJobMetrics();
      const contractorMetrics = this.getContractorMetrics();
      const revenueMetrics = this.getRevenueMetrics();
      const recentActivity = this.getRecentActivity();
      
      return {
        rows: [{
          ...jobMetrics,
          ...contractorMetrics,
          ...revenueMetrics,
          recent_activity: recentActivity,
          last_updated: new Date()
        }]
      };
    }
    
    // FILTERED JOBS QUERIES
    if (sqlLower.includes('select * from jobs where status in')) {
      const statuses = params;
      const jobs = db.jobs
        .filter(j => statuses.includes(j.status))
        .map(j => this._enrichJobData(j));
      return { rows: jobs };
    }
    
    // CONTRACTORS WITH FILTERS
    if (sqlLower.includes('select * from contractors where vetting_status in')) {
      const statuses = params;
      const contractors = db.contractors.filter(c => statuses.includes(c.vetting_status));
      return { rows: contractors };
    }
    
    // DOCS EXPIRING
    if (sqlLower.includes('select * from contractor_documents where expiry')) {
      const docsExpiring = this.getDocsExpiringSoon();
      return { rows: docsExpiring };
    }
    // Count queries (dashboard stats)
    if (sqlLower.includes('select count(*) from')) {
      let count = 0;
      if (sqlLower.includes('from jobs')) {
        if (sqlLower.includes('where status in')) {
          count = db.jobs.filter(j => params.includes(j.status)).length;
        } else if (params[0]) {
          count = db.jobs.filter(j => j.status === params[0]).length;
        } else {
          count = db.jobs.length;
        }
      } else if (sqlLower.includes('from contractors')) {
        if (sqlLower.includes('where vetting_status in')) {
          count = db.contractors.filter(c => params.includes(c.vetting_status)).length;
        } else if (params[0]) {
          count = db.contractors.filter(c => c.vetting_status === params[0]).length;
        } else {
          count = db.contractors.length;
        }
      }
      return { rows: [{ count }] };
    }
    
    console.log('⚠️  Unhandled query:', sql.substring(0, 100));
    return { rows: [] };
  }

  // ADMIN DASHBOARD METRICS
  getJobMetrics() {
    return {
      active_jobs: db.jobs.filter(j => ['assigned', 'en_route', 'on_site'].includes(j.status)).length,
      pending_review: db.jobs.filter(j => ['completed_pending_review', 'cancel_requested'].includes(j.status)).length,
      unassigned_jobs: db.jobs.filter(j =>
        !j.contractor_id &&
        ['submitted', 'confirmed', 'ready_to_assign', 'open', 'cancel_requested'].includes(j.status)
      ).length,
      total_jobs: db.jobs.length,
      completed_jobs: db.jobs.filter(j => j.status === 'completed').length
    };
  }

  getContractorMetrics() {
    return {
      vetting_queue: db.contractors.filter(c => ['APPLIED', 'UNDER_REVIEW', 'PENDING_DOCUMENTS'].includes(c.vetting_status)).length,
      approved_contractors: db.contractors.filter(c => c.vetting_status === 'APPROVED_ACTIVE').length,
      docs_expiring_soon: this.getDocsExpiringSoon().length,
      total_contractors: db.contractors.length
    };
  }

  getDocsExpiringSoon() {
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    return db.contractor_documents.filter(doc =>
      doc.expiry_date &&
      new Date(doc.expiry_date) < ninetyDaysFromNow &&
      new Date(doc.expiry_date) > new Date()
    );
  }

  getRevenueMetrics() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Mock revenue calculation (in production, this comes from invoices table)
    const mtdRevenue = db.jobs
      .filter(j => j.status === 'completed' && new Date(j.completed_at || j.created_at) >= monthStart)
      .length * 350; // Average job value

    return {
      mtd_revenue: mtdRevenue,
      pending_payouts: db.contractors.filter(c => c.vetting_status === 'APPROVED_ACTIVE').length * 200, // Mock
      disputes_open: 0 // Will be from disputes table
    };
  }

  getRecentActivity() {
    return db.jobs
      .slice(-10)
      .reverse()
      .map(j => ({
        id: j.id,
        type: 'job',
        action: `Job ${j.status}`,
        description: `${this._enrichJobData(j).type_name} - ${this._enrichJobData(j).city}`,
        timestamp: j.updated_at
      }));
  }
  
  // Helper to enrich job data with category/type names
  _enrichJobData(job) {
    const category = db.service_categories.find(c => c.id === job.service_category_id);
    const type = db.service_types.find(t => t.id === job.service_type_id) ||
                 db._full_service_types.find(t => t.id === job.service_type_id);
    const address = db.addresses.find(a => a.id === job.address_id);
    const contractor = job.contractor_id ? db.contractors.find(c => c.id === job.contractor_id) : null;
    const customer = db.customers.find(c => c.id === job.customer_id);
    
    return {
      ...job,
      category_name: category?.name,
      category_icon: category?.icon,
      type_name: type?.name,
      is_quote_only: type?.is_quote_only,
      address_line1: address?.address_line1,
      city: address?.city,
      province: address?.province,
      contractor_name: contractor?.business_name || contractor?.legal_name,
      contractor_tier: contractor?.contractor_tier || contractor?.contractorTier || 'bronze',
      customer_email: customer?.email
    };
  }
}

module.exports = {
  pool: new MockPool(),
  db
};
