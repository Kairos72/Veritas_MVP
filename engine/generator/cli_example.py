import sys
import os
import csv

# Add the project root to python path to allow imports if needed, 
# though we are importing locally here.
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from engine.generator.generator import simulate

def main():
    # Define sample segments matching the schema structure
    segments = [
        {"segment_id": "seg-A", "length_m": 50, "width_m": 7},
        {"segment_id": "seg-B", "length_m": 30, "width_m": 7},
    ]
    
    print(f"Starting simulation for {len(segments)} segments...")
    
    # Run simulation
    logs = simulate(segments, days=5, seed=123)
    
    # Print as CSV to stdout
    fieldnames = ["date", "segment_id", "shift_output_blocks", "cumulative_blocks", "remaining_blocks", "crew_size", "weather"]
    
    writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames)
    writer.writeheader()
    for log in logs:
        writer.writerow(log)
        
    print(f"\nSimulation complete. Generated {len(logs)} logs.")

if __name__ == "__main__":
    main()
