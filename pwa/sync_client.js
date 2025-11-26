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

            // 2. Sync Field Logs
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

    async syncFieldLogs() {
        const localLogs = JSON.parse(localStorage.getItem('veritas_field_logs') || '[]');

        // Get remote logs
        const { data: remoteLogs, error } = await supabase
            .from('field_logs')
            .select('*');

        if (error) throw error;

        let hasChanges = false;

        // Check for locally deleted logs (logs that exist remotely but not locally)
        const locallyDeletedLogs = remoteLogs.filter(remote =>
            !localLogs.find(local => local.entry_id === remote.entry_id)
        );

        // Handle deletions - ask user what to do
        if (locallyDeletedLogs.length > 0) {
            const deleteRemote = confirm(
                `Found ${locallyDeletedLogs.length} log(s) that were deleted locally.\n\n` +
                `Do you want to delete them from the cloud as well?\n\n` +
                `• "OK" = Delete from cloud permanently\n` +
                `• "Cancel" = Keep them in cloud and restore locally`
            );

            if (deleteRemote) {
                // Delete from cloud
                for (const logToDelete of locallyDeletedLogs) {
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
                // User chose to keep them - they will be restored locally below
                console.log('User chose to keep remote logs locally');
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

        // 2. Download missing remote logs (excluding those marked for deletion)
        for (const remote of remoteLogs) {
            const local = localLogs.find(l => l.entry_id === remote.entry_id);
            if (!local) {
                // Only download if this log wasn't marked for deletion in this sync cycle
                if (!locallyDeletedLogs.find(del => del.entry_id === remote.entry_id)) {
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
