-- Expansion Proposals Table
CREATE TABLE expansion_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Location data
  city VARCHAR(100) NOT NULL,
  region VARCHAR(50) NOT NULL,
  population VARCHAR(50),
  coverage_distance VARCHAR(50) NOT NULL,
  
  -- Market insights
  why_broken TEXT NOT NULL,
  demand_level VARCHAR(50) NOT NULL,
  contractor_availability VARCHAR(50) NOT NULL,
  
  -- Proposer details
  roles TEXT[], -- Array of role checkboxes
  trades_in_demand TEXT[], -- Array of trades
  avg_job_size VARCHAR(50),
  seasonal_notes TEXT,
  commitment_level VARCHAR(50) NOT NULL,
  
  -- Contact info
  contact_name VARCHAR(100) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50),
  
  -- Admin workflow
  status VARCHAR(50) DEFAULT 'pending_review',
  reviewed BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES admins(id),
  reviewed_at TIMESTAMP,
  admin_notes TEXT,
  priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for admin dashboard
CREATE INDEX idx_expansion_proposals_status ON expansion_proposals(status, created_at DESC);
CREATE INDEX idx_expansion_proposals_city ON expansion_proposals(city, region);
CREATE INDEX idx_expansion_proposals_commitment ON expansion_proposals(commitment_level);

-- Trigger for updated_at
CREATE TRIGGER update_expansion_proposals_updated_at
  BEFORE UPDATE ON expansion_proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();