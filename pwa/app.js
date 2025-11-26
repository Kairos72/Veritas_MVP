const API_URL = 'http://192.168.1.56:5000';

let currentLogs = [];
let projects = [];
let activeProject = null;
let fieldLogs = [];
let segments = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're offline
    const isOffline = !navigator.onLine;

    if (isOffline) {
        console.log('📶 Offline mode detected');
        showOfflineIndicator();
    }

    window.loadProjects();
    window.loadSegments();
    window.loadFieldLogs();
    updateProjectSelect();
    updateSegmentSelect();

    // Improve overall mobile touch behavior
    document.body.style.touchAction = 'pan-y'; // Allow vertical scrolling by default

    // Fix touch scrolling for all table containers
    const allTableContainers = document.querySelectorAll('.table-container');
    allTableContainers.forEach(container => {
        container.style.touchAction = 'pan-x'; // Allow horizontal scrolling in tables
    });

    // Listen for online/offline events
    window.addEventListener('online', () => {
        console.log('📶 Back online!');
        hideOfflineIndicator();
    });

    window.addEventListener('offline', () => {
        console.log('📶 Gone offline');
        showOfflineIndicator();
    });
});

function showOfflineIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'offlineIndicator';
    indicator.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #f59e0b;
        color: white;
        text-align: center;
        padding: 8px;
        font-size: 0.9rem;
        z-index: 9999;
        font-weight: bold;
    `;
    indicator.textContent = '📶 Offline Mode - Limited Functionality';

    // Only add if not already present
    if (!document.getElementById('offlineIndicator')) {
        document.body.appendChild(indicator);
    }
}

function hideOfflineIndicator() {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Enhanced API calls with offline handling
async function makeAPICall(url, options = {}) {
    try {
        const response = await fetch(API_URL + url, options);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        if (!navigator.onLine) {
            console.log('API call failed - offline mode');
            // You could implement offline queueing here
            throw new Error('Offline - Please connect to internet for this feature');
        }
        throw error;
    }
}

// --- Persistence ---

// Load field logs from LocalStorage
window.loadFieldLogs = function () {
    const stored = localStorage.getItem('veritas_field_logs');
    if (stored) {
        fieldLogs = JSON.parse(stored);

        // Fix duplicate entry_id issues
        fieldLogs = fixDuplicateEntryIds(fieldLogs);
    }
    if (typeof renderFieldLogs === 'function') {
        renderFieldLogs();
    }
}

// --- Segments Management ---

// Load segments from LocalStorage
window.loadSegments = function () {
    const stored = localStorage.getItem('veritas_segments');
    if (stored) {
        segments = JSON.parse(stored);
    }
    console.log('Loaded segments:', segments.length);
};

// Save segments to LocalStorage
function saveSegments() {
    localStorage.setItem('veritas_segments', JSON.stringify(segments));
    updateSegmentSelect();
}

// Create or update a segment
window.saveSegment = function (segmentData) {
    const existingIndex = segments.findIndex(s => s.segment_id === segmentData.segment_id);

    if (existingIndex >= 0) {
        // Update existing segment
        segments[existingIndex] = { ...segments[existingIndex], ...segmentData };
        console.log('Updated segment:', segmentData.segment_id);
    } else {
        // Add new segment
        const newSegment = {
            segment_id: segmentData.segment_id,
            length_m: parseFloat(segmentData.length_m),
            width_m: parseFloat(segmentData.width_m),
            block_length_m: parseFloat(segmentData.block_length_m) || 4.5,
            chainage_start: segmentData.chainage_start || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        segments.push(newSegment);
        console.log('Created new segment:', segmentData.segment_id);
    }

    saveSegments();

    // Sync to cloud if online and logged in
    if (navigator.onLine && window.supabaseClient) {
        syncSegmentToCloud(segmentData);
    }
};

// Delete a segment
window.deleteSegment = function (segmentId) {
    const index = segments.findIndex(s => s.segment_id === segmentId);
    if (index >= 0) {
        segments.splice(index, 1);
        saveSegments();
        console.log('Deleted segment:', segmentId);

        // Also delete from cloud if online and logged in
        if (navigator.onLine && window.supabaseClient) {
            deleteSegmentFromCloud(segmentId);
        }
    }
};

// Get segment by ID
function getSegment(segmentId) {
    return segments.find(s => s.segment_id === segmentId);
}

// Calculate remaining blocks for a segment
function calculateRemainingBlocks(segment) {
    if (!segment) return 0;

    // Get all field logs for this segment
    const segmentLogs = fieldLogs.filter(log => log.segment_id === segment.segment_id);

    // Sum completed blocks
    const completedBlocks = segmentLogs.reduce((sum, log) => sum + (parseFloat(log.blocks_completed) || 0), 0);

    // Calculate total blocks
    const totalBlocks = Math.floor(segment.length_m / segment.block_length_m);

    return Math.max(0, totalBlocks - completedBlocks);
}

// --- Cloud Sync Functions for Segments ---

// Sync segment to cloud (if online and logged in)
function syncSegmentToCloud(segmentData) {
    if (!window.supabaseClient || !window.currentUser) {
        return;
    }

    const payload = {
        segment_id: segmentData.segment_id,
        length_m: segmentData.length_m,
        width_m: segmentData.width_m,
        block_length_m: segmentData.block_length_m,
        chainage_start: segmentData.chainage_start,
        created_at: segmentData.created_at,
        updated_at: segmentData.updated_at,
        user_id: window.currentUser.id
    };

    window.supabaseClient
        .from('segments')
        .upsert(payload, { onConflict: 'segment_id' })
        .then(({ error }) => {
            if (error) {
                console.error('Failed to sync segment to cloud:', error);
            } else {
                console.log('Segment synced to cloud:', segmentData.segment_id);
            }
        });
}

// Delete segment from cloud
function deleteSegmentFromCloud(segmentId) {
    if (!window.supabaseClient || !window.currentUser) {
        return;
    }

    window.supabaseClient
        .from('segments')
        .delete()
        .eq('segment_id', segmentId)
        .eq('user_id', window.currentUser.id)
        .then(({ error }) => {
            if (error) {
                console.error('Failed to delete segment from cloud:', error);
            } else {
                console.log('Segment deleted from cloud:', segmentId);
            }
        });
}

// Render segments table
window.renderSegmentsTable = function () {
    const tbody = document.getElementById('segmentsTableBody');
    const noSegmentsMsg = document.getElementById('noSegmentsMessage');

    if (!tbody) return; // Not on segments tab

    if (segments.length === 0) {
        tbody.innerHTML = '';
        noSegmentsMsg.style.display = 'block';
        return;
    }

    noSegmentsMsg.style.display = 'none';
    tbody.innerHTML = '';

    // Sort segments by ID
    const sortedSegments = [...segments].sort((a, b) => a.segment_id.localeCompare(b.segment_id));

    sortedSegments.forEach(segment => {
        const totalBlocks = Math.floor(segment.length_m / segment.block_length_m);
        const remainingBlocks = calculateRemainingBlocks(segment);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${segment.segment_id}</strong></td>
            <td>${segment.length_m}</td>
            <td>${segment.width_m}</td>
            <td>${segment.block_length_m}</td>
            <td>${totalBlocks}</td>
            <td>${remainingBlocks}</td>
            <td>${segment.chainage_start || '-'}</td>
            <td>
                <div style="display: flex; gap: 4px;">
                    <button onclick="editSegment('${segment.segment_id}')" style="background: none; border: none; cursor: pointer; font-size: 1.2em;" title="Edit">✏️</button>
                    <button onclick="deleteSegmentConfirm('${segment.segment_id}')" style="background: none; border: none; cursor: pointer; font-size: 1.2em; color: #ef4444;" title="Delete">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
};

// Edit segment
window.editSegment = function (segmentId) {
    const segment = getSegment(segmentId);
    if (!segment) return;

    // Populate form with segment data
    document.getElementById('segId').value = segment.segment_id;
    document.getElementById('segLength').value = segment.length_m;
    document.getElementById('segWidth').value = segment.width_m;
    document.getElementById('segBlockLength').value = segment.block_length_m;
    document.getElementById('segChainageStart').value = segment.chainage_start || '';

    // Change form title and show form
    document.getElementById('segmentFormTitle').textContent = 'Edit Segment';
    document.getElementById('newSegmentForm').style.display = 'block';
    document.getElementById('newSegmentBtn').style.display = 'none';
};

// Delete segment with confirmation
window.deleteSegmentConfirm = function (segmentId) {
    const segment = getSegment(segmentId);
    if (!segment) return;

    const confirmDelete = confirm(`Are you sure you want to delete segment ${segmentId}?\n\nThis will also remove all field logs associated with this segment.`);
    if (confirmDelete) {
        // Also remove associated field logs
        fieldLogs = fieldLogs.filter(log => log.segment_id !== segmentId);
        localStorage.setItem('veritas_field_logs', JSON.stringify(fieldLogs));

        // Delete the segment
        window.deleteSegment(segmentId);

        // Refresh tables
        renderSegmentsTable();
        if (typeof renderFieldLogs === 'function') {
            renderFieldLogs();
        }
    }
};

// Fix duplicate entry IDs by generating new ones for duplicates
function fixDuplicateEntryIds(logs) {
    const idCounts = {};
    const fixedLogs = [];

    logs.forEach(log => {
        if (!log.entry_id) {
            // Generate new ID for logs without one
            log.entry_id = crypto.randomUUID();
            fixedLogs.push(log);
        } else if (idCounts[log.entry_id]) {
            // Duplicate found - generate new unique ID
            const newId = crypto.randomUUID();
            console.log(`Fixed duplicate entry_id: ${log.entry_id} -> ${newId}`);
            log.entry_id = newId;
            fixedLogs.push(log);
        } else {
            // First occurrence - track it
            idCounts[log.entry_id] = 1;
            fixedLogs.push(log);
        }
    });

    // Save the fixed logs back to storage
    if (logs.length !== fixedLogs.length || Object.keys(idCounts).some(id => idCounts[id] > 1)) {
        localStorage.setItem('veritas_field_logs', JSON.stringify(fixedLogs));
        console.log('Fixed duplicate entry IDs in field logs');
    }

    return fixedLogs;
}

// Save field logs to LocalStorage
function saveFieldLogs() {
    try {
        const jsonString = JSON.stringify(fieldLogs);

        // Check storage quota before saving
        const storageUsed = JSON.stringify(localStorage).length;
        const storageQuota = 5 * 1024 * 1024; // 5MB estimate

        if (storageUsed > storageQuota * 0.8) { // 80% warning threshold
            console.warn('LocalStorage approaching quota limit');

            // Try to free up space by compressing old photos
            cleanupOldPhotos();
        }

        localStorage.setItem('veritas_field_logs', jsonString);

        if (typeof renderFieldLogs === 'function') {
            renderFieldLogs();
        }

        // Trigger Sync
        if (window.syncClient && currentUser) {
            window.syncClient.sync();
        }
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            alert('Storage full! Please export and clear some data, or delete old photos.');
            // Try to free up space immediately
            emergencyCleanup();
        } else {
            console.error('Error saving field logs:', error);
        }
    }
}

// --- Photo Compression ---

function compressPhoto(base64String, maxWidth = 800, quality = 0.6) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Calculate new dimensions
            let { width, height } = img;
            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);

            // Try to get smaller size
            let compressed = canvas.toDataURL('image/jpeg', quality);

            // If still too large, compress more
            if (compressed.length > 500000) { // 500KB limit
                compressed = canvas.toDataURL('image/jpeg', 0.3);
            }
            if (compressed.length > 300000) { // 300KB limit
                compressed = canvas.toDataURL('image/jpeg', 0.2);
            }

            resolve(compressed);
        };
        img.src = base64String;
    });
}

// --- Storage Management ---

function cleanupOldPhotos() {
    console.log('Cleaning up old photos to free storage space...');

    // Be more aggressive - keep only the last 20 photos
    const photoLogs = fieldLogs.filter(log => log.photo_base64);
    const oldPhotoCount = photoLogs.length;

    if (oldPhotoCount > 0) {
        // Remove ALL photos if more than 20, or oldest if less
        const photosToKeep = Math.min(20, Math.floor(oldPhotoCount * 0.3)); // Keep 30% max
        photoLogs.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Remove everything except the most recent ones
        const photosToRemove = oldPhotoCount - photosToKeep;

        photoLogs.slice(0, photosToRemove).forEach(log => {
            const index = fieldLogs.findIndex(l => l.entry_id === log.entry_id);
            if (index !== -1) {
                fieldLogs[index].photo_base64 = null;
                fieldLogs[index].photo_removed = true;
            }
        });

        console.log(`Removed ${photosToRemove} old photos, keeping ${photosToKeep} recent ones`);

        // Save the cleaned up logs
        try {
            const cleanedJson = JSON.stringify(fieldLogs);
            console.log(`New field logs size: ${Math.round(cleanedJson.length / 1024)}KB`);

            localStorage.setItem('veritas_field_logs', cleanedJson);

            // Check if it fits now
            const storageUsed = JSON.stringify(localStorage).length;
            const storageMB = (storageUsed / (1024 * 1024)).toFixed(2);
            console.log(`Total storage after cleanup: ${storageMB}MB`);

        } catch (error) {
            console.error('Still too large after cleanup, removing all photos');
            // More aggressive - remove all photos
            fieldLogs.forEach(log => {
                if (log.photo_base64) {
                    log.photo_base64 = null;
                    log.photo_removed = true;
                }
            });

            try {
                localStorage.setItem('veritas_field_logs', JSON.stringify(fieldLogs));
                console.log('All photos removed - storage freed');
            } catch (error) {
                console.error('Even removing all photos failed');
            }
        }
    }
}

function emergencyCleanup() {
    console.log('Emergency cleanup - removing all photos');

    fieldLogs.forEach(log => {
        if (log.photo_base64) {
            log.photo_base64 = null;
            log.photo_removed = true;
        }
    });

    try {
        localStorage.setItem('veritas_field_logs', JSON.stringify(fieldLogs));
        alert('Emergency cleanup complete! All photos have been removed to free storage space.');
    } catch (error) {
        console.error('Even emergency cleanup failed');
        alert('Critical: Unable to save data. Please export and clear all data.');
    }
}

function getStorageInfo() {
    const storageUsed = JSON.stringify(localStorage).length;
    const storageUsedKB = Math.round(storageUsed / 1024);
    const storageUsedMB = (storageUsedKB / 1024).toFixed(2);

    const fieldLogsSize = localStorage.getItem('veritas_field_logs')?.length || 0;
    const fieldLogsKB = Math.round(fieldLogsSize / 1024);
    const fieldLogsMB = (fieldLogsKB / 1024).toFixed(2);

    console.log(`Total storage used: ${storageUsedKB}KB (${storageUsedMB}MB)`);
    console.log(`Field logs size: ${fieldLogsKB}KB (${fieldLogsMB}MB)`);

    return { storageUsedKB, fieldLogsKB, photoCount: fieldLogs.filter(l => l.photo_base64).length };
}

function showStorageInfo() {
    const info = getStorageInfo();
    const estimatedQuotaMB = 5; // Most browsers ~5MB limit
    const percentUsed = ((info.storageUsedKB / 1024) / estimatedQuotaMB * 100).toFixed(1);

    const message = `
