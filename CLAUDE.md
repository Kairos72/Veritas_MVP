# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Veritas MVP is a **universal infrastructure management system** and construction data engine with provenance tracking, featuring two main components:

1. **Python Engine** (`/engine`): Backend API for data simulation, provenance PDF generation, and data management
2. **Progressive Web App** (`/pwa`): Frontend for project management, field data collection, and offline operation with Supabase sync

The system tracks construction progress through **Assets** and **Work Items**, supporting universal infrastructure types:
- **Assets**: Physical infrastructure being monitored (road sections, buildings, flood control structures, bridges, culverts, utilities, landscaping, etc.)
- **Work Items**: Measurable tasks within assets (PCCP, excavation, foundation, drainage, finishing, etc.)
- **Field Logs**: Daily progress records with crew size, weather, and quantity measurements
- **Legacy Support**: Maintains backwards compatibility with road segment system

The **Assets & Work Items** architecture makes Veritas a truly universal construction management tool that can handle any type of infrastructure project, not just roads.

## Common Development Commands

### Starting the API Server
```bash
run_api.bat
```
This starts the Flask API server on `http://localhost:5000` which is required for full functionality.

### Running the PWA
Simply open `pwa/index.html` in a modern web browser. The app includes a service worker for offline functionality.

### Testing
- **Engine Tests**: Located in `/engine/tests/` - Run using standard Python test methods in the engine directory
- **Automated PWA Testing**: Professional Playwright test suite for end-to-end browser automation
  - Location: `/tests/` directory (cleaned and organized November 2025)
  - Test Files: `complete-end-to-end-test.spec.js`, `field-entry-workflow.spec.js`, `simple-working-test.spec.js`
  - Setup: `cd tests && npm install && npx playwright install`
  - Run tests: `npm test` (headless) or `npm run test:headed` (browser visible)
  - Debug tests: `npm run test:debug`
  - Coverage: Field entry workflow, asset creation, work item matching, UI navigation, end-to-end scenarios
  - Features: Screenshot capture, video recording, console logging, LocalStorage inspection
  - Reports: HTML report generated automatically - view with `npx playwright show-report`
  - Clean Repository: All generated artifacts (node_modules, test-results, reports) excluded from version control

## Architecture Overview

### Data Models
The system uses JSON schemas defined in `/engine/schema/`:

#### Current Architecture (Assets & Work Items)
- **Asset**: Universal physical infrastructure with metadata (asset_id, asset_type, dimensions, location, work_items)
  - Asset Types: `road_section`, `building`, `flood_control`, `bridge`, `culvert`, `utility`, `landscaping`, `other`
  - Example: Road section with chainage, building with floor area, flood control with stationing
- **Work Item**: Measurable tasks within assets (work_item_id, work_type, item_code, unit, target_total, cumulative, remaining, status)
  - Units: `blocks`, `m`, `lm`, `m2`, `m3`, `pcs`, `kg`, `tons`, `custom`
  - Supports intelligent matching by item_code or work_type
- **Field Log**: Daily progress records (date, asset_id, work_item_id, quantity_today, crew_size, weather, notes, photo_base64)
  - Uses smart Work Item matching algorithm (match by item_code → work_type → auto-create)
  - Backwards compatible with legacy segment system

#### Legacy Support
- **Project**: Construction projects with metadata (project_id, contract, dates, location)
- **Segment**: Road segments linked to projects with dimensions (length, width, thickness) - **DEPRECATED**
- **Block**: Construction units (4.5m blocks) that make up segments - **DEPRECATED**

### Python Engine Structure
- `/engine/api/app.py`: Flask API server providing `/simulate` and `/provenance` endpoints
- `/engine/generator/generator.py`: Simulation logic that generates realistic construction progress based on weather, crew size, and productivity factors
- `/engine/provenance/provenance.py`: PDF generation using fpdf to create "Statement of Work Accomplished" documents with SHA-256 hashing
- `/engine/schema/`: JSON schema definitions for assets, work items, and field logs with examples
- `/database/`: Database schema and migration files (cleaned November 2025)

### PWA Frontend Structure
- `app.js`: Main application logic, project management, and LocalStorage persistence (2000+ lines)
- `auth.js`: Supabase authentication handling
- `sync_client.js`: Bidirectional sync between LocalStorage and Supabase using last-writer-wins conflict resolution
- `sw.js`: Service worker for offline caching
- `pdf_local.js`: Local PDF generation capabilities with GPS overlays and QR codes
- `config.js`: Supabase configuration and developer settings (includes `ENABLE_SIMULATION_UI` flag)

### Assets & Work Items System
- **Universal Asset Management**: Create any type of infrastructure asset (roads, buildings, flood control, bridges, utilities, etc.)
- **Intelligent Work Item Matching**: Smart algorithm matches field entries to existing work items by item_code or work_type, auto-creates new work items when needed
- **Asset Templates**: Pre-built templates for roads, buildings, and flood control with common work items
- **Progress Tracking**: Real-time progress calculation at both work item and asset levels
- **Chainage Support**: Full support for linear infrastructure with chainage (e.g., "0+000" to meters conversion)
- **Flexible Units**: Support for blocks, meters, linear meters, square meters, cubic meters, pieces, kg, tons, and custom units
- **Backwards Compatibility**: Migration tools to convert legacy segments to assets, maintains full compatibility with existing data

