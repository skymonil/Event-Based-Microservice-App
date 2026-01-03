-- migrate:up
ALTER TABLE orders
ADD COLUMN items JSONB NOT NULL;

-- migrate:down
ALTER TABLE orders
DROP COLUMN items;