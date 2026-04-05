-- migrate:up

-- 1. Add the column with a default value
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Create a function that sets updated_at to the current time
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3. Create a trigger to call that function before any UPDATE
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- migrate:down
-- DOWN MIGRATION

-- 1. Drop the trigger
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;

-- 2. Remove the column
ALTER TABLE payments DROP COLUMN IF EXISTS updated_at;

-- (Note: We usually keep the function update_updated_at_column() 
-- because other tables might be using it)