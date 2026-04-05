-- migrate:up

-- 1. Add the column. We allow NULL temporarily to avoid errors with existing data.
ALTER TABLE orders 
ADD COLUMN cancellable_until TIMESTAMPTZ;

-- 2. Populate existing rows with a default (e.g., 30 mins after they were created).
-- Adjust the interval based on your business logic.
UPDATE orders 
SET cancellable_until = created_at + INTERVAL '30 minutes'
WHERE cancellable_until IS NULL;

-- 3. Now that all rows have data, enforce the NOT NULL constraint.
ALTER TABLE orders 
ALTER COLUMN cancellable_until SET NOT NULL;

-- 4. Set a default for FUTURE rows so the application doesn't have to send it every time.
ALTER TABLE orders 
ALTER COLUMN cancellable_until SET DEFAULT (NOW() + INTERVAL '10 minutes');


-- migrate:down

ALTER TABLE orders 
DROP COLUMN IF EXISTS cancellable_until;