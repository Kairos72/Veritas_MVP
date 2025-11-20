const API_URL = 'http://localhost:5000';

let currentLogs = [];
let projects = [];
let activeProject = null;
let fieldLogs = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.loadProjects();
    window.loadFieldLogs();
    updateProjectSelect();
});

// --- Persistence ---

// Load field logs from LocalStorage
window.loadFieldLogs = function () {
    const stored = localStorage.getItem('veritas_field_logs');
    if (stored) {
        fieldLogs = JSON.parse(stored);
    }
    if (typeof renderFieldLogs === 'function') {
        renderFieldLogs();
    }
}

// Save field logs to LocalStorage
function saveFieldLogs() {
    localStorage.setItem('veritas_field_logs', JSON.stringify(fieldLogs));
    if (typeof renderFieldLogs === 'function') {
        renderFieldLogs();
    }

    // Trigger Sync
    if (window.syncClient && currentUser) {
        window.syncClient.sync();
    }
}

// --- Export / Import ---

document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', importData);

function exportData() {
    if (!activeProject) {
        alert("Please select a project to include in the filename (optional, but recommended).");
    }

    const exportData = {
        exported_at: new Date().toISOString(),
        version: "v1",
        projects: projects,
        segments: [],
        field_logs: fieldLogs
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const projId = activeProject ? activeProject.project_id : 'ALL';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `veritas_export_${projId}_${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            if (!data.projects || !Array.isArray(data.projects) || !data.field_logs || !Array.isArray(data.field_logs)) {
                alert("Invalid import file: Missing projects or field_logs arrays.");
                return;
            }

            if (!confirm(`Import will merge ${data.projects.length} projects and ${data.field_logs.length} logs. Continue?`)) {
                return;
            }

            let newProjectsCount = 0;
            data.projects.forEach(importedProj => {
                const existingIndex = projects.findIndex(p => p.project_id === importedProj.project_id);
                if (existingIndex >= 0) {
                    projects[existingIndex] = importedProj;
                } else {
                    projects.push(importedProj);
                    newProjectsCount++;
                }
            });

            let newLogsCount = 0;
            data.field_logs.forEach(importedLog => {
                if (!importedLog.entry_id) {
                    importedLog.entry_id = crypto.randomUUID();
                }

                const existingIndex = fieldLogs.findIndex(l => l.entry_id === importedLog.entry_id);
                if (existingIndex === -1) {
                    fieldLogs.push(importedLog);
                    newLogsCount++;
                }
            });

            saveProjects();
            saveFieldLogs();
            updateProjectSelect(activeProject ? activeProject.project_id : "");

            event.target.value = '';

            alert(`Import Successful!\nProjects added: ${newProjectsCount}\nLogs added: ${newLogsCount}`);

        } catch (err) {
            console.error(err);
            alert("Failed to import data: " + err.message);
        }
    };
    reader.readAsText(file);
}

// --- Project Management ---

// Load projects from LocalStorage
window.loadProjects = function () {
    const stored = localStorage.getItem('veritas_projects');
    if (stored) {
        projects = JSON.parse(stored);
    }
    updateProjectSelect();
}

// Save projects to LocalStorage
function saveProjects() {
    localStorage.setItem('veritas_projects', JSON.stringify(projects));
    const select = document.getElementById('projectSelect');
    const currentVal = select.value;
    updateProjectSelect(currentVal);

    // Trigger Sync
    if (window.syncClient && currentUser) {
        window.syncClient.sync();
    }
}

function updateProjectSelect(selectedValue = "") {
    const select = document.getElementById('projectSelect');
    select.innerHTML = '<option value="">-- Select a Project --</option>';
    projects.forEach((p, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${p.project_title} (${p.project_id})`;
        select.appendChild(option);
    });

    if (selectedValue !== "") {
        select.value = selectedValue;
    }
}

document.getElementById('newProjectBtn').addEventListener('click', () => {
    document.getElementById('newProjectForm').style.display = 'block';
    document.getElementById('newProjectBtn').style.display = 'none';
});

