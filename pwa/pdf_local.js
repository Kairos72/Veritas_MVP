
// Local PDF Generation using jsPDF
// This module runs entirely in the browser.

async function generateLocalPDF(project, logs) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Helper for layout
    let y = 10;
    const lineHeight = 7;
    const margin = 10;
    const pageWidth = doc.internal.pageSize.getWidth();

    // --- Title ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Statement of Work Accomplished", pageWidth / 2, y, { align: "center" });
    y += 10;

    // --- Project Header ---
    if (project) {
        doc.setFontSize(12);
        doc.text(`Project: ${project.project_title || 'N/A'} (ID: ${project.project_id || 'N/A'})`, margin, y);
        y += lineHeight;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Contract: ${project.contract_id || 'N/A'}`, margin, y);
        y += 6;
        doc.text(`Contractor: ${project.contractor_name || 'N/A'}`, margin, y);
        y += 6;
        doc.text(`Owner: ${project.owner || 'N/A'}`, margin, y);
        y += 6;
        doc.text(`Type: ${project.project_type || 'N/A'}`, margin, y);
        y += 6;
        doc.text(`Location: ${project.location || 'N/A'}`, margin, y);
        y += 6;
        doc.text(`Start Date: ${project.start_date || 'N/A'}   End Date: ${project.end_date || 'N/A'}`, margin, y);
        y += 6;

        if (project.notes) {
            const splitNotes = doc.splitTextToSize(`Notes: ${project.notes}`, pageWidth - 2 * margin);
            doc.text(splitNotes, margin, y);
            y += (splitNotes.length * 6);
        }

        y += 5;
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;
    }

    // --- Logs ---
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);

    // Group logs by segment
    const logsBySegment = {};
    logs.forEach(log => {
        if (!logsBySegment[log.segment_id]) {
            logsBySegment[log.segment_id] = [];
        }
        logsBySegment[log.segment_id].push(log);
    });

    // Sort segments by ID for consistent ordering
    const sortedSegmentIds = Object.keys(logsBySegment).sort();

    // Process each segment
    for (const segmentId of sortedSegmentIds) {
        const segmentLogs = logsBySegment[segmentId];

        // Add segment header if multiple segments
        if (sortedSegmentIds.length > 1) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(`=== Segment ${segmentId} ===`, margin, y);
            y += 10;
        }

        // Process logs for this segment (sorted by date)
        const sortedLogs = segmentLogs.sort((a, b) => new Date(a.date) - new Date(b.date));

        for (const log of sortedLogs) {
        // Check for page break
        if (y > 250) {
            doc.addPage();
            y = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.text(`Date: ${log.date || 'N/A'}`, margin, y);
        y += lineHeight;
        doc.text(`Segment: ${log.segment_id || 'N/A'}`, margin, y);
        y += lineHeight; // Extra space

        doc.setFont("helvetica", "normal");
        doc.text(`Blocks Completed Today: ${log.shift_output_blocks}`, margin, y);
        y += lineHeight;
        doc.text(`Cumulative Blocks: ${log.cumulative_blocks}`, margin, y);
        y += lineHeight;
        doc.text(`Remaining Blocks: ${log.remaining_blocks}`, margin, y);
        y += lineHeight;
        doc.text(`Crew Size: ${log.crew_size || 'N/A'}`, margin, y);
        y += lineHeight;
        doc.text(`Weather: ${log.weather || 'N/A'}`, margin, y);
        y += lineHeight;

        // GPS
        if (log.latitude && log.longitude) {
            doc.text(`GPS: (${log.latitude}, ${log.longitude})`, margin, y);
        } else {
            doc.text(`GPS: Not Available`, margin, y);
        }
        y += lineHeight;

        // Photo
        if (log.photo_base64) {
            try {
                // jsPDF handles base64 images directly
                // Format: data:image/jpeg;base64,...
                // We need to determine format
                let format = 'JPEG';
                if (log.photo_base64.includes('image/png')) {
                    format = 'PNG';
                }

                // Add image
                // x, y, w, h
                // We set width to 100mm, calculate height to keep aspect ratio if possible, 
                // but for simplicity let's just set width and let height scale or fixed.
                // Let's use a fixed width of 100mm
                const imgWidth = 100;
                const imgHeight = 75; // Approx 4:3

                // Check page break for image
                if (y + imgHeight > 280) {
                    doc.addPage();
                    y = 20;
                }

                doc.addImage(log.photo_base64, format, margin, y, imgWidth, imgHeight);
                y += imgHeight + 2;

                doc.setFont("helvetica", "italic");
                doc.setFontSize(10);
                doc.text(`Field Photo for ${log.date}`, margin, y);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(12);
                y += lineHeight;

            } catch (e) {
                console.error("Error adding image to PDF", e);
                doc.text("[Error embedding photo]", margin, y);
                y += lineHeight;
            }
        }

        y += 5;
            doc.line(margin, y, pageWidth - margin, y);
            y += 10;
        }

        // Add spacing between segments
        if (sortedSegmentIds.length > 1) {
            y += 10;
        }
    }

    return doc.output('blob');
}

// Expose to window
window.generateLocalPDF = generateLocalPDF;