### Data Flow
1. **Asset Creation**: User creates assets with work items using templates or custom configuration
2. **Field Entry**: Field entries use intelligent Work Item matching (item_code → work_type → auto-create)
3. **Progress Updates**: Work item progress automatically calculated from field entries
4. **Provenance**: Field logs grouped by Asset → Work Item for PDF generation with SHA-256 hash
5. **Sync**: Assets, work items, and field logs sync with Supabase via last-writer-wins conflict resolution
6. **Persistence**: Primary storage in LocalStorage with optional cloud sync
7. **Migration**: Legacy segment data can be migrated to assets using `tools/migrate_segments_to_assets.py`

### Key Features
- **Offline First**: Full functionality without network connection using LocalStorage
- **PWA Capabilities**: Installable, cached assets for offline use
- **Bidirectional Sync**: Projects and field logs sync with Supabase when authenticated
- **Data Export/Import**: JSON export functionality for data portability
- **PDF Generation**: Both server-side (provenance) and client-side PDF creation
- **Photo Gallery**: Field photo management with filtering, thumbnails, and modal viewing (200+ photos)
- **GPS Integration**: Photo overlays with coordinates, QR codes, and location verification
- **Production UI**: Clean, field-focused interface (Simulation UI hidden by default)

### Authentication & Sync
Uses Supabase for authentication and data sync. Configuration in `config.js` requires valid Supabase credentials. Sync implements last-writer-wins conflict resolution based on timestamps.

### API Endpoints
- `POST /simulate`: Generate construction progress simulation from segments (INTERNAL/DEMO USE)
- `POST /provenance`: Create provenance PDF from shift logs
- `GET /output/<filename>`: Serve generated PDF files

### Current State (November 2025 - Production Ready with Critical Updates)
- **Universal Infrastructure System**: Clean UI with **Assets**, Field Entry, **Daily Summary**, and Photo Gallery tabs
- **Universal Asset Management**: Supports 8+ asset types (road_section, building, flood_control, bridge, culvert, utility, landscaping, other)
- **Intelligent Work Item Matching**: Smart algorithm matches field entries by item_code → work_type → auto-creates
- **Asset Templates**: Pre-built templates for roads, buildings, and flood control with common work items
- **Real-time Progress Tracking**: Progress calculated at work item and asset levels with visual indicators
- **Enhanced Data Model**: Assets, Work Items, and Field Logs with full backwards compatibility to legacy segments
- **PDF Generation**: **Enhanced compact layout** with photos positioned at top-right corner, smaller fonts (9pt), reduced spacing, and clean progress displays
- **Progress Display**: Fixed misleading hardcoded defaults - shows clean progress (e.g., "15 blocks" instead of "15/1000 blocks") when no target set
- **Photo Management**: Optimized photo positioning (80×60px) at entry box top-right with GPS overlays and QR codes
- **API Configuration**: Fixed local development URL (localhost:5000) and added missing getWorkItem function for PDF compatibility
- **Sync & Export**: Full bidirectional sync for assets and work items, enhanced export/import with v2 format
- **Simulation Engine**: Retained for internal testing, QA, and demos (toggle via `CONFIG.ENABLE_SIMULATION_UI`)
- **Mobile Optimized**: Responsive design with touch-friendly controls and horizontal photo detail layouts
- **Field Provenance**: Cryptographic PDF generation with SHA-256 verification
- **Daily Summary Reports**: Comprehensive supervisory dashboard with KPI tracking and PDF export
- **Data Integrity**: Mission-critical fixes ensuring unit information preservation during sync operations
- **Schema & Examples**: Complete JSON schema documentation with examples for all asset types and field logs
- **Migration Tools**: Complete migration scripts to convert legacy segments and blocks to assets
- **Database Migrations**: Production-ready schema updates with verification and rollback capabilities
- **Automated Testing**: Professional-grade Playwright test suite for end-to-end browser automation
- **Code Quality**: Cleaned temporary files, test artifacts, and backup files for production-ready repository
- **Operator Documentation**: Comprehensive reports in `docs/operator_reports/` for system maintenance and knowledge transfer

## Recent Development Updates (November 2025)

### Task 19: Critical Data Integrity & Daily Summary Implementation (Latest)
- **Mission-Critical Sync Bug Fix**: Eliminated unit information loss during logout/login cycles
  - Added `quantity_text` column to `field_logs` database table for complete quantity preservation
  - Fixed sync logic to maintain original user input (e.g., "5 cubic meters" stays "5 cubic meters")
  - Database schema migration with production-ready scripts (`database/correct_migration.sql`)
