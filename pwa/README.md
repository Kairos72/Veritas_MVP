# Veritas MVP PWA

## UI Mode Configuration

The PWA supports two different interface modes:

### Production Mode (Default)
- Field users see a clean, focused interface with: Segments, Field Entry, and Photo Gallery
- Simulation Mode UI is hidden to reduce confusion and improve field workflow
- Default tab is "Segments" for project setup and management

### Development Mode (Optional)
- Simulation Mode can be re-enabled for internal demos and QA:
  1. Edit `config.js`
  2. Set `ENABLE_SIMULATION_UI: true`
  3. Refresh the page
  4. Simulation tab will appear and content will be visible

**Note**: Simulation Mode has been removed from the production UI to create a cleaner field experience. The simulation engine remains available via API for internal testing.

## Data Safety

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
