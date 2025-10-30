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

        // Load user settings
        let eventColorId = '9'; // Default Blueberry
        let createReminders = true; // Default true
        let reminderSchedule = 'double'; // Default double
        let customReminders = [1440, 60]; // Default double preset
        let eventDisplayTime = 'deadline'; // Default deadline

        try {
            const localSettings = await browser.storage.local.get([
                'settings_create_reminders',
                'reminderSchedule',
                'customReminders',
                'eventDisplayTime'
            ]);
            const syncSettings = await browser.storage.sync.get(['eventColorId']);

            eventColorId = syncSettings.eventColorId || '9';
            createReminders = localSettings.settings_create_reminders !== false;
            reminderSchedule = localSettings.reminderSchedule || 'double';
            customReminders = localSettings.customReminders || [1440, 60];
            eventDisplayTime = localSettings.eventDisplayTime || 'deadline';

            console.log('🎨 Using event color ID:', eventColorId);
            console.log('🔔 Create reminders:', createReminders);
            console.log('🔔 Reminder schedule:', reminderSchedule);
            console.log('📅 Event display timing:', eventDisplayTime);
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

        // Apply event display timing preference
        if (eventDisplayTime === 'allday') {
            // All-day event format - use timezone-aware date formatting
            // This prevents UTC conversion from shifting the date
            const dateFormatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            const dateOnly = dateFormatter.format(dueDate); // Returns "YYYY-MM-DD" in local timezone
            event.start = { date: dateOnly };
            event.end = { date: dateOnly };
        } else {
            // Timed event format (deadline time)
            event.start = {
                dateTime: dueDate.toISOString(),
                timeZone: timezone
            };
            event.end = {
                dateTime: dueDate.toISOString(),
                timeZone: timezone
            };
        }

        // Apply reminder schedule
        if (createReminders && reminderSchedule !== 'none') {
            let reminderMinutes = [];

            switch (reminderSchedule) {
                case 'single':
                    reminderMinutes = [1440]; // 1 day before
                    break;
                case 'double':
                    reminderMinutes = [1440, 60]; // 1 day + 1 hour before
                    break;
                case 'custom':
                    reminderMinutes = customReminders;
                    break;
                default:
                    reminderMinutes = [1440, 60]; // Fallback to double
            }

            // For all-day events, Google Calendar only allows "day of" reminders (minutes = 0)
            // or reminders measured in full days
            if (eventDisplayTime === 'allday') {
                // Convert minutes to full days, or use 0 for same-day reminders
                reminderMinutes = reminderMinutes.map(minutes => {
                    if (minutes >= 1440 && minutes % 1440 === 0) {
                        // Full days - keep as is
                        return minutes;
                    } else if (minutes < 1440) {
                        // Less than a day - convert to day-of reminder (0 minutes at 9 AM)
                        return 0;
                    } else {
                        // Not a full day - round to nearest day
                        return Math.round(minutes / 1440) * 1440;
                    }
                });

                // Remove duplicates and sort
                reminderMinutes = [...new Set(reminderMinutes)].sort((a, b) => b - a);
            }

            // Set reminders
            event.reminders = {
                useDefault: false,
                overrides: reminderMinutes.map(minutes => ({
                    method: 'popup',
                    minutes: minutes
                }))
            };
        } else {
            // Explicitly disable reminders (prevents Google Calendar from using default reminders)
            event.reminders = {
                useDefault: false,
                overrides: []
            };
        }

        console.log('📝 Creating calendar event with data:');
        console.log('   - Summary:', event.summary);
        console.log('   - Assignment ID:', assignment.assignmentId);
        console.log('   - Extended properties:', JSON.stringify(event.extendedProperties, null, 2));

        const response = await this.makeAPIRequest('/calendars/primary/events', {
            method: 'POST',
            body: JSON.stringify(event)
        });

        console.log('✅ Event created successfully:');
        console.log('   - Event ID:', response.id);
        console.log('   - HTML Link:', response.htmlLink);
        console.log('   - Extended properties in response:', JSON.stringify(response.extendedProperties, null, 2));

        // Verify extended properties were saved
        if (!response.extendedProperties?.private?.gradescope_assignment_id) {
            console.error('⚠️ WARNING: Extended properties NOT returned by API!');
            console.error('   This may cause duplicate event creation on next sync.');
            console.error('   Request had:', assignment.assignmentId);
            console.error('   Response has:', response.extendedProperties);
        }

        this.eventCache.invalidateAssignment(assignment.assignmentId);
        return response;
    }

    async findExistingEvent(assignmentId, assignment = null) {
        try {
            // First try: Use assignment ID (extended properties)
            const eventById = await this.eventCache.getExistingEvent(assignmentId);
            if (eventById) {
                return eventById;
            }

            // Second try: Use summary + date fallback (for Firefox or when extended properties fail)
            if (assignment && assignment.course && assignment.title && assignment.dueDate) {
                console.log('   🔄 Extended properties search failed, trying summary + date fallback...');
                const eventBySummary = await this.eventCache.searchBySummaryAndDate(
                    assignment.course,
                    assignment.title,
                    assignment.dueDate
                );

                if (eventBySummary) {
                    console.log('   ✅ Found event via fallback search!');
                    return eventBySummary;
                }
            }

            // No event found
            return null;

        } catch (error) {
            console.error(`❌ Error finding event ${assignmentId}:`, error.message);
            return null;
        }
    }

    async syncAssignments(assignments) {
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════════════╗');
        console.log('║  🔄 SYNCING ASSIGNMENTS TO CALENDAR                                    ║');
        console.log('╚════════════════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log(`📊 Starting sync for ${assignments.length} assignments`);

        const results = {
            created: 0,
            skipped: 0,
            errors: 0,
            details: []
        };

        for (let i = 0; i < assignments.length; i++) {
            const assignment = assignments[i];
            console.log('');
            console.log(`[${i + 1}/${assignments.length}] Processing: "${assignment.title}"`);
            console.log(`   - Course: ${assignment.course}`);
            console.log(`   - Assignment ID: ${assignment.assignmentId}`);
            console.log(`   - Due Date: ${assignment.dueDate}`);

            try {
                if (!assignment.dueDate) {
                    console.log('   ⏭️  SKIPPED: No due date');
                    results.skipped++;
                    results.details.push({
                        assignment: assignment.title,
                        status: 'skipped',
                        reason: 'No due date'
                    });
                    continue;
                }

                console.log('   🔍 Checking if event already exists...');
                const existingEvent = await this.findExistingEvent(assignment.assignmentId, assignment);

                if (existingEvent) {
                    console.log('   ✅ SKIPPED: Event already exists');
                    console.log(`      Event ID: ${existingEvent.id}`);
                    results.skipped++;
                    results.details.push({
                        assignment: assignment.title,
                        status: 'skipped',
                        reason: 'Already exists',
                        eventId: existingEvent.id
                    });
                    continue;
                }

                console.log('   🆕 No existing event found, creating new event...');
                await this.createEventFromAssignment(assignment);
                console.log('   ✅ CREATED: New event added to calendar');
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
                await browser.storage.local.set({
                    last_auto_sync: new Date().toISOString(),
                    last_sync_results: { created: 0, skipped: 0, errors: 0 },
                    lastSyncType: 'auto'
                });
                return {
                    success: true,
                    reason: 'No assignments to sync',
                    results: { created: 0, skipped: 0, errors: 0 }
                };
            }

            const results = await this.syncAssignments(assignments);

            await browser.storage.local.set({
                last_auto_sync: new Date().toISOString(),
                last_sync_results: results,
                lastSyncType: 'auto'
            });

            return { success: true, results };

        } catch (error) {
            console.error('❌ Background sync failed:', error);

            await browser.storage.local.set({
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
            const storage = await browser.storage.local.get();
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
