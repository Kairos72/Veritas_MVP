const API_URL = 'http://localhost:5000';

let currentLogs = [];
let projects = [];
let activeProject = null;
let fieldLogs = [];
let segments = []; // Kept for backwards compatibility
let assets = [];      // New universal asset system
let workItems = [];    // Work items within assets
let deletedAssets = []; // Three-state deletion: Recently deleted assets

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
    window.loadAssets();
    window.loadWorkItems();
    window.loadDeletedAssets();

    // CRITICAL FIX: Initialize data synchronization after loading
    setTimeout(() => {
        initializeDataSync();
        populateAssetSelect();
    }, 100);
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

    // Initialize the default tab (Assets)
    setTimeout(() => {
        const assetsTab = document.getElementById('assets');
        if (assetsTab) {
            assetsTab.style.display = 'block';
            renderAssets();
            populateAssetSelect();
        }
        // Set the Assets button as active
        const assetsBtn = document.querySelector('button[onclick="switchTab(\'assets\')"]');
        if (assetsBtn) {
            assetsBtn.classList.add('active');
        }
    }, 200);
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

        // Fix missing project_id for existing logs
        fieldLogs = fixMissingProjectIds(fieldLogs);
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

// ===============================
// ASSET MANAGEMENT FUNCTIONS
// ===============================

// Save assets to LocalStorage
function saveAssets() {
    localStorage.setItem('veritas_assets', JSON.stringify(assets));
    populateAssetSelect();
}

// Save work items to LocalStorage
function saveWorkItems() {
    localStorage.setItem('veritas_work_items', JSON.stringify(workItems));
}

// Sync work items from assets to global workItems array
function syncWorkItemsFromAssets() {
    assets.forEach(asset => {
        if (asset.work_items && asset.work_items.length > 0) {
            asset.work_items.forEach(assetWorkItem => {
                // Find if this work item exists in global array
                const existingIndex = workItems.findIndex(wi => wi.work_item_id === assetWorkItem.work_item_id);

                if (existingIndex !== -1) {
                    // Update existing work item - preserve ALL progress data from global array
                    const globalWorkItem = workItems[existingIndex];
                    workItems[existingIndex] = {
                        // Keep ALL existing global work item data (including progress!)
                        ...globalWorkItem,
                        // Only update basic metadata if missing
                        work_type: globalWorkItem.work_type || assetWorkItem.work_type,
                        item_code: globalWorkItem.item_code || assetWorkItem.item_code,
                        unit: globalWorkItem.unit || assetWorkItem.unit,
                        target_total: globalWorkItem.target_total || assetWorkItem.target_total,
                        // CRITICAL FIX: NEVER overwrite progress data from assets!
                        // cumulative, remaining, status should stay as they are in global array
                    };
                } else {
                    // Add new work item to global array
                    workItems.push({
                        work_item_id: assetWorkItem.work_item_id,
                        asset_id: asset.asset_id,
                        work_type: assetWorkItem.work_type,
                        item_code: assetWorkItem.item_code,
                        unit: assetWorkItem.unit,
                        target_total: assetWorkItem.target_total,
                        cumulative: assetWorkItem.cumulative || 0,
                        remaining: assetWorkItem.remaining || null,
                        status: assetWorkItem.status || 'pending'
                    });
                }
            });
        }
    });
}


// Load assets from LocalStorage
window.loadAssets = function () {
    try {
        const savedAssets = localStorage.getItem('veritas_assets');
        if (savedAssets) {
            assets = JSON.parse(savedAssets);
        } else {
            assets = [];
        }
        renderAssets();
        populateAssetSelect();
    } catch (error) {
        console.error('Error loading assets:', error);
        assets = [];
        renderAssets();
        populateAssetSelect();
    }
};

// Load work items from LocalStorage
window.loadWorkItems = function () {
    try {
        const savedWorkItems = localStorage.getItem('veritas_work_items');
        if (savedWorkItems) {
            workItems = JSON.parse(savedWorkItems);
        } else {
            workItems = [];
        }
    } catch (error) {
        console.error('Error loading work items:', error);
        workItems = [];
    }
};

// Load deleted assets from localStorage
window.loadDeletedAssets = function () {
    try {
        const savedDeletedAssets = localStorage.getItem('veritas_deleted_assets');
        if (savedDeletedAssets) {
            deletedAssets = JSON.parse(savedDeletedAssets);
        } else {
            deletedAssets = [];
        }
    } catch (error) {
        console.error('Error loading deleted assets:', error);
        deletedAssets = [];
    }
};

// Save deleted assets to localStorage
function saveDeletedAssets() {
    try {
        localStorage.setItem('veritas_deleted_assets', JSON.stringify(deletedAssets));
    } catch (error) {
        console.error('Error saving deleted assets:', error);
    }
}

// Initialize data synchronization on startup
function initializeDataSync() {
    // CRITICAL FIX: Only sync work items from assets to global array on startup
    // This ensures work items created via Asset Creation are available in global array
    syncWorkItemsFromAssets();
    // Save to ensure global work items are updated
    saveWorkItems();
}

// Populate asset dropdown for Field Entry form
function populateAssetSelect() {
    const assetSelect = document.getElementById('assetSelect');
    if (!assetSelect) return;

    assetSelect.innerHTML = '<option value="">-- Select Asset --</option>';

    if (assets.length === 0) {
        assetSelect.innerHTML = '<option value="">-- No Assets Available --</option>';
        return;
    }

    // Sort assets by name for better UX
    const sortedAssets = [...assets].sort((a, b) => (a.name || a.asset_id).localeCompare(b.name || b.asset_id));

    sortedAssets.forEach(asset => {
        const option = document.createElement('option');
        option.value = asset.asset_id;
        option.textContent = `${asset.name || asset.asset_id} (${formatAssetType(asset.asset_type)})`;
        assetSelect.appendChild(option);
    });
}

// Create or update an asset
window.saveAsset = function (assetData) {
    const existingIndex = assets.findIndex(a => a.asset_id === assetData.asset_id);

    // Add timestamps and ensure project_id is set
    const now = new Date().toISOString();
    const newAsset = {
        ...assetData,
        project_id: assetData.project_id || activeProject?.project_id || localStorage.getItem('veritas_active_project') || 'PROJ-1',
        updated_at: now,
        created_at: assetData.created_at || now
    };

    if (existingIndex >= 0) {
        // Update existing asset
        assets[existingIndex] = { ...assets[existingIndex], ...newAsset };
        console.log('Updated asset:', assetData.asset_id);
    } else {
        // Add new asset
        assets.push(newAsset);
        console.log('Created new asset:', assetData.asset_id);
    }

    saveAssets();

    // Also save work items if provided
    if (assetData.work_items && assetData.work_items.length > 0) {
        assetData.work_items.forEach(workItem => {
            const existingWorkIndex = workItems.findIndex(wi => wi.work_item_id === workItem.work_item_id);

            if (existingWorkIndex >= 0) {
                workItems[existingWorkIndex] = { ...workItems[existingWorkIndex], ...workItem };
            } else {
                workItems.push(workItem);
            }
        });
        saveWorkItems();
    }

    // Refresh UI components
    renderAssets();
    populateAssetSelect();
};

// View asset details
window.viewAsset = function(assetId) {
    const asset = assets.find(a => a.asset_id === assetId);
    if (!asset) return;

    alert(`Asset Details:\n\nID: ${asset.asset_id}\nName: ${asset.name}\nType: ${formatAssetType(asset.asset_type)}\nWork Items: ${asset.work_items ? asset.work_items.length : 0}`);
}

// Edit asset
window.editAsset = function(assetId) {
    const asset = assets.find(a => a.asset_id === assetId);
    if (!asset) return;

    // Implementation for edit modal would go here
    alert(`Edit asset: ${asset.name}\n\n(Edit modal to be implemented)`);
}

// Delete an asset with three-state deletion system
window.deleteAsset = function (assetId) {
    const asset = assets.find(a => a.asset_id === assetId);
    if (!asset) {
        console.error('Asset not found:', assetId);
        return;
    }

    // Show deletion confirmation dialog with options
    const deletionMessage = `Delete Asset: ${asset.name || asset.asset_id}\n\n` +
        `Choose deletion option:\n` +
        `1. Delete locally (can be restored)\n` +
        `2. Delete permanently from cloud\n` +
        `3. Cancel\n\n` +
        `Option 1: Asset can be restored if sync runs\n` +
        `Option 2: Permanent deletion from all systems`;

    const choice = prompt(deletionMessage + '\nEnter choice (1-3):');

    switch (choice) {
        case '1':
            // SOFT DELETE: Local deletion with recovery option
            softDeleteAsset(asset, 'accidental');
            break;
        case '2':
            // HARD DELETE: Request cloud deletion
            const confirmPermanent = confirm(
                `⚠️ PERMANENT DELETION WARNING\n\n` +
                `This will permanently delete "${asset.name || asset.asset_id}" from:\n` +
                `• Local device\n` +
                `• Cloud database\n` +
                `• All connected systems\n\n` +
                `This action cannot be undone.\n\n` +
                `Continue with permanent deletion?`
            );
            if (confirmPermanent) {
                softDeleteAsset(asset, 'intentional');
                // Mark for cloud deletion
                const deletedAsset = deletedAssets.find(d => d.asset_id === assetId);
                if (deletedAsset) {
                    deletedAsset.cloud_delete_requested = true;
                    deletedAsset.cloud_delete_requested_at = new Date().toISOString();
                    saveDeletedAssets();
                }
            }
            break;
        case '3':
        default:
            // Cancel deletion
            console.log('Deletion cancelled by user');
            break;
    }
};

// Soft delete asset (move to deleted assets)
function softDeleteAsset(asset, deletionReason) {
    const now = new Date().toISOString();

    // Remove from active assets
    const index = assets.findIndex(a => a.asset_id === asset.asset_id);
    if (index >= 0) {
        assets.splice(index, 1);
    }

    // Move associated work items to deleted asset structure
    const associatedWorkItems = workItems.filter(wi => wi.asset_id === asset.asset_id);

    // Remove work items from active workItems array
    workItems = workItems.filter(wi => wi.asset_id !== asset.asset_id);

    // Create deleted asset record
    const deletedAsset = {
        // Basic asset information
        asset_id: asset.asset_id,
        project_id: asset.project_id,
        name: asset.name,
        asset_type: asset.asset_type,
        description: asset.description,
        location: asset.location,

        // 🎯 CRITICAL: Preserve all location and dimension fields
        chainage_start_m: asset.chainage_start_m,
        chainage_end_m: asset.chainage_end_m,
        length_m: asset.length_m,
        width_m: asset.width_m,
        height_m: asset.height_m,
        floor_area_m2: asset.floor_area_m2,
        stationing: asset.stationing,
        dimensions: asset.dimensions,

        // Work items and deletion metadata
        work_items: associatedWorkItems,
        deleted_at: now,
        deleted_by: 'user', // Could be enhanced with actual user info
        deletion_reason: deletionReason, // 'accidental' | 'intentional'
        cloud_delete_requested: false,
        cloud_delete_requested_at: null,
        cloud_deleted_at: null,
        original_updated_at: asset.updated_at
    };

    // DEBUG: Log preserved location data
    console.log('🔍 DEBUG: Asset deletion - preserving location data:', {
        asset_id: asset.asset_id,
        original_chainage: `${asset.chainage_start_m} -> ${asset.chainage_end_m}`,
        preserved_chainage: `${deletedAsset.chainage_start_m} -> ${deletedAsset.chainage_end_m}`,
        original_location: asset.location,
        preserved_location: deletedAsset.location
    });

    // Add to deleted assets
    deletedAssets.push(deletedAsset);

    // Save everything
    saveAssets();
    saveWorkItems();
    saveDeletedAssets();
    renderAssets();
    populateAssetSelect();

    console.log(`Asset ${deletionReason === 'accidental' ? 'soft deleted' : 'marked for permanent deletion'}:`, asset.asset_id);
}

// Restore a deleted asset
window.restoreAsset = function (assetId) {
    const deletedAsset = deletedAssets.find(d => d.asset_id === assetId);
    if (!deletedAsset) {
        console.error('Deleted asset not found:', assetId);
        return;
    }

    // Confirm restoration
    const confirmRestore = confirm(
        `Restore Asset: ${deletedAsset.name || deletedAsset.asset_id}\n\n` +
        `This will restore the asset and all its work items.\n` +
        `The asset will be available for field entries again.\n\n` +
        `Continue with restoration?`
    );

    if (!confirmRestore) {
        console.log('Asset restoration cancelled by user');
        return;
    }

    // Recreate the asset from deleted record
    const restoredAsset = {
        // Basic asset information
        asset_id: deletedAsset.asset_id,
        project_id: deletedAsset.project_id,
        name: deletedAsset.name,
        asset_type: deletedAsset.asset_type,
        description: deletedAsset.description,
        location: deletedAsset.location,

        // 🎯 CRITICAL: Restore all preserved location and dimension fields
        chainage_start_m: deletedAsset.chainage_start_m,
        chainage_end_m: deletedAsset.chainage_end_m,
        length_m: deletedAsset.length_m,
        width_m: deletedAsset.width_m,
        height_m: deletedAsset.height_m,
        floor_area_m2: deletedAsset.floor_area_m2,
        stationing: deletedAsset.stationing,
        dimensions: deletedAsset.dimensions,

        // Work items and timestamps
        work_items: deletedAsset.work_items || [],
        updated_at: new Date().toISOString(), // Update restoration timestamp
        created_at: deletedAsset.deleted_at // Keep original creation reference
    };

    // DEBUG: Log restored location data
    console.log('🔍 DEBUG: Asset restoration - restoring location data:', {
        asset_id: deletedAsset.asset_id,
        deleted_chainage: `${deletedAsset.chainage_start_m} -> ${deletedAsset.chainage_end_m}`,
        restored_chainage: `${restoredAsset.chainage_start_m} -> ${restoredAsset.chainage_end_m}`,
        deleted_location: deletedAsset.location,
        restored_location: restoredAsset.location,
        location_info: getAssetLocationInfo(restoredAsset)
    });

    // Add back to active assets
    assets.push(restoredAsset);

    // Restore work items
    if (deletedAsset.work_items && deletedAsset.work_items.length > 0) {
        deletedAsset.work_items.forEach(workItem => {
            // Check if work item already exists in active workItems
            const existingIndex = workItems.findIndex(w => w.work_item_id === workItem.work_item_id);
            if (existingIndex === -1) {
                workItems.push(workItem);
            }
        });
    }

    // Remove from deleted assets
    const deletedIndex = deletedAssets.findIndex(d => d.asset_id === assetId);
    if (deletedIndex >= 0) {
        deletedAssets.splice(deletedIndex, 1);
    }

    // Save everything
    saveAssets();
    saveWorkItems();
    saveDeletedAssets();
    renderAssets();
    populateAssetSelect();

    console.log('Asset restored successfully:', assetId);
};

