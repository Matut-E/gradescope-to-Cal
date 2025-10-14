/**
 * Auto-Sync Manager Module
 * Manages automatic background synchronization using Chrome alarms
 *
 * Schedules periodic syncs (default: 24 hours)
 * Tracks sync status and results
 *
 * Part of background.js refactoring
 */

class AutoSyncManager {
    constructor(config) {
        this.config = config;
    }

    async setupAutoSync() {
        await chrome.alarms.clear(this.config.ALARM_NAME);
        await chrome.alarms.create(this.config.ALARM_NAME, {
            delayInMinutes: this.config.AUTO_SYNC_INTERVAL,
            periodInMinutes: this.config.AUTO_SYNC_INTERVAL
        });
        console.log(`✅ Auto-sync scheduled every ${this.config.AUTO_SYNC_INTERVAL} minutes`);
    }

    async disableAutoSync() {
        await chrome.alarms.clear(this.config.ALARM_NAME);
        console.log('✅ Auto-sync disabled');
    }

    async getAutoSyncStatus() {
        const alarm = await chrome.alarms.get(this.config.ALARM_NAME);
        const storage = await chrome.storage.local.get(['last_auto_sync', 'last_sync_results', 'last_auto_sync_error']);

        return {
            enabled: !!alarm,
            interval: this.config.AUTO_SYNC_INTERVAL,
            nextSync: alarm ? new Date(alarm.scheduledTime).toISOString() : null,
            lastSync: storage.last_auto_sync || null,
            lastResults: storage.last_sync_results || null,
            lastError: storage.last_auto_sync_error || null
        };
    }
}

// Expose for service worker context
if (typeof self !== 'undefined') {
    self.AutoSyncManager = AutoSyncManager;
}
