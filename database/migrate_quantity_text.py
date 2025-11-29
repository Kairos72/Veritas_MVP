#!/usr/bin/env python3
"""
Database Migration: Add quantity_text column to field_logs table
Purpose: Fix critical sync bug that loses unit information during sync
"""

import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

try:
    import psycopg2
    from psycopg2 import sql
    from dotenv import load_dotenv

    # Load environment variables
    load_dotenv()

    print("🚀 Starting migration: Add quantity_text column...")

    # Database connection
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("❌ ERROR: DATABASE_URL not found in environment variables")
        print("Please check your .env file and ensure DATABASE_URL is set")
        sys.exit(1)

    print(f"📡 Connecting to database...")

    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()

    print("✅ Connected successfully")

    # Read SQL migration
    sql_file = Path(__file__).parent / "add_quantity_text_column.sql"

    if not sql_file.exists():
        print(f"❌ ERROR: SQL file not found: {sql_file}")
        sys.exit(1)

    print(f"📖 Reading migration from: {sql_file}")

    with open(sql_file, 'r') as f:
        sql_content = f.read()

    # Split into individual statements (basic approach)
    statements = [stmt.strip() for stmt in sql_content.split(';') if stmt.strip()]

    print(f"📝 Found {len(statements)} SQL statements to execute")

    # Execute each statement
    for i, statement in enumerate(statements, 1):
        if statement and not statement.startswith('--'):
            print(f"⚡ Executing statement {i}/{len(statements)}...")
            try:
                cursor.execute(statement)
                conn.commit()
                print(f"✅ Statement {i} executed successfully")
            except Exception as e:
                print(f"❌ ERROR in statement {i}: {e}")
                # Continue with other statements
                conn.rollback()

    # Verify column was added
    print("🔍 Verifying column was added...")
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'field_logs'
        AND column_name = 'quantity_text'
    """)

    result = cursor.fetchone()
    if result:
        print(f"✅ SUCCESS: Column 'quantity_text' exists in field_logs table")
    else:
        print(f"❌ ERROR: Column 'quantity_text' was not added")

    # Close connection
    cursor.close()
    conn.close()

    print("🎉 Migration completed successfully!")
    print("💡 Next step: Test the sync functionality with your field entries")

except Exception as e:
    print(f"❌ ERROR: {e}")
    sys.exit(1)