# Schema Definitions

This directory contains the JSON schemas for the Veritas engine data models.

## Schemas

### 1. Project (`project.schema.json`)
Describes a construction project.

**Example:**
```json
{
  "project_id": "PROJ-001",
  "contract_id": "CTR-2025-XYZ",
  "project_title": "Barangay Road Improvement",
  "contractor_name": "Veritas Construction Inc.",
  "owner": "DPWH Region IV-A",
  "project_type": "PCCP Road",
  "start_date": "2025-11-01",
  "location": "San Juan, Batangas"
}
```

### 2. Segment (`segment.schema.json`)
Describes a road segment. Now includes `project_id` to link it to a project.

**Example:**
```json
{
  "segment_id": "seg-001",
  "project_id": "PROJ-001",
  "length_m": 150,
  "width_m": 7,
  "thickness_m": 0.2
}
```

### 2. Block (`block.schema.json`)
Describes one block unit and totals for the segment.

**Example:**
```json
{
  "segment_id": "seg-001",
  "block_length_m": 4.5,
  "blocks_total": 33.3333
}
```

### 3. Shift Log (`shift_log.schema.json`)
A per-day / per-shift log entry.

**Example:**
```json
{
  "date": "2025-11-10",
  "segment_id": "seg-001",
  "shift_output_blocks": 2.5,
  "cumulative_blocks": 10.5,
  "remaining_blocks": 22.8333,
  "crew_size": 8,
  "weather": "clear"
}
```