Storage Usage Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Used: ${info.storageUsedKB} KB (${(info.storageUsedKB / 1024).toFixed(2)} MB)
Field Logs: ${info.fieldLogsKB} KB
Photos: ${info.photoCount} photos stored
Est. Usage: ${percentUsed}% of ~${estimatedQuotaMB}MB quota

${percentUsed > 80 ? '⚠️  WARNING: Approaching storage limit!' : '✅ Storage usage is normal'}

Recommendations:
• Export data regularly to free up space
• Consider deleting old photos after syncing
• Use cloud sync to backup photos
• Try "Clear All Data" if sync is failing
${percentUsed > 80 ? '\n⚠️  Action needed: Export data and clear old photos' : ''}
    `.trim();

    if (confirm(message + '\n\nWould you like to export your data now to free up space?')) {
        exportData();
    }

    if (percentUsed > 90 && confirm('Storage is critically full! Would you like to remove old photos now? (This will free significant space)')) {
        cleanupOldPhotos();
        alert('Cleanup completed! Old photos have been removed from local storage.');
    }
}

function clearAllData() {
    const message = `
⚠️  DANGER: This will delete ALL local data!

This action will:
• Remove all projects from local storage
• Remove all field logs from local storage
• Clear all photos from local storage
• NOT affect cloud data (if synced)

