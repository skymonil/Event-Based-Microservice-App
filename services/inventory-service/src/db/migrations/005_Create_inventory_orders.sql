-- migrate:up

/**
 * Table: inventory_orders
 * Purpose: Acts as an idempotency gate and state tracker for incoming orders.
 *
 * Status Lifecycle:
 * - 'PROCESSING': Lock acquired. Service is currently calculating stock/locking rows.
 * - 'RESERVED':   Success. All items found and db rows locked.
 * - 'FAILED':     Failure. Out of stock or system error.
 * - 'RELEASED':   Compensation. Payment failed later, so stock was returned.
 */
 
CREATE TABLE inventory_orders (
    order_id UUID PRIMARY KEY,
    status VARCHAR(50) NOT NULL, -- 'PROCESSING', 'RESERVED', 'FAILED', 'RELEASED'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast status lookups (optional but recommended)
CREATE INDEX idx_inventory_orders_status ON inventory_orders(status);


-- migrate:down
DROP TABLE inventory_orders;
DROP INDEX idx_inventory_orders_status;