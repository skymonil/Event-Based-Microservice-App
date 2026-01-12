-- migrate:up
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE reservation_status AS ENUM (
  'RESERVED', 'CONFIRMED', 'RELEASED', 'EXPIRED'
);

CREATE TABLE outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
-- migrate:down
DROP TABLE outbox;
DROP TYPE reservation_status;