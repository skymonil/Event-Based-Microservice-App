-- migrate:up
CREATE INDEX idx_res_expires ON inventory_reservations (expires_at) WHERE status = 'RESERVED';
CREATE INDEX idx_stock_available ON inventory_stock (warehouse_id, available_quantity);
-- migrate:down
DROP INDEX idx_res_expires;
DROP INDEX idx_stock_available;