-- migrate:up
CREATE TABLE IF NOT EXISTS processed_events (
  event_id VARCHAR(255) PRIMARY KEY,  -- The lock: Flexible format, guarantees uniqueness
  event_type VARCHAR(100) NOT NULL,   -- The context: Useful for debugging/metrics (e.g., 'order.created')
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- migrate:down
DROP TABLE IF EXISTS processed_events;