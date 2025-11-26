import sys
import os
import json
from flask_cors import CORS
from flask import Flask, request, jsonify, send_from_directory

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from engine.generator.generator import simulate
from engine.provenance.provenance import create_provenance_pdf, hash_file

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

# Ensure output directory exists
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
os.makedirs(OUTPUT_DIR, exist_ok=True)

@app.route('/output/<path:filename>')
def serve_output(filename):
    return send_from_directory(OUTPUT_DIR, filename)

@app.route('/simulate', methods=['POST'])
def run_simulation():
    """
    Monte Carlo simulation endpoint.
    INTERNAL USE: For QA, testing, and internal demos.
    Can be used with curl for direct testing by engineers.
    """
    try:
        data = request.get_json()
        segments = data.get('segments', [])
        days = data.get('days', 10)
        seed = data.get('seed', 42)
        
        if not segments:
            return jsonify({"error": "No segments provided"}), 400
            
        logs = simulate(segments, days=days, seed=seed)
        
        return jsonify({
            "logs": logs,
            "summary": {
                "total_days": days,
                "total_logs": len(logs)
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/provenance', methods=['POST'])
def generate_provenance():
    """
    Provenance PDF generation endpoint.
    Used by both field logs and simulation data for creating "Statement of Work Accomplished" documents.
    """
    try:
        data = request.get_json()
        shift_logs = data.get('shift_logs', [])
        output_name = data.get('output_name', 'provenance.pdf')
        project = data.get('project')
        
        if not shift_logs:
            return jsonify({"error": "No shift_logs provided"}), 400
            
        # Define output path
        output_path = os.path.join(OUTPUT_DIR, output_name)
        
        # Create PDF
        create_provenance_pdf(shift_logs, output_path, project=project)
        
        # Calculate hash
        file_hash = hash_file(output_path)
        
        # Return full URL for the file
        file_url = f"{request.host_url}output/{output_name}"
        
        return jsonify({
            "pdf_path": file_url,
            "sha256": file_hash
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Starting Veritas Engine API on http://localhost:5000")
    app.run(debug=True, port=5000)