// Delete asset permanently from cloud
window.deleteAssetFromCloud = function (assetId) {
    const deletedAsset = deletedAssets.find(d => d.asset_id === assetId);
    if (!deletedAsset) {
        console.error('Deleted asset not found:', assetId);
        return;
    }

    const confirmPermanent = confirm(
        `⚠️ FINAL CONFIRMATION\n\n` +
        `Permanently delete "${deletedAsset.name || deletedAsset.asset_id}"?\n\n` +
        `This will:\n` +
        `• Remove asset from cloud database\n` +
        `• Delete all associated field logs\n` +
        `• Remove from all connected devices\n` +
        `• Delete permanently from this device\n\n` +
        `This action CANNOT be undone.\n\n` +
        `Proceed with permanent deletion?`
    );

    if (!confirmPermanent) {
        console.log('Permanent deletion cancelled by user');
        return;
    }

    // Remove asset from deletedAssets array completely - user wants it GONE
    const deletedIndex = deletedAssets.findIndex(d => d.asset_id === assetId);
    if (deletedIndex !== -1) {
        deletedAssets.splice(deletedIndex, 1);
    }

    // Add to pending cloud deletions list for sync to handle
    const pendingCloudDeletions = JSON.parse(localStorage.getItem('veritas_pending_cloud_deletions') || '[]');
    if (!pendingCloudDeletions.includes(assetId)) {
        pendingCloudDeletions.push(assetId);
        localStorage.setItem('veritas_pending_cloud_deletions', JSON.stringify(pendingCloudDeletions));
    }

    // Save the updated deletedAssets list
    saveDeletedAssets();
    renderAssets();

    console.log('Asset permanently deleted from local storage:', assetId);
    alert('Asset has been permanently deleted. It will be removed from the cloud during the next sync.');
};

// Get asset by ID
function getAsset(assetId) {
    return assets.find(a => a.asset_id === assetId);
}

// Get work items for an asset
function getWorkItemsForAsset(assetId) {
    return workItems.filter(wi => wi.asset_id === assetId);
}

// Get a single work item by ID
function getWorkItem(workItemId) {
    return workItems.find(wi => wi.work_item_id === workItemId);
}

// Generate unique asset ID following DPWH standard format: ASSET-XX-NNN
function generateAssetId() {
    // Get all existing assets to determine the next sequence number for each type
    const assetTypePrefixes = {
        'road_section': 'ASSET-RD',
        'building': 'ASSET-BLD',
        'flood_control': 'ASSET-FC',
        'bridge': 'ASSET-BR',
        'culvert': 'ASSET-CU',
        'utility': 'ASSET-UT',
        'landscaping': 'ASSET-LS',
        'other': 'ASSET-OT'
    };

    // For now, generate a generic road section asset ID (asset type will be set when asset is created)
    const prefix = 'ASSET-RD';

    // Get existing assets with this prefix to determine next sequence number
    const existingAssets = assets.filter(asset => asset.asset_id && asset.asset_id.startsWith(prefix));

    // Determine next sequence number
    let sequenceNumber = 1;
    if (existingAssets.length > 0) {
        // Extract the highest existing sequence number
        const existingNumbers = existingAssets.map(asset => {
            const parts = asset.asset_id.split('-');
            return parseInt(parts[2]) || 0;
        });
        sequenceNumber = Math.max(...existingNumbers) + 1;
    }

    // Format with zero-padding (3 digits)
    const paddedSequence = String(sequenceNumber).padStart(3, '0');

    return `${prefix}-${paddedSequence}`;
}

// Generate unique asset ID for specific asset type following DPWH standard
function generateAssetIdForType(assetType) {
    const assetTypePrefixes = {
        'road_section': 'ASSET-RD',
        'building': 'ASSET-BLD',
        'flood_control': 'ASSET-FC',
        'bridge': 'ASSET-BR',
        'culvert': 'ASSET-CU',
        'utility': 'ASSET-UT',
        'landscaping': 'ASSET-LS',
        'other': 'ASSET-OT'
    };

    const prefix = assetTypePrefixes[assetType] || 'ASSET-OT';

    // Get existing assets with this prefix to determine next sequence number
    const existingAssets = assets.filter(asset => asset.asset_id && asset.asset_id.startsWith(prefix));

    // Determine next sequence number
    let sequenceNumber = 1;
    if (existingAssets.length > 0) {
        // Extract the highest existing sequence number
        const existingNumbers = existingAssets.map(asset => {
            const parts = asset.asset_id.split('-');
            return parseInt(parts[2]) || 0;
        });
        sequenceNumber = Math.max(...existingNumbers) + 1;
    }

    // Format with zero-padding (3 digits)
    const paddedSequence = String(sequenceNumber).padStart(3, '0');

    return `${prefix}-${paddedSequence}`;
}

// Generate unique work item ID
function generateWorkItemId() {
    const now = Date.now();
    const random = Math.floor(Math.random() * 100);
    const workTypes = ['PCC', 'BASE', 'EXC', 'STR', 'FND', 'DRN', 'FLOOD', 'UTIL'];
    const workType = workTypes[Math.floor(Math.random() * workTypes.length)];
    return `WI-${workType}-${random}`;
}

// --- Cloud Sync Functions for Assets ---
function syncAssetToCloud(assetData) {
    // Implementation will be added to sync_client.js
    console.log('Syncing asset to cloud:', assetData.asset_id);
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

// Render assets table
window.renderAssets = function () {
    const tbody = document.getElementById('assetsTableBody');
    const noAssetsMsg = document.getElementById('noAssetsMessage');

    if (!tbody) return; // Not on assets tab

    tbody.innerHTML = '';

    // RENDER ACTIVE ASSETS SECTION
    if (assets.length === 0 && deletedAssets.length === 0) {
        noAssetsMsg.style.display = 'block';
        return;
    }

    noAssetsMsg.style.display = 'none';

    // Active Assets Section Header
    if (assets.length > 0) {
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <td colspan="7" style="background-color: #f3f4f6; font-weight: bold; padding: 8px; text-align: center;">
                📋 Active Assets (${assets.length})
            </td>
        `;
        tbody.appendChild(headerRow);

        // Table headers for active assets
        const headersRow = document.createElement('tr');
        headersRow.innerHTML = `
            <th style="padding: 8px;">Asset ID</th>
            <th style="padding: 8px;">Name</th>
            <th style="padding: 8px;">Type</th>
            <th style="padding: 8px;">Location</th>
            <th style="padding: 8px;">Work Items</th>
            <th style="padding: 8px;">Progress</th>
            <th style="padding: 8px;">Actions</th>
        `;
        tbody.appendChild(headersRow);

        // Sort assets by type and name
        const sortedAssets = [...assets].sort((a, b) => {
            if (a.asset_type !== b.asset_type) {
                return a.asset_type.localeCompare(b.asset_type);
            }
            return a.name.localeCompare(b.name);
        });

        sortedAssets.forEach(asset => {
            const assetWorkItems = getWorkItemsForAsset(asset.asset_id);
            const totalProgress = calculateAssetProgress(asset);
            const locationInfo = getAssetLocationInfo(asset);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding: 8px;"><strong>${asset.asset_id}</strong></td>
                <td style="padding: 8px;">${asset.name}</td>
                <td style="padding: 8px;">${formatAssetType(asset.asset_type)}</td>
                <td style="padding: 8px;">${locationInfo}</td>
                <td style="padding: 8px;">${assetWorkItems.length} items</td>
                <td style="padding: 8px;">${totalProgress}</td>
                <td style="padding: 8px;">
                    <div style="display: flex; gap: 4px;">
                        <button onclick="viewAsset('${asset.asset_id}')" style="background: none; border: none; cursor: pointer; font-size: 1.2em;" title="View Details">👁️</button>
                        <button onclick="editAsset('${asset.asset_id}')" style="background: none; border: none; cursor: pointer; font-size: 1.2em;" title="Edit">✏️</button>
                        <button onclick="deleteAsset('${asset.asset_id}')" style="background: none; border: none; cursor: pointer; font-size: 1.2em; color: #ef4444;" title="Delete">🗑️</button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // RECENTLY DELETED ASSETS SECTION
    if (deletedAssets.length > 0) {
        // Add spacer
        const spacerRow = document.createElement('tr');
        spacerRow.innerHTML = `<td colspan="7" style="height: 20px;"></td>`;
        tbody.appendChild(spacerRow);

        // Recently Deleted Section Header
        const deletedHeaderRow = document.createElement('tr');
        deletedHeaderRow.innerHTML = `
            <td colspan="7" style="background-color: #fef2f2; font-weight: bold; padding: 8px; text-align: center; color: #dc2626;">
                🗑️ Recently Deleted (${deletedAssets.length})
            </td>
        `;
        tbody.appendChild(deletedHeaderRow);

        // Table headers for deleted assets
        const deletedHeadersRow = document.createElement('tr');
        deletedHeadersRow.innerHTML = `
            <th style="padding: 8px; color: #dc2626;">Asset ID</th>
            <th style="padding: 8px; color: #dc2626;">Name</th>
            <th style="padding: 8px; color: #dc2626;">Type</th>
            <th style="padding: 8px; color: #dc2626;">Deleted</th>
            <th style="padding: 8px; color: #dc2626;">Work Items</th>
            <th style="padding: 8px; color: #dc2626;">Reason</th>
            <th style="padding: 8px; color: #dc2626;">Actions</th>
        `;
        tbody.appendChild(deletedHeadersRow);

        // Sort deleted assets by deletion date (most recent first)
        const sortedDeletedAssets = [...deletedAssets].sort((a, b) =>
            new Date(b.deleted_at) - new Date(a.deleted_at)
        );

        sortedDeletedAssets.forEach(deletedAsset => {
            const deletedDate = new Date(deletedAsset.deleted_at).toLocaleDateString();
            const deletedTime = new Date(deletedAsset.deleted_at).toLocaleTimeString();
            const workItemsCount = deletedAsset.work_items ? deletedAsset.work_items.length : 0;

            const deletionReasonText = deletedAsset.deletion_reason === 'accidental' ? 'Local Delete' : 'Permanent Request';
            const reasonColor = deletedAsset.deletion_reason === 'accidental' ? '#059669' : '#dc2626';

            const row = document.createElement('tr');
            row.style.backgroundColor = '#fef2f2';
            row.innerHTML = `
                <td style="padding: 8px; color: #dc2626;"><strong>${deletedAsset.asset_id}</strong></td>
                <td style="padding: 8px; color: #dc2626;">${deletedAsset.name}</td>
                <td style="padding: 8px; color: #dc2626;">${formatAssetType(deletedAsset.asset_type)}</td>
                <td style="padding: 8px; color: #dc2626; font-size: 0.9em;">${deletedDate}<br>${deletedTime}</td>
                <td style="padding: 8px; color: #dc2626;">${workItemsCount} items</td>
                <td style="padding: 8px; color: ${reasonColor}; font-weight: bold;">${deletionReasonText}</td>
                <td style="padding: 8px;">
                    <div style="display: flex; gap: 4px;">
                        <button onclick="restoreAsset('${deletedAsset.asset_id}')" style="background: none; border: none; cursor: pointer; font-size: 1.2em; color: #059669;" title="Restore Asset">↩️</button>
                        ${!deletedAsset.cloud_delete_requested ?
                            `<button onclick="deleteAssetFromCloud('${deletedAsset.asset_id}')" style="background: none; border: none; cursor: pointer; font-size: 1.2em; color: #dc2626;" title="Delete Permanently">☠️</button>` :
                            `<span style="color: #dc2626; font-size: 0.8em;">🗑️ Pending</span>`
                        }
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
};

// Format asset type for display
function formatAssetType(assetType) {
    const typeMap = {
        'road_section': 'Road Section',
        'building': 'Building',
        'flood_control': 'Flood Control',
        'bridge': 'Bridge',
        'culvert': 'Culvert',
        'utility': 'Utility',
        'landscaping': 'Landscaping',
        'other': 'Other'
    };
    return typeMap[assetType] || assetType;
}

// Get asset location information
function getAssetLocationInfo(asset) {
    if (asset.chainage_start_m !== undefined && asset.chainage_end_m !== undefined) {
        const startChainage = formatChainage(asset.chainage_start_m);
        const endChainage = formatChainage(asset.chainage_end_m);
        return `${startChainage} - ${endChainage}`;
    }
    if (asset.length_m) {
        return `${asset.length_m}m`;
    }
    if (asset.width_m) {
        return `${asset.width_m}m × ${asset.length_m || 0}m`;
    }
    return '-';
}

// Calculate overall progress for an asset
function calculateAssetProgress(asset) {
    const assetWorkItems = getWorkItemsForAsset(asset.asset_id);

    if (assetWorkItems.length === 0) return 'No work items';

    let totalProgress = 0;
    let completedItems = 0;
    let itemsWithTargets = 0;

    assetWorkItems.forEach(workItem => {
        if (workItem.target_total && workItem.target_total > 0) {
            const progress = (workItem.cumulative / workItem.target_total) * 100;
            totalProgress += progress;
            if (progress >= 100) completedItems++;
            itemsWithTargets++;
        }
    });

    if (itemsWithTargets === 0) {
        // No targets set - show cumulative work instead
        const totalCumulative = assetWorkItems.reduce((sum, wi) => sum + (wi.cumulative || 0), 0);
        return `${totalCumulative} cumulative units (no targets set)`;
    }

    const avgProgress = totalProgress / itemsWithTargets;
    return `${avgProgress.toFixed(1)}% (${completedItems}/${itemsWithTargets} complete)`;
}

// ===============================
// ASSET MODAL FUNCTIONS
// ===============================

// Open asset creation modal
window.openAssetModal = function (assetData = null) {
    const modal = document.getElementById('assetModal');
    const form = document.getElementById('assetForm');

    // Reset form
    form.reset();
    document.getElementById('workItemsList').innerHTML = '';
    currentWorkItems = [];

    // Hide all asset type specific fields
    document.getElementById('roadSectionFields').style.display = 'none';
    document.getElementById('buildingFields').style.display = 'none';
    document.getElementById('floodControlFields').style.display = 'none';

    // If editing existing asset, populate form
    if (assetData) {
        document.getElementById('assetModalTitle').textContent = 'Edit Asset';
        document.getElementById('assetName').value = assetData.name || '';
        document.getElementById('assetDescription').value = assetData.description || '';
        document.getElementById('assetType').value = assetData.asset_type || '';

        // Show appropriate fields based on asset type
        showAssetTypeFields(assetData.asset_type);

        // Load existing work items
        if (assetData.work_items && assetData.work_items.length > 0) {
            currentWorkItems = [...assetData.work_items];
            renderWorkItems();
        }
    } else {
        document.getElementById('assetModalTitle').textContent = 'Create New Asset';
        // Generate a new asset ID (will be updated when asset type is selected)
        const assetTypeSelect = document.getElementById('assetType');
        const initialAssetType = assetTypeSelect?.value || 'road_section';
        const newAssetId = generateAssetIdForType(initialAssetType);
        document.getElementById('assetForm').dataset.assetId = newAssetId;
    }

    modal.style.display = 'flex';

    // Add event listener to update asset ID when asset type changes
    const assetTypeSelect = document.getElementById('assetType');
    if (assetTypeSelect) {
        assetTypeSelect.addEventListener('change', (e) => {
            const newAssetType = e.target.value;
            const newAssetId = generateAssetIdForType(newAssetType);
            document.getElementById('assetForm').dataset.assetId = newAssetId;
        });
    }
};

// Close asset modal
window.closeAssetModal = function () {
    const modal = document.getElementById('assetModal');
    modal.style.display = 'none';
};

// Show/hide fields based on asset type
window.showAssetTypeFields = function (assetType) {
    // Hide all fields first
    document.getElementById('roadSectionFields').style.display = 'none';
    document.getElementById('buildingFields').style.display = 'none';
    document.getElementById('floodControlFields').style.display = 'none';

    // Show relevant fields
    switch (assetType) {
        case 'road_section':
            document.getElementById('roadSectionFields').style.display = 'block';
            break;
        case 'building':
            document.getElementById('buildingFields').style.display = 'block';
            break;
        case 'flood_control':
            document.getElementById('floodControlFields').style.display = 'block';
            break;
    }
};

// Handle asset type change
document.addEventListener('DOMContentLoaded', () => {
    const assetTypeSelect = document.getElementById('assetType');
    if (assetTypeSelect) {
        assetTypeSelect.addEventListener('change', (e) => {
            showAssetTypeFields(e.target.value);
        });
    }

    // New Asset button click
    const newAssetBtn = document.getElementById('newAssetBtn');
    if (newAssetBtn) {
        newAssetBtn.addEventListener('click', () => {
            openAssetModal();
        });
    }

    // Asset form submission
    const assetForm = document.getElementById('assetForm');
    if (assetForm) {
        assetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAssetFormSubmit();
        });
    }

    // Cancel Asset button
    const cancelAssetBtn = document.getElementById('cancelAssetBtn');
    if (cancelAssetBtn) {
        cancelAssetBtn.addEventListener('click', () => {
            closeAssetModal();
        });
    }

    // Add Work Item button
    const addWorkItemBtn = document.getElementById('addWorkItemBtn');
    if (addWorkItemBtn) {
        addWorkItemBtn.addEventListener('click', addWorkItem);
    }
});

  // Handle asset form submission