document.getElementById('cancelProjectBtn').addEventListener('click', () => {
    document.getElementById('newProjectForm').style.display = 'none';
    document.getElementById('newProjectBtn').style.display = 'inline-block';
});

document.getElementById('newProjectForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const newProject = {
        project_id: document.getElementById('projId').value,
        contract_id: document.getElementById('contractId').value,
        project_title: document.getElementById('projTitle').value,
        contractor_name: document.getElementById('contractor').value,
        owner: document.getElementById('owner').value,
        project_type: document.getElementById('projType').value,
        location: document.getElementById('location').value,
        start_date: document.getElementById('startDate').value,
        end_date: document.getElementById('endDate').value,
        notes: document.getElementById('notes').value
    };

    projects.push(newProject);
    saveProjects();

    // Reset UI
    document.getElementById('newProjectForm').reset();
    document.getElementById('newProjectForm').style.display = 'none';
    document.getElementById('newProjectBtn').style.display = 'inline-block';

    // Auto-select new project
    document.getElementById('projectSelect').value = projects.length - 1;
    document.getElementById('projectSelect').dispatchEvent(new Event('change'));
});

document.getElementById('projectSelect').addEventListener('change', (e) => {
    const index = e.target.value;
    if (index !== "") {
        activeProject = projects[index];
        document.getElementById('activeProjectDisplay').style.display = 'block';
        document.getElementById('activeProjectTitle').textContent = activeProject.project_title;
        document.getElementById('activeProjectId').textContent = activeProject.project_id;
    } else {
        activeProject = null;
        document.getElementById('activeProjectDisplay').style.display = 'none';
    }
});

// --- Tabs ---

window.switchTab = function (tabName) {
    // Hide all contents
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    // Show selected
    document.getElementById(tabName).style.display = 'block';

    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    // This is a simple way to toggle active class based on onclick handler text, 
    // but better to use event delegation or IDs. For now, we'll just toggle based on order or assume.
    // Actually, let's just find the button that calls this function.
    // Simpler:
    if (tabName === 'simulation') {
        document.querySelector('.tabs button:nth-child(1)').classList.add('active');
        document.querySelector('.tabs button:nth-child(2)').classList.remove('active');
    } else {
        document.querySelector('.tabs button:nth-child(1)').classList.remove('active');
        document.querySelector('.tabs button:nth-child(2)').classList.add('active');
    }
};

// --- Field Entry Mode ---



// Set today's date
document.getElementById('fieldDate').valueAsDate = new Date();

// Photo Button Handlers
document.getElementById('btnCamera').addEventListener('click', () => {
    document.getElementById('fieldPhotoCamera').click();
});

document.getElementById('btnUpload').addEventListener('click', () => {
    document.getElementById('fieldPhoto').click();
});

document.getElementById('clearPhotoBtn').addEventListener('click', () => {
    document.getElementById('fieldPhoto').value = '';
    document.getElementById('fieldPhotoCamera').value = '';
    document.getElementById('photoPreviewContainer').style.display = 'none';
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoInfo').textContent = '';
});

// Handle file selection (both camera and upload)
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('photoPreview').src = e.target.result;
            document.getElementById('photoPreviewContainer').style.display = 'block';
            document.getElementById('photoInfo').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        }
        reader.readAsDataURL(file);
    }
}

document.getElementById('fieldPhoto').addEventListener('change', handleFileSelect);
document.getElementById('fieldPhotoCamera').addEventListener('change', handleFileSelect);

