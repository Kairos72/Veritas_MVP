import random
import datetime
from typing import List, Dict, Any

def simulate(segments: List[Dict[str, Any]], days: int = 10, seed: int = 42, block_length_m: float = 4.5, crew_size: int = 8) -> List[Dict[str, Any]]:
    """
    Simulates construction progress for a list of segments.
    
    Args:
        segments: List of segment dictionaries (must have 'segment_id' and 'length_m').
        days: Number of days to simulate.
        seed: Random seed for reproducibility.
        block_length_m: Length of a single block in meters.
        crew_size: Number of crew members.
        
    Returns:
        List of shift_log entries matching the schema.
    """
    random.seed(seed)
    
    logs = []
    start_date = datetime.date.today()
    
    # Initialize state for each segment
    segment_states = {}
    for seg in segments:
        total_blocks = seg['length_m'] / block_length_m
        segment_states[seg['segment_id']] = {
            'cumulative_blocks': 0.0,
            'blocks_total': total_blocks,
            'completed': False
        }
        
    for day in range(days):
        current_date = start_date + datetime.timedelta(days=day)
        date_str = current_date.isoformat()
        
        # Simple weather simulation
        weather = random.choice(['clear', 'clear', 'clear', 'cloudy', 'rain'])
        
        # Productivity factor based on weather
        weather_factor = 1.0
        if weather == 'rain':
            weather_factor = 0.5
        elif weather == 'cloudy':
            weather_factor = 0.9
            
        # Base productivity: 0.1 blocks per person per day (calibration point)
        # So 8 people = 0.8 blocks/day base
        base_productivity = 0.1 * crew_size
        
        for seg in segments:
            seg_id = seg['segment_id']
            state = segment_states[seg_id]
            
            if state['completed']:
                continue
                
            # Calculate potential output for this shift
            # Add some random variance (+/- 20%)
            variance = random.uniform(0.8, 1.2)
            daily_potential = base_productivity * weather_factor * variance
            
            # Cap at remaining blocks
            remaining = state['blocks_total'] - state['cumulative_blocks']
            
            if daily_potential >= remaining:
                shift_output = remaining
                state['cumulative_blocks'] = state['blocks_total']
                state['completed'] = True
                remaining_after = 0.0
            else:
                shift_output = daily_potential
                state['cumulative_blocks'] += shift_output
                remaining_after = state['blocks_total'] - state['cumulative_blocks']
                
            # Create log entry
            log_entry = {
                "date": date_str,
                "segment_id": seg_id,
                "shift_output_blocks": round(shift_output, 4),
                "cumulative_blocks": round(state['cumulative_blocks'], 4),
                "remaining_blocks": round(remaining_after, 4),
                "crew_size": crew_size,
                "weather": weather
            }
            logs.append(log_entry)
            
    return logs
