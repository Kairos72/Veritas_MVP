# Veritas MVP PWA

This directory contains the Progressive Web App (PWA) for the Veritas MVP.

## Features
- **Project Management**: Create and select active projects.
- **Simulation Mode**: Run construction simulations and generate provenance records.
- **Field Entry Mode**: Log daily field data, including photos and GPS coordinates.
- **Offline Mode**: Generate provenance PDFs locally in the browser without an internet connection.
- **Data Export/Import**: Backup and restore project data and field logs via JSON files.

## Offline Usage
The PWA is designed to work offline. When offline:
1.  **Field Entry**: You can continue to add field logs, photos, and GPS coordinates (if device GPS is active).
2.  **Local PDF Generation**: Click "Generate Local PDF (Offline)" to create a signed PDF directly in your browser.
    - This uses `jspdf` and `crypto.subtle` to generate the PDF and its SHA-256 hash locally.
    - You can download the PDF immediately.
3.  **Server Sync**: The "Generate Server PDF" button will fail if the API is unreachable, but your local data is preserved in the current session.

## Data Backup (Export/Import)
To ensure data safety, especially when switching devices or clearing browser cache:
1.  **Export**: Click "Export Data (JSON)" in the Project Selection area. This downloads a JSON file containing all projects and field logs.
2.  **Import**: Click "Import Data" and select a previously exported JSON file.
    - The system will merge the imported data with your current data.
    - Existing projects/logs with the same IDs will be updated (projects) or skipped (logs) to prevent duplicates.

## Setup
1.  Ensure the API is running (`run_api.bat` in the root directory) for full functionality.
2.  Open `index.html` in a modern web browser.

## Dependencies
- `jspdf.min.js`: Library for local PDF generation.
- `pdf_local.js`: Custom module for local PDF logic.
- `app.js`: Main application logic.
- `style.css`: Styling.
