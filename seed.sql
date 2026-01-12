-- seed.sql

-- 1. Clear existing data (in reverse order of dependencies)
TRUNCATE outbox, inventory_reservations, inventory_stock, warehouses, products CASCADE;

-- 2. Insert Test Products
INSERT INTO products (id, name, sku) VALUES
('bc6ed327-a5c9-4551-92d2-f38462a095f4', 'MacBook Pro 14', 'APPLE-MBP-14-M3'),
('6cda3622-366b-4c40-955d-62be8fd54a75', 'iPhone 15 Pro', 'APPLE-I15P-256-BLK'),
('0a927658-f559-4e0f-3ef2-9b8860f3cb56', 'AirPods Pro 2', 'APPLE-APP2-WHT');

-- 3. Insert Warehouses (Multi-Region)
INSERT INTO warehouses (id, name, region) VALUES
('11111111-1111-1111-1111-111111111111', 'Mumbai Distribution Center', 'IN-WEST'),
('22222222-2222-2222-2222-222222222222', 'Delhi Fulfillment Hub', 'IN-NORTH'),
('33333333-3333-3333-3333-333333333333', 'Bangalore Logistics Park', 'IN-SOUTH');

-- 4. Set Stock Levels per Warehouse
-- MacBook: 50 in Mumbai, 20 in Delhi
INSERT INTO inventory_stock (product_id, warehouse_id, total_quantity, available_quantity) VALUES
('bc6ed327-a5c9-4551-92d2-f38462a095f4', '11111111-1111-1111-1111-111111111111', 50, 50),
('bc6ed327-a5c9-4551-92d2-f38462a095f4', '22222222-2222-2222-2222-222222222222', 20, 20);

-- iPhone: 100 in Mumbai, 100 in Bangalore
INSERT INTO inventory_stock (product_id, warehouse_id, total_quantity, available_quantity) VALUES
('6cda3622-366b-4c40-955d-62be8fd54a75', '11111111-1111-1111-1111-111111111111', 100, 100),
('6cda3622-366b-4c40-955d-62be8fd54a75', '33333333-3333-3333-3333-333333333333', 100, 100);

-- AirPods: Spread across all three
INSERT INTO inventory_stock (product_id, warehouse_id, total_quantity, available_quantity) VALUES
('0a927658-f559-4e0f-3ef2-9b8860f3cb56', '11111111-1111-1111-1111-111111111111', 200, 200),
('0a927658-f559-4e0f-3ef2-9b8860f3cb56', '22222222-2222-2222-2222-222222222222', 200, 200),
('0a927658-f559-4e0f-3ef2-9b8860f3cb56', '33333333-3333-3333-3333-333333333333', 200, 200);