-- CORRECTED Migration Script for Veritas MVP
-- Only use the columns that actually exist in the database

-- Step 1: Add the new column
ALTER TABLE field_logs
ADD COLUMN quantity_text TEXT;

-- Step 2: Add description
COMMENT ON COLUMN field_logs.quantity_text IS 'Complete quantity text as entered by user (e.g., "5 cubic meters") - preserves unit information during sync';

-- Step 3: Simple update - set quantity_text from quantity_today for all existing records
UPDATE field_logs
SET quantity_text = quantity_today::text
WHERE quantity_today IS NOT NULL AND quantity_today > 0 AND quantity_text IS NULL;

-- Step 4: Verification query
SELECT
    COUNT(*) as total_records,
    COUNT(CASE WHEN quantity_text IS NOT NULL THEN 1 END) as records_with_quantity_text,
    COUNT(CASE WHEN quantity_text IS NULL THEN 1 END) as records_without_quantity_text
FROM field_logs;