# Database Schema and Migrations

## Overview

This directory contains database schema definitions, migration scripts, and documentation for the Veritas MVP system. The database uses PostgreSQL with Supabase for cloud synchronization.

## Quick Setup

The Assets & Work Items system requires database tables in Supabase. Follow these steps:

### 1. Create Tables in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `correct_migration.sql`
4. Click **Run** to execute the script

This will create:
- `quantity_text` column in `field_logs` table for complete quantity preservation
- Proper data migration for existing records
- Verification queries to confirm successful migration

Note: The main database schema (assets, work_items, projects tables) should already be set up in your Supabase project. This migration specifically adds the critical `quantity_text` column for Task 19 data integrity fixes.

### 2. Verify Migration Success

After running the migration script, verify the changes:

1. Check the new column exists:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'field_logs'
AND column_name = 'quantity_text';
```

2. Verify data was migrated (if you had existing field logs):
```sql
SELECT COUNT(*) as total_records,
       COUNT(CASE WHEN quantity_text IS NOT NULL THEN 1 END) as records_with_quantity_text
FROM field_logs;
```

3. Test the functionality in the Veritas PWA - quantities should now preserve unit information during sync.

### 3. Test the System

Refresh your Veritas PWA page. The sync should now work without errors and you'll be able to:
- Preserve unit information during sync (e.g., "5 cubic meters" stays "5 cubic meters")
- Sync field entries without data loss
- View proper quantity text in Daily Summary dashboard

## Files in This Directory

### Essential Files:
- **`correct_migration.sql`** - ✅ **USE THIS ONE** - Production-ready migration script for Task 19 quantity preservation fixes
- **`migrate_quantity_text.py`** - Python automation tool for running migrations (for developers)
- **`README.md`** - This documentation file

### Migration History:
- **Task 19 (Nov 2025)**: Added `quantity_text` column to fix critical sync data loss bug
- Database now preserves complete user input during sync operations
- Maintains backward compatibility with existing data

### Important Notes:
- Only use `correct_migration.sql` - other migration files were removed as they referenced non-existent database columns
- The migration is safe and includes verification queries
- All existing data is preserved during the migration process

## Troubleshooting

### Sync Error: "Could not find the 'quantity_text' column"
This means the migration hasn't been run yet. Run `correct_migration.sql` in your Supabase SQL Editor.

### Common Issues:
- **Make sure you're logged into Supabase** with proper permissions
- **Check your Supabase URL and anon key** in `pwa/config.js`
- **Verify the migration script executed successfully** using the verification queries above
- **Test with a new field entry** to ensure quantity text is preserved

### Task 19 Related Issues:
- If units still show as "pcs" after sync, verify the `quantity_text` column was created
- If asset names show as "undefined", check asset sync normalization (see CLAUDE.md)
- Daily Summary dropdown should show "PROJ-1 - Project Name" format

## Related Documentation

- **[CLAUDE.md](../CLAUDE.md)** - Complete system documentation and Task 19 fixes
- **[Operator Reports](../docs/operator_reports/)** - Comprehensive Task 19 implementation documentation
- **[Migration Tools](../tools/)** - Legacy data conversion utilities