IMPORTANT: Export your data first if you want to keep it!

Are you absolutely sure you want to proceed?
    `.trim();

    if (!confirm(message)) {
        return;
    }

    if (!confirm('FINAL WARNING: This cannot be undone! Are you sure?')) {
        return;
    }

    // Clear all local storage
    localStorage.removeItem('veritas_projects');
    localStorage.removeItem('veritas_segments');
    localStorage.removeItem('veritas_field_logs');
    localStorage.removeItem('veritas_active_project');

    // Reset in-memory variables
    projects = [];
    fieldLogs = [];
    segments = [];
    activeProject = null;

    // Refresh the UI
    window.loadProjects();
    window.loadSegments();
    window.loadFieldLogs();
    updateProjectSelect();
    updateSegmentSelect();

    alert('✅ All local data has been cleared!\n\nStorage is now empty. You can:\n• Import previously exported data\n• Create new projects\n• Sync from cloud if logged in');
}

// --- Export / Import ---

document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', importData);
document.getElementById('storageBtn').addEventListener('click', showStorageInfo);
document.getElementById('clearAllBtn').addEventListener('click', clearAllData);

// --- Segments Event Listeners ---
document.getElementById('newSegmentBtn').addEventListener('click', () => {
    document.getElementById('newSegmentForm').style.display = 'block';
    document.getElementById('newSegmentBtn').style.display = 'none';
    document.getElementById('segmentFormTitle').textContent = 'Create New Segment';
    document.getElementById('newSegmentForm').reset();
});

document.getElementById('cancelSegmentBtn').addEventListener('click', () => {
    document.getElementById('newSegmentForm').style.display = 'none';
    document.getElementById('newSegmentBtn').style.display = 'inline-block';
});

document.getElementById('newSegmentForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const segmentData = {
        segment_id: document.getElementById('segId').value,
        length_m: parseFloat(document.getElementById('segLength').value),
        width_m: parseFloat(document.getElementById('segWidth').value),
        block_length_m: parseFloat(document.getElementById('segBlockLength').value),
        chainage_start: document.getElementById('segChainageStart').value || null
    };

    window.saveSegment(segmentData);

    // Reset UI
    document.getElementById('newSegmentForm').reset();
    document.getElementById('newSegmentForm').style.display = 'none';
    document.getElementById('newSegmentBtn').style.display = 'inline-block';

    // Refresh segments table
    renderSegmentsTable();
});

// Segment selection dropdown change handler
document.addEventListener('DOMContentLoaded', () => {
    // Add this after DOM is loaded
    const segmentSelect = document.getElementById('segmentSelect');
    if (segmentSelect) {
        segmentSelect.addEventListener('change', (e) => {
            const selectedSegmentId = e.target.value;
            const hiddenInput = document.getElementById('fieldSegmentId');
            const infoRow = document.getElementById('segmentInfoRow');
            const lengthInput = document.getElementById('fieldSegLength');
            const blockLengthInput = document.getElementById('fieldBlockLength');

            if (selectedSegmentId) {
                const segment = getSegment(selectedSegmentId);
                if (segment) {
                    hiddenInput.value = selectedSegmentId;
                    lengthInput.value = segment.length_m;
                    blockLengthInput.value = segment.block_length_m;
                    infoRow.style.display = 'flex';
                }
            } else {
                hiddenInput.value = '';
                infoRow.style.display = 'none';
                lengthInput.value = '';
                blockLengthInput.value = '';
            }
        });
    }
});

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

// Update segment selection dropdown
function updateSegmentSelect(selectedValue = "") {
    const select = document.getElementById('segmentSelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select a Segment --</option>';

    // Sort segments by ID for consistent ordering
    segments.sort((a, b) => a.segment_id.localeCompare(b.segment_id));

    segments.forEach(segment => {
        const option = document.createElement('option');
        option.value = segment.segment_id;

        // Calculate remaining blocks
        const remainingBlocks = calculateRemainingBlocks(segment);
        const totalBlocks = Math.floor(segment.length_m / segment.block_length_m);

        option.textContent = `${segment.segment_id} (${segment.length_m}m × ${segment.width_m}m) - ${remainingBlocks}/${totalBlocks} blocks remaining`;
        select.appendChild(option);
    });

    if (selectedValue) {
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
        let entryId;
        let attempts = 0;
        const maxAttempts = 10;

        // Ensure unique entry_id
        do {
            entryId = crypto.randomUUID();
            attempts++;
        } while (fieldLogs.some(log => log.entry_id === entryId) && attempts < maxAttempts);

        const entry = {
            entry_id: entryId,
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

        // Fix mobile touch scrolling for table
        setTimeout(() => {
            const tableContainer = document.querySelector('#fieldLogsTable').parentElement;
            if (tableContainer) {
                // Prevent page scroll when scrolling table horizontally
                let isScrolling = false;

                tableContainer.addEventListener('touchstart', (e) => {
                    isScrolling = false;
                }, { passive: true });

                tableContainer.addEventListener('touchmove', (e) => {
                    const container = tableContainer;
                    const canScrollHorizontally = container.scrollWidth > container.clientWidth;

                    if (canScrollHorizontally) {
                        const touch = e.touches[0];
                        const startX = touch.clientX;
                        const startY = touch.clientY;

                        // Check if scrolling horizontally
                        const diffX = Math.abs(touch.clientX - startX);
                        const diffY = Math.abs(touch.clientY - startY);

                        if (diffX > diffY) {
                            e.preventDefault(); // Prevent page scroll
                            isScrolling = true;
                        }
                    }
                }, { passive: false });

                tableContainer.addEventListener('touchend', () => {
                    isScrolling = false;
                }, { passive: true });
            }
        }, 100);
    }

    // Sort logs by segment_id, then by date (newest first)
    const sortedLogs = [...fieldLogs].sort((a, b) => {
        if (a.segment_id !== b.segment_id) {
            return a.segment_id.localeCompare(b.segment_id);
        }
        return new Date(b.date) - new Date(a.date);
    });

    // Group logs by segment
    const logsBySegment = {};
    sortedLogs.forEach(log => {
        if (!logsBySegment[log.segment_id]) {
            logsBySegment[log.segment_id] = [];
        }
        logsBySegment[log.segment_id].push(log);
    });

    // Render logs grouped by segment
    Object.keys(logsBySegment).forEach(segmentId => {
        const segmentLogs = logsBySegment[segmentId];
        const segment = getSegment(segmentId);

        // Add segment header row
        if (Object.keys(logsBySegment).length > 1) {
            const headerRow = document.createElement('tr');
            headerRow.innerHTML = `
                <td colspan="12" style="background-color: #f3f4f6; font-weight: bold; padding: 8px; border-left: 4px solid #2563eb;">
                    ${segment ? `${segment.segment_id} (${segment.length_m}m × ${segment.width_m}m)` : segmentId}
                </td>
            `;
            tbody.appendChild(headerRow);
        }

        // Add logs for this segment
        segmentLogs.forEach(log => {
        const tr = document.createElement('tr');
        let photoHtml = '-';
        if (log.photo_base64) {
            photoHtml = `<img src="${log.photo_base64}" style="height: 50px; width: auto; border: 1px solid #ddd; border-radius: 4px;">`;
        }

        const location = (log.latitude && log.longitude) ? `${log.latitude}, ${log.longitude}` : '-';

        // Ensure entry_id exists (for old logs)
        if (!log.entry_id) {
            log.entry_id = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + Math.floor(Math.random() * 1000000);
        }

        tr.innerHTML = `
            <td>${log.date}</td>
            <td>${log.segment_id}</td>
            <td>${log.shift_output_blocks.toFixed(2)}</td>
            <td>${log.cumulative_blocks.toFixed(2)}</td>
            <td>${log.remaining_blocks.toFixed(2)}</td>
            <td>${log.remaining_meters ? log.remaining_meters.toFixed(2) : '-'}</td>
            <td>${log.weather}</td>
            <td>${log.crew_size}</td>
            <td style="font-size: 0.8em; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${location}">${location}</td>
            <td>${photoHtml}</td>
            <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.notes || ''}">${log.notes || ''}</td>
            <td>
                <div style="display: flex; gap: 0px; align-items: center; min-width: 40px; justify-content: center;">
                    <button class="btn small" style="background-color: #dc2626; color: white; padding: 0px; font-size: 0.5rem; line-height: 1; min-height: 16px; min-width: 16px; max-height: 16px; max-width: 16px; border-radius: 2px;"
                            onclick="deleteFieldLogLocal('${log.entry_id}')" title="Delete locally">
                        🗑️
                    </button>
                    ${currentUser ? `<button class="btn small" style="background-color: #b91c1c; color: white; padding: 0px; font-size: 0.5rem; line-height: 1; min-height: 16px; min-width: 16px; max-height: 16px; max-width: 16px; border-radius: 2px;"
                            onclick="deleteFieldLogEverywhere('${log.entry_id}')" title="Delete everywhere">
                        ☁️
                    </button>` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
        });
    });
}

