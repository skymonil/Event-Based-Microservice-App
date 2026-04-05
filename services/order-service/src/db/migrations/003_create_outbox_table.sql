-- migrate:up

-- We ensure the pgcrypto extension is available for gen_random_uuid()
-- (Standard on Postgres 13+, but safe to include)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(255) NOT NULL, -- e.g., 'ORDER'
    aggregate_id VARCHAR(255) NOT NULL,   -- e.g., order_id
    event_type VARCHAR(255) NOT NULL,      -- e.g., 'ORDER_CREATED'
    payload JSONB NOT NULL,                -- The actual event data
    metadata JSONB,                        -- Tracing IDs, user context, version
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE  -- Null until the relay picks it up
);

-- We add an index on created_at to help with the "Retention Policy" 
-- (Deleting old events after X days)
CREATE INDEX idx_outbox_created_at ON outbox (created_at);

-- migrate:down

DROP INDEX IF EXISTS idx_outbox_created_at;
DROP TABLE IF EXISTS outbox;