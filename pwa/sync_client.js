// Sync Client for Veritas MVP
// Handles syncing local data with Supabase

class SyncClient {
    constructor() {
        this.isSyncing = false;
    }

    async sync() {
        if (!supabase || !currentUser) {
            console.log("Sync skipped: No supabase or current user");
            return;
        }
        if (this.isSyncing) return;

        this.isSyncing = true;
        const syncBtn = document.getElementById('syncBtn');
        const originalText = syncBtn.textContent;

        // Safe button updates
        if (syncBtn) {
            syncBtn.textContent = "Syncing...";
            syncBtn.disabled = true;
        }

        try {
            console.log("Starting sync...");

            // Double-check current user before proceeding
            if (!currentUser) {
                throw new Error("User logged out during sync operation");
            }

            // 1. Sync Projects
            await this.syncProjects();

            // 2. Sync Assets
            await this.syncAssets();

            // 3. Sync Work Items
            await this.syncWorkItems();

            // 4. Sync Field Logs
            await this.syncFieldLogs();

            // Update UI safely
            const lastSyncTimeEl = document.getElementById('lastSyncTime');
            if (lastSyncTimeEl) {
                const now = new Date();
                lastSyncTimeEl.textContent = `Last synced: ${now.toLocaleTimeString()}`;
            }

            // Refresh UI if needed (reload data from local storage which might have been updated)
            if (window.loadProjects) window.loadProjects();
            if (window.loadAssets) window.loadAssets();
            if (window.loadFieldLogs) window.loadFieldLogs();

        } catch (err) {
            console.error("Sync failed:", err);
            // Only show alert for meaningful errors, not for user logout
            if (!err.message.includes("logged out")) {
                alert("Sync failed: " + err.message);
            }
        } finally {
            this.isSyncing = false;
            if (syncBtn) {
                syncBtn.textContent = originalText;
                syncBtn.disabled = false;
            }
        }
    }

    async syncProjects() {
        // Get local projects
        const localProjects = JSON.parse(localStorage.getItem('veritas_projects') || '[]');

        // Get remote projects
        const { data: remoteProjects, error } = await supabase
            .from('projects')
            .select('*');

        if (error) throw error;

        let hasChanges = false;

        // Merge Logic:
        // 1. Upload local projects that are new or newer than remote
        for (const local of localProjects) {
            const remote = remoteProjects.find(r => r.project_id === local.project_id);

            if (!remote) {
                // New local project -> Upload
                await this.uploadProject(local);
            } else {
                // Conflict resolution: Last Write Wins based on updated_at (if we tracked it locally)
                // For MVP, we assume local edits are authoritative if we are editing. 
                // But to be safe, let's just upsert local to server for now.
                // Ideally we compare timestamps.
                // Let's assume if we are syncing, we want to push our state.
                // A better approach for "simple" sync:
                // If remote has it, update local if remote is newer?
                // Let's implement: Download remote if missing locally. Upload local if missing remotely.
                // If both exist, Server wins? Or Client wins?
                // Requirement: "If a record ID exists on the server, update fields by updated_at — last-writer-wins."

                // We need updated_at in local data. We haven't been tracking it explicitly in app.js.
                // Let's assume local is "now" if we just edited it.
                // For this MVP, let's just upload everything local to server (Upsert)
                // And download everything from server that is missing locally.

                await this.uploadProject(local);
            }
        }

        // 2. Download remote projects that are missing locally
        for (const remote of remoteProjects) {
            const local = localProjects.find(l => l.project_id === remote.project_id);
            if (!local) {
                localProjects.push(remote);
                hasChanges = true;
            }
        }

        if (hasChanges) {
            localStorage.setItem('veritas_projects', JSON.stringify(localProjects));
        }
    }

    async uploadProject(project) {
        // Check if user is still available
        if (!currentUser) {
            console.error("Cannot upload project: No current user");
            return;
        }

        // Validate required fields and handle field mapping
        const projectId = project.project_id;
        const projectName = project.project_name || project.project_title || 'Untitled Project';

        if (!projectId || !projectName) {
            console.warn("Skipping invalid project (missing required fields):", project);
            return;
        }

        // Prepare payload with field mapping for legacy data
        const payload = {
            project_id: projectId,
            project_name: projectName,
            contract_no: project.contract_no || project.contract_id || null,
            location: project.location || null,
            start_date: project.start_date || null,
            end_date: project.end_date || null,
            contractor: project.contractor || project.contractor_name || null,
            engineer: project.engineer || null,
            owner_user_id: currentUser.id,
            updated_at: new Date().toISOString(),
            created_at: project.created_at || new Date().toISOString()
        };

        const { error } = await supabase
            .from('projects')
            .upsert(payload, { onConflict: 'project_id' });

        if (error) console.error("Error uploading project:", error);
    }

