import sys
import os

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from engine.provenance.provenance import create_provenance_pdf, hash_file

def main():
    # Sample data (simulating one day of logs)
    sample_logs = [
        {
            "date": "2025-11-10",
            "segment_id": "seg-001",
            "shift_output_blocks": 2.5,
            "cumulative_blocks": 10.5,
            "remaining_blocks": 22.8333,
            "crew_size": 8,
            "weather": "clear"
        }
    ]
    
    output_dir = os.path.join(os.path.dirname(__file__), 'output')
    output_file = os.path.join(output_dir, 'provenance_2025-11-10.pdf')
    
    print(f"Generating PDF at: {output_file}")
    
    try:
        create_provenance_pdf(sample_logs, output_file)
        print(f"PDF created successfully.")
        
        file_hash = hash_file(output_file)
        print(f"SHA256: {file_hash}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
