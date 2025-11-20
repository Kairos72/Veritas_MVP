# Veritas Engine API

This directory contains a minimal Flask API to interact with the Veritas Engine.

## Endpoints

### POST /simulate
Simulates construction progress.

**Input:**
```json
{
  "segments": [
    {"segment_id": "seg-001", "length_m": 100, "width_m": 7}
  ],
  "days": 10,
  "seed": 42
}
```

**Output:**
```json
{
  "logs": [...],
  "summary": {"total_days": 10, "total_logs": 20}
}
```

### POST /provenance
Generates a PDF statement of work and returns its hash.

**Input:**
```json
{
  "shift_logs": [...],
  "output_name": "my_report.pdf"
}
```

**Output:**
```json
{
  "pdf_path": "output/my_report.pdf",
  "sha256": "a5d8..."
}
```

## Running Locally

1. Ensure dependencies are installed (`flask`, `fpdf`).
2. Run the app:
   ```bash
   python engine/api/app.py
   ```
3. The API will be available at `http://localhost:5000`.
