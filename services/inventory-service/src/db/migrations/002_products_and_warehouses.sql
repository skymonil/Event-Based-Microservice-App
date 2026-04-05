-- migrate:up
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  sku VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE warehouses (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  region VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- migrate:down
DROP TABLE warehouses;
DROP TABLE products;