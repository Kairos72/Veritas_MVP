#!/usr/bin/env python3
"""
Migration script: Convert legacy blocks_completed_today to quantity_today format

This script finds old field log entries that have blocks_completed_today but missing quantity_today,
and converts them to the new universal format.

Usage:
    python tools/migrate_blocks_from_legacy.py

Safety features:
- Creates backup before migration
- Only processes entries missing quantity_today
- Adds migration timestamp for tracking
- Dry-run mode available for testing
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

def migrate_field_logs(data_file_path, dry_run=False):
    """
    Migrate field logs from legacy blocks to quantity_today format.

    Args:
        data_file_path: Path to the JSON data file
        dry_run: If True, only show what would be migrated without making changes

    Returns:
        dict: Migration results and statistics
    """

    print(f"{'DRY RUN - ' if dry_run else ''}Processing: {data_file_path}")

    # Load the data file
    try:
        with open(data_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        return {'error': f'Failed to read file: {e}'}

    if 'field_logs' not in data:
        return {'error': 'No field_logs found in data file'}

    field_logs = data['field_logs']
    migration_results = {
        'total_logs': len(field_logs),
        'legacy_logs_found': 0,
        'logs_migrated': 0,
        'logs_skipped': 0,
        'migrated_entries': []
    }

    # Process each field log
    for i, log in enumerate(field_logs):
        # Check if this is a legacy log that needs migration
        has_blocks_today = 'shift_output_blocks' in log and log['shift_output_blocks'] not in [0, None, '']
        missing_quantity_today = not log.get('quantity_today', '').strip()

        if has_blocks_today and missing_quantity_today:
            migration_results['legacy_logs_found'] += 1

            blocks_value = log['shift_output_blocks']

            # Create the new quantity_today value
            if blocks_value == 1:
                new_quantity = f"1.0 block"
            else:
                new_quantity = f"{float(blocks_value):.1f} blocks"

            # Prepare migration entry
            migration_entry = {
                'index': i,
                'entry_id': log.get('entry_id', f'log_{i}'),
                'old_blocks': blocks_value,
                'new_quantity': new_quantity,
                'date': log.get('date', 'N/A'),
                'segment_id': log.get('segment_id', 'N/A')
            }

            migration_results['migrated_entries'].append(migration_entry)

            if not dry_run:
                # Apply the migration
                log['quantity_today'] = new_quantity
                log['migrated_at'] = datetime.now().isoformat()
                log['migration_source'] = 'blocks_completed_today'

                print(f"  Migrated: {log.get('entry_id', 'unknown')} - {blocks_value} blocks → '{new_quantity}'")
            else:
                print(f"  Would migrate: {log.get('entry_id', 'unknown')} - {blocks_value} blocks → '{new_quantity}'")

            migration_results['logs_migrated'] += 1
        else:
            migration_results['logs_skipped'] += 1

    # Save the migrated data if not dry run
    if not dry_run and migration_results['logs_migrated'] > 0:
        # Create backup
        backup_path = data_file_path.with_suffix(f'.backup.{datetime.now().strftime("%Y%m%d_%H%M%S")}.json')
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  ✅ Backup created: {backup_path}")

        # Save migrated data
        with open(data_file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  ✅ Migration completed: {data_file_path}")

    return migration_results

def main():
    """Main migration function."""

    print("🔧 Legacy Blocks Migration Tool")
    print("=" * 50)

    # Check if we're in the right directory
    project_root = Path(__file__).parent.parent

    # Look for common data locations
    possible_data_files = [
        project_root / "pwa" / "exported_data.json",
        project_root / "field_logs_export.json",
        project_root / "veritas_export.json"
    ]

    data_files = [f for f in possible_data_files if f.exists()]

    if not data_files:
        print("❌ No exported data files found.")
        print("\nLooking for files like:")
        for f in possible_data_files:
            print(f"  - {f}")
        print("\nPlease export your data from the PWA first (Project Selection → Export Data)")
        return 1

    print(f"Found {len(data_files)} data file(s):")
    for i, f in enumerate(data_files, 1):
        print(f"  {i}. {f}")

    # Ask which file to process
    if len(data_files) == 1:
        selected_file = data_files[0]
        print(f"\nAuto-selecting: {selected_file}")
    else:
        try:
            choice = input(f"\nSelect file to migrate (1-{len(data_files)}): ")
            choice_idx = int(choice) - 1
            if 0 <= choice_idx < len(data_files):
                selected_file = data_files[choice_idx]
            else:
                print("❌ Invalid selection")
                return 1
        except (ValueError, KeyboardInterrupt):
            print("❌ Invalid input")
            return 1

    # Ask if dry run
    dry_run = input("\nDry run? (y/N): ").lower().strip() in ['y', 'yes']

    print(f"\n{'🔍 DRY RUN MODE' if dry_run else '🚀 MIGRATION MODE'}")
    print("-" * 30)

    # Perform migration
    result = migrate_field_logs(selected_file, dry_run=dry_run)

    # Display results
    print("\n" + "=" * 50)
    print("MIGRATION RESULTS:")
    print("=" * 50)

    if 'error' in result:
        print(f"❌ Error: {result['error']}")
        return 1

    print(f"📊 Total logs processed: {result['total_logs']}")
    print(f"🔍 Legacy logs found: {result['legacy_logs_found']}")
    print(f"✅ Logs migrated: {result['logs_migrated']}")
    print(f"⏭️  Logs skipped: {result['logs_skipped']}")

    if result['migrated_entries']:
        print(f"\n📋 Migrated Entries:")
        for entry in result['migrated_entries'][:10]:  # Show first 10
            print(f"  • {entry['entry_id']} ({entry['date']}) - {entry['old_blocks']} → {entry['new_quantity']}")

        if len(result['migrated_entries']) > 10:
            print(f"  ... and {len(result['migrated_entries']) - 10} more")

    if dry_run:
        print(f"\n💡 To perform actual migration, run again without dry run mode.")
    else:
        print(f"\n✅ Migration completed successfully!")
        print(f"🔄 Import the migrated file back into your PWA to see the changes.")

    return 0

if __name__ == '__main__':
    sys.exit(main())