document.getElementById('fieldForm').addEventListener('submit', (e) => {
    e.preventDefault();

    if (!activeProject) {
        alert("Please select a project first!");
        return;
    }

    const date = document.getElementById('fieldDate').value;
    const segmentId = document.getElementById('fieldSegmentId').value;
    const segLength = parseFloat(document.getElementById('fieldSegLength').value);
    const blockLength = parseFloat(document.getElementById('fieldBlockLength').value);
    const blocksToday = parseFloat(document.getElementById('fieldBlocks').value);
    const crew = parseInt(document.getElementById('fieldCrew').value);
    const weather = document.getElementById('fieldWeather').value;
    const notes = document.getElementById('fieldNotes').value;
    const lat = document.getElementById('fieldLat').value;
    const long = document.getElementById('fieldLong').value;

    // Calculate stats
    // Filter existing logs for this segment to get previous cumulative
    const segmentLogs = fieldLogs.filter(l => l.segment_id === segmentId);
    const prevCumulative = segmentLogs.length > 0 ? segmentLogs[segmentLogs.length - 1].cumulative_blocks : 0;

    const cumulative = prevCumulative + blocksToday;

    // Total blocks needed = segLength / blockLength
    const totalBlocks = segLength / blockLength;
    const remaining = Math.max(0, totalBlocks - cumulative);
    const remainingMeters = Math.max(0, segLength - (cumulative * blockLength));

    // Check both inputs for a file
    const photoInput = document.getElementById('fieldPhoto');
    const cameraInput = document.getElementById('fieldPhotoCamera');
    let file = null;

    if (photoInput.files && photoInput.files[0]) {
        file = photoInput.files[0];
    } else if (cameraInput.files && cameraInput.files[0]) {
        file = cameraInput.files[0];
    }

    let photoBase64 = null;

    const processEntry = (base64Img) => {
        const entry = {
            entry_id: crypto.randomUUID(),
            date: date,
            segment_id: segmentId,
            shift_output_blocks: blocksToday,
            cumulative_blocks: cumulative,
            remaining_blocks: remaining,
            remaining_meters: remainingMeters,
            crew_size: crew,
            weather: weather,
            notes: notes,
            photo_base64: base64Img,
            latitude: lat,
            longitude: long
        };

        fieldLogs.push(entry);
        saveFieldLogs();
        renderFieldLogs();

        // Reset fields
        document.getElementById('fieldBlocks').value = '';
        document.getElementById('fieldNotes').value = '';
        document.getElementById('fieldPhoto').value = '';
        document.getElementById('fieldPhotoCamera').value = '';
        document.getElementById('fieldLat').value = '';
        document.getElementById('fieldLong').value = '';
        document.getElementById('gpsStatus').textContent = '';
        document.getElementById('photoPreviewContainer').style.display = 'none';
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            processEntry(e.target.result);
        };
        reader.readAsDataURL(file);
    } else {
        processEntry(null);
    }
});

// GPS Button Handler
document.getElementById('gpsBtn').addEventListener('click', () => {
    const status = document.getElementById('gpsStatus');
    if (!navigator.geolocation) {
        status.textContent = "GPS unavailable";
        return;
    }
    status.textContent = "Locating...";
    navigator.geolocation.getCurrentPosition(
        (position) => {
            document.getElementById('fieldLat').value = position.coords.latitude.toFixed(5);
            document.getElementById('fieldLong').value = position.coords.longitude.toFixed(5);
            status.textContent = "OK";
        },
        (error) => {
            status.textContent = "Permission denied/Error";
            console.error(error);
        }
    );
});



function renderFieldLogs() {
    const tbody = document.querySelector('#fieldLogsTable tbody');
    tbody.innerHTML = '';

    if (fieldLogs.length > 0) {
        document.getElementById('fieldResultsSection').style.display = 'block';
    }

    fieldLogs.forEach(log => {
        const tr = document.createElement('tr');
        let photoHtml = '-';
        if (log.photo_base64) {
            photoHtml = `<img src="${log.photo_base64}" style="height: 50px; width: auto; border: 1px solid #ddd; border-radius: 4px;">`;
        }

        const location = (log.latitude && log.longitude) ? `${log.latitude}, ${log.longitude}` : '-';

        tr.innerHTML = `
            <td>${log.date}</td>
            <td>${log.segment_id}</td>
            <td>${log.shift_output_blocks.toFixed(2)}</td>
            <td>${log.cumulative_blocks.toFixed(2)}</td>
            <td>${log.remaining_blocks.toFixed(2)}</td>
            <td>${log.remaining_meters ? log.remaining_meters.toFixed(2) : '-'}</td>
            <td>${log.weather}</td>
            <td>${log.crew_size}</td>
            <td style="font-size: 0.8em;">${location}</td>
            <td>${photoHtml}</td>
            <td>${log.notes || ''}</td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('fieldProvenanceBtn').addEventListener('click', async () => {
    if (!fieldLogs.length) return;
    if (!activeProject) {
        alert("No active project selected.");
        return;
    }

    const payload = {
        shift_logs: fieldLogs,
        project: activeProject,
        output_name: `provenance_field_${activeProject.project_id}_${Date.now()}.pdf`
    };

    try {
        const response = await fetch(`${API_URL}/provenance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }

        document.getElementById('serverHashValue').textContent = data.sha256;
        const link = document.getElementById('serverPdfLink');
        link.href = data.pdf_path;
        link.download = ''; // Let browser handle filename from server or path
        link.textContent = "Download Server PDF";
        document.getElementById('serverProvenanceSection').style.display = 'block';
        document.getElementById('localProvenanceSection').style.display = 'none';
        document.getElementById('serverProvenanceSection').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error(err);
        alert('Failed to generate provenance.');
    }
});

