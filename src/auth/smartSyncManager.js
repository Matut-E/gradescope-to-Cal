/**
 * Smart Sync Manager Module
 * Detects new assignments after extraction and triggers immediate sync
 *
 * Prevents waiting 24 hours for new assignments by syncing right after extraction
 * Includes rate limiting to prevent excessive API calls
 *
 * Part of background.js refactoring
 */

class SmartSyncManager {
    constructor(config, calendarClient, eventCache) {
        this.config = config;
        this.calendarClient = calendarClient;
        this.eventCache = eventCache;

        // Rate limiting: minimum time between smart syncs (60 minutes)
        this.SMART_SYNC_COOLDOWN = 60 * 60 * 1000; // 60 minutes in milliseconds

        console.log('🧠 Smart Sync Manager initialized');
    }

    /**
     * Check if newly extracted assignments should trigger an immediate sync
     * @param {Array} extractedAssignments - Assignments just extracted from Gradescope
     * @returns {Object} - { shouldSync: boolean, newAssignments: Array, reason: string }
     */
    async checkForNewAssignments(extractedAssignments) {
        try {
            // Check rate limiting first
            const canSync = await this.checkRateLimit();
            if (!canSync.allowed) {
                console.log(`⏱️ Smart sync rate limited: ${canSync.reason}`);
                return {
                    shouldSync: false,
                    newAssignments: [],
                    reason: canSync.reason
                };
            }

            // Ensure event cache is fresh
            await this.eventCache.ensureCacheValid();

            // Filter for calendar-eligible assignments (upcoming, not submitted)
            const calendarEligible = extractedAssignments.filter(a =>
                a.dueDate && !a.isSubmitted
            );

            if (calendarEligible.length === 0) {
                return {
                    shouldSync: false,
                    newAssignments: [],
                    reason: 'No calendar-eligible assignments'
                };
            }

            // Check which assignments are NOT in the calendar yet
            const newAssignments = [];
            for (const assignment of calendarEligible) {
                const existsInCalendar = await this.eventCache.getExistingEvent(assignment.assignmentId);
                if (!existsInCalendar) {
                    newAssignments.push(assignment);
                }
            }

            if (newAssignments.length === 0) {
                console.log('✅ All extracted assignments already in calendar');
                return {
                    shouldSync: false,
                    newAssignments: [],
                    reason: 'All assignments already synced'
                };
            }

            console.log(`🆕 Found ${newAssignments.length} new assignments not in calendar:`);
            newAssignments.forEach(a => {
                console.log(`   • ${a.course}: ${a.title} (due: ${new Date(a.dueDate).toLocaleString()})`);
            });

            return {
                shouldSync: true,
                newAssignments: newAssignments,
                reason: `${newAssignments.length} new assignment(s) detected`
            };

        } catch (error) {
            console.error('❌ Error checking for new assignments:', error);
            return {
                shouldSync: false,
                newAssignments: [],
                reason: `Error: ${error.message}`
            };
        }
    }

    /**
     * Check if enough time has passed since last smart sync
     * @returns {Object} - { allowed: boolean, reason: string, timeSinceLastSync: number }
     */
    async checkRateLimit() {
        try {
            const storage = await browser.storage.local.get([
                'lastSmartSyncTimestamp',
                'last_auto_sync' // Regular 24-hour sync timestamp
            ]);

            const now = Date.now();
            const lastSmartSync = storage.lastSmartSyncTimestamp || 0;
            const timeSinceLastSync = now - lastSmartSync;

            // Allow smart sync if cooldown period has passed
            if (timeSinceLastSync >= this.SMART_SYNC_COOLDOWN) {
                return {
                    allowed: true,
                    reason: 'Rate limit check passed',
                    timeSinceLastSync: timeSinceLastSync
                };
            }

            // Calculate remaining cooldown time
            const remainingCooldown = this.SMART_SYNC_COOLDOWN - timeSinceLastSync;
            const remainingMinutes = Math.ceil(remainingCooldown / (60 * 1000));

            return {
                allowed: false,
                reason: `Rate limited: ${remainingMinutes} minutes remaining until next smart sync`,
                timeSinceLastSync: timeSinceLastSync
            };

        } catch (error) {
            console.error('❌ Error checking rate limit:', error);
            // On error, allow sync (fail open)
            return {
                allowed: true,
                reason: 'Rate limit check failed, allowing sync',
                timeSinceLastSync: 0
            };
        }
    }

    /**
     * Perform smart sync for new assignments
     * @param {Array} newAssignments - New assignments to sync
     * @returns {Object} - Sync results
     */
    async performSmartSync(newAssignments) {
        try {
            console.log(`🧠 Starting smart sync for ${newAssignments.length} new assignments...`);

            // Update last smart sync timestamp
            const syncTimestamp = new Date().toISOString();
            await browser.storage.local.set({
                lastSmartSyncTimestamp: Date.now(),
                lastSmartSync: syncTimestamp
            });

            // Perform the sync
            const results = await this.calendarClient.syncAssignments(newAssignments);

            console.log(`✅ Smart sync complete:`, results);

            // Also update last_auto_sync for consistency
            await browser.storage.local.set({
                last_auto_sync: syncTimestamp,
                last_sync_results: results,
                lastSyncType: 'smart' // Track that this was a smart sync
            });

            return {
                success: true,
                type: 'smart',
                results: results,
                timestamp: syncTimestamp
            };

        } catch (error) {
            console.error('❌ Smart sync failed:', error);

            await browser.storage.local.set({
                last_auto_sync_error: {
                    timestamp: new Date().toISOString(),
                    error: error.message,
                    type: 'smart_sync'
                }
            });

            return {
                success: false,
                error: error.message,
                type: 'smart'
            };
        }
    }

    /**
     * Get smart sync statistics
     * @returns {Object} - Stats about smart sync behavior
     */
    async getStats() {
        try {
            const storage = await browser.storage.local.get([
                'lastSmartSyncTimestamp',
                'lastSmartSync',
                'lastSyncType'
            ]);

            const now = Date.now();
            const lastSmartSync = storage.lastSmartSyncTimestamp || 0;
            const timeSinceLastSync = lastSmartSync ? now - lastSmartSync : null;
            const canSyncIn = lastSmartSync
                ? Math.max(0, this.SMART_SYNC_COOLDOWN - timeSinceLastSync)
                : 0;

            return {
                lastSmartSync: storage.lastSmartSync || null,
                lastSyncType: storage.lastSyncType || 'unknown',
                cooldownPeriod: this.SMART_SYNC_COOLDOWN,
                canSyncIn: canSyncIn,
                canSyncNow: canSyncIn === 0
            };

        } catch (error) {
            console.error('❌ Error getting smart sync stats:', error);
            return null;
        }
    }
}

// Expose for service worker context
if (typeof self !== 'undefined') {
    self.SmartSyncManager = SmartSyncManager;
}
