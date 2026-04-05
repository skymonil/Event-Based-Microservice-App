-- migrate:up
ALTER TABLE orders
ADD COLUMN idempotency_key TEXT UNIQUE;

-- migrate:down
ALTER TABLE orders
DROP COLUMN idempotency_key;