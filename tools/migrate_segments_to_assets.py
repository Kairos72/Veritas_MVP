#!/usr/bin/env python3
"""
Migration script: Convert legacy segments to the new Assets + Work Items model

This script finds old segment entries in localStorage exports and converts them
to the new asset-based data structure, preserving all field logs and progress.

Usage:
    python tools/migrate_segments_to_assets.py

Safety features:
- Creates backup before migration
- Preserves all existing field logs
- Converts block-based segments to Road Section assets with PCCP work items
- Maintains backwards compatibility
"""

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

def generate_asset_id(segment_id):
    """Generate a new asset ID from segment ID"""
    # Extract number from segment ID like "SEG-001" -> "001"
    if '-' in segment_id:
        number = segment_id.split('-')[-1]
    else:
        # Fallback: use the whole segment ID
        number = segment_id.replace('SEG', '').replace('segment', '')

    return f"ASSET-RD-{number.zfill(3)}"

def generate_work_item_id(asset_id, work_type):
    """Generate work item ID from asset ID and work type"""
    asset_num = asset_id.split('-')[-1]
    # Create a simple code based on work type
    if 'PCCP' in work_type.upper() or 'CONCRETE' in work_type.upper():
        code = '311'
    else:
        # Generate a simple numeric code
        code = f"99{len(work_type) % 10}"

    return f"WI-{code}-{asset_num}"

def migrate_segments_to_assets(data_file_path, dry_run=False):
    """
    Migrate segments to assets with work items.

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

    if 'segments' not in data:
        return {'error': 'No segments found in data file'}

    segments = data['segments']
    field_logs = data.get('field_logs', [])

    migration_results = {
        'total_segments': len(segments),
        'segments_migrated': 0,
        'assets_created': [],
        'work_items_created': [],
        'field_logs_updated': 0,
        'field_logs_orphaned': 0
    }

    # Create assets from segments
    assets = []
    work_items = []
    segment_to_asset_map = {}

    for segment in segments:
        segment_id = segment.get('segment_id', f'segment_{len(assets)}')
        length_m = segment.get('length_m', 0)
        width_m = segment.get('width_m', 0)
        block_length_m = segment.get('block_length_m', 4.5)
        chainage_start = segment.get('chainage_start', None)

        # Create asset
        asset_id = generate_asset_id(segment_id)
        asset = {
            "asset_id": asset_id,
            "asset_type": "road_section",
            "name": f"Road Section {segment_id.replace('SEG-', '')} ({length_m}m × {width_m}m)",
            "description": f"Migrated from segment {segment_id}. Block length: {block_length_m}m.",
            "chainage_start_m": 0,
            "chainage_end_m": length_m,
            "length_m": length_m,
            "width_m": width_m,
            "side": "center",  # Default for migrated segments
            "work_items": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "migrated_from": segment_id,
            "migration_date": datetime.now(timezone.utc).isoformat()
        }

        # Handle chainage if present
        if chainage_start:
            try:
                # Parse chainage like "0+000" to meters
                if '+' in chainage_start:
                    station, offset = chainage_start.split('+')
                    start_meters = int(station) * 1000 + int(offset.ljust(3, '0'))
                    asset["chainage_start_m"] = start_meters
                    asset["chainage_end_m"] = start_meters + length_m
                    asset["name"] = f"Road Section {segment_id.replace('SEG-', '')} (Station {chainage_start} to {start_meters + length_m // 1000}+{(start_meters + length_m) % 1000:03d})"
            except:
                pass  # Keep default values if parsing fails

        # Create PCCP work item if blocks exist
        total_blocks = segment.get('total_blocks', 0)
        if total_blocks > 0:
            work_item_id = generate_work_item_id(asset_id, "PCCP")
            work_item = {
                "work_item_id": work_item_id,
                "work_type": "PCCP (Concrete Pavement)",
                "item_code": "311",  # Standard PCCP item code
                "unit": "blocks",
                "target_total": total_blocks,
                "cumulative": 0,  # Will be calculated from field logs
                "remaining": total_blocks,
                "status": "pending",
                "priority": "medium",
                "notes": f"Migrated from segment {segment_id}. {total_blocks} blocks total ({length_m}m ÷ {block_length_m}m block length)."
            }

            work_items.append(work_item)
            asset["work_items"].append(work_item)
            migration_results['work_items_created'].append(work_item_id)

        assets.append(asset)
        segment_to_asset_map[segment_id] = asset_id
        migration_results['segments_migrated'] += 1
        migration_results['assets_created'].append(asset_id)

        print(f"  Migrated segment {segment_id} → asset {asset_id}")

    # Update field logs to use asset_id
    updated_logs = []
    for log in field_logs:
        old_segment_id = log.get('segment_id')

        if old_segment_id and old_segment_id in segment_to_asset_map:
            # Update the field log
            updated_log = log.copy()
            updated_log['asset_id'] = segment_to_asset_map[old_segment_id]
            updated_log['migrated_from_segment'] = old_segment_id
            updated_log['migration_date'] = datetime.now(timezone.utc).isoformat()

            # Remove old segment-specific fields
            if 'cumulative_blocks' in updated_log and 'remaining_blocks' in updated_log:
                # Keep these as they're useful for PCCP work items
                pass

            updated_logs.append(updated_log)
            migration_results['field_logs_updated'] += 1
        else:
            # Keep logs that don't have a matching segment
            updated_logs.append(log)
            if old_segment_id:
                migration_results['field_logs_orphaned'] += 1

    # Save the migrated data if not dry run
    if not dry_run:
        # Create backup
        backup_path = data_file_path.with_suffix(f'.backup.segments_to_assets.{datetime.now().strftime("%Y%m%d_%H%M%S")}.json')
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  ✅ Backup created: {backup_path}")

        # Update data structure
        data['assets'] = assets
        data['work_items'] = work_items
        data['field_logs'] = updated_logs

        # Remove old segments (optional - keep for now for backwards compatibility)
        # del data['segments']

        # Save migrated data
        with open(data_file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  ✅ Migration completed: {data_file_path}")

    return migration_results

def main():
    """Main migration function."""

    print("🔧 Segments to Assets Migration Tool")
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
    result = migrate_segments_to_assets(selected_file, dry_run=dry_run)

    # Display results
    print("\n" + "=" * 50)
    print("MIGRATION RESULTS:")
    print("=" * 50)

    if 'error' in result:
        print(f"❌ Error: {result['error']}")
        return 1

    print(f"📊 Total segments processed: {result['total_segments']}")
    print(f"🔄 Segments migrated: {result['segments_migrated']}")
    print(f"🏗️ Assets created: {len(result['assets_created'])}")
    print(f"📋 Work items created: {len(result['work_items_created'])}")
    print(f"📝 Field logs updated: {result['field_logs_updated']}")
    print(f"⚠️  Field logs orphaned: {result['field_logs_orphaned']}")

    if result['assets_created']:
        print(f"\n📋 Assets Created:")
        for asset_id in result['assets_created']:
            print(f"  • {asset_id}")

    if result['work_items_created']:
        print(f"\n📋 Work Items Created:")
        for work_item_id in result['work_items_created']:
            print(f"  • {work_item_id}")

    if dry_run:
        print(f"\n💡 To perform actual migration, run again without dry run mode.")
        print(f"🔄 This will preserve all field logs and update them to use the new asset references.")
    else:
        print(f"\n✅ Migration completed successfully!")
        print(f"🔄 Import the migrated file back into your PWA to see the new Assets tab.")

    return 0

if __name__ == '__main__':
    sys.exit(main())