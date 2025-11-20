# Veritas MVP PWA

To ensure data safety, especially when switching devices or clearing browser cache:

1. **Export**: Click "Export Data (JSON)" in the Project Selection area. This downloads a JSON file containing all projects and field logs.
2. **Import**: Click "Import Data" and select a previously exported JSON file.
    - The system will merge the imported data with your current data.
    - Existing projects/logs with the same IDs will be updated (projects) or skipped (logs) to prevent duplicates.

## Setup

1. Ensure the API is running (`run_api.bat` in the root directory) for full functionality.
2. Open `index.html` in a modern web browser.

## Dependencies

- `jspdf.min.js`: Library for local PDF generation.
- `pdf_local.js`: Custom module for local PDF logic.
- `app.js`: Main application logic.
- `style.css`: Styling.
