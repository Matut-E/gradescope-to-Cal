/**
 * Calendar API Client Module
 * Handles all Google Calendar API operations
 *
 * Creates events, syncs assignments, performs background sync
 * Uses TokenManager for authentication and EventCache for performance
 *
 * Part of background.js refactoring
 */

class CalendarAPIClient {
    constructor(config, tokenManager, authenticationManager) {
        this.config = config;
        this.tokenManager = tokenManager;
        this.authManager = authenticationManager;
        this.eventCache = new EventCache(this);
    }

    // ============================================================================
    // CALENDAR API OPERATIONS
    // ============================================================================

    async makeAPIRequest(endpoint, options = {}) {
        const token = await this.tokenManager.getValidToken(
            () => this.authManager.getChromeToken()
        );

        const url = `${this.config.CALENDAR_API_BASE}${endpoint}`;
        const requestOptions = {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const response = await fetch(url, requestOptions);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error: ${response.status} ${response.statusText}`, errorText);

            if (response.status === 401) {
                this.tokenManager.setTokens(null, this.tokenManager.refreshToken, 0, this.tokenManager.getAuthMethod());
            }

            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    async createEventFromAssignment(assignment) {
        const dueDate = new Date(assignment.dueDate);

        // Use detected timezone (Tier 1/2) or fallback to Pacific Time
        const timezone = assignment.timezone || 'America/Los_Angeles';
        console.log(`🌍 Using timezone: ${timezone} ${assignment.timezone ? '(detected)' : '(fallback)'}`);

        // Load user settings for reminders and color
        let eventColorId = '9'; // Default Blueberry
        let createReminders = true; // Default true

        try {
            const localSettings = await chrome.storage.local.get(['settings_create_reminders']);
            const syncSettings = await chrome.storage.sync.get(['eventColorId']);

            eventColorId = syncSettings.eventColorId || '9';
            createReminders = localSettings.settings_create_reminders !== false;

            console.log('🎨 Using event color ID:', eventColorId);
            console.log('🔔 Create reminders:', createReminders);
        } catch (error) {
            console.warn('⚠️ Failed to load settings, using defaults:', error);
        }

        const event = {
            summary: `${assignment.course}: ${assignment.title}`,
            description: `Gradescope Assignment: ${assignment.title}\n\nCourse: ${assignment.course}\n\nDue: ${dueDate.toLocaleString('en-US', {
                timeZone: timezone,
                dateStyle: 'full',
                timeStyle: 'short'
            })}\n\nSubmit at: ${assignment.url}\n\nExtracted from: ${assignment.pageUrl}`,

            // Use timed event with actual due time for accurate reminders
            start: {
                dateTime: dueDate.toISOString(),
                timeZone: timezone
            },
            end: {
                dateTime: dueDate.toISOString(),
                timeZone: timezone
            },

            location: 'Gradescope',
            source: {
                title: 'Gradescope',
                url: assignment.url
            },
            extendedProperties: {
                private: {
                    gradescope_assignment_id: assignment.assignmentId,
                    gradescope_course: assignment.course,
                    gradescope_url: assignment.url,
                    gradescope_due_time: assignment.dueDate
                }
            },
            colorId: eventColorId
        };

        // Add reminders if enabled (now accurate to actual due time)
        if (createReminders) {
            event.reminders = {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 1440 },  // 24 hours before actual due time
                    { method: 'popup', minutes: 60 }      // 1 hour before actual due time
                ]
            };
        }

        const response = await this.makeAPIRequest('/calendars/primary/events', {
            method: 'POST',
            body: JSON.stringify(event)
        });

        this.eventCache.invalidateAssignment(assignment.assignmentId);
        return response;
    }

    async findExistingEvent(assignmentId) {
        try {
            return await this.eventCache.getExistingEvent(assignmentId);
        } catch (error) {
            console.error(`❌ Error finding event ${assignmentId}:`, error.message);
            return null;
        }
    }

    async syncAssignments(assignments) {
        const results = {
            created: 0,
            skipped: 0,
            errors: 0,
            details: []
        };

        for (const assignment of assignments) {
            try {
                if (!assignment.dueDate) {
                    results.skipped++;
                    results.details.push({
                        assignment: assignment.title,
                        status: 'skipped',
                        reason: 'No due date'
                    });
                    continue;
                }

                const existingEvent = await this.findExistingEvent(assignment.assignmentId);

                if (existingEvent) {
                    results.skipped++;
                    results.details.push({
                        assignment: assignment.title,
                        status: 'skipped',
                        reason: 'Already exists',
                        eventId: existingEvent.id
                    });
                    continue;
                }

                await this.createEventFromAssignment(assignment);
                results.created++;
                results.details.push({
                    assignment: assignment.title,
                    status: 'created',
                    dueDate: assignment.dueDate
                });

                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`❌ Failed to sync ${assignment.title}:`, error);
                results.errors++;
                results.details.push({
                    assignment: assignment.title,
                    status: 'error',
                    error: error.message
                });
            }
        }

        return results;
    }

    async performBackgroundSync() {
        try {
            const authStatus = await this.authManager.getAuthStatus();
            if (!authStatus.authenticated) {
                return {
                    success: false,
                    reason: 'Authentication needed',
                    needsReauth: true,
                    silent: true
                };
            }

            try {
                await this.tokenManager.getValidToken(
                    () => this.authManager.getChromeToken()
                );
            } catch (error) {
                return {
                    success: false,
                    reason: 'Authentication expired',
                    needsReauth: true,
                    silent: true
                };
            }

            const assignments = await this.getAllStoredAssignments();
            if (assignments.length === 0) {
                await chrome.storage.local.set({
                    last_auto_sync: new Date().toISOString(),
                    last_sync_results: { created: 0, skipped: 0, errors: 0 }
                });
                return {
                    success: true,
                    reason: 'No assignments to sync',
                    results: { created: 0, skipped: 0, errors: 0 }
                };
            }

            const results = await this.syncAssignments(assignments);

            await chrome.storage.local.set({
                last_auto_sync: new Date().toISOString(),
                last_sync_results: results
            });

            return { success: true, results };

        } catch (error) {
            console.error('❌ Background sync failed:', error);

            await chrome.storage.local.set({
                last_auto_sync_error: {
                    timestamp: new Date().toISOString(),
                    error: error.message
                }
            });

            return {
                success: false,
                error: error.message,
                silent: true
            };
        }
    }

    async getAllStoredAssignments() {
        try {
            const storage = await chrome.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

            let allAssignments = [];
            assignmentKeys.forEach(key => {
                if (storage[key].assignments) {
                    allAssignments.push(...storage[key].assignments);
                }
            });

            const uniqueAssignments = allAssignments.filter((assignment, index, array) =>
                array.findIndex(a => a.assignmentId === assignment.assignmentId) === index
            );

            return uniqueAssignments;
        } catch (error) {
            console.error('Error getting assignments:', error);
            return [];
        }
    }

    // ============================================================================
    // CACHE OPERATIONS
    // ============================================================================

    getCacheStats() {
        return this.eventCache.getStats();
    }

    async forceCacheRefresh() {
        await this.eventCache.forceRefresh();
    }
}

// Expose for service worker context
if (typeof self !== 'undefined') {
    self.CalendarAPIClient = CalendarAPIClient;
}