document.getElementById('fieldProvenanceLocalBtn').addEventListener('click', async () => {
    if (!fieldLogs.length) return;
    if (!activeProject) {
        alert("No active project selected.");
        return;
    }

    try {
        // Generate PDF Blob
        const pdfBlob = await window.generateLocalPDF(activeProject, fieldLogs);

        // Calculate SHA-256 Hash
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Create Download Link
        const url = URL.createObjectURL(pdfBlob);

        // Update UI
        document.getElementById('localHashValue').textContent = hashHex;
        const link = document.getElementById('localPdfLink');
        link.href = url;
        link.download = `provenance_local_${activeProject.project_id}_${Date.now()}.pdf`;
        link.textContent = "Download Local PDF";

        document.getElementById('localProvenanceSection').style.display = 'block';
        document.getElementById('serverProvenanceSection').style.display = 'none';
        document.getElementById('localProvenanceSection').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        console.error(err);
        alert('Failed to generate local PDF: ' + err.message);
    }
});

// --- Simulation ---

document.getElementById('simForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!activeProject) {
        alert("Please select a project first!");
        return;
    }

    const segmentId = document.getElementById('segmentId').value;
    const length = parseFloat(document.getElementById('length').value);
    const width = parseFloat(document.getElementById('width').value);
    const days = parseInt(document.getElementById('days').value);

    const payload = {
        segments: [{
            segment_id: segmentId,
            length_m: length,
            width_m: width
        }],
        days: days,
        seed: Math.floor(Math.random() * 1000)
    };

    try {
        const response = await fetch(`${API_URL}/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }

        currentLogs = data.logs;
        renderLogs(currentLogs);

        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('serverProvenanceSection').style.display = 'none';
        document.getElementById('localProvenanceSection').style.display = 'none';

    } catch (err) {
        console.error(err);
        alert('Failed to connect to API. Is it running?');
    }
});

// --- Provenance ---

document.getElementById('provenanceBtn').addEventListener('click', async () => {
    if (!currentLogs.length) return;
    if (!activeProject) {
        alert("No active project selected.");
        return;
    }

    const payload = {
        shift_logs: currentLogs,
        project: activeProject,
        output_name: `provenance_${activeProject.project_id}_${Date.now()}.pdf`
    };

    try {
        const response = await fetch(`${API_URL}/provenance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            alert('Error: ' + data.error);
            return;
        }

        document.getElementById('serverHashValue').textContent = data.sha256;
        document.getElementById('serverPdfLink').href = data.pdf_path;
        document.getElementById('serverProvenanceSection').style.display = 'block';
        document.getElementById('localProvenanceSection').style.display = 'none';

    } catch (err) {
        console.error(err);
        alert('Failed to generate provenance.');
    }
});

function renderLogs(logs) {
    const tbody = document.querySelector('#logsTable tbody');
    tbody.innerHTML = '';

    logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${log.date}</td>
            <td>${log.segment_id}</td>
            <td>${log.shift_output_blocks.toFixed(2)}</td>
            <td>${log.cumulative_blocks.toFixed(2)}</td>
            <td>${log.remaining_blocks.toFixed(2)}</td>
            <td>${log.weather}</td>
        `;
        tbody.appendChild(tr);
    });
}
