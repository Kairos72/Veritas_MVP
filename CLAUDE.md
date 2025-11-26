# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Veritas MVP is a construction data engine and provenance tracking system with two main components:

1. **Python Engine** (`/engine`): Backend API for data simulation, provenance PDF generation, and data management
2. **Progressive Web App** (`/pwa`): Frontend for project management, field data collection, and offline operation with Supabase sync

The system tracks construction progress through projects, road segments, blocks, and daily shift logs, providing both online sync capabilities and offline functionality.

## Common Development Commands

### Starting the API Server
```bash
run_api.bat
```
This starts the Flask API server on `http://localhost:5000` which is required for full functionality.

### Running the PWA
Simply open `pwa/index.html` in a modern web browser. The app includes a service worker for offline functionality.

### Testing
- Engine tests are located in `/engine/tests/`
- Run tests using standard Python test methods in the engine directory

## Architecture Overview

### Data Models
The system uses JSON schemas defined in `/engine/schema/`:
- **Project**: Construction projects with metadata (project_id, contract, dates, location)
- **Segment**: Road segments linked to projects with dimensions (length, width, thickness)
- **Block**: Construction units (4.5m blocks) that make up segments
- **Shift Log**: Daily progress records with crew size, weather, and block counts

### Python Engine Structure
- `/engine/api/app.py`: Flask API server providing `/simulate` and `/provenance` endpoints
- `/engine/generator/generator.py`: Simulation logic that generates realistic construction progress based on weather, crew size, and productivity factors
- `/engine/provenance/provenance.py`: PDF generation using fpdf to create "Statement of Work Accomplished" documents with SHA-256 hashing

### PWA Frontend Structure
- `app.js`: Main application logic, project management, and LocalStorage persistence (2000+ lines)
- `auth.js`: Supabase authentication handling
- `sync_client.js`: Bidirectional sync between LocalStorage and Supabase using last-writer-wins conflict resolution
- `sw.js`: Service worker for offline caching
- `pdf_local.js`: Local PDF generation capabilities with GPS overlays and QR codes
- `config.js`: Supabase configuration and developer settings (includes `ENABLE_SIMULATION_UI` flag)

### Data Flow
1. **Simulation**: Frontend sends segments to API `/simulate` → returns shift logs with daily progress
2. **Provenance**: Shift logs sent to `/provenance` → generates PDF with metadata and SHA-256 hash
3. **Sync**: Local changes in LocalStorage ↔ Supabase via sync_client.js
4. **Persistence**: Primary storage in LocalStorage with optional cloud sync

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

### Current State (Post-Development)
- **Production Ready**: Clean UI with Segments, Field Entry, and Photo Gallery tabs
- **Simulation Engine**: Retained for internal testing, QA, and demos (toggle via `CONFIG.ENABLE_SIMULATION_UI`)
- **Photo Enhancement**: GPS overlays, QR codes, and medium-sized image optimization
- **Mobile Optimized**: Responsive design with touch-friendly controls and horizontal photo detail layouts
- **Field Provenance**: Cryptographic PDF generation with SHA-256 verification

## Development Notes

- The PWA works entirely offline without the API but simulation requires the Python server
- All data models follow the JSON schemas in `/engine/schema/`
- The system uses a block-based construction model (4.5m blocks per segment)
- Simulation includes weather factors and crew productivity modeling
- PDF provenance documents include project metadata and cryptographic hashes
- Photo Gallery handles large datasets (200+ photos) with client-side caching and performance optimization
- Field UI optimized for daily workflow with minimal clicks and mobile-first design
- Developer toggle in `config.js` controls Simulation Mode visibility (default: hidden)