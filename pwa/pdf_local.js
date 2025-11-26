
// Local PDF Generation using jsPDF
// This module runs entirely in the browser.

// Helper function to create canvas for photo enhancement
async function enhancePhotoWithGPS(base64Image, log) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Set canvas size to match image
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Add GPS overlay if GPS data is available
            if (log.latitude && log.longitude) {
                addGPSOverlay(ctx, canvas.width, canvas.height, log);
            }

            // Convert canvas back to base64
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.src = base64Image;
    });
}

// Function to add GPS overlay to photo
function addGPSOverlay(ctx, imgWidth, imgHeight, log) {
    const padding = 10;
    const fontSize = Math.max(12, imgWidth / 50); // Responsive font size

    // Set up text style
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 3;

    // Create GPS text
    const gpsText = `GPS: ${log.latitude}, ${log.longitude}`;
    const dateTimeText = log.date || new Date().toISOString().split('T')[0];

    // Measure text dimensions
    const gpsMetrics = ctx.measureText(gpsText);
    const dateMetrics = ctx.measureText(dateTimeText);

    // Calculate text box dimensions
    const maxWidth = Math.max(gpsMetrics.width, dateMetrics.width) + 20;
    const textHeight = fontSize * 2.5;

    // Position (bottom left - DPWH standard)
    const x = padding; // Left side instead of right
    const y = imgHeight - textHeight - padding;

    // Draw semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x - 5, y - 5, maxWidth + 10, textHeight + 10);

    // Draw border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 5, y - 5, maxWidth + 10, textHeight + 10);

    // Draw text with white color and shadow
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillText(gpsText, x + 10, y + fontSize + 5);
    ctx.fillText(dateTimeText, x + 10, y + fontSize * 2 + 5);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Add small location pin icon
    drawLocationPin(ctx, x + maxWidth + 10, y);
}

// Function to draw simple location pin icon
function drawLocationPin(ctx, x, y) {
    ctx.fillStyle = '#ef4444'; // Red color for pin
    ctx.beginPath();
    ctx.moveTo(x, y + 15); // Bottom point of pin
    ctx.lineTo(x + 10, y);
    ctx.lineTo(x + 5, y + 8);
    ctx.lineTo(x, y + 15);
    ctx.fill();

    // Pin circle
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x + 5, y + 8, 3, 0, 2 * Math.PI);
    ctx.fill();
}

// Function to create QR code with GPS data
function createGPSQRCode(log) {
    return new Promise((resolve) => {
        // Create GPS data string
        const gpsData = {
            lat: log.latitude,
            lng: log.longitude,
            date: log.date,
            segment: log.segment_id,
            time: new Date().toISOString()
        };

        // Create temporary div for QR code
        const qrDiv = document.createElement('div');
        qrDiv.style.position = 'absolute';
        qrDiv.style.left = '-9999px';
        document.body.appendChild(qrDiv);

        // Generate QR code - 300% larger and higher quality
        new QRCode(qrDiv, {
            text: JSON.stringify(gpsData),
            width: 768, // 256 * 3 = much higher quality
            height: 768,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H // Higher error correction for better scanning
        });

        // Wait for QR code to be generated
        setTimeout(() => {
            const qrImage = qrDiv.querySelector('img');
            if (qrImage) {
                resolve(qrImage.src);
            } else {
                resolve(null);
            }
            document.body.removeChild(qrDiv);
        }, 500);
    });
}

// Function to combine photo with QR code (overlayed on image)
async function addQRCodeToPhoto(base64Image, qrCodeData) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Keep original canvas size - photo stays same size
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw original image first
            ctx.drawImage(img, 0, 0);

            // Overlay QR code directly on photo
            if (qrCodeData) {
                const qrImg = new Image();
                qrImg.onload = () => {
                    // Position QR code in top right corner of photo (50% smaller)
                    const qrSize = Math.min(img.width * 0.2, img.height * 0.2); // 20% of photo dimensions (50% smaller)
                    const qrX = img.width - qrSize - 20; // 20px margin from right
                    const qrY = 20; // 20px margin from top

                    // Draw semi-transparent white background for QR code (better visibility)
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.fillRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10);

                    // Draw QR code overlay
                    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

                    // Add "Scan GPS" text overlay on photo
                    ctx.font = `bold ${Math.max(12, qrSize/15)}px Arial`;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.lineWidth = 3;
                    ctx.textAlign = 'center';

                    // Add text with stroke for better readability (below QR code)
                    const textX = qrX + (qrSize / 2);
                    const textY = qrY + qrSize + 15; // Below QR code in top right

                    ctx.strokeText('SCAN GPS', textX, textY);
                    ctx.fillText('SCAN GPS', textX, textY);

                    resolve(canvas.toDataURL('image/jpeg', 0.9));
                };
                qrImg.src = qrCodeData;
            } else {
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            }
        };
        img.src = base64Image;
    });
}

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

        // Enhanced Photo with GPS overlays
        if (log.photo_base64) {
            try {
                let enhancedPhoto = log.photo_base64;

                // Step 1: Add GPS overlay to photo if GPS data is available
                if (log.latitude && log.longitude) {
                    enhancedPhoto = await enhancePhotoWithGPS(enhancedPhoto, log);
                }

                // Step 2: Create and add QR code if GPS data is available
                if (log.latitude && log.longitude && window.QRCode) {
                    const qrCodeData = await createGPSQRCode(log);
                    if (qrCodeData) {
                        enhancedPhoto = await addQRCodeToPhoto(enhancedPhoto, qrCodeData);
                    }
                }

                // Determine image format
                let format = 'JPEG';
                if (enhancedPhoto.includes('image/png')) {
                    format = 'PNG';
                }

                // Calculate image dimensions (back to normal size with QR overlay)
                const imgWidth = 100; // Standard size with QR overlay on photo
                const imgHeight = 75; // Maintaining aspect ratio

                // Check page break for enhanced image
                if (y + imgHeight + 10 > 280) {
                    doc.addPage();
                    y = 20;
                }

                // Add enhanced image to PDF
                doc.addImage(enhancedPhoto, format, margin, y, imgWidth, imgHeight);
                y += imgHeight + 5;

                // Add photo description with GPS info if available
                doc.setFont("helvetica", "italic");
                doc.setFontSize(10);
                let photoCaption = `Field Photo for ${log.date}`;
                if (log.latitude && log.longitude) {
                    photoCaption += " (GPS-enabled)";
                }
                doc.text(photoCaption, margin, y);

                // Add note about QR code if GPS is available
                if (log.latitude && log.longitude) {
                    doc.setFontSize(8);
                    doc.setFont("helvetica", "normal");
                    doc.text("Scan QR code for location details and verification", margin, y + 4);
                }

                doc.setFont("helvetica", "normal");
                doc.setFontSize(12);
                y += lineHeight + 4;

            } catch (e) {
                console.error("Error adding enhanced photo to PDF", e);
                // Fallback to original photo if enhancement fails
                try {
                    let format = 'JPEG';
                    if (log.photo_base64.includes('image/png')) {
                        format = 'PNG';
                    }

                    const imgWidth = 100;
                    const imgHeight = 75;

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
                } catch (fallbackError) {
                    console.error("Error even with fallback photo", fallbackError);
                    doc.text("[Error embedding photo]", margin, y);
                    y += lineHeight;
                }
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