function handleAssetFormSubmit() {
    const form = document.getElementById('assetForm');
    const formData = new FormData(form);

    // Get form values
    const assetType = formData.get('assetType');
    const assetName = formData.get('assetName');
    const assetDescription = formData.get('assetDescription');
    const assetId = document.getElementById('assetForm').dataset.assetId || generateAssetIdForType(assetType);

    // Validate required fields
    if (!assetType || !assetName) {
        alert('Please fill in all required fields (Asset Type and Asset Name).');
        return;
    }

    // Collect work items
    const workItems = [];
    const workItemRows = document.querySelectorAll('.work-item-row');
    workItemRows.forEach((row, index) => {
        const workType = row.querySelector('.work-item-type')?.value;
        const itemCode = row.querySelector('.work-item-code')?.value;
        const unit = row.querySelector('.work-item-unit')?.value;
        const targetTotal = parseFloat(row.querySelector('.work-item-target')?.value) || 0;

        if (workType && unit) {
            workItems.push({
                work_item_id: generateWorkItemId(),
                project_id: activeProject ? activeProject.project_id : null,
                asset_id: assetId,
                work_type: workType,
                item_code: itemCode || null,
                unit: unit,
                target_total: targetTotal,
                cumulative: 0,
                remaining: targetTotal,
                status: 'pending',
                priority: 'medium',
                notes: ''
            });
        }
    });

    // Create asset object
    const assetData = {
        asset_id: assetId,
        name: assetName,
        description: assetDescription,
        asset_type: assetType,
        work_items: workItems,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        project_id: activeProject ? activeProject.project_id : null
    };

    // Add type-specific fields
    if (assetType === 'road_section') {
        const chainageStart = document.getElementById('chainageStart')?.value;
        const chainageEnd = document.getElementById('chainageEnd')?.value;
        const roadSide = document.getElementById('roadSide')?.value;

        if (chainageStart) {
            assetData.chainage_start_m = parseChainage(chainageStart);
        }
        if (chainageEnd) {
            assetData.chainage_end_m = parseChainage(chainageEnd);
        }
        if (roadSide) {
            assetData.side = roadSide;
        }
    } else if (assetType === 'building') {
        const buildingLength = parseFloat(document.getElementById('buildingLength')?.value) || 0;
        const buildingWidth = parseFloat(document.getElementById('buildingWidth')?.value) || 0;

        if (buildingLength > 0) {
            assetData.length_m = buildingLength;
        }
        if (buildingWidth > 0) {
            assetData.width_m = buildingWidth;
        }
    } else if (assetType === 'flood_control') {
        const floodChainageStart = document.getElementById('floodChainageStart')?.value;
        const floodChainageEnd = document.getElementById('floodChainageEnd')?.value;
        const floodSide = document.getElementById('floodSide')?.value;

        if (floodChainageStart) {
            assetData.chainage_start_m = parseChainage(floodChainageStart);
        }
        if (floodChainageEnd) {
            assetData.chainage_end_m = parseChainage(floodChainageEnd);
        }
        if (floodSide) {
            assetData.side = floodSide.replace(' Bank', '');
        }
    }

    // Save the asset
    saveAsset(assetData);

    // Close modal and reset form
    closeAssetModal();

    // Refresh assets display
    renderAssets();

    console.log('Asset saved:', assetData.asset_id);
}

// Parse chainage string to meters
function parseChainage(chainageStr) {
    try {
        if (!chainageStr) return 0;

        // Handle formats like "0+000", "5+200", "10+050"
        if (chainageStr.includes('+')) {
            const [station, offset] = chainageStr.split('+');
            return parseInt(station) * 1000 + parseInt(offset.padStart(3, '0'));
        }

        // Simple numeric fallback
        return parseFloat(chainageStr) || 0;
    } catch (error) {
        return 0;
    }
}

// Format meters back to chainage display format (e.g., 1000 -> "1+000")
function formatChainage(meters) {
    if (meters === undefined || meters === null) return null;

    const totalMeters = Math.round(meters);
    const station = Math.floor(totalMeters / 1000);
    const offset = totalMeters % 1000;

    return `${station}+${String(offset).padStart(3, '0')}`;
}

// Add work item to form
window.addWorkItem = function () {
    const workItemHtml = `
        <div class="work-item-row" style="border: 1px solid #e5e7eb; padding: 10px; margin-bottom: 10px; border-radius: 4px;">
            <div class="form-row">
                <div class="form-group">
                    <label>Work Type *</label>
                    <input type="text" class="work-item-type" placeholder="e.g., PCCP, Foundation, Excavation" required>
                </div>
                <div class="form-group">
                    <label>Item Code</label>
                    <input type="text" class="work-item-code" placeholder="e.g., 311, 208" maxlength="20">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Unit *</label>
                    <select class="work-item-unit" required>
                        <option value="">-- Select Unit --</option>
                        <option value="blocks">Blocks</option>
                        <option value="m">Meters</option>
                        <option value="lm">Linear Meters</option>
                        <option value="m2">Square Meters</option>
                        <option value="m3">Cubic Meters</option>
                        <option value="pcs">Pieces</option>
                        <option value="kg">Kilograms</option>
                        <option value="tons">Tons</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Target Total</label>
                    <input type="number" class="work-item-target" step="0.01" placeholder="0">
                </div>
            </div>
            <button type="button" onclick="this.parentElement.parentElement.remove()" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Remove</button>
        </div>
    `;

    const workItemsList = document.getElementById('workItemsList');
    workItemsList.insertAdjacentHTML('beforeend', workItemHtml);
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

// Fix missing project_id for existing field logs
function fixMissingProjectIds(logs) {
    const fixedLogs = [...logs];
    let hasFixes = false;

    fixedLogs.forEach(log => {
        // If project_id is missing or undefined, try to determine it
        if (!log.project_id || log.project_id === '0') {
            // For now, assign to the first available project if no logs exist
            if (projects.length > 0) {
                log.project_id = projects[0].project_id;
                hasFixes = true;
                console.log(`Fixed missing project_id for log ${log.entry_id}: set to ${log.project_id}`);
            }
        }
    });

    // Save the fixed logs back to storage if we made changes
    if (hasFixes) {
        localStorage.setItem('veritas_field_logs', JSON.stringify(fixedLogs));
        console.log('Fixed missing project IDs in field logs');
    }

    return fixedLogs;
}

// Get actual storage quota from browser
async function getActualStorageQuota() {
    try {
        const estimate = await navigator.storage.estimate();
        const quota = estimate.quota || 10 * 1024 * 1024; // Default to 10MB if not available
        const usage = estimate.usage || 0;
        return { quota, usage, percentUsed: (usage / quota) * 100 };
    } catch (error) {
        console.warn('Could not get storage estimate, using fallback:', error);
        const storageUsed = JSON.stringify(localStorage).length;
        return { quota: 10 * 1024 * 1024, usage: storageUsed, percentUsed: (storageUsed / (10 * 1024 * 1024)) * 100 };
    }
}

// Save field logs to LocalStorage
async function saveFieldLogs() {
    try {
        const jsonString = JSON.stringify(fieldLogs);

        // Get actual storage quota from browser
        const storageInfo = await getActualStorageQuota();

        if (storageInfo.percentUsed > 85) { // Warning at 85% with real quota
            const storageMB = (storageInfo.usage / (1024 * 1024)).toFixed(2);
            const quotaMB = (storageInfo.quota / (1024 * 1024)).toFixed(1);
            const shouldContinue = confirm(
                `Storage usage: ${storageMB} MB (${storageInfo.percentUsed.toFixed(1)}% of ${quotaMB}MB quota)\n\n` +
                'Storage is almost full. Consider exporting old data to free up space. Continue saving?'
            );

            if (!shouldContinue) {
                return; // Cancel the operation - no data lost
            }
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
            alert('Storage full! Please export data to continue. No data was lost.\n\nGo to Settings → Export Data to free up space.');
            // Don't delete anything automatically - user must choose
        } else {
            console.error('Error saving field logs:', error);
        }
    }
}

// --- Photo Compression ---

function compressPhoto(base64String, targetSizeKB = 100) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Start with original dimensions
            let { width, height } = img;
            const maxDimension = 800;

            // Scale down if needed
            if (width > maxDimension || height > maxDimension) {
                const scale = Math.min(maxDimension / width, maxDimension / height);
                width *= scale;
                height *= scale;
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Try different quality levels to reach target size
            let quality = 0.8;
            let result = canvas.toDataURL('image/jpeg', quality);

            // Reduce quality if too large
            while (result.length > targetSizeKB * 1024 && quality > 0.1) {
                quality -= 0.1;
                result = canvas.toDataURL('image/jpeg', quality);
            }

            // Final check: if still too large, reduce dimensions
            if (result.length > targetSizeKB * 1024) {
                const smallerScale = Math.sqrt(targetSizeKB * 1024 / result.length);
                canvas.width *= smallerScale;
                canvas.height *= smallerScale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                result = canvas.toDataURL('image/jpeg', 0.6);
            }

            const finalSizeKB = Math.round(result.length / 1024);
            console.log(`Photo compressed: ${finalSizeKB}KB (target: ${targetSizeKB}KB, quality: ${quality.toFixed(1)})`);
            resolve(result);
        };
        img.src = base64String;
    });
}

// --- Storage Management ---

function cleanupOldPhotos() {
    const photoLogs = fieldLogs.filter(log => log.photo_base64);

    if (photoLogs.length === 0) {
        alert('No photos to clean up.');
        return;
    }

    const totalSize = photoLogs.reduce((sum, log) => sum + log.photo_base64.length, 0);
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

    const message =
        `Photo Cleanup Options\n\n` +
        `Current photos: ${photoLogs.length}\n` +
        `Total size: ${sizeMB} MB\n\n` +
        `Choose an option:\n` +
        `1. Compress all photos to 100KB each\n` +
        `2. Delete photos older than 30 days\n` +
        `3. Keep only 50 most recent photos\n` +
        `4. Export photos and delete from device\n` +
        `5. Cancel - do nothing`;

    const choice = prompt(message + '\n\nEnter choice (1-5):');

    switch(choice) {
        case '1':
            compressAllPhotos();
            break;
        case '2':
            deleteOldPhotos(30);
            break;
        case '3':
            keepRecentPhotos(50);
            break;
        case '4':
            exportAndCleanPhotos();
            break;
        case '5':
        default:
            return; // Do nothing
    }
}

