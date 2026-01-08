-- migrate:up
-- Add unique constraint to prevent multiple payments for the same order
ALTER TABLE payments 
ADD CONSTRAINT unique_payment_per_order UNIQUE (order_id);

-- migrate:down
-- Remove the unique constraint
ALTER TABLE payments 
DROP CONSTRAINT IF EXISTS unique_payment_per_order;