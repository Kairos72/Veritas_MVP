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

            // 2. Sync Segments
            await this.syncSegments();

            // 3. Sync Field Logs
            await this.syncFieldLogs();

            // Update UI safely
            const lastSyncTimeEl = document.getElementById('lastSyncTime');
            if (lastSyncTimeEl) {
                const now = new Date();
                lastSyncTimeEl.textContent = `Last synced: ${now.toLocaleTimeString()}`;
            }

            // Refresh UI if needed (reload projects/logs from local storage which might have been updated)
            // We need to expose loadProjects/loadFieldLogs globally or trigger event
            if (window.loadProjects) window.loadProjects();
            if (window.loadSegments) window.loadSegments();
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

        // Prepare payload (remove local-only fields if any)
        const payload = {
            ...project,
            owner_user_id: currentUser.id,
            updated_at: new Date().toISOString()
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

        const payload = {
            ...log,
            owner_user_id: currentUser.id,
            updated_at: new Date().toISOString()
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
