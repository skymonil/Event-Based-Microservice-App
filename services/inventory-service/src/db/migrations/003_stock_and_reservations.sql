-- migrate:up
CREATE TABLE inventory_stock (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  total_quantity INT NOT NULL CHECK (total_quantity >= 0),
  available_quantity INT NOT NULL CHECK (available_quantity >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE TABLE inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity INT NOT NULL CHECK (quantity > 0),
  status reservation_status NOT NULL DEFAULT 'RESERVED',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_order_product_warehouse UNIQUE (order_id, product_id, warehouse_id)
);
-- migrate:down
DROP TABLE inventory_reservations;
DROP TABLE inventory_stock;