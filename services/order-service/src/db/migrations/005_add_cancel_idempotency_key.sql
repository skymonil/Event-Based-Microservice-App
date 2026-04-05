-- migrate:up

-- 1. Add the column
-- We allow NULL because not every order will be cancelled.
ALTER TABLE orders 
ADD COLUMN cancel_idempotency_key UUID;

-- 2. Add a Unique Constraint
-- This ensures the same key isn't used across different orders
-- and speeds up lookups when we check for duplicates.
CREATE UNIQUE INDEX idx_orders_cancel_idempotency_key 
ON orders (cancel_idempotency_key) 
WHERE cancel_idempotency_key IS NOT NULL;

-- 3. (Optional) Add a comment for documentation
COMMENT ON COLUMN orders.cancel_idempotency_key IS 'Stored idempotency key for the cancellation/refund saga';

-- migrate:down

-- Drop the column (this also removes the index)
ALTER TABLE orders 
DROP COLUMN IF EXISTS cancel_idempotency_key;