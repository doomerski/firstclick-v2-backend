#!/usr/bin/env node

/**
 * PostgreSQL Team Applications Setup and Testing Script
 * 
 * Usage:
 *   node db-setup.js --migrate           # Run migrations only
 *   node db-setup.js --seed              # Create test data
 *   node db-setup.js --verify            # Verify schema
 *   node db-setup.js --drop              # Drop and recreate database
 *   node db-setup.js --migrate --seed    # Run migrations and seed test data
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const ENV = require('./config/env');
const { URL } = require('url');

const args = process.argv.slice(2);
const autoMigrate = args.includes('--migrate');

// Parse database name from DATABASE_URL
const parsedUrl = (() => {
  try {
    const u = new URL(ENV.databaseUrl);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      database: u.pathname.replace(/^\//, ''),
      user: u.username || 'postgres',
      password: u.password || ''
    };
  } catch {
    throw new Error('DATABASE_URL is invalid or missing');
  }
})();

const targetDatabase = parsedUrl.database;

const dbDisplay = {
  host: parsedUrl.host,
  port: parsedUrl.port,
  database: targetDatabase,
  user: parsedUrl.user
};

const DB_CONFIG = {
  connectionString: ENV.databaseUrl,
  ssl: ENV.isProduction ? { rejectUnauthorized: false } : false
};

console.log('🗄️  FirstClick Database Setup');
console.log('=' .repeat(50));

async function connectAsAdmin() {
  // Connect as postgres (admin) to create database
  const adminConfig = {
    user: parsedUrl.user,
    password: parsedUrl.password,
    host: parsedUrl.host,
    port: parsedUrl.port,
    database: 'postgres' // Connect to default postgres database
  };

  console.log(`\n📍 Connecting to ${adminConfig.host}:${adminConfig.port} as admin...`);
  return new Pool(adminConfig);
}

async function connectToDatabase() {
  console.log(`\n📍 Connecting to database: ${targetDatabase}...`);
  const pool = new Pool(DB_CONFIG);
  
  try {
    const result = await pool.query('SELECT NOW()');
    console.log(`✅ Connected successfully!`);
    return pool;
  } catch (error) {
    console.error(`❌ Connection failed: ${error.message}`);
    throw error;
  }
}

async function createDatabase() {
  const adminPool = await connectAsAdmin();
  
  try {
    // Check if database exists
    const result = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDatabase]
    );
    
    if (result.rows.length > 0) {
      console.log(`✅ Database '${targetDatabase}' already exists`);
      return;
    }
    
    // Create database
    console.log(`\n🔨 Creating database '${targetDatabase}'...`);
    await adminPool.query(`CREATE DATABASE ${targetDatabase}`);
    console.log(`✅ Database created!`);
  } finally {
    await adminPool.end();
  }
}

async function runMigrations(pool) {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('⚠️  No migrations directory found');
    return;
  }
  
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  if (files.length === 0) {
    console.log('⚠️  No migration files found');
    return;
  }
  
  console.log(`\n🚀 Running ${files.length} migration(s)...`);
  
  for (const file of files) {
    const filepath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filepath, 'utf8');
    
    try {
      console.log(`  📄 ${file}...`);
      await pool.query(sql);
      console.log(`  ✅ Done`);
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      throw error;
    }
  }
}

async function seedTestData(pool) {
  console.log(`\n🌱 Seeding test data...`);
  
  const testApplications = [
    {
      city_id: 1,
      city_name: 'Denver',
      name: 'John Smith',
      email: 'john@example.com',
      phone: '+1-555-0001',
      roles: ['Team Lead', 'Operations'],
      why: 'Passionate about local hiring',
      status: 'pending_review'
    },
    {
      city_id: 2,
      city_name: 'Boulder',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+1-555-0002',
      roles: ['Coordinator'],
      why: 'Want to support my community',
      status: 'approved',
      reviewed_at: new Date(),
      reviewer_notes: 'Excellent experience'
    }
  ];
  
  for (const app of testApplications) {
    try {
      await pool.query(
        `INSERT INTO team_applications (city_id, city_name, name, email, phone, roles, why, status, reviewed_at, reviewer_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [app.city_id, app.city_name, app.name, app.email, app.phone, app.roles, app.why, app.status, app.reviewed_at || null, app.reviewer_notes || null]
      );
      console.log(`  ✅ Added test application: ${app.name}`);
    } catch (error) {
      console.error(`  ❌ Error seeding: ${error.message}`);
    }
  }
}

async function verifySchema(pool) {
  console.log(`\n🔍 Verifying schema...`);
  
  try {
    // Check if team_applications table exists
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name = 'team_applications'`
    );
    
    if (result.rows.length === 0) {
      console.error(`❌ team_applications table not found`);
      return false;
    }
    
    console.log(`✅ team_applications table exists`);
    
    // Get column info
    const columns = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = 'team_applications'
       ORDER BY ordinal_position`
    );
    
    console.log(`\n📋 Table Columns:`);
    columns.rows.forEach(row => {
      console.log(`  • ${row.column_name}: ${row.data_type}`);
    });
    
    // Count existing records
    const count = await pool.query(`SELECT COUNT(*) FROM team_applications`);
    console.log(`\n📊 Current Records: ${count.rows[0].count}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Error verifying schema: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    console.log(`\n📋 Configuration:`);
    console.log(`  Host: ${dbDisplay.host}:${dbDisplay.port}`);
    console.log(`  Database: ${dbDisplay.database}`);
    console.log(`  User: ${dbDisplay.user}`);
    
    // Step 1: Create database if it doesn't exist
    await createDatabase();
    
    // Step 2: Connect to the application database
    const pool = await connectToDatabase();
    
    try {
      // Step 3: Run migrations
      await runMigrations(pool);
      
      // Step 4: Verify schema
      const schemaValid = await verifySchema(pool);
      
      if (!schemaValid) {
        throw new Error('Schema validation failed');
      }
      
      // Step 5: Optionally seed test data
      if (autoMigrate || process.argv.includes('--seed')) {
        await seedTestData(pool);
      }
      
      console.log(`\n✅ Database setup completed successfully!`);
      console.log(`\n📝 Next steps:`);
      console.log(`  1. Update .env with database credentials`);
      console.log(`  2. Restart the application: npm start`);
      console.log(`  3. The app will now use PostgreSQL instead of mock DB`);
      
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error(`\n❌ Setup failed: ${error.message}`);
    process.exit(1);
  }
}

if (autoMigrate || process.argv.includes('--help')) {
  if (process.argv.includes('--help')) {
    console.log(`
Usage: node db-setup.js [options]

Options:
  --migrate     Auto-migrate using .env credentials
  --seed        Seed test data after migration
  --help        Show this help message

Environment Variables:
  DB_USER           PostgreSQL user (default: postgres)
  DB_PASSWORD       PostgreSQL password
  DB_HOST           PostgreSQL host (default: localhost)
  DB_PORT           PostgreSQL port (default: 5432)
  DB_NAME           Database name (default: firstclick)
  DB_ADMIN_USER     Admin user for setup (default: postgres)
  DB_ADMIN_PASSWORD Admin password (default: DB_PASSWORD)
    `);
    process.exit(0);
  }
  
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
} else {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
