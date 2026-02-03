-- FirstClick PostgreSQL Schema
-- Team Applications Table
-- Created for storing team application submissions with resume support

-- ============================================================================
-- TABLE: team_applications
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id INTEGER NOT NULL,
  city_name VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  roles TEXT[] DEFAULT ARRAY[]::TEXT[],
  why TEXT,
  resume JSONB, -- { filename, dataUrl (base64), size, mime }
  status VARCHAR(50) DEFAULT 'pending_review', -- pending_review, approved, rejected
  reviewed_at TIMESTAMP,
  reviewer_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for common queries
  CONSTRAINT team_applications_status_check CHECK (status IN ('pending_review', 'approved', 'rejected'))
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_team_applications_city_id ON team_applications(city_id);
CREATE INDEX IF NOT EXISTS idx_team_applications_status ON team_applications(status);
CREATE INDEX IF NOT EXISTS idx_team_applications_email ON team_applications(email);
CREATE INDEX IF NOT EXISTS idx_team_applications_created_at ON team_applications(created_at DESC);

-- ============================================================================
-- TABLE: audit_log (optional, for tracking all changes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(255) NOT NULL,
  record_id UUID,
  action VARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE
  old_values JSONB,
  new_values JSONB,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);

-- ============================================================================
-- FUNCTION: update_updated_at_column
-- Automatically updates the updated_at column on any record update
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: team_applications_update_updated_at
-- Automatically update updated_at when a team application is modified
-- ============================================================================

DROP TRIGGER IF EXISTS team_applications_update_updated_at ON team_applications;
CREATE TRIGGER team_applications_update_updated_at
  BEFORE UPDATE ON team_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS: Documentation
-- ============================================================================

COMMENT ON TABLE team_applications IS 'Stores team applications from users wanting to join local city teams';
COMMENT ON COLUMN team_applications.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN team_applications.city_id IS 'Reference to the city/team (not yet foreign key constrained)';
COMMENT ON COLUMN team_applications.city_name IS 'Human readable city name';
COMMENT ON COLUMN team_applications.resume IS 'JSON object with resume metadata and base64 encoded data';
COMMENT ON COLUMN team_applications.status IS 'Application status: pending_review, approved, or rejected';
COMMENT ON COLUMN team_applications.reviewer_notes IS 'Notes from the superadmin reviewer';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify schema created successfully:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name = 'team_applications';

-- Count applications by status:
-- SELECT status, COUNT(*) FROM team_applications GROUP BY status;

-- Find applications awaiting review:
-- SELECT id, name, email, city_name, created_at FROM team_applications 
-- WHERE status = 'pending_review' ORDER BY created_at DESC;

-- Find approved applications for a city:
-- SELECT id, name, email, roles FROM team_applications 
-- WHERE status = 'approved' AND city_id = $1 ORDER BY created_at DESC;
