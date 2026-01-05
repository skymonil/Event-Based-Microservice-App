-- migrate:up
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,

  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',

  status TEXT NOT NULL, 
  -- INITIATED | SUCCESS | FAILED

  provider TEXT NOT NULL,
  -- MOCK | STRIPE | RAZORPAY

  idempotency_key TEXT UNIQUE,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for faster lookups by order and user
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);

-- migrate:down
-- Dropping indexes first (Best practice)
DROP INDEX IF EXISTS idx_payments_user_id;
DROP INDEX IF EXISTS idx_payments_order_id;

-- Dropping the table
DROP TABLE IF EXISTS payments;