async function compressAllPhotos() {
    console.log('Compressing all photos...');
    const photoLogs = fieldLogs.filter(log => log.photo_base64);
    let compressedCount = 0;

    for (const log of photoLogs) {
        if (log.photo_base64) {
            const originalSize = Math.round(log.photo_base64.length / 1024);
            log.photo_base64 = await compressPhoto(log.photo_base64, 100);
            const newSize = Math.round(log.photo_base64.length / 1024);
            console.log(`Compressed photo: ${originalSize}KB → ${newSize}KB`);
            compressedCount++;
        }
    }

    await saveFieldLogs();
    alert(`Compressed ${compressedCount} photos to ~100KB each.`);
}

function deleteOldPhotos(daysOld) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const photosToDelete = fieldLogs.filter(log =>
        log.photo_base64 && new Date(log.date) < cutoffDate
    );

    if (photosToDelete.length === 0) {
        alert(`No photos older than ${daysOld} days found.`);
        return;
    }

    const confirmed = confirm(`Delete ${photosToDelete.length} photos older than ${daysOld} days?\n\n` +
        `Photos will be removed from local device only. Cloud photos will be preserved.`);

    if (confirmed) {
        photosToDelete.forEach(log => {
            const index = fieldLogs.findIndex(l => l.entry_id === log.entry_id);
            if (index !== -1) {
                fieldLogs[index].photo_base64 = null;
                fieldLogs[index].photo_removed_for_space = true;
            }
        });

        saveFieldLogs().then(() => {
            alert(`Deleted ${photosToDelete.length} old photos from local device.`);
            renderFieldLogs(); // Refresh the display
        });
    }
}

function keepRecentPhotos(count) {
    const photoLogs = fieldLogs.filter(log => log.photo_base64);

    if (photoLogs.length <= count) {
        alert(`Only ${photoLogs.length} photos exist. No cleanup needed.`);
        return;
    }

    const toDelete = photoLogs.length - count;

    const confirmed = confirm(`Delete ${toDelete} oldest photos, keeping ${count} most recent?\n\n` +
        `Photos will be removed from local device only. Cloud photos will be preserved.`);

    if (confirmed) {
        photoLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

        photoLogs.slice(count).forEach(log => {
            const index = fieldLogs.findIndex(l => l.entry_id === log.entry_id);
            if (index !== -1) {
                fieldLogs[index].photo_base64 = null;
                fieldLogs[index].photo_removed_for_space = true;
            }
        });

        saveFieldLogs().then(() => {
            alert(`Deleted ${toDelete} old photos, kept ${count} recent ones.`);
            renderFieldLogs(); // Refresh the display
        });
    }
}

function exportAndCleanPhotos() {
    if (confirm('Export all data first? This will create a backup file with all photos.')) {
        exportData();
        setTimeout(() => {
            if (confirm('Data exported. Now delete all photos from local device?')) {
                const photoCount = fieldLogs.filter(log => log.photo_base64).length;

                fieldLogs.forEach(log => {
                    if (log.photo_base64) {
                        log.photo_base64 = null;
                        log.photo_removed_for_space = true;
                    }
                });

                saveFieldLogs().then(() => {
                    alert(`Removed ${photoCount} photos from local device. Your backup contains all photos.`);
                    renderFieldLogs(); // Refresh the display
                });
            }
        }, 2000);
    }
}

function emergencyCleanup() {
    const message =
        '⚠️ CRITICAL: Storage completely full!\n\n' +
        'Options to resolve:\n' +
        '1. Export all data (recommended)\n' +
        '2. Delete all photos permanently from local only\n' +
        '3. Cancel and try manual cleanup';

    const choice = prompt(message + '\n\nEnter choice (1-3):');

    switch(choice) {
        case '1':
            exportData();
            setTimeout(() => {
                if (confirm('Data exported. Clear all local data now?')) {
                    clearAllLocalData();
                }
            }, 1000);
            break;
        case '2':
            if (confirm('⚠️ WARNING: This will permanently delete ALL photos from local storage only. Cloud photos will be preserved. Continue?')) {
                fieldLogs.forEach(log => {
                    if (log.photo_base64) {
                        log.photo_base64 = null;
                        log.photo_removed_emergency = true; // Special flag for emergency deletions
                    }
                });
                try {
                    localStorage.setItem('veritas_field_logs', JSON.stringify(fieldLogs));
                    alert('All photos deleted from local storage only. Cloud photos preserved.');
                } catch (error) {
                    console.error('Emergency cleanup failed:', error);
                    alert('Unable to free space. Please export all data.');
                }
            }
            break;
        case '3':
        default:
            return; // Do nothing
    }
}

