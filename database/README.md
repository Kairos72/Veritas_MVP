# Database Setup for Assets & Work Items

## Quick Setup

The Assets & Work Items system requires database tables in Supabase. Follow these steps:

### 1. Create Tables in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase_assets_schema.sql`
4. Click **Run** to execute the script

This will create:
- `assets` table - for storing infrastructure assets
- `work_items` table - for storing measurable tasks within assets
- Proper indexes, RLS policies, and triggers

### 2. Verify Tables Created

After running the script, you should see these tables in your Supabase database:
- `assets`
- `work_items`
- `asset_progress_summary` (view)

### 3. Test the System

Refresh your Veritas PWA page. The sync should now work without errors and you'll be able to:
- Create assets and work items
- Sync them with Supabase
- Import/export assets and work items

## What the Schema Includes

### Assets Table
- All asset types (road_section, building, flood_control, etc.)
- Location and dimension fields
- GPS coordinates support
- Chainage support for linear infrastructure
- Migration tracking fields

### Work Items Table
- Work item details (type, item code, unit)
- Progress tracking (target, cumulative, remaining)
- Status and priority management
- Automatic progress calculations

### Security
- Row Level Security (RLS) enabled
- Users can only access their own assets
- Project-based access control
- Automatic timestamp updates

## Troubleshooting

### Sync Error: "Could not find the table 'public.assets'"
This means the database tables haven't been created yet. Run the SQL script in Supabase.

### Other Errors
- Make sure you're logged into Supabase
- Check that your Supabase URL and anon key are correct in `config.js`
- Verify the SQL script executed successfully

## Migration from Legacy Segments

Use the migration tool to convert existing segments to assets:
```bash
python tools/migrate_segments_to_assets.py
```

This will:
- Convert segments to Road Section assets
- Create PCCP work items from block data
- Preserve all field logs
- Create a backup before migration