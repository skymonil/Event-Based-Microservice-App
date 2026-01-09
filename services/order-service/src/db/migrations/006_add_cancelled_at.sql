-- migrate:up

-- 1. Add the column
-- We use TIMESTAMPTZ (Timestamp with Time Zone) for global accuracy
ALTER TABLE orders 
ADD COLUMN cancelled_at TIMESTAMPTZ;

-- 2. Create an index
-- This is useful if you ever need to generate reports like 
-- "How many orders were cancelled today?"
CREATE INDEX idx_orders_cancelled_at ON orders (cancelled_at) 
WHERE cancelled_at IS NOT NULL;

-- migrate:down

ALTER TABLE orders 
DROP COLUMN IF EXISTS cancelled_at;