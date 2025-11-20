import hashlib
import os
import base64
import tempfile
from typing import List, Dict, Any
from fpdf import FPDF

def hash_file(path: str) -> str:
    """
    Calculates the SHA-256 hash of a file.
    
    Args:
        path: Path to the file.
        
    Returns:
        Hex string of the SHA-256 hash.
    """
    sha256_hash = hashlib.sha256()
    with open(path, "rb") as f:
        # Read and update hash string value in blocks of 4K
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def create_provenance_pdf(shift_logs: List[Dict[str, Any]], output_path: str, project: Dict[str, Any] = None) -> str:
    """
    Creates a PDF Statement of Work Accomplished from shift logs.
    
    Args:
        shift_logs: List of shift_log entries (usually for a single day/segment).
        output_path: Path where the PDF should be saved.
        project: Optional dictionary containing project metadata.
        
    Returns:
        Path to the created PDF.
    """
    pdf = FPDF()
    pdf.add_page()
    
    # Title
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, "Statement of Work Accomplished", ln=True, align="C")
    pdf.ln(5)
    
    # Project Header
    if project:
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 8, f"Project: {project.get('project_title', 'N/A')} (ID: {project.get('project_id', 'N/A')})", ln=True)
        
        pdf.set_font("Arial", "", 10)
        pdf.cell(0, 6, f"Contract: {project.get('contract_id', 'N/A')}", ln=True)
        pdf.cell(0, 6, f"Contractor: {project.get('contractor_name', 'N/A')}", ln=True)
        pdf.cell(0, 6, f"Owner: {project.get('owner', 'N/A')}", ln=True)
        pdf.cell(0, 6, f"Type: {project.get('project_type', 'N/A')}", ln=True)
        pdf.cell(0, 6, f"Location: {project.get('location', 'N/A')}", ln=True)
        
        start = project.get('start_date', 'N/A')
        end = project.get('end_date', 'N/A')
        pdf.cell(0, 6, f"Start Date: {start}   End Date: {end}", ln=True)
        
        if project.get('notes'):
            pdf.multi_cell(0, 6, f"Notes: {project.get('notes')}")
            
        pdf.ln(5)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(5)
    
    # Content
    pdf.set_font("Arial", "", 12)
    
    for log in shift_logs:
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 10, f"Date: {log.get('date', 'N/A')}", ln=True)
        pdf.cell(0, 10, f"Segment: {log.get('segment_id', 'N/A')}", ln=True)
        pdf.ln(2)
        
        pdf.set_font("Arial", "", 12)
        pdf.cell(0, 8, f"Blocks Completed Today: {log.get('shift_output_blocks', 0)}", ln=True)
        pdf.cell(0, 8, f"Cumulative Blocks: {log.get('cumulative_blocks', 0)}", ln=True)
        pdf.cell(0, 8, f"Remaining Blocks: {log.get('remaining_blocks', 0)}", ln=True)
        pdf.cell(0, 8, f"Crew Size: {log.get('crew_size', 'N/A')}", ln=True)
        pdf.cell(0, 8, f"Weather: {log.get('weather', 'N/A')}", ln=True)
        
        # GPS
        lat = log.get('latitude')
        lon = log.get('longitude')
        if lat and lon:
            pdf.cell(0, 8, f"GPS: ({lat}, {lon})", ln=True)
        else:
            pdf.cell(0, 8, f"GPS: Not Available", ln=True)
        
        # Photo Handling
        photo_base64 = log.get('photo_base64')
        if photo_base64:
            try:
                import uuid
                
                # Determine extension and extract data
                extension = ".jpg" # default
                if ',' in photo_base64:
                    header, encoded = photo_base64.split(',', 1)
                    if "image/png" in header:
                        extension = ".png"
                    elif "image/jpeg" in header:
                        extension = ".jpg"
                else:
                    encoded = photo_base64
                
                # Decode
                image_data = base64.b64decode(encoded)
                
                # Create temp file manually to avoid Windows locking issues
                tmp_filename = f"temp_img_{uuid.uuid4()}{extension}"
                tmp_path = os.path.join(tempfile.gettempdir(), tmp_filename)
                
                with open(tmp_path, "wb") as f:
                    f.write(image_data)
                
                # OPTIMIZATION: Resize image if it's too large using PIL (if available)
                try:
                    from PIL import Image
                    with Image.open(tmp_path) as img:
                        # Resize to max width of 800px to speed up PDF generation
                        if img.width > 800:
                            ratio = 800 / img.width
                            new_height = int(img.height * ratio)
                            img = img.resize((800, new_height), Image.Resampling.LANCZOS)
                            # Save back to temp path with compression
                            img.save(tmp_path, optimize=True, quality=60)
                except ImportError:
                    pass # PIL not installed, skip optimization
                
                # Insert into PDF
                pdf.ln(5)
                pdf.image(tmp_path, w=100) # 100mm width
                pdf.ln(2)
                pdf.set_font("Arial", "I", 10)
                pdf.cell(0, 6, f"Field Photo for {log.get('date', 'N/A')}", ln=True)
                
                # Cleanup
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
                
                pdf.set_font("Arial", "", 12) # Reset font
                
            except Exception as e:
                print(f"Error embedding photo: {e}")
                pdf.cell(0, 8, f"[Error embedding photo: {str(e)}]", ln=True)

        pdf.ln(5)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(5)
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    pdf.output(output_path)
    return output_path
