# Monte Carlo Simulation Generator

## Overview

This module handles the simulation of construction progress and generation of shift logs. The simulation is retained for **internal testing, QA, and demonstration purposes** only.

## Status

**RETIRED FROM PRODUCTION UI** - Simulation Mode has been removed from the main PWA interface to simplify the user experience for field workers. The engine remains available for internal use.

## Usage

You can run the generator using the `cli_example.py` script.

### Example Command

```bash
python engine/generator/cli_example.py
```

### Expected Output

```csv
date,segment_id,shift_output_blocks,cumulative_blocks,remaining_blocks,crew_size,weather
2025-11-19,seg-A,0.8543,0.8543,10.2568,8,clear
2025-11-19,seg-B,0.8543,0.8543,5.8124,8,clear
...
```

## Logic

The generator:
1. Takes a list of segments.
2. Calculates total blocks needed based on segment length and block length (default 4.5m).
3. Simulates daily progress based on crew size and weather conditions.
4. Outputs `shift_log` entries adhering to the schema defined in `/engine/schema/shift_log.schema.json`.
