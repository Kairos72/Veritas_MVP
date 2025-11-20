import json
import os
import sys

# Define the examples directly in the script for simplicity, matching the README
examples = {
    "segment.schema.json": {
        "segment_id": "seg-001",
        "project_id": "PROJ-001",
        "length_m": 150,
        "width_m": 7,
        "thickness_m": 0.2
    },
    "project.schema.json": {
        "project_id": "PROJ-001",
        "contract_id": "CTR-2025-XYZ",
        "project_title": "Barangay Road Improvement",
        "contractor_name": "Veritas Construction Inc.",
        "owner": "DPWH Region IV-A",
        "project_type": "PCCP Road",
        "start_date": "2025-11-01",
        "location": "San Juan, Batangas"
    },
    "block.schema.json": {
        "segment_id": "seg-001",
        "block_length_m": 4.5,
        "blocks_total": 33.3333
    },
    "shift_log.schema.json": {
        "date": "2025-11-10",
        "segment_id": "seg-001",
        "shift_output_blocks": 2.5,
        "cumulative_blocks": 10.5,
        "remaining_blocks": 22.8333,
        "crew_size": 8,
        "weather": "clear"
    }
}

def validate_schema(schema_file, data):
    try:
        with open(schema_file, 'r') as f:
            schema = json.load(f)
        
        # Basic type checking since we might not have jsonschema installed
        # This is a simple sanity check as requested
        
        print(f"Validating {schema_file}...")
        
        # Check required fields
        if "required" in schema:
            for req in schema["required"]:
                if req not in data:
                    print(f"  ERROR: Missing required field '{req}'")
                    return False
        
        # Check types for present fields (simple check)
        if "properties" in schema:
            for prop, value in data.items():
                if prop in schema["properties"]:
                    prop_type = schema["properties"][prop].get("type")
                    if prop_type == "string" and not isinstance(value, str):
                        print(f"  ERROR: Field '{prop}' should be string, got {type(value)}")
                        return False
                    elif prop_type == "number" and not isinstance(value, (int, float)):
                        print(f"  ERROR: Field '{prop}' should be number, got {type(value)}")
                        return False
                    elif prop_type == "integer" and not isinstance(value, int):
                        print(f"  ERROR: Field '{prop}' should be integer, got {type(value)}")
                        return False
                    elif prop_type == "boolean" and not isinstance(value, bool):
                        print(f"  ERROR: Field '{prop}' should be boolean, got {type(value)}")
                        return False
        
        print("  OK")
        return True
        
    except Exception as e:
        print(f"  ERROR: {str(e)}")
        return False

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    all_passed = True
    
    for schema_name, example_data in examples.items():
        schema_path = os.path.join(base_dir, schema_name)
        if not validate_schema(schema_path, example_data):
            all_passed = False
            
    if all_passed:
        print("\nAll examples validated successfully!")
        sys.exit(0)
    else:
        print("\nSome validations failed.")
        sys.exit(1)

if __name__ == "__main__":
    main()