function clearAllLocalData() {
    localStorage.removeItem('veritas_projects');
    localStorage.removeItem('veritas_segments'); // Legacy compatibility
    localStorage.removeItem('veritas_assets');
    localStorage.removeItem('veritas_work_items');
    localStorage.removeItem('veritas_field_logs');
    localStorage.removeItem('veritas_user');

    // Reload page to clean state
    window.location.reload();
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

async function showStorageInfo() {
    const storageInfo = await getActualStorageQuota();
    const info = getStorageInfo();

    // Calculate photo storage details
    const photoLogs = fieldLogs.filter(log => log.photo_base64);
    const totalPhotoSize = photoLogs.reduce((sum, log) => sum + log.photo_base64.length, 0);
    const photoSizeMB = (totalPhotoSize / (1024 * 1024)).toFixed(2);
    const avgPhotoSizeKB = photoLogs.length > 0 ? Math.round(totalPhotoSize / photoLogs.length / 1024) : 0;

    const message = `
Storage Usage Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Used: ${info.storageUsedKB} KB (${(info.storageUsedKB / 1024).toFixed(2)} MB)
Field Logs: ${info.fieldLogsKB} KB
Photos: ${info.photoCount} photos (${photoSizeMB} MB)
Average Photo: ${avgPhotoSizeKB} KB
Actual Usage: ${storageInfo.percentUsed.toFixed(1)}% of ${(storageInfo.quota / (1024 * 1024)).toFixed(1)}MB quota

${storageInfo.percentUsed > 90 ? '⚠️  CRITICAL: Storage almost full!' :
  storageInfo.percentUsed > 75 ? '⚠️  WARNING: Storage getting full!' :
  '✅ Storage usage is normal'}

Recommended Actions:
${storageInfo.percentUsed > 90 ? '• Export data immediately\n• Run photo cleanup (compress or delete old photos)' :
  storageInfo.percentUsed > 75 ? '• Export data soon\n• Consider photo compression\n• Run photo cleanup' :
  '• Export data regularly for backup'}
• Use cloud sync to preserve photos
• Average photo size should be under 150KB
    `.trim();

    if (confirm(message + '\n\nWould you like to run photo cleanup now?')) {
        cleanupOldPhotos();
    }

    if (storageInfo.percentUsed > 90) {
        if (confirm('Storage is critically full! Export data now?')) {
            exportData();
        }
    }
}

function clearAllData() {
    const message = `
⚠️  DANGER: This will delete ALL local data!

This action will:
• Remove all projects from local storage
• Remove all assets from local storage
• Remove all work items from local storage
• Remove all field logs from local storage
• Remove all recently deleted assets from local storage
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
    localStorage.removeItem('veritas_assets');
    localStorage.removeItem('veritas_work_items');
    localStorage.removeItem('veritas_segments');
    localStorage.removeItem('veritas_field_logs');
    localStorage.removeItem('veritas_deleted_assets');
    localStorage.removeItem('veritas_active_project');
    localStorage.removeItem('veritas_pending_cloud_deletions');

    // Reset in-memory variables
    projects = [];
    assets = [];
    workItems = [];
    fieldLogs = [];
    segments = [];
    deletedAssets = []; // Reset recently deleted assets
    activeProject = null;

    // Refresh the UI
    window.loadProjects();
    window.loadAssets();
    window.loadWorkItems();
    window.loadSegments();
    window.loadFieldLogs();
    window.loadDeletedAssets(); // Load deleted assets (should be empty now)
    updateProjectSelect();
    populateAssetSelect();
    updateSegmentSelect();
    renderAssets(); // Refresh assets display (should show no recently deleted items)

    // Clear project selection UI
    document.getElementById('projectSelect').value = '';
    document.getElementById('activeProjectDisplay').style.display = 'none';
    activeProject = null;

    alert('✅ All local data has been cleared!\n\nStorage is now empty. You can:\n• Import previously exported data\n• Create new projects\n• "Clear Cloud Data" to remove cloud data\n• Sync from cloud if logged in');
}

async function clearAllCloudData() {
    if (!currentUser) {
        alert('❌ You must be logged in to clear cloud data.');
        return;
    }

    const message = `
🔥 CRITICAL: This will PERMANENTLY delete ALL cloud data!

This action will:
• Delete ALL projects from Supabase cloud
• Delete ALL assets from Supabase cloud
• Delete ALL work items from Supabase cloud
• Delete ALL field logs from Supabase cloud
• Delete ALL segments from Supabase cloud
• This CANNOT be undone!
• This affects ALL users!

⚠️  This is a PERMANENT, IRREVERSIBLE operation!

Are you absolutely sure you want to proceed?
    `.trim();

    if (!confirm(message)) {
        return;
    }

    if (!confirm('FINAL CRITICAL WARNING: This will delete EVERYTHING from the cloud forever! Type "DELETE" to confirm.')) {
        const confirmation = prompt('Type "DELETE" to confirm permanent cloud data deletion:');
        if (confirmation !== 'DELETE') {
            alert('❌ Operation cancelled. Confirmation did not match "DELETE"');
            return;
        }
    }

    try {
        const deletedItems = [];

        // Delete all field logs
        const { error: logsError } = await supabase
            .from('field_logs')
            .delete()
            .neq('entry_id', 'impossible-value'); // Delete all records

        if (!logsError) deletedItems.push('Field logs');

        // Delete all work items
        const { error: workItemsError } = await supabase
            .from('work_items')
            .delete()
            .neq('work_item_id', 'impossible-value');

        if (!workItemsError) deletedItems.push('Work items');

        // Delete all assets
        const { error: assetsError } = await supabase
            .from('assets')
            .delete()
            .neq('asset_id', 'impossible-value');

        if (!assetsError) deletedItems.push('Assets');

        // Delete all projects
        const { error: projectsError } = await supabase
            .from('projects')
            .delete()
            .neq('project_id', 'impossible-value');

        if (!projectsError) deletedItems.push('Projects');

        // Delete all segments
        const { error: segmentsError } = await supabase
            .from('segments')
            .delete()
            .neq('segment_id', 'impossible-value');

        if (!segmentsError) deletedItems.push('Segments');

        if (deletedItems.length > 0) {
            alert(`✅ Cloud data cleared successfully!\n\nDeleted: ${deletedItems.join(', ')}\n\nThe cloud is now completely empty.`);

            // Also clear local data since user wants complete reset
            const clearLocalToo = confirm('Cloud data cleared! Would you also like to clear all local data for a complete fresh start?');
            if (clearLocalToo) {
                // Clear local deleted assets too
                localStorage.removeItem('veritas_deleted_assets');
                deletedAssets = [];

                // Clear all other local data
                localStorage.removeItem('veritas_projects');
                localStorage.removeItem('veritas_assets');
                localStorage.removeItem('veritas_work_items');
                localStorage.removeItem('veritas_segments');
                localStorage.removeItem('veritas_field_logs');
                localStorage.removeItem('veritas_active_project');
                localStorage.removeItem('veritas_pending_cloud_deletions');

                // Reset in-memory variables
                projects = [];
                assets = [];
                workItems = [];
                fieldLogs = [];
                segments = [];
                activeProject = null;

                // Refresh UI
                window.loadProjects();
                window.loadAssets();
                window.loadWorkItems();
                window.loadSegments();
                window.loadFieldLogs();
                window.loadDeletedAssets();
                updateProjectSelect();
                populateAssetSelect();
                updateSegmentSelect();
                renderAssets();

                alert('✅ Complete reset successful! All cloud and local data has been cleared.');
            }
        } else {
            alert('⚠️ No data was deleted or there were errors.');
        }

    } catch (error) {
        console.error('Error clearing cloud data:', error);
        alert('❌ Error clearing cloud data: ' + error.message);
    }
}

// --- Export / Import ---

document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', importData);
document.getElementById('storageBtn').addEventListener('click', showStorageInfo);
document.getElementById('clearAllBtn').addEventListener('click', clearAllData);
document.getElementById('clearCloudBtn').addEventListener('click', clearAllCloudData);

// --- Legacy Segments Event Listeners (DISABLED - REMOVED HTML ELEMENTS) ---
// Note: These buttons no longer exist in the HTML since we've moved to Assets model
// The code is kept for reference but commented out to prevent errors

/*
document.getElementById('newSegmentBtn')?.addEventListener('click', () => {
    document.getElementById('newSegmentForm').style.display = 'block';
    document.getElementById('newSegmentBtn').style.display = 'none';
    document.getElementById('segmentFormTitle').textContent = 'Create New Segment';
    document.getElementById('newSegmentForm').reset();
});

document.getElementById('cancelSegmentBtn')?.addEventListener('click', () => {
    document.getElementById('newSegmentForm').style.display = 'none';
    document.getElementById('newSegmentBtn').style.display = 'inline-block';
});

document.getElementById('newSegmentForm')?.addEventListener('submit', (e) => {
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
*/

// Asset selection dropdown change handler - updated for Assets & Work Items
document.addEventListener('DOMContentLoaded', () => {
    // Add this after DOM is loaded
    const assetSelect = document.getElementById('assetSelect');
    if (assetSelect) {
        assetSelect.addEventListener('change', (e) => {
            const selectedAssetId = e.target.value;
            const hiddenInput = document.getElementById('fieldAssetId');
            const infoRow = document.getElementById('assetInfoRow');
            const lengthInput = document.getElementById('fieldAssetInfo');
            const workItemContainer = document.getElementById('workItemsContainer');

            if (selectedAssetId) {
                const asset = getAsset(selectedAssetId);
                if (asset) {
                    hiddenInput.value = selectedAssetId;
                    // Display asset info with available dimensions
                let assetInfo = '';
                if (asset.chainage_start_m !== undefined && asset.chainage_end_m !== undefined) {
                    const startChainage = formatChainage(asset.chainage_start_m);
                    const endChainage = formatChainage(asset.chainage_end_m);
                    assetInfo = `${startChainage} - ${endChainage}`;
                } else if (asset.length_m) {
                    assetInfo = `${asset.length_m}m long`;
                } else if (asset.width_m && asset.length_m) {
                    // Keep for building assets
                    assetInfo = `${asset.length_m}m × ${asset.width_m}m`;
                } else {
                    assetInfo = 'No dimensions specified';
                }
                lengthInput.value = assetInfo;
                    infoRow.style.display = 'flex';

                    // Populate work type dropdown with asset-specific work items
                    populateWorkTypeFromAsset(selectedAssetId);
                    workItemContainer.style.display = 'block';
                }
            } else {
                hiddenInput.value = '';
                infoRow.style.display = 'none';
                workItemContainer.style.display = 'none';
                lengthInput.value = '';
            }
        });
    }

    // Add event listener for auto-populating item code
    const fieldWorkTypeSelect = document.getElementById('fieldWorkType');
    if (fieldWorkTypeSelect) {
        fieldWorkTypeSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            const itemCodeInput = document.getElementById('fieldItemCode');

            if (selectedOption.dataset.itemCode && itemCodeInput) {
                itemCodeInput.value = selectedOption.dataset.itemCode;
            }
        });
    }
});

// Populate Work Type dropdown with asset-specific work items
function populateWorkTypeFromAsset(assetId) {
    const workTypeSelect = document.getElementById('fieldWorkType');
    if (!workTypeSelect) {
        console.warn('fieldWorkType element not found');
        return;
    }

    const asset = getAsset(assetId);
    if (!asset) {
        return;
    }

    // Clear existing options but keep the first placeholder
    const currentValue = workTypeSelect.value;
    workTypeSelect.innerHTML = '<option value="">-- Select Work Type --</option>';

    // Collect all work types to avoid duplicates
    const addedWorkTypes = new Set();
    const workTypeNames = [];

    // Add work items from this asset first (prioritized)
    if (asset.work_items && asset.work_items.length > 0) {
        asset.work_items.forEach(workItem => {
            const workType = workItem.work_type;
            if (workType && !addedWorkTypes.has(workType)) {
                addedWorkTypes.add(workType);
                const option = document.createElement('option');
                option.value = workType;
                option.textContent = `${workType} (${workItem.item_code || 'N/A'})`;
                if (workItem.item_code) {
                    option.dataset.itemCode = workItem.item_code;
                }
                workTypeSelect.appendChild(option);
                workTypeNames.push(workType);
            }
        });
    }

    // Define appropriate work types by asset type
    const workTypesByAssetType = {
        'road_section': [
            'Road Opening', 'Excavation', 'Embankment', 'Subgrade Prep',
            'Base Course', 'PCCP (Concrete Pavement)', 'Asphalt Works',
            'Drainage Works', 'Road Furniture'
        ],
        'building': [
            'Site Clearing', 'Excavation', 'Foundation', 'Reinforcement',
            'Formworks', 'Concrete Pouring', 'Masonry', 'Roofing',
            'Electrical', 'Plumbing', 'Finishing'
        ],
        'flood_control': [
            'Site Clearing', 'Excavation', 'Embankment', 'Riprap',
            'Concrete Works', 'Drainage Structures', 'Grouted Riprap',
            'Gabion Installation', 'Slope Protection'
        ],
        'bridge': [
            'Site Clearing', 'Foundation Works', 'Piling', 'Abutment',
            'Pier Construction', 'Superstructure', 'Deck Works',
            'Railings', 'Approach Slabs'
        ],
        'culvert': [
            'Excavation', 'Foundation', 'Concrete Works', 'Culvert Installation',
            'Headwalls', 'Apron Works', 'Backfilling', 'Compaction'
        ],
        'utility': [
            'Trenching', 'Pipe Laying', 'Manhole Installation', 'Backfilling',
            'Compaction', 'Connection Works', 'Testing', 'Restoration'
        ],
        'landscaping': [
            'Site Preparation', 'Soil Preparation', 'Planting',
            'Irrigation Works', 'Hardscaping', 'Lighting', 'Maintenance'
        ],
        'other': [
            'Site Clearing', 'Excavation', 'General Construction',
            'Others'
        ]
    };

    // Get appropriate work types for this asset type
    const appropriateWorkTypes = workTypesByAssetType[asset.asset_type] || workTypesByAssetType['other'];

    // Only add appropriate work types that aren't already in the asset
    appropriateWorkTypes.forEach(workType => {
        if (!addedWorkTypes.has(workType)) {
            const option = document.createElement('option');
            option.value = workType;
            option.textContent = workType;
            workTypeSelect.appendChild(option);
        }
    });

    // Restore previous selection if it still exists
    if (currentValue) {
        workTypeSelect.value = currentValue;
    }
}

// Populate Work Items dropdown for selected Asset
function populateWorkItemsDropdown(assetId) {
    const workItemSelect = document.getElementById('workItemSelect');
    if (!workItemSelect) {
        console.warn('workItemSelect element not found - work items dropdown functionality disabled');
        return;
    }
    workItemSelect.innerHTML = '<option value="">-- Select Work Item --</option>';

    const asset = getAsset(assetId);
    if (!asset || !asset.work_items || asset.work_items.length === 0) {
        workItemSelect.innerHTML = '<option value="">-- No Work Items (will auto-create) --</option>';
        return;
    }

    asset.work_items.forEach(workItem => {
        const option = document.createElement('option');
        option.value = workItem.work_item_id;
        let progressText;
        if (workItem.target_total && workItem.target_total > 0) {
            progressText = `${workItem.remaining}/${workItem.target_total} ${workItem.unit}`;
        } else {
            progressText = `${workItem.cumulative} ${workItem.unit} (no target)`;
        }
        option.textContent = `${workItem.work_type} (${progressText})`;
        option.dataset.workType = workItem.work_type;
        option.dataset.itemCode = workItem.item_code || '';
        option.dataset.unit = workItem.unit;
        workItemSelect.appendChild(option);
    });
}

// Work Item matching algorithm - matches field entry to existing work item or creates new one
function matchOrCreateWorkItem(assetId, workType, itemCode, quantityToday) {
    const asset = getAsset(assetId);
    if (!asset) return null;

    // Use assetWorkItems to avoid shadowing the global workItems array
    const assetWorkItems = asset.work_items || [];

    // STEP 1: Try to match by item_code first (highest priority)
    if (itemCode) {
        const matchByCode = assetWorkItems.find(wi => wi.item_code === itemCode);
        if (matchByCode) {
            return matchByCode;
        }
    }

    // STEP 2: Try to match by work_type (case-insensitive, partial match)
    const matchByType = assetWorkItems.find(wi =>
        wi.work_type.toLowerCase().includes(workType.toLowerCase()) ||
        workType.toLowerCase().includes(wi.work_type.toLowerCase())
    );
    if (matchByType) {
        return matchByType;
    }

    // STEP 3: Auto-create new work item if no match found
    const newWorkItemId = `WI-${Date.now().toString(36).toUpperCase()}`;
    const unit = inferUnitFromQuantity(quantityToday);

    const newWorkItem = {
        work_item_id: newWorkItemId,
        asset_id: assetId,  // CRITICAL: Include asset_id for database sync
        work_type: workType,
        item_code: itemCode || generateItemCodeFromWorkType(workType),
        unit: unit,
        target_total: null, // No default target - user sets actual target later
        cumulative: 0,
        remaining: null,
        status: "pending",
        priority: "medium",
        notes: `Auto-created from field entry on ${new Date().toISOString().split('T')[0]}`
    };

    // Add to asset's work items
    if (!asset.work_items) {
        asset.work_items = [];
    }
    asset.work_items.push(newWorkItem);

    // Update global workItems array and save
    workItems.push(newWorkItem);  // Now adds to GLOBAL workItems array, not local copy
    saveAssets();
    saveWorkItems();

    return newWorkItem;
}

// Infer unit from quantity string (intelligent parsing)
function inferUnitFromQuantity(quantityStr) {
    const str = quantityStr.toLowerCase().trim();

    // Check for explicit unit mentions
    if (str.includes('block') || str.includes('pcs')) return 'blocks';
    if (str.includes('m3') || str.includes('cu.m') || str.includes('cubic')) return 'm3';
    if (str.includes('m2') || str.includes('sq.m') || str.includes('square')) return 'm2';
    if (str.includes('m') && !str.includes('m2') && !str.includes('m3')) return 'lm';
    if (str.includes('kg')) return 'kg';
    if (str.includes('ton') || str.includes('tonne')) return 'tons';

    // Default to 'blocks' for PCCP and 'm' for others
    if (str.includes('pccp') || str.includes('concrete') || str.includes('pavement')) {
        return 'blocks';
    }

    return 'custom'; // Most flexible default
}

// Generate item code from work type (simple heuristic)
function generateItemCodeFromWorkType(workType) {
    const type = workType.toLowerCase();

    // Common mappings
    if (type.includes('excavation')) return '101';
    if (type.includes('pccp') || type.includes('concrete pavement')) return '311';
    if (type.includes('base') || type.includes('base course')) return '201';
    if (type.includes('asphalt')) return '301';
    if (type.includes('drainage')) return '401';
    if (type.includes('foundation')) return '501';
    if (type.includes('column') || type.includes('col')) return '502';
    if (type.includes('beam')) return '503';
    if (type.includes('slab')) return '504';
    if (type.includes('roof')) return '505';
    if (type.includes('finishing') || type.includes('finish')) return '601';
    if (type.includes('riprap')) return '701';
    if (type.includes('gabion')) return '702';
    if (type.includes('planting') || type.includes('vegetation')) return '703';

    // Generate code based on first letters and length
    const words = workType.split(/\s+/);
    let code = '';
    words.forEach(word => {
        if (word.length > 0) {
            code += word[0].toUpperCase();
        }
    });

    // Add numbers to make it look like an item code
    return code + (type.length % 900 + 100);
}

function exportData() {
    if (!activeProject) {
        alert("Please select a project to include in the filename (optional, but recommended).");
    }

    const exportData = {
        exported_at: new Date().toISOString(),
        version: "v2", // Updated version for Assets & Work Items
        projects: projects,
        segments: [], // Keep for backwards compatibility
        assets: assets,
        work_items: workItems,
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

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = JSON.parse(e.target.result);

            // Validate required fields (support both v1 and v2 formats)
            if (!data.projects || !Array.isArray(data.projects) || !data.field_logs || !Array.isArray(data.field_logs)) {
                alert("Invalid import file: Missing projects or field_logs arrays.");
                return;
            }

            // Count what we're importing
            const assetsCount = data.assets ? data.assets.length : 0;
            const workItemsCount = data.work_items ? data.work_items.length : 0;
            const segmentsCount = data.segments ? data.segments.length : 0;

            let confirmMessage = `Import will merge:\n• ${data.projects.length} projects\n• ${data.field_logs.length} field logs`;
            if (assetsCount > 0) confirmMessage += `\n• ${assetsCount} assets`;
            if (workItemsCount > 0) confirmMessage += `\n• ${workItemsCount} work items`;
            if (segmentsCount > 0) confirmMessage += `\n• ${segmentsCount} segments (legacy)`;
            confirmMessage += '\n\nContinue?';

            if (!confirm(confirmMessage)) {
                return;
            }

            let newProjectsCount = 0;
            let newAssetsCount = 0;
            let newWorkItemsCount = 0;
            let newLogsCount = 0;

            // Import projects
            data.projects.forEach(importedProj => {
                const existingIndex = projects.findIndex(p => p.project_id === importedProj.project_id);
                if (existingIndex >= 0) {
                    projects[existingIndex] = importedProj;
                } else {
                    projects.push(importedProj);
                    newProjectsCount++;
                }
            });

            // Import assets (v2 format)
            if (data.assets && Array.isArray(data.assets)) {
                data.assets.forEach(importedAsset => {
                    if (!importedAsset.asset_id) {
                        importedAsset.asset_id = `ASSET-${Date.now().toString(36).toUpperCase()}`;
                    }

                    const existingIndex = assets.findIndex(a => a.asset_id === importedAsset.asset_id);
                    if (existingIndex === -1) {
                        assets.push(importedAsset);
                        newAssetsCount++;
                    }
                });
            }

            // Import work items (v2 format)
            if (data.work_items && Array.isArray(data.work_items)) {
                data.work_items.forEach(importedWorkItem => {
                    if (!importedWorkItem.work_item_id) {
                        importedWorkItem.work_item_id = `WI-${Date.now().toString(36).toUpperCase()}`;
                    }

                    const existingIndex = workItems.findIndex(wi => wi.work_item_id === importedWorkItem.work_item_id);
                    if (existingIndex === -1) {
                        workItems.push(importedWorkItem);
                        newWorkItemsCount++;
                    }
                });
            }

            // Import field logs
            data.field_logs.forEach(importedLog => {
                if (!importedLog.entry_id) {
                    importedLog.entry_id = crypto.randomUUID();
                }

                // Migrate old segment_id to asset_id for backwards compatibility
                if (importedLog.segment_id && !importedLog.asset_id) {
                    importedLog.asset_id = importedLog.segment_id;
                }

                const existingIndex = fieldLogs.findIndex(l => l.entry_id === importedLog.entry_id);
                if (existingIndex === -1) {
                    fieldLogs.push(importedLog);
                    newLogsCount++;
                }
            });

            // Save everything
            saveProjects();
            saveAssets();
            saveWorkItems();
            await saveFieldLogs();
            updateProjectSelect(activeProject ? activeProject.project_id : "");

            event.target.value = '';

            let successMessage = `Import Successful!\n• Projects added: ${newProjectsCount}\n• Field logs added: ${newLogsCount}`;
            if (newAssetsCount > 0) successMessage += `\n• Assets added: ${newAssetsCount}`;
            if (newWorkItemsCount > 0) successMessage += `\n• Work items added: ${newWorkItemsCount}`;

            alert(successMessage);

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
        const projectName = p.project_name || p.project_title || 'Untitled Project';
        option.textContent = `${projectName} (${p.project_id})`;
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
// switchTab function is defined later in the file

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

document.getElementById('fieldForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!activeProject) {
        alert("Please select a project first!");
        return;
    }

    const date = document.getElementById('fieldDate').value;
    const assetId = document.getElementById('fieldAssetId').value;
    const workItemSelect = document.getElementById('workItemSelect');
    const selectedWorkItemId = workItemSelect ? workItemSelect.value : '';
    const workType = document.getElementById('fieldWorkType').value;
    const itemCode = document.getElementById('fieldItemCode').value.trim() || null;
    const quantityToday = document.getElementById('fieldQuantity').value.trim();
    const crew = parseInt(document.getElementById('fieldCrew').value);
    const weather = document.getElementById('fieldWeather').value;
    const notes = document.getElementById('fieldNotes').value;
    const lat = document.getElementById('fieldLat').value;
    const long = document.getElementById('fieldLong').value;

    // Validation for new required fields
    if (!assetId) {
        alert("Please select an Asset!");
        return;
    }
    if (!workType) {
        alert("Please select a Work Type!");
        return;
    }
    if (!quantityToday) {
        alert("Please enter Quantity Today!");
        return;
    }

    // STEP 1: Find or create Work Item using the matching algorithm
    let workItem = null;

    // If user selected a specific work item, use it
    if (selectedWorkItemId) {
        const asset = getAsset(assetId);
        workItem = asset.work_items.find(wi => wi.work_item_id === selectedWorkItemId);
        console.log(`🎯 Using selected work item: ${selectedWorkItemId} - ${workItem.work_type}`);
    } else {
        // Use automatic matching algorithm
        workItem = matchOrCreateWorkItem(assetId, workType, itemCode, quantityToday);
    }

    if (!workItem) {
        alert("Error: Could not create or match work item!");
        return;
    }

    // STEP 2: Parse quantity and calculate progress
    let numericQuantity = 0;
    let unit = workItem.unit;

    // Parse numeric quantity from string (e.g., "15 blocks" -> 15)
    const quantityMatch = quantityToday.match(/(\d+\.?\d*)/);
    if (quantityMatch) {
        numericQuantity = parseFloat(quantityMatch[1]);
    }

    // Calculate work item progress
    const workItemLogs = fieldLogs.filter(l => l.work_item_id === workItem.work_item_id);
    const prevCumulative = workItemLogs.length > 0 ? workItemLogs[workItemLogs.length - 1].work_item_cumulative : 0;
    const newCumulative = prevCumulative + numericQuantity;
    const newRemaining = workItem.target_total ? Math.max(0, workItem.target_total - newCumulative) : null;

  
    // CRITICAL FIX: Update the work item in the global workItems array directly
    const globalWorkItemIndex = workItems.findIndex(wi => wi.work_item_id === workItem.work_item_id && wi.asset_id === assetId);

    if (globalWorkItemIndex !== -1) {
        // Update the actual object in the global array
        workItems[globalWorkItemIndex].cumulative = newCumulative;
        workItems[globalWorkItemIndex].remaining = newRemaining;
        if (newRemaining === 0) {
            workItems[globalWorkItemIndex].status = 'completed';
        } else if (numericQuantity > 0) {
            workItems[globalWorkItemIndex].status = 'in_progress';
        }

        // Also update the local workItem object reference for consistency
        workItem.cumulative = newCumulative;
        workItem.remaining = newRemaining;
        workItem.status = workItems[globalWorkItemIndex].status;
    }

    // CRITICAL FIX: Also update the work item inside the asset
    const asset = getAsset(assetId);
    if (asset && asset.work_items) {
        const assetWorkItem = asset.work_items.find(wi => wi.work_item_id === workItem.work_item_id);
        if (assetWorkItem) {
            assetWorkItem.cumulative = newCumulative;
            assetWorkItem.remaining = newRemaining;
            assetWorkItem.status = workItem.status;
        }
    }

    // Save updated work item and asset
    saveAssets();
    saveWorkItems();

    // Calculate asset overall progress
    const assetProgress = calculateAssetProgress(asset);

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

    const processEntry = async (base64Img) => {
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
            project_id: activeProject.project_id, // Add project_id!
            asset_id: assetId,
            work_item_id: workItem.work_item_id,
            work_type: workItem.work_type,
            item_code: workItem.item_code,
            quantity_today: quantityToday,
            // CRITICAL FIX: Preserve the complete quantity text from user input
            quantity_text: quantityToday, // Preserves "5 cubic meters" exactly as user entered
            work_item_quantity: numericQuantity,
            work_item_unit: workItem.unit,
            work_item_cumulative: newCumulative,
            work_item_remaining: newRemaining,
            crew_size: crew,
            weather: weather,
            notes: notes,
            photo_base64: base64Img,
            latitude: lat,
            longitude: long,
            // Legacy compatibility fields
            segment_id: assetId, // For backward compatibility
            shift_output_blocks: unit === 'blocks' ? numericQuantity : 0,
            cumulative_blocks: unit === 'blocks' ? newCumulative : 0,
            remaining_blocks: unit === 'blocks' ? newRemaining : 0
        };

        fieldLogs.push(entry);
        await saveFieldLogs();
        renderFieldLogs();

        // Reset fields
        document.getElementById('fieldWorkType').value = '';
        document.getElementById('fieldItemCode').value = '';
        document.getElementById('fieldQuantity').value = '';
        document.getElementById('fieldNotes').value = '';
        document.getElementById('fieldPhoto').value = '';
        document.getElementById('fieldPhotoCamera').value = '';
        document.getElementById('fieldLat').value = '';
        document.getElementById('fieldLong').value = '';
        document.getElementById('gpsStatus').textContent = '';
        document.getElementById('photoPreviewContainer').style.display = 'none';

        // Reset asset-related fields
        if (document.getElementById('workItemSelect')) {
            document.getElementById('workItemSelect').value = '';
        }

        // Refresh Assets tab to show updated progress
        renderAssets();
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = async function (e) {
            // Compress the photo before processing
            console.log('Compressing photo before saving...');
            const compressedPhoto = await compressPhoto(e.target.result, 150); // Target 150KB
            console.log('Photo compression completed');
            await processEntry(compressedPhoto);
        };
        reader.readAsDataURL(file);
    } else {
        await processEntry(null);
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
                <td colspan="11" style="background-color: #f3f4f6; font-weight: bold; padding: 8px; border-left: 4px solid #2563eb;">
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
            <td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.work_type || 'N/A'}">${log.work_type || 'N/A'}</td>
            <td style="text-align: center;">${log.item_code || '-'}</td>
            <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.quantity_today || 'N/A'}">${log.quantity_today || 'N/A'}</td>
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
window.deleteFieldLogLocal = async function(entryId) {
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
        await saveFieldLogs();

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
            await saveFieldLogs();

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
    // Debug logging
    console.log('switchTab called with:', tabName);
    const debugInfo = document.getElementById('debugInfo');
    if (debugInfo) {
        debugInfo.textContent = `Switching to ${tabName}...`;
    }

    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab if it exists
    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.style.display = 'block';
        console.log(`Tab ${tabName} shown successfully`);
        if (debugInfo) {
            debugInfo.textContent = `Tab ${tabName} active`;
        }
    } else {
        console.error(`Tab element not found: ${tabName}`);
        if (debugInfo) {
            debugInfo.textContent = `ERROR: Tab ${tabName} not found`;
        }
    }

    // Add active class to clicked button if event exists
    if (event && event.target) {
        event.target.classList.add('active');
    }

    // Tab-specific initialization
    if (tabName === 'assets') {
        renderAssets();
        populateAssetSelect();
    } else if (tabName === 'fieldEntry') {
        renderFieldLogs();
        // Populate asset dropdown for field entry
        populateAssetSelect();
    } else if (tabName === 'photoGallery') {
        loadPhotoGallery();
    } else if (tabName === 'dailySummary') {
        initializeDailySummary();
        renderDailySummary();
    } else if (tabName === 'segments') {
        renderSegmentsTable();
    }
    // Note: simulation tab initialization removed from production UI
}

// ===============================
// PHOTO GALLERY FUNCTIONALITY
// ===============================

let galleryPhotos = [];
let filteredPhotos = [];
let thumbnailCache = {};

// Load photo gallery
window.loadPhotoGallery = function() {
    console.log('Loading photo gallery...');

    // Load photos from field logs
    galleryPhotos = [];
    fieldLogs.forEach(log => {
        if (log.photo_base64 && log.photo_base64.trim() !== '') {
            galleryPhotos.push({
                ...log,
                thumbnail: null
            });
        }
    });

    // Sort by date (newest first)
    galleryPhotos.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Populate segment filter
    populateSegmentFilter();

    // Apply initial filters
    applyFilters();

    // Add event listeners
    setupGalleryEventListeners();
};

// Setup gallery event listeners
function setupGalleryEventListeners() {
    // Filter change listeners
    ['filterSegment', 'filterWorkType', 'filterDateFrom', 'filterDateTo', 'filterSearch'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', applyFilters);
            if (id === 'filterSearch') {
                element.addEventListener('input', applyFilters);
            }
        }
    });

    // Refresh button
    const refreshBtn = document.getElementById('refreshGalleryBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadPhotoGallery();
        });
    }

    // Modal backdrop click to close
    const modal = document.getElementById('photoModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            // Only close if clicking the backdrop (not the modal content)
            if (e.target === modal) {
                closePhotoModal();
            }
        });

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closePhotoModal();
            }
        });
    }
}

// Populate segment filter dropdown
function populateSegmentFilter() {
    const segmentFilter = document.getElementById('filterSegment');
    if (!segmentFilter) return;

    // Get unique segments
    const uniqueSegments = [...new Set(galleryPhotos.map(photo => photo.segment_id))].sort();

    // Clear existing options (except "All Segments")
    segmentFilter.innerHTML = '<option value="all">All Segments</option>';

    // Add segment options
    uniqueSegments.forEach(segmentId => {
        const option = document.createElement('option');
        option.value = segmentId;
        option.textContent = segmentId;
        segmentFilter.appendChild(option);
    });
}

// Apply filters to photos
function applyFilters() {
    const segmentFilter = document.getElementById('filterSegment')?.value || 'all';
    const workTypeFilter = document.getElementById('filterWorkType')?.value || 'all';
    const dateFromFilter = document.getElementById('filterDateFrom')?.value;
    const dateToFilter = document.getElementById('filterDateTo')?.value;
    const searchFilter = document.getElementById('filterSearch')?.value.toLowerCase();

    // Filter photos
    filteredPhotos = galleryPhotos.filter(photo => {
        // Segment filter
        if (segmentFilter !== 'all' && photo.segment_id !== segmentFilter) {
            return false;
        }

        // Work type filter (from notes or segment type)
        if (workTypeFilter !== 'all') {
            const photoWorkType = getWorkTypeFromPhoto(photo);
            if (photoWorkType !== workTypeFilter) {
                return false;
            }
        }

        // Date filters
        if (dateFromFilter && photo.date < dateFromFilter) {
            return false;
        }
        if (dateToFilter && photo.date > dateToFilter) {
            return false;
        }

        // Search filter
        if (searchFilter) {
            const searchText = `${photo.segment_id} ${photo.notes || ''} ${photo.date}`.toLowerCase();
            if (!searchText.includes(searchFilter)) {
                return false;
            }
        }

        return true;
    });

    // Update photo count
    updatePhotoCount();

    // Render gallery
    renderPhotoGrid();
}

// Get work type from photo (simplified logic)
function getWorkTypeFromPhoto(photo) {
    // Try to extract work type from notes or segment
    const notes = (photo.notes || '').toLowerCase();
    const segmentId = (photo.segment_id || '').toLowerCase();

    // Check notes for work type keywords
    if (notes.includes('pccp') || notes.includes('concrete')) return 'PCCP';
    if (notes.includes('excavat')) return 'Excavation';
    if (notes.includes('backfill')) return 'Backfilling';
    if (notes.includes('compaction') || notes.includes('compact')) return 'Compaction';
    if (notes.includes('reinforce') || notes.includes('rebar')) return 'Reinforcement';
    if (notes.includes('formwork')) return 'Formworks';
    if (notes.includes('cure')) return 'Curing';

    // Default to PCCP for construction projects
    return 'PCCP';
}

// Update photo count display
function updatePhotoCount() {
    const countElement = document.getElementById('photoCount');
    const noPhotosElement = document.getElementById('noPhotosMessage');
    const gridElement = document.getElementById('photoGrid');

    if (filteredPhotos.length === 0) {
        countElement.textContent = 'No photos found';
        noPhotosElement.style.display = 'block';
        gridElement.style.display = 'none';
    } else {
        countElement.textContent = `Showing ${filteredPhotos.length} photo${filteredPhotos.length !== 1 ? 's' : ''}`;
        noPhotosElement.style.display = 'none';
        gridElement.style.display = 'grid';
    }
}

// Render photo grid
async function renderPhotoGrid() {
    const gridElement = document.getElementById('photoGrid');
    if (!gridElement || filteredPhotos.length === 0) return;

    // Clear existing grid
    gridElement.innerHTML = '';

    // Create photo thumbnails
    for (const photo of filteredPhotos) {
        const thumbnail = await createThumbnail(photo);
        gridElement.appendChild(thumbnail);
    }
}

// Create photo thumbnail element
async function createThumbnail(photo) {
    const thumbnail = document.createElement('div');
    thumbnail.className = 'photo-thumbnail';
    thumbnail.onclick = () => openPhotoModal(photo);

    // Get or generate thumbnail
    let thumbnailSrc = thumbnailCache[photo.entry_id];
    if (!thumbnailSrc) {
        thumbnailSrc = await generateThumbnail(photo.photo_base64);
        thumbnailCache[photo.entry_id] = thumbnailSrc;
    }

    // Get work type
    const workType = getWorkTypeFromPhoto(photo);

    thumbnail.innerHTML = `
        <img src="${thumbnailSrc}" alt="Field photo" class="thumbnail-image">
        <div class="thumbnail-info">
            <div class="thumbnail-date">${formatDate(photo.date)}</div>
            <div class="thumbnail-segment">
                <span>📍 ${photo.segment_id}</span>
            </div>
            <div class="thumbnail-work-type">${workType}</div>
        </div>
    `;

    return thumbnail;
}

// Generate thumbnail from base64 image (optimized for large photos)
function generateThumbnail(base64Image) {
    return new Promise((resolve) => {
        const img = new Image();

        // Add error handling and loading timeout
        const timeout = setTimeout(() => {
            resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiPkVycm9yPC90ZXh0PjwvcmVjdD48L3N2Zz4=');
        }, 5000);

        img.onload = () => {
            clearTimeout(timeout);

            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Set thumbnail size (200px max, maintain aspect ratio)
                const maxSize = 200;
                let width = img.width;
                let height = img.height;

                // Prevent division by zero
                if (width === 0 || height === 0) {
                    resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiPkltYWdlIEVycm9yPC90ZXh0PjwvcmVjdD48L3N2Zz4=');
                    return;
                }

                // Calculate aspect ratio
                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }

                // Limit canvas size to prevent memory issues
                const maxCanvasSize = 400;
                if (width > maxCanvasSize) {
                    height = (height * maxCanvasSize) / width;
                    width = maxCanvasSize;
                }
                if (height > maxCanvasSize) {
                    width = (width * maxCanvasSize) / height;
                    height = maxCanvasSize;
                }

                canvas.width = width;
                canvas.height = height;

                // Enable image smoothing for better quality
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw compressed image
                ctx.drawImage(img, 0, 0, width, height);

                // High compression to reduce file size
                const thumbnail = canvas.toDataURL('image/jpeg', 0.5);
                resolve(thumbnail);

            } catch (error) {
                console.error('Error generating thumbnail:', error);
                resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiPlRodW1ibmFpbCBFcnJvcjwvdGV4dD48L3JlY3Q+PC9zdmc+');
            }
        };

        img.onerror = () => {
            clearTimeout(timeout);
            console.error('Error loading image for thumbnail generation');
            resolve('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiPkxvYWRpbmcgRXJyb3I8L3RleHQ+PC9yZWN0Pjwvc3ZnPg==');
        };

        // Start with a reasonable timeout for loading
        setTimeout(() => {
            img.src = base64Image;
        }, 100);
    });
}

// Generate medium-sized image (2.5x larger than thumbnail) for modal viewing
function generateMediumImage(base64Image) {
    return new Promise((resolve) => {
        const img = new Image();

        // Add timeout for loading
        const timeout = setTimeout(() => {
            console.warn('Medium image generation timeout, falling back to thumbnail');
            const thumbnail = thumbnailCache[Object.keys(thumbnailCache)[0]] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiPkltZGl1bSBdXJuPC90ZXh0PjwvcmVjdD48L3N2Zz4=';
            resolve(thumbnail);
        }, 3000);

        img.onload = () => {
            clearTimeout(timeout);

            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Generate thumbnail first to get dimensions
                const thumbnailSize = 200;
                let thumbWidth, thumbHeight;

                // Get thumbnail dimensions first
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                let thumbW = img.width;
                let thumbH = img.height;

                if (thumbW > thumbH) {
                    if (thumbW > thumbnailSize) {
                        thumbH = (thumbH * thumbnailSize) / thumbW;
                        thumbW = thumbnailSize;
                    }
                } else {
                    if (thumbH > thumbnailSize) {
                        thumbW = (thumbW * thumbnailSize) / thumbH;
                        thumbH = thumbnailSize;
                    }
                }

                // Calculate medium size (2.5x larger than thumbnail)
                const mediumSize = Math.round(thumbnailSize * 2.5);
                const mediumWidth = Math.round(thumbW * 2.5);
                const mediumHeight = Math.round(thumbH * 2.5);

                // Limit medium image size to prevent memory issues
                const maxMediumSize = 600;
                let finalWidth = mediumWidth;
                let finalHeight = mediumHeight;

                if (mediumWidth > maxMediumSize) {
                    const aspectRatio = mediumHeight / mediumWidth;
                    finalWidth = maxMediumSize;
                    finalHeight = Math.round(maxMediumSize * aspectRatio);
                }
                if (finalHeight > maxMediumSize) {
                    const aspectRatio = mediumWidth / mediumHeight;
                    finalHeight = maxMediumSize;
                    finalWidth = Math.round(maxMediumSize * aspectRatio);
                }

                canvas.width = finalWidth;
                canvas.height = finalHeight;

                // Enable image smoothing for better quality
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw medium-sized image
                ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

                // Moderate compression for balance of quality and size
                const mediumImage = canvas.toDataURL('image/jpeg', 0.75);
                resolve(mediumImage);

            } catch (error) {
                console.error('Error generating medium image:', error);
                // Fallback to thumbnail
                const thumbnail = thumbnailCache[Object.keys(thumbnailCache)[0]] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiPkltZGl1bSBkXJuPC90ZXh0PjwvcmVjdD48L3N2Zz4=';
                resolve(thumbnail);
            }
        };

        img.onerror = () => {
            clearTimeout(timeout);
            console.error('Error loading image for medium image generation');
            // Fallback to thumbnail
            const thumbnail = thumbnailCache[Object.keys(thumbnailCache)[0]] || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiPk1ldW1kaW1lZCBFYXJyb3I8L3RleHQ+PC9yZWN0PjwvcmVjdD48L3N2Zz4=';
            resolve(thumbnail);
        };

        setTimeout(() => {
            img.src = base64Image;
        }, 100);
    });
}

// Open photo modal with full details
window.openPhotoModal = function(photo) {
    const modal = document.getElementById('photoModal');

    // Use the original full-size photo in modal (but enhanced)
    const modalImage = document.getElementById('modalImage');

    // Check if we have the original photo available
    if (photo.photo_base64 && photo.photo_base64 !== '') {
        // Generate medium-sized image from original (2.5x larger than thumbnail)
        generateMediumImage(photo.photo_base64).then(mediumImage => {
            modalImage.src = mediumImage;
        }).catch(error => {
            console.error('Error generating medium image:', error);
            // Fallback to cached thumbnail
            const cachedThumbnail = thumbnailCache[photo.entry_id];
            modalImage.src = cachedThumbnail || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiPk5vIFBob3RvPC90ZXh0PjwvcmVjdD48L3N2Zz4=';
        });
    } else {
        // Fallback to thumbnail if original not available
        const cachedThumbnail = thumbnailCache[photo.entry_id];
        modalImage.src = cachedThumbnail || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiPk5vIFBob3RvPC90ZXh0PjwvcmVjdD48L3N2Zz4=';
    }

    // Create horizontal details layout below photo
    const detailsContainer = document.getElementById('modalDetailsContainer');
    const detailsHtml = `
        <div style="text-align: center;">
            <strong style="color: #555; font-size: 14px;">📅 Date</strong><br>
            <span style="font-size: 16px;">${formatDate(photo.date)}</span>
        </div>
        <div style="text-align: center;">
            <strong style="color: #555; font-size: 14px;">📍 Segment</strong><br>
            <span style="font-size: 16px;">${photo.segment_id || 'N/A'}</span>
        </div>
        <div style="text-align: center;">
            <strong style="color: #555; font-size: 14px;">🔧 Work Type</strong><br>
            <span style="font-size: 16px;">${getWorkTypeFromPhoto(photo)}</span>
        </div>
        <div style="text-align: center;">
            <strong style="color: #555; font-size: 14px;">👥 Crew</strong><br>
            <span style="font-size: 16px;">${photo.crew_size || 'N/A'}</span>
        </div>
        <div style="text-align: center;">
            <strong style="color: #555; font-size: 14px;">☁️ Weather</strong><br>
            <span style="font-size: 16px;">${photo.weather || 'N/A'}</span>
        </div>
        <div style="text-align: center;">
            <strong style="color: #555; font-size: 14px;">📊 Progress</strong><br>
            <span style="font-size: 16px;">${photo.shift_output_blocks || 0} blocks</span>
        </div>
        ${photo.latitude && photo.longitude ? `
        <div style="text-align: center; grid-column: 1 / -1;">
            <strong style="color: #555; font-size: 14px;">🌍 GPS</strong><br>
            <span style="font-size: 16px;">${photo.latitude}, ${photo.longitude}</span>
        </div>
        ` : ''}
        ${photo.notes ? `
        <div style="text-align: center; grid-column: 1 / -1;">
            <strong style="color: #555; font-size: 14px;">📝 Notes</strong><br>
            <span style="font-size: 16px; word-wrap: break-word; max-width: 100%;">${photo.notes}</span>
        </div>
        ` : ''}
    `;

    detailsContainer.innerHTML = detailsHtml;

    // Show modal
    modal.style.display = 'flex';

    // Store current scroll position
    modal.dataset.scrollTop = window.pageYOffset;

    // Don't prevent body scroll - allow page to remain scrollable
};

// Close photo modal
window.closePhotoModal = function() {
    const modal = document.getElementById('photoModal');

    modal.style.display = 'none';

    // Restore scroll position if needed
    if (modal.dataset.scrollTop) {
        window.scrollTo(0, parseInt(modal.dataset.scrollTop));
        delete modal.dataset.scrollTop;
    }
};

// Format date for display
function formatDate(dateString) {
    if (!dateString) return 'N/A';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

// ===============================
// DAILY SUMMARY FUNCTIONALITY
// ===============================

let dailySummaryState = {
    selectedProject: null,
    selectedDate: null,
    aggregatedData: null
};

// Initialize Daily Summary tab
function initializeDailySummary() {
    // Set default date to today in Asia/Manila timezone
    const today = new Date();
    const manilaOffset = 8 * 60; // UTC+8 for Manila
    const manilaTime = new Date(today.getTime() + (manilaOffset * 60000) + today.getTimezoneOffset() * 60000);
    const todayString = manilaTime.toISOString().split('T')[0];

    const dateInput = document.getElementById('summaryDatePicker');
    if (dateInput) {
        dateInput.value = todayString;
        dailySummaryState.selectedDate = todayString;
    }

    // Populate project selector
    populateSummaryProjectSelector();

    // Setup event listeners
    setupDailySummaryListeners();
}

// Setup Daily Summary event listeners
function setupDailySummaryListeners() {
    // Project selector change
    const projectSelect = document.getElementById('summaryProjectSelect');
    if (projectSelect) {
        projectSelect.addEventListener('change', (e) => {
            dailySummaryState.selectedProject = e.target.value;
            renderDailySummary();
        });
    }

    // Date picker change
    const dateInput = document.getElementById('summaryDatePicker');
    if (dateInput) {
        dateInput.addEventListener('change', (e) => {
            dailySummaryState.selectedDate = e.target.value;
            renderDailySummary();
        });
    }

    // Previous/Next date buttons
    const prevBtn = document.getElementById('prevDateBtn');
    const nextBtn = document.getElementById('nextDateBtn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            changeDateByDays(-1);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            changeDateByDays(1);
        });
    }

    // Refresh/Sync button
    const refreshBtn = document.getElementById('refreshSummaryBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (isOnline()) {
                syncFromSupabase();
                renderDailySummary();
            } else {
                alert('You are currently offline. Showing cached data.');
            }
        });
    }

    // Download PDF button
    const pdfBtn = document.getElementById('downloadSummaryPdfBtn');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', () => {
            downloadDailySummaryPDF();
        });
    }
}

// Change date by +/- days
function changeDateByDays(days) {
    const dateInput = document.getElementById('summaryDatePicker');
    if (!dateInput || !dateInput.value) return;

    const currentDate = new Date(dateInput.value + 'T00:00:00');
    currentDate.setDate(currentDate.getDate() + days);

    const newDateString = currentDate.toISOString().split('T')[0];
    dateInput.value = newDateString;
    dailySummaryState.selectedDate = newDateString;

    renderDailySummary();
}

// Populate project selector for summary
function populateSummaryProjectSelector() {
    const projectSelect = document.getElementById('summaryProjectSelect');
    if (!projectSelect) return;

    // Clear existing options
    projectSelect.innerHTML = '<option value="">-- Select Project --</option>';

    // Add projects
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.project_id;
        option.textContent = `${project.project_id} - ${project.project_name || project.project_title || project.contract || project.project_id}`;
        projectSelect.appendChild(option);
    });

    // Set default to active project if available
    const activeProjectSelect = document.getElementById('projectSelect');
    if (activeProjectSelect && activeProjectSelect.value) {
        projectSelect.value = activeProjectSelect.value;
        dailySummaryState.selectedProject = activeProjectSelect.value;
    }
}

// Render Daily Summary
function renderDailySummary() {
    if (!dailySummaryState.selectedProject || !dailySummaryState.selectedDate) {
        // Show no activity message
        showNoActivity(false);
        return;
    }

    // Aggregate data for selected project and date
    dailySummaryState.aggregatedData = aggregateDailyData(dailySummaryState.selectedProject, dailySummaryState.selectedDate);

    if (!dailySummaryState.aggregatedData || dailySummaryState.aggregatedData.totalEntries === 0) {
        showNoActivity(true);
        return;
    }

    // Hide no activity message
    document.getElementById('noActivityMessage').style.display = 'none';
    document.getElementById('assetAccordions').style.display = 'block';
    document.getElementById('summaryTimeline').style.display = 'block';

    // Update KPI cards
    updateKPICards();

    // Render asset accordions
    renderAssetAccordions();

    // Render timeline
    renderTimeline();
}

// Aggregate daily data
function aggregateDailyData(projectId, date) {
    // Filter field logs by project and date
    const dayLogs = fieldLogs.filter(log => {
        if (log.project_id !== projectId) {
            return false;
        }

        // Simple date matching - compare YYYY-MM-DD format directly
        const logDateString = log.date.split('T')[0]; // This handles both YYYY-MM-DD and ISO formats
        return logDateString === date;
    });

    if (dayLogs.length === 0) {
        return {
            totalEntries: 0,
            uniqueAssets: [],
            assetWorkItems: {},
            photos: [],
            timeline: []
        };
    }

    // Aggregate data
    const assetWorkItems = {};
    const uniqueAssets = new Set();
    const photos = [];
    const timeline = [];

    dayLogs.forEach(log => {
        // Track unique assets
        uniqueAssets.add(log.asset_id);

        // Initialize asset in work items structure
        if (!assetWorkItems[log.asset_id]) {
            const asset = getAsset(log.asset_id);
            assetWorkItems[log.asset_id] = {
                assetInfo: asset || { asset_id: log.asset_id, name: 'Unknown Asset' },
                workItems: {},
                photos: [],
                totalQuantity: 0
            };
        }

        // Create work item key
        const workItemKey = log.item_code || log.work_type || 'unknown';

        // Initialize work item
        if (!assetWorkItems[log.asset_id].workItems[workItemKey]) {
            assetWorkItems[log.asset_id].workItems[workItemKey] = {
                item_code: log.item_code || '',
                work_type: log.work_type || 'Unknown',
                unit: log.unit || 'pcs', // Will be updated with work item definition unit
                entries: [],
                totalQuantity: 0,
                cumulative: 0,
                remaining: 0,
                target_total: null,
                photos: []
            };
        }

        // Add entry to work item
        const workItem = assetWorkItems[log.asset_id].workItems[workItemKey];
        workItem.entries.push(log);

        // CRITICAL FIX: Handle quantity_text for display and numeric value for calculations
        const quantityText = log.quantity_text || log.quantity_today || '0';
        const numericValue = parseFloat(log.quantity_today || 0);

        // Add numeric value for calculations (totaling, progress, etc.)
        workItem.totalQuantity += numericValue;

        // Store the original quantity text for display in Daily Summary
        if (!workItem.quantityDisplayTexts) {
            workItem.quantityDisplayTexts = [];
        }
        workItem.quantityDisplayTexts.push(quantityText);

        // Add to timeline
        timeline.push({
            timestamp: log.timestamp || log.date + 'T12:00:00',
            asset_id: log.asset_id,
            work_type: log.work_type,
            item_code: log.item_code,
            quantity_today: log.quantity_today,
            unit: log.unit,
            crew_size: log.crew_size,
            hash: log.hash || '',
            photo: log.photo_base64
        });

        // Handle photos
        if (log.photo_base64) {
            workItem.photos.push(log.photo_base64);
            assetWorkItems[log.asset_id].photos.push(log.photo_base64);
            photos.push({
                asset_id: log.asset_id,
                work_type: log.work_type,
                photo: log.photo_base64,
                timestamp: log.timestamp || log.date + 'T12:00:00'
            });
        }
    });

    // Calculate cumulative and remaining for work items with targets
    Object.keys(assetWorkItems).forEach(assetId => {
        Object.keys(assetWorkItems[assetId].workItems).forEach(workItemKey => {
            const workItem = assetWorkItems[assetId].workItems[workItemKey];

            // Find the original work item to get target_total
            const originalWorkItem = workItems.find(wi =>
                wi.asset_id === assetId &&
                (wi.item_code === workItem.item_code || wi.work_type === workItem.work_type)
            );

            if (originalWorkItem && originalWorkItem.target_total !== null) {
                workItem.target_total = originalWorkItem.target_total;
                workItem.cumulative = originalWorkItem.cumulative || 0;
                workItem.remaining = Math.max(0, workItem.target_total - workItem.cumulative);
                // Fix: Update unit from work item definition instead of using field log fallback
                workItem.unit = originalWorkItem.unit || workItem.unit;
            }
        });
    });

    // Sort timeline by timestamp (most recent first)
    timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return {
        totalEntries: dayLogs.length,
        uniqueAssets: Array.from(uniqueAssets),
        assetWorkItems: assetWorkItems,
        photos: photos,
        timeline: timeline.slice(0, 10) // Last 10 entries
    };
}

// Update KPI cards
function updateKPICards() {
    if (!dailySummaryState.aggregatedData) return;

    const data = dailySummaryState.aggregatedData;

    document.getElementById('kpiActiveAssets').textContent = data.uniqueAssets.length;
    document.getElementById('kpiWorkItems').textContent = Object.keys(data.assetWorkItems).reduce((total, assetId) => {
        return total + Object.keys(data.assetWorkItems[assetId].workItems).length;
    }, 0);
    document.getElementById('kpiPhotos').textContent = data.photos.length;
    document.getElementById('kpiEntries').textContent = data.totalEntries;
}

// Render asset accordions
function renderAssetAccordions() {
    const container = document.getElementById('assetAccordions');
    if (!container || !dailySummaryState.aggregatedData) return;

    container.innerHTML = '';

    const assetWorkItems = dailySummaryState.aggregatedData.assetWorkItems;
    const sortedAssetIds = Object.keys(assetWorkItems).sort((a, b) => {
        const assetA = assetWorkItems[a].assetInfo;
        const assetB = assetWorkItems[b].assetInfo;
        return (assetA.name || assetA.asset_id).localeCompare(assetB.name || assetB.asset_id);
    });

    sortedAssetIds.forEach(assetId => {
        const assetData = assetWorkItems[assetId];
        const accordion = createAssetAccordion(assetId, assetData);
        container.appendChild(accordion);
    });
}

// Create asset accordion
function createAssetAccordion(assetId, assetData) {
    const asset = assetData.assetInfo;
    const workItemCount = Object.keys(assetData.workItems).length;
    const photoCount = assetData.photos.length;

    const accordionDiv = document.createElement('div');
    accordionDiv.className = 'asset-accordion';

    accordionDiv.innerHTML = `
        <div class="accordion-header" onclick="toggleAccordion(this)">
            <div>
                <strong>${asset.name || asset.asset_id}</strong>
                <span style="color: #6b7280; font-size: 0.9rem;">(${formatAssetType(asset.asset_type || 'other')})</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color: #3b82f6;">${photoCount} photos</span>
                <span style="color: #059669;">${workItemCount} work items</span>
                <span class="accordion-arrow">▼</span>
            </div>
        </div>
        <div class="accordion-content">
            ${createWorkItemTable(assetId, assetData.workItems)}
        </div>
    `;

    return accordionDiv;
}

// Create work item table
function createWorkItemTable(assetId, workItems) {
    const sortedWorkItems = Object.keys(workItems).sort();

    let tableHTML = `
        <table class="work-item-table daily-summary-table" style="table-layout: fixed; width: 720px !important; max-width: 720px !important; min-width: 720px !important; border-collapse: collapse; background-color: transparent !important; font-size: 0.95rem !important;">
            <thead>
                <tr style="height: auto !important;">
                    <th style="width: 144px !important; max-width: 144px !important; min-width: 144px !important; background-color: #f8fafc !important; box-sizing: border-box !important; padding: 8px 6px !important; margin: 0px !important; font-size: 1rem !important; font-weight: 600 !important;">Work Item</th>
                    <th style="width: 103px !important; max-width: 103px !important; min-width: 103px !important; background-color: #f8fafc !important; box-sizing: border-box !important; padding: 8px 6px !important; margin: 0px !important; font-size: 1rem !important; font-weight: 600 !important;">Qty Today</th>
                    <th style="width: 173px !important; max-width: 173px !important; min-width: 173px !important; background-color: #f8fafc !important; box-sizing: border-box !important; padding: 8px 6px !important; margin: 0px !important; font-size: 1rem !important; font-weight: 600 !important;">Progress</th>
                    <th style="width: 115px !important; max-width: 115px !important; min-width: 115px !important; background-color: #f8fafc !important; box-sizing: border-box !important; padding: 8px 6px !important; margin: 0px !important; font-size: 1rem !important; font-weight: 600 !important;">Photos</th>
                    <th style="width: 121px !important; max-width: 121px !important; min-width: 121px !important; background-color: #f8fafc !important; box-sizing: border-box !important; padding: 8px 6px !important; margin: 0px !important; font-size: 1rem !important; font-weight: 600 !important;">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    sortedWorkItems.forEach(workItemKey => {
        const workItem = workItems[workItemKey];
        const progressText = workItem.target_total ?
            `${workItem.cumulative}/${workItem.target_total} ${workItem.unit} (${workItem.remaining} remaining)` :
            `${workItem.cumulative} ${workItem.unit} (no target set)`;

        tableHTML += `
            <tr>
                <td style="width: 144px !important; max-width: 144px !important; min-width: 144px !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box !important; padding: 8px 6px !important; margin: 0px !important; font-size: 0.9rem !important;">
                    ${workItem.item_code ? `<span class="work-item-code" style="font-size: 0.85rem !important;">${workItem.item_code}</span>` : ''}
                    ${workItem.work_type}
                </td>
                <td style="width: 103px !important; max-width: 103px !important; min-width: 103px !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box !important; padding: 8px 6px !important; margin: 0px !important; font-size: 0.9rem !important;" class="quantity-display">
                    ${workItem.quantityDisplayTexts && workItem.quantityDisplayTexts.length > 0
                        ? workItem.quantityDisplayTexts.slice(-3).join(', ') + (workItem.entries.length > 3 ? '...' : '')
                        : `${workItem.totalQuantity} ${workItem.unit}`}
                </td>
                <td style="width: 173px !important; max-width: 173px !important; min-width: 173px !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box !important; padding: 8px 6px !important; margin: 0px !important; font-size: 0.85rem !important;" class="progress-display">${progressText}</td>
                <td style="width: 115px !important; max-width: 115px !important; min-width: 115px !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box !important; padding: 12px 6px !important; margin: 0px !important; font-size: 0.9rem !important; height: auto !important; vertical-align: middle !important;">
                    <div class="thumbnail-row" style="gap: 4px !important; display: flex !important; justify-content: center !important; align-items: center !important; min-height: 80px !important;">
                        ${workItem.photos.slice(0, 2).map(photo =>
                            `<img src="${photo}" style="width: 90px !important; height: 80px !important; border-radius: 8px !important; margin: 0 !important; cursor: pointer !important; border: 1px solid #e5e7eb !important; object-fit: cover !important;" onclick="openPhotoModal('${assetId}', '${workItemKey}', '${photo}')">`
                        ).join('')}
                        ${workItem.photos.length > 2 ? `<span style="font-size: 0.85rem; color: #6b7280; align-self: center !important;">+${workItem.photos.length - 2}</span>` : ''}
                    </div>
                </td>
                <td style="width: 121px !important; max-width: 121px !important; min-width: 121px !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box !important; padding: 8px 6px !important; margin: 0px !important;">
                    <div class="action-buttons" style="display: flex !important; flex-direction: column !important; gap: 4px !important;">
                        <button class="btn-xs" style="padding: 4px 6px !important; font-size: 0.75rem !important; border-radius: 4px !important; line-height: 1.2 !important;" onclick="viewWorkItemEntries('${assetId}', '${workItemKey}')">View Entries</button>
                        <button class="btn-xs primary" style="padding: 4px 6px !important; font-size: 0.75rem !important; border-radius: 4px !important; line-height: 1.2 !important;" onclick="generateDayPDF('${assetId}', '${workItemKey}')">View PDF</button>
                    </div>
                </td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    return tableHTML;
}

// Render timeline
function renderTimeline() {
    const container = document.getElementById('summaryTimeline');
    if (!container || !dailySummaryState.aggregatedData) return;

    container.innerHTML = '';

    dailySummaryState.aggregatedData.timeline.forEach(entry => {
        const timelineItem = createTimelineItem(entry);
        container.appendChild(timelineItem);
    });
}

// Create timeline item
function createTimelineItem(entry) {
    const item = document.createElement('div');
    item.className = 'timeline-entry';

    const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const shortHash = entry.hash ? entry.hash.substring(0, 8) + '...' : '';
    const asset = getAsset(entry.asset_id);

    item.innerHTML = `
        <div class="timeline-time">${time}</div>
        <div class="timeline-content">
            <span class="timeline-asset">${asset ? (asset.name || asset.asset_id) : entry.asset_id}</span>
            <span class="timeline-work">${entry.work_type}</span>
            <span class="timeline-quantity">${entry.quantity_today || 0} ${entry.unit || 'pcs'}</span>
            <span class="timeline-crew">${entry.crew_size || 0} crew</span>
            <span class="timeline-hash">${shortHash}</span>
        </div>
        ${entry.photo ? `<img src="${entry.photo}" class="timeline-photo" onclick="openPhotoModal('${entry.asset_id}', '${entry.work_type}', '${entry.photo}')">` : ''}
    `;

    return item;
}

// Toggle accordion
function toggleAccordion(header) {
    header.classList.toggle('active');
    const content = header.nextElementSibling;
    content.classList.toggle('active');
}

// Show/hide no activity message
function showNoActivity(show) {
    const noActivityMsg = document.getElementById('noActivityMessage');
    const assetAccordions = document.getElementById('assetAccordions');
    const timeline = document.getElementById('summaryTimeline');
    const kpiCards = document.getElementById('summaryKpiCards');

    if (show) {
        noActivityMsg.style.display = 'block';
        assetAccordions.style.display = 'none';
        timeline.style.display = 'none';

        // Reset KPI cards to 0
        document.getElementById('kpiActiveAssets').textContent = '0';
        document.getElementById('kpiWorkItems').textContent = '0';
        document.getElementById('kpiPhotos').textContent = '0';
        document.getElementById('kpiEntries').textContent = '0';
    } else {
        noActivityMsg.style.display = 'none';
        assetAccordions.style.display = 'block';
        timeline.style.display = 'block';
    }
}

// Download Daily Summary PDF
function downloadDailySummaryPDF() {
    if (!dailySummaryState.aggregatedData || dailySummaryState.aggregatedData.totalEntries === 0) {
        alert('No data available for PDF generation');
        return;
    }

    // Implementation would go here to generate PDF using pdf_local.js
    // For now, show placeholder
    const project = projects.find(p => p.project_id === dailySummaryState.selectedProject);
    const projectName = project ? (project.contract || project.project_id) : dailySummaryState.selectedProject;

    alert(`PDF Generation:\n\nProject: ${projectName}\nDate: ${dailySummaryState.selectedDate}\n\nThis feature will be implemented in the next task.`);
}

// Check if online
function isOnline() {
    return navigator.onLine;
}

// Helper functions (to be implemented)
function openPhotoModal(assetId, workType, photo) {
    // Implementation would reuse existing photo modal
    console.log('Open photo modal:', assetId, workType, photo);
}

function viewWorkItemEntries(assetId, workItemKey) {
    // Implementation would filter and show specific work item entries
    console.log('View work item entries:', assetId, workItemKey);
}

function generateDayPDF(assetId, workItemKey) {
    // Implementation would generate PDF for specific asset/work item day
    console.log('Generate day PDF:', assetId, workItemKey);
}