- **Asset Metadata Display Fix**: Resolved asset names showing as "undefined" and locations as "null - null"
  - Implemented `normalizeAssetFromDatabase()` function for proper field mapping
  - Fixed chainage and dimension field preservation during sync operations
  - Ensured consistent asset display across all UI components
- **Daily Summary View Feature**: New supervisory dashboard for at-a-glance project insights
  - Mobile-first responsive design with KPI cards and asset accordions
  - Offline-capable daily progress aggregation with real-time sync
  - Integrated PDF generation with SHA-256 verification for daily reports
  - Per-project/per-date timeline with photo thumbnails and activity tracking
- **User Interface Consistency**: Fixed project dropdown display in Daily Summary
  - Corrected field priority logic to show proper project names ("PROJ-1 - Cabaluay Bypass Road")
  - Standardized display formatting across all project selection components

### PDF Layout Enhancement
- **Fixed Critical Bugs**: Resolved both local and server PDF generation errors
- **Missing Function Fix**: Added getWorkItem function to app.js for PDF compatibility
- **API URL Correction**: Changed from 192.168.1.56:5000 to localhost:5000 for local development
- **Progress Display Cleanup**: Removed misleading "5/1000 blocks" by eliminating hardcoded target_total defaults
- **Compact Design**: Reduced font size to 9pt, decreased line spacing to 4pt for efficient PDF layout
- **Photo Positioning**: Photos now positioned at top-right corner of each entry box (80×60px)
- **Clean Progress Text**: Shows "15 blocks (no target set)" instead of misleading fractions when target_total is null
- **Field Consolidation**: Combined multiple fields into single lines for space efficiency

### Repository Cleanup & Organization
- **Database Directory**: Cleaned all temporary SQL files, kept README.md
- **Test Suite**: Removed generated artifacts (node_modules, playwright-report, test-results, PNG screenshots)
- **Temporary Files**: Removed debug_tabs.html, test_tabs.html, test_simple.html, unregister_sw.js
- **Backup Files**: Removed app_backup.js, app_clean.js, app_fixed_start.js, app_old.js
- **Production Ready**: Repository now contains only essential code and documentation
- **Operator Reports**: Added comprehensive documentation in `docs/operator_reports/` for system maintenance

### Schema & Migration Infrastructure
- **Asset Schema**: Complete JSON schema (`engine/schema/asset.schema.json`) defining universal asset structure
- **Examples**: Concrete examples for road_section, building, flood_control assets and field logs
- **Migration Tools**: Scripts to convert legacy segments and blocks to new asset architecture
- **Database Migrations**: Production-ready migration scripts with verification and rollback capabilities
- **Testing Utilities**: Block parsing and migration validation tools

## Development Notes

- The PWA works entirely offline without the API but simulation requires the Python server
- **PDF Generation**: Both local (pdf_local.js) and server (provenance.py) PDF generation are fully functional
- **Progress Handling**: Work items now support null target_total values with clean display formatting
- **Photo Integration**: GPS coordinates properly converted to numbers for PDF positioning
- **Asset Architecture**: New universal system supports any infrastructure type, not just roads
- **Data Integrity**: Critical sync bug fixes ensure complete preservation of unit information and asset metadata
- **Daily Summary**: New supervisory dashboard providing at-a-glance project insights with PDF export capabilities
- All data models follow the JSON schemas in `/engine/schema/` (see `asset.schema.json` for new architecture)
- **Universal Asset System**: The system now uses Assets & Work Items instead of road-specific segments
- **Work Item Matching**: Intelligent 3-step algorithm (item_code → work_type → auto-create) for seamless field entry
- **Flexible Units**: Support for blocks, meters, linear meters, square meters, cubic meters, pieces, kg, tons, and custom units
- **Unit Preservation**: Original quantity text (e.g., "5 cubic meters") maintained through complete sync cycle
- **Chainage Support**: Full support for linear infrastructure with chainage parsing (e.g., "0+000" → 0 meters)
- **Asset Templates**: Road, Building, and Flood Control templates with pre-configured work items
- **Progress Calculation**: Real-time progress at work item and asset levels with status tracking
- **Enhanced PDF**: Grouped by Asset → Work Item structure with comprehensive progress reporting
- **Bidirectional Sync**: Assets and work items sync with Supabase with last-writer-wins conflict resolution
- **Export/Import**: v2 format includes assets and work items with backwards compatibility to v1
- **Migration**: Complete migration script (`tools/migrate_segments_to_assets.py`) preserves all field logs
- **Field UI**: Asset dropdown with work item population, optimized for daily workflow and mobile-first design
- **Legacy Compatibility**: All existing segment data continues to work seamlessly
- Developer toggle in `config.js` controls Simulation Mode visibility (default: hidden)
- **Playwright Testing**: Automated browser testing framework for QA and workflow validation - critical development tool
- **Database Schema**: Updated with `quantity_text` column for complete quantity preservation during sync operations
- **Asset Display**: Fixed metadata rendering issues ensuring proper name and location display across all components
- **Documentation**: Comprehensive operator reports available in `docs/operator_reports/` for system maintenance