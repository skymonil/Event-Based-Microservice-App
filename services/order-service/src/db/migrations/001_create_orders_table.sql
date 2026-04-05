-- migrate:up
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  total_amount NUMERIC NOT NULL,
  status TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]', -- Added for order details
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- migrate:down
DROP TABLE IF EXISTS orders;