-- Core schema additions for FirstClick admin payments.
-- If you already have a schema, append this payments table.

-- Ensure admins have a role column for admin/super_admin.
ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'admin';

-- Ensure customers and contractors can store role overrides.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'customer';

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'contractor';

-- Session tracking for login tokens.
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  job_id UUID REFERENCES jobs(id),
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50),
  transaction_id VARCHAR(120),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS payments_customer_id_idx ON payments(customer_id);
CREATE INDEX IF NOT EXISTS payments_job_id_idx ON payments(job_id);

-- Audit logs for super admin actions.
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID,
  user_email VARCHAR(255),
  user_role VARCHAR(50),
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);

-- Automatically set paid_at when status moves to completed/paid
CREATE OR REPLACE FUNCTION set_payment_paid_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('paid', 'completed', 'success') AND NEW.paid_at IS NULL THEN
    NEW.paid_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_set_paid_at ON payments;
CREATE TRIGGER payments_set_paid_at
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION set_payment_paid_at();