// Delete field log locally only
window.deleteFieldLogLocal = function(entryId) {
    if (!entryId) {
        alert('Cannot delete log: No entry ID found');
        return;
    }

    const logToDelete = fieldLogs.find(log => log.entry_id === entryId);
    if (!logToDelete) {
        alert('Log not found');
        return;
    }

    const confirmMessage = `
Delete this field log entry?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date: ${logToDelete.date}
Segment: ${logToDelete.segment_id}
Blocks: ${logToDelete.shift_output_blocks}
Notes: ${logToDelete.notes || 'None'}

This action cannot be undone!
    `.trim();

    if (!confirm(confirmMessage)) {
        return;
    }

    // Remove from array
    const index = fieldLogs.findIndex(log => log.entry_id === entryId);
    if (index !== -1) {
        fieldLogs.splice(index, 1);

        // Save to localStorage
        saveFieldLogs();

        // Re-render the table
        renderFieldLogs();

        // Show success message
        alert('✅ Field log deleted successfully!');

        // If no more logs, hide the section
        if (fieldLogs.length === 0) {
            document.getElementById('fieldResultsSection').style.display = 'none';
        }
    }
}

// Delete field log from device AND cloud
window.deleteFieldLogEverywhere = async function(entryId) {
    if (!entryId) {
        alert('Cannot delete log: No entry ID found');
        return;
    }

    if (!currentUser) {
        alert('You must be logged in to delete from cloud');
        return;
    }

    const logToDelete = fieldLogs.find(log => log.entry_id === entryId);
    if (!logToDelete) {
        alert('Log not found');
        return;
    }

    const confirmMessage = `
Delete this field log EVERYWHERE?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date: ${logToDelete.date}
Segment: ${logToDelete.segment_id}
Blocks: ${logToDelete.shift_output_blocks}
Notes: ${logToDelete.notes || 'None'}

This will delete from:
• This device (localStorage)
• Cloud database (Supabase)

⚠️  This CANNOT be undone!
    `.trim();

    if (!confirm(confirmMessage)) {
        return;
    }

    if (!confirm('FINAL WARNING: This will permanently delete the log from all devices! Are you absolutely sure?')) {
        return;
    }

    try {
        // Delete from cloud first
        const { error } = await supabase
            .from('field_logs')
            .delete()
            .eq('entry_id', entryId);

        if (error) {
            alert(`Failed to delete from cloud: ${error.message}`);
            return;
        }

        // Remove from local array
        const index = fieldLogs.findIndex(log => log.entry_id === entryId);
        if (index !== -1) {
            fieldLogs.splice(index, 1);

            // Save to localStorage
            saveFieldLogs();

            // Re-render the table
            renderFieldLogs();

            // Show success message
            alert('✅ Field log deleted from device AND cloud!');

            // If no more logs, hide the section
            if (fieldLogs.length === 0) {
                document.getElementById('fieldResultsSection').style.display = 'none';
            }
        }
    } catch (error) {
        alert(`Error deleting from cloud: ${error.message}`);
    }
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
        // Check if offline
        if (!navigator.onLine) {
            alert('⚠️ Offline Mode\n\nSimulation requires internet connection to the API server.\n\nPlease connect to WiFi or mobile data and try again.\n\nLocal data entry and PDF generation still work!');
            return;
        }

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
        if (!navigator.onLine) {
            alert('⚠️ Offline Mode\n\nSimulation requires internet connection to the API server.\n\nPlease connect to WiFi or mobile data and try again.\n\nLocal data entry and PDF generation still work!');
        } else {
            alert('Failed to connect to API. Is it running?');
        }
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

// Tab switching function
window.switchTab = function(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).style.display = 'block';

    // Add active class to clicked button
    event.target.classList.add('active');

    // Render segments table when switching to segments tab
    if (tabName === 'segments') {
        renderSegmentsTable();
    }
}