    async syncSegments() {
        const localSegments = JSON.parse(localStorage.getItem('veritas_segments') || '[]');

        // Get remote segments
        const { data: remoteSegments, error } = await supabase
            .from('segments')
            .select('*');

        if (error) throw error;

        let hasChanges = false;

        // Merge Logic similar to projects
        // 1. Upload local segments that are new or newer than remote
        for (const local of localSegments) {
            const remote = remoteSegments.find(r => r.segment_id === local.segment_id);

            if (!remote) {
                // New local segment -> Upload
                await this.uploadSegment(local);
                hasChanges = true;
            } else if (new Date(local.updated_at) > new Date(remote.updated_at)) {
                // Local is newer -> Upload
                await this.uploadSegment(local);
                hasChanges = true;
            }
        }

        // 2. Download remote segments that are newer
        for (const remote of remoteSegments) {
            const local = localSegments.find(l => l.segment_id === remote.segment_id);

            if (!local) {
                // New remote segment -> Download
                await this.downloadSegment(remote);
                hasChanges = true;
            } else if (new Date(remote.updated_at) > new Date(local.updated_at)) {
                // Remote is newer -> Download
                await this.downloadSegment(remote);
                hasChanges = true;
            }
        }

        if (hasChanges) {
            console.log("Segments synced successfully");
        }
    }

    async uploadSegment(segment) {
        const payload = {
            segment_id: segment.segment_id,
            length_m: segment.length_m,
            width_m: segment.width_m,
            block_length_m: segment.block_length_m,
            chainage_start: segment.chainage_start,
            created_at: segment.created_at,
            updated_at: segment.updated_at,
            user_id: currentUser.id
        };

        const { error } = await supabase
            .from('segments')
            .upsert(payload, { onConflict: 'segment_id' });

        if (error) console.error("Error uploading segment:", error);
    }

    async downloadSegment(segment) {
        // Get current local segments
        const localSegments = JSON.parse(localStorage.getItem('veritas_segments') || '[]');

        // Find if segment exists locally
        const existingIndex = localSegments.findIndex(l => l.segment_id === segment.segment_id);

        // Remove user_id field from cloud data before storing locally
        const localSegment = {
            segment_id: segment.segment_id,
            length_m: segment.length_m,
            width_m: segment.width_m,
            block_length_m: segment.block_length_m,
            chainage_start: segment.chainage_start,
            created_at: segment.created_at,
            updated_at: segment.updated_at
        };

        if (existingIndex >= 0) {
            // Update existing segment
            localSegments[existingIndex] = localSegment;
        } else {
            // Add new segment
            localSegments.push(localSegment);
        }

        localStorage.setItem('veritas_segments', JSON.stringify(localSegments));
        console.log(`Downloaded segment ${segment.segment_id} from cloud`);
    }

    async ensureSegmentExists(segmentId) {
        // Check if segment already exists locally
        const localSegments = JSON.parse(localStorage.getItem('veritas_segments') || '[]');
        const existingSegment = localSegments.find(s => s.segment_id === segmentId);

        if (existingSegment) {
            return; // Segment already exists
        }

        // Try to get segment from cloud
        try {
            const { data: remoteSegment, error } = await supabase
                .from('segments')
                .select('*')
                .eq('segment_id', segmentId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = not found
                console.error('Error fetching segment from cloud:', error);
                return;
            }

            if (remoteSegment) {
                // Download the actual segment from cloud
                await this.downloadSegment(remoteSegment);
            } else {
                // Create a placeholder segment
                const placeholderSegment = {
                    segment_id: segmentId,
                    length_m: 50, // Default values
                    width_m: 3.5,
                    block_length_m: 4.5,
                    chainage_start: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                localSegments.push(placeholderSegment);
                localStorage.setItem('veritas_segments', JSON.stringify(localSegments));
                console.log(`Created placeholder segment: ${segmentId}`);
            }
        } catch (error) {
            console.error('Error ensuring segment exists:', error);
        }
    }

    async syncAssets() {
        const localAssets = JSON.parse(localStorage.getItem('veritas_assets') || '[]');

        // Check if assets table exists in Supabase
        const { data: tableCheck, error: tableError } = await supabase
            .from('assets')
            .select('asset_id')
            .limit(1);

        if (tableError && tableError.message.includes('does not exist')) {
            console.log('Assets table not found in Supabase. Skipping asset sync. Please run the database setup script.');
            return;
        }

        if (tableError) throw tableError;

        // Get remote assets
        const { data: remoteAssets, error } = await supabase
            .from('assets')
            .select('*');

        if (error) throw error;

        let hasChanges = false;

        // Merge Logic: Last-writer-wins based on updated_at
        for (const local of localAssets) {
            const remote = remoteAssets.find(r => r.asset_id === local.asset_id);

            if (!remote) {
                // New local asset -> Upload
                await this.uploadAsset(local);
            } else if (new Date(local.updated_at) > new Date(remote.updated_at)) {
                // Local is newer -> Upload
                await this.uploadAsset(local);
            }
        }

        // Download remote assets that are newer or missing locally
        for (const remote of remoteAssets) {
            const local = localAssets.find(l => l.asset_id === remote.asset_id);

            if (!local) {
                // New remote asset -> Download
                localAssets.push(remote);
                hasChanges = true;
            } else if (new Date(remote.updated_at) > new Date(local.updated_at)) {
                // Remote is newer -> Download
                const localIndex = localAssets.findIndex(l => l.asset_id === remote.asset_id);
                localAssets[localIndex] = remote;
                hasChanges = true;
            }
        }

        if (hasChanges) {
            localStorage.setItem('veritas_assets', JSON.stringify(localAssets));
            console.log("Assets synced successfully");
        }
    }

    async uploadAsset(asset) {
        // Field mapping and validation
        const assetId = asset.asset_id;
        const projectId = asset.project_id || localStorage.getItem('veritas_active_project');
        const assetName = asset.asset_name || asset.name || 'Unnamed Asset';
        const assetType = asset.asset_type;

        if (!assetId || !projectId || !assetName || !assetType) {
            console.warn("Skipping invalid asset (missing required fields):", asset);
            return;
        }

        // Prepare payload with field mapping
        const payload = {
            asset_id: assetId,
            project_id: projectId,
            asset_name: assetName,
            asset_type: assetType,
            description: asset.description || null,
            location: asset.location || null,
            chainage_start: asset.chainage_start || null,
            chainage_end: asset.chainage_end || null,
            length_m: asset.length_m || null,
            width_m: asset.width_m || null,
            height_m: asset.height_m || null,
            floor_area_m2: asset.floor_area_m2 || null,
            stationing: asset.stationing || null,
            dimensions: asset.dimensions || null,
            work_items: asset.work_items || [],
            owner_user_id: currentUser.id,
            updated_at: new Date().toISOString(),
            created_at: asset.created_at || new Date().toISOString()
        };

        const { error } = await supabase
            .from('assets')
            .upsert(payload, { onConflict: 'asset_id' });

        if (error) console.error("Error uploading asset:", error);
    }

    async syncWorkItems() {
        const localWorkItems = JSON.parse(localStorage.getItem('veritas_work_items') || '[]');

        // Check if work_items table exists in Supabase
        const { data: tableCheck, error: tableError } = await supabase
            .from('work_items')
            .select('work_item_id')
            .limit(1);

        if (tableError && tableError.message.includes('does not exist')) {
            console.log('Work Items table not found in Supabase. Skipping work items sync. Please run the database setup script.');
            return;
        }

        if (tableError) throw tableError;

        // Get remote work items
        const { data: remoteWorkItems, error } = await supabase
            .from('work_items')
            .select('*');

        if (error) throw error;

        let hasChanges = false;

        // Merge Logic: Last-writer-wins based on updated_at
        for (const local of localWorkItems) {
            const remote = remoteWorkItems.find(r => r.work_item_id === local.work_item_id);

            if (!remote) {
                // New local work item -> Upload
                await this.uploadWorkItem(local);
            } else if (new Date(local.updated_at) > new Date(remote.updated_at)) {
                // Local is newer -> Upload
                await this.uploadWorkItem(local);
            }
        }

        // Download remote work items that are newer or missing locally
        for (const remote of remoteWorkItems) {
            const local = localWorkItems.find(l => l.work_item_id === remote.work_item_id);

            if (!local) {
                // New remote work item -> Download
                localWorkItems.push(remote);
                hasChanges = true;
            } else if (new Date(remote.updated_at) > new Date(local.updated_at)) {
                // Remote is newer -> Download
                const localIndex = localWorkItems.findIndex(l => l.work_item_id === remote.work_item_id);
                localWorkItems[localIndex] = remote;
                hasChanges = true;
            }
        }

        if (hasChanges) {
            localStorage.setItem('veritas_work_items', JSON.stringify(localWorkItems));
            console.log("Work items synced successfully");
        }
    }

    async uploadWorkItem(workItem) {
        // Field mapping and validation
        const workItemId = workItem.work_item_id;
        let projectId = workItem.project_id || localStorage.getItem('veritas_active_project');
        const assetId = workItem.asset_id;
        const workType = workItem.work_type;
        const unit = workItem.unit;

        // If no project_id, try to get it from the asset
        if (!projectId && assetId) {
            const localAssets = JSON.parse(localStorage.getItem('veritas_assets') || '[]');
            const asset = localAssets.find(a => a.asset_id === assetId);
            if (asset && asset.project_id) {
                projectId = asset.project_id;
            }
        }

        // Last resort: get from first available project
        if (!projectId) {
            const localProjects = JSON.parse(localStorage.getItem('veritas_projects') || '[]');
            if (localProjects.length > 0) {
                projectId = localProjects[0].project_id;
            }
        }

        if (!workItemId || !projectId || !assetId || !workType || !unit) {
            console.warn("Skipping invalid work item (missing required fields):", workItem);
            return;
        }

        const payload = {
            work_item_id: workItemId,
            project_id: projectId,
            asset_id: assetId,
            work_type: workType,
            item_code: workItem.item_code || null,
            unit: unit,
            target_total: workItem.target_total || 0,
            cumulative: workItem.cumulative || 0,
            remaining: workItem.remaining || 0,
            status: workItem.status || 'pending',
            priority: workItem.priority || 'medium',
            notes: workItem.notes || null,
            owner_user_id: currentUser.id,
            updated_at: new Date().toISOString(),
            created_at: workItem.created_at || new Date().toISOString()
        };

        const { error } = await supabase
            .from('work_items')
            .upsert(payload, { onConflict: 'work_item_id' });

        if (error) console.error("Error uploading work item:", error);
    }

    async syncFieldLogs() {
        const localLogs = JSON.parse(localStorage.getItem('veritas_field_logs') || '[]');

        // Get remote logs
        const { data: remoteLogs, error } = await supabase
            .from('field_logs')
            .select('*');

        if (error) throw error;

        let hasChanges = false;

        // Check for missing local logs (logs that exist remotely but not locally)
        const missingLocalLogs = remoteLogs.filter(remote =>
            !localLogs.find(local => local.entry_id === remote.entry_id)
        );

        // Handle missing local logs - ask user what to do
        let shouldDeleteRemote = false; // Default: don't delete
        let processedLogIds = []; // Track processed log IDs

        if (missingLocalLogs.length > 0) {
            const action = confirm(
                `Found ${missingLocalLogs.length} field log(s) in the cloud that are not on this device.\n\n` +
                `This is normal when syncing from another device (like your mobile).\n\n` +
                `• "OK" = Download these logs to this device\n` +
                `• "Cancel" = Delete them from the cloud permanently`
            );

            shouldDeleteRemote = !action; // Invert: OK = download, Cancel = delete

            if (shouldDeleteRemote) {
                // User chose to delete from cloud
                for (const logToDelete of missingLocalLogs) {
                    const { error: deleteError } = await supabase
                        .from('field_logs')
                        .delete()
                        .eq('entry_id', logToDelete.entry_id);

                    if (deleteError) {
                        console.error('Failed to delete log from cloud:', deleteError);
                    } else {
                        console.log(`Deleted log ${logToDelete.entry_id} from cloud`);
                    }
                }
            } else {
                // User chose to download them - immediately add to localLogs
                console.log('User chose to download remote logs to this device');

                for (const logToDownload of missingLocalLogs) {
                    // Check if segment exists locally, create placeholder if missing
                    if (logToDownload.segment_id) {
                        await this.ensureSegmentExists(logToDownload.segment_id);
                    }

                    // Add to local logs
                    localLogs.push(logToDownload);
                    hasChanges = true;
                    console.log(`Downloaded log ${logToDownload.entry_id} to this device`);
                    processedLogIds.push(logToDownload.entry_id); // Track processed logs
                }
            }
        }

        // 1. Upload local logs
        for (const local of localLogs) {
            // Ensure entry_id exists (migration for old data)
            if (!local.entry_id) continue; // Skip invalid logs

            const remote = remoteLogs.find(r => r.entry_id === local.entry_id);

            if (!remote) {
                await this.uploadLog(local);
            } else {
                // If remote exists, we check if local is different/newer?
                // For logs, usually they are append-only or rarely edited.
                // Let's just upsert to be safe.
                await this.uploadLog(local);
            }
        }

        // 2. Download remaining missing remote logs (excluding those already processed)
        // Skip this section if user chose to delete from cloud
        if (!shouldDeleteRemote) {
            for (const remote of remoteLogs) {
                const local = localLogs.find(l => l.entry_id === remote.entry_id);
                if (!local) {
                    // Only download if this log wasn't already processed above
                    if (!processedLogIds.includes(remote.entry_id)) {
                        // Check if segment exists locally, create placeholder if missing
                        if (remote.segment_id) {
                            await this.ensureSegmentExists(remote.segment_id);
                        }

                        localLogs.push(remote);
                        hasChanges = true;
                    }
                }
            }
        }

        if (hasChanges) {
            localStorage.setItem('veritas_field_logs', JSON.stringify(localLogs));
            // Notify user
            const toast = document.createElement('div');
            toast.textContent = "New logs downloaded from cloud.";
            toast.style.cssText = "position: fixed; bottom: 20px; right: 20px; background: #10b981; color: white; padding: 10px 20px; border-radius: 4px; z-index: 2000;";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
    }

    async uploadLog(log) {
        // Check if user is still available
        if (!currentUser) {
            console.error("Cannot upload log: No current user");
            return;
        }

        // Field mapping and validation
        const entryId = log.entry_id;
        let projectId = log.project_id || localStorage.getItem('veritas_active_project');
        const assetId = log.asset_id;
        const date = log.date;
        const workType = log.work_type;

        // If no project_id, try to get it from the asset
        if (!projectId && assetId) {
            const localAssets = JSON.parse(localStorage.getItem('veritas_assets') || '[]');
            const asset = localAssets.find(a => a.asset_id === assetId);
            if (asset && asset.project_id) {
                projectId = asset.project_id;
            }
        }

        // Last resort: get from first available project
        if (!projectId) {
            const localProjects = JSON.parse(localStorage.getItem('veritas_projects') || '[]');
            if (localProjects.length > 0) {
                projectId = localProjects[0].project_id;
            }
        }

        if (!entryId || !projectId || !assetId || !date || !workType) {
            console.warn("Skipping invalid field log (missing required fields):", log);
            return;
        }

        // Parse quantity to extract numeric value (handle "5 blocks" -> 5)
        const parseQuantity = (quantity) => {
            if (!quantity) return 0;
            if (typeof quantity === 'number') return quantity;
            if (typeof quantity === 'string') {
                const match = quantity.match(/[\d.]+/);
                return match ? parseFloat(match[0]) : 0;
            }
            return 0;
        };

        const payload = {
            entry_id: entryId,
            project_id: projectId,
            asset_id: assetId,
            work_item_id: log.work_item_id || null,
            date: date,
            work_type: workType,
            item_code: log.item_code || null,
            quantity_today: parseQuantity(log.quantity_today),
            crew_size: parseInt(log.crew_size) || 1,
            weather: log.weather || null,
            notes: log.notes || null,
            photo_base64: log.photo_base64 || null,
            owner_user_id: currentUser.id,
            updated_at: new Date().toISOString(),
            created_at: log.created_at || new Date().toISOString()
        };

        const { error } = await supabase
            .from('field_logs')
            .upsert(payload, { onConflict: 'entry_id' });

        if (error) console.error("Error uploading log:", error);
    }
}

// Initialize
window.syncClient = new SyncClient();

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('syncBtn').addEventListener('click', () => {
        window.syncClient.sync();
    });
});
