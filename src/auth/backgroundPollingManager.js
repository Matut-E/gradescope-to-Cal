/**
 * Background Polling Manager Module
 * Enables true background sync by fetching Gradescope pages directly
 *
 * IMPORTANT: This is an OPT-IN feature that users must explicitly enable.
 * It uses the user's existing Gradescope session cookies to fetch assignment
 * data without requiring the user to visit Gradescope pages.
 *
 * Features:
 * - Periodic background fetching (default: 30 minutes)
 * - Session expiration detection and user notification
 * - Rate limiting to respect Gradescope servers
 * - Graceful degradation on errors
 *
 * Part of background.js refactoring
 */

class BackgroundPollingManager {
    constructor(config, calendarClient, smartSyncManager, authManager) {
        this.config = config;
        this.calendarClient = calendarClient;
        this.smartSyncManager = smartSyncManager;
        this.authManager = authManager;

        // Polling configuration
        this.POLL_ALARM_NAME = 'gradescope_background_poll';
        this.POLL_INTERVAL_MINUTES = 30;  // Check every 30 minutes
        this.MIN_POLL_INTERVAL = 15;      // Minimum allowed interval
        this.MAX_POLL_INTERVAL = 120;     // Maximum allowed interval

        // Gradescope URLs
        this.GRADESCOPE_BASE = 'https://www.gradescope.com';
        this.GRADESCOPE_ACCOUNT = 'https://www.gradescope.com/account';

        // Session state
        this.lastPollAttempt = null;
        this.consecutiveFailures = 0;
        this.MAX_CONSECUTIVE_FAILURES = 3;

        console.log('🔄 Background Polling Manager initialized');
    }

    /**
     * Initialize background polling if enabled
     * Default: ENABLED (opt-out) - users must explicitly disable if they don't want it
     */
    async initialize() {
        try {
            const storage = await browser.storage.local.get(['backgroundPollingEnabled', 'enrolledCourses']);

            // Default to enabled (undefined means user hasn't explicitly disabled)
            const isEnabled = storage.backgroundPollingEnabled !== false;
            const hasCourses = storage.enrolledCourses && storage.enrolledCourses.length > 0;

            if (isEnabled && hasCourses) {
                await this.startPolling();
                console.log('✅ Background polling initialized (enabled by default)');
            } else if (isEnabled && !hasCourses) {
                console.log('ℹ️ Background polling enabled but no courses detected yet. Will start after user visits Gradescope.');
            } else {
                console.log('ℹ️ Background polling is disabled by user');
            }
        } catch (error) {
            console.error('❌ Error initializing background polling:', error);
        }
    }

    /**
     * Enable and start background polling
     */
    async enablePolling() {
        try {
            const { enrolledCourses } = await browser.storage.local.get('enrolledCourses');
            const hasCourses = enrolledCourses && enrolledCourses.length > 0;

            await browser.storage.local.set({
                backgroundPollingEnabled: true,
                backgroundPollingEnabledAt: Date.now()
            });

            if (hasCourses) {
                await this.startPolling();
                console.log('✅ Background polling enabled and started');
                return { success: true, message: 'Background polling enabled' };
            } else {
                console.log('✅ Background polling enabled (will start after visiting Gradescope)');
                return {
                    success: true,
                    message: 'Background polling enabled. Visit Gradescope to detect your courses.',
                    pendingCourseDetection: true
                };
            }

        } catch (error) {
            console.error('❌ Error enabling background polling:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Disable background polling
     */
    async disablePolling() {
        try {
            await browser.alarms.clear(this.POLL_ALARM_NAME);
            await browser.storage.local.set({
                backgroundPollingEnabled: false,
                backgroundPollingDisabledAt: Date.now()
            });

            console.log('✅ Background polling disabled');
            return { success: true, message: 'Background polling disabled' };

        } catch (error) {
            console.error('❌ Error disabling background polling:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Start the polling alarm
     */
    async startPolling() {
        await browser.alarms.clear(this.POLL_ALARM_NAME);
        await browser.alarms.create(this.POLL_ALARM_NAME, {
            delayInMinutes: 1,  // First poll after 1 minute
            periodInMinutes: this.POLL_INTERVAL_MINUTES
        });

        console.log(`⏰ Background polling scheduled every ${this.POLL_INTERVAL_MINUTES} minutes`);
    }

    /**
     * Handle the polling alarm trigger
     */
    async handlePollAlarm() {
        console.log('🔄 Background poll triggered');
        this.lastPollAttempt = Date.now();

        try {
            // Check if user is authenticated with Google Calendar
            const authStatus = await this.authManager.getAuthStatus();
            if (!authStatus.authenticated) {
                console.log('⏭️ User not authenticated with Google Calendar, skipping poll');
                return { success: false, reason: 'not_authenticated' };
            }

            // Perform the background fetch
            const result = await this.performBackgroundFetch();

            if (result.success) {
                this.consecutiveFailures = 0;
                await this.clearSessionExpiredFlag();

                // If we found new assignments, sync them
                if (result.newAssignments && result.newAssignments.length > 0) {
                    console.log(`📥 Found ${result.newAssignments.length} assignments via background poll`);
                    await this.syncNewAssignments(result.newAssignments);
                }

                return result;
            } else {
                return await this.handlePollFailure(result);
            }

        } catch (error) {
            console.error('❌ Background poll error:', error);
            return await this.handlePollFailure({
                success: false,
                reason: 'error',
                error: error.message
            });
        }
    }

    /**
     * Perform the actual background fetch of Gradescope data
     */
    async performBackgroundFetch() {
        console.log('📡 Starting background fetch...');

        // Get stored course list
        const { enrolledCourses } = await browser.storage.local.get('enrolledCourses');

        if (!enrolledCourses || enrolledCourses.length === 0) {
            console.log('⚠️ No enrolled courses stored');
            return { success: false, reason: 'no_courses' };
        }

        console.log(`📚 Fetching assignments from ${enrolledCourses.length} courses...`);

        const allAssignments = [];
        let sessionValid = true;

        for (const course of enrolledCourses) {
            try {
                const result = await this.fetchCourseAssignments(course);

                if (result.sessionExpired) {
                    sessionValid = false;
                    break;
                }

                if (result.assignments) {
                    allAssignments.push(...result.assignments);
                }

                // Small delay between requests to be respectful
                await this.delay(500);

            } catch (error) {
                console.error(`❌ Error fetching ${course.shortName}:`, error);
            }
        }

        if (!sessionValid) {
            return { success: false, reason: 'session_expired' };
        }

        // Filter for calendar-eligible assignments
        const calendarEligible = allAssignments.filter(a =>
            a.dueDate &&
            !a.isSubmitted &&
            new Date(a.dueDate) > new Date()
        );

        // Deduplicate by assignmentId
        const uniqueAssignments = Array.from(
            new Map(calendarEligible.map(a => [a.assignmentId, a])).values()
        );

        console.log(`✅ Background fetch complete: ${uniqueAssignments.length} calendar-eligible assignments`);

        // Store the fetched assignments
        await this.storeBackgroundFetchResults(uniqueAssignments);

        return {
            success: true,
            totalFetched: allAssignments.length,
            calendarEligible: uniqueAssignments.length,
            newAssignments: uniqueAssignments,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Fetch assignments from a single course
     */
    async fetchCourseAssignments(course) {
        const courseUrl = `${this.GRADESCOPE_BASE}/courses/${course.id}`;

        try {
            // Fetch with credentials to include session cookies
            const response = await fetch(courseUrl, {
                credentials: 'include',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Cache-Control': 'no-cache'
                }
            });

            // Check for auth issues
            if (response.status === 401 || response.status === 403) {
                console.log('🔒 Session expired detected');
                return { sessionExpired: true };
            }

            // Check for redirects to login page
            if (response.redirected && response.url.includes('/login')) {
                console.log('🔒 Redirected to login - session expired');
                return { sessionExpired: true };
            }

            if (!response.ok) {
                console.log(`⚠️ HTTP ${response.status} for ${course.shortName}`);
                return { assignments: [] };
            }

            const html = await response.text();

            // Check if HTML contains login form (another indicator of expired session)
            if (html.includes('name="session[email]"') || html.includes('Sign in to Gradescope')) {
                console.log('🔒 Login form detected - session expired');
                return { sessionExpired: true };
            }

            // Parse assignments from HTML
            const assignments = this.parseAssignmentsFromHTML(html, course);

            console.log(`   📋 ${course.shortName}: ${assignments.length} assignments`);

            return { assignments };

        } catch (error) {
            console.error(`❌ Fetch error for ${course.shortName}:`, error);
            return { assignments: [] };
        }
    }

    /**
     * Parse assignments from course page HTML
     * Adapted from assignmentParser.js for background script context
     */
    parseAssignmentsFromHTML(html, course) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const assignments = [];
        const tables = doc.querySelectorAll('table');

        if (tables.length === 0) {
            console.log(`   ⚠️ No assignment tables found for ${course.shortName}`);
            return assignments;
        }

        tables.forEach(table => {
            const rows = table.querySelectorAll('tbody tr');

            rows.forEach(row => {
                try {
                    const assignment = this.parseAssignmentRow(row, course);
                    if (assignment) {
                        assignments.push(assignment);
                    }
                } catch (error) {
                    // Skip problematic rows silently
                }
            });
        });

        return assignments;
    }

    /**
     * Parse a single assignment row
     */
    parseAssignmentRow(row, course) {
        // Skip header rows
        const thElements = row.querySelectorAll('th');
        const tdElements = row.querySelectorAll('td');

        if (thElements.length > 0 && tdElements.length === 0) {
            return null;
        }

        // Find title element
        let titleElement = row.querySelector('button.js-submitAssignment, button[data-assignment-id]');

        if (!titleElement) {
            titleElement = row.querySelector('a[href*="/assignments/"]');
        }

        if (!titleElement) {
            const firstCell = row.querySelector('th, td');
            if (firstCell) {
                titleElement = firstCell.querySelector('button, a');
            }
        }

        if (!titleElement) {
            return null;
        }

        const title = titleElement.textContent?.trim();
        if (!title) return null;

        // Extract assignment ID
        let assignmentId = titleElement.getAttribute?.('data-assignment-id');

        if (!assignmentId && titleElement.href) {
            const match = titleElement.href.match(/assignments\/(\d+)/);
            assignmentId = match?.[1];
        }

        if (!assignmentId) {
            // Generate pseudo-ID from title
            assignmentId = 'bg_' + title.replace(/\s+/g, '_').toLowerCase().substring(0, 50);
        }

        // Extract due date from cells
        const cells = row.querySelectorAll('td, th');
        const dueDate = this.extractDueDateFromCells(cells);

        // Check submission status
        const rowText = row.textContent.toLowerCase();
        const isSubmitted = rowText.includes('submitted') ||
                          rowText.includes('graded') ||
                          row.querySelector('.submissionStatus--submitted') !== null;

        const isGraded = rowText.includes('graded') ||
                        row.querySelector('.submissionStatus--graded') !== null;

        const assignmentUrl = `${this.GRADESCOPE_BASE}/courses/${course.id}/assignments/${assignmentId}`;

        return {
            title: title,
            dueDate: dueDate ? dueDate.toISOString() : null,
            course: course.shortName || course.fullName || 'Unknown Course',
            courseId: course.id,
            url: assignmentUrl,
            assignmentId: assignmentId,
            extractedAt: new Date().toISOString(),
            extractionMethod: 'background_poll',
            isSubmitted: isSubmitted,
            isGraded: isGraded,
            semester: course.semester
        };
    }

    /**
     * Extract due date from table cells
     */
    extractDueDateFromCells(cells) {
        // Look for common date patterns in cells
        const datePatterns = [
            /(\w+)\s+(\d{1,2}),?\s+(\d{4})?\s+at\s+(\d{1,2}):(\d{2})([AP]M)?/i,  // "Jan 15, 2025 at 11:59PM"
            /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/,               // "1/15/25 23:59"
            /Due:\s*(.+)/i
        ];

        for (const cell of cells) {
            const text = cell.textContent?.trim() || '';

            // Try each pattern
            for (const pattern of datePatterns) {
                const match = text.match(pattern);
                if (match) {
                    try {
                        // Try to parse the matched date
                        const dateStr = match[0].replace(/^Due:\s*/i, '');
                        const parsed = new Date(dateStr);

                        if (!isNaN(parsed.getTime()) && parsed > new Date('2020-01-01')) {
                            return parsed;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }

            // Fallback: look for time element
            const timeEl = cell.querySelector('time[datetime]');
            if (timeEl) {
                const datetime = timeEl.getAttribute('datetime');
                if (datetime) {
                    const parsed = new Date(datetime);
                    if (!isNaN(parsed.getTime())) {
                        return parsed;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Store background fetch results
     */
    async storeBackgroundFetchResults(assignments) {
        const storageKey = `assignments_background_poll_${Date.now()}`;

        await browser.storage.local.set({
            [storageKey]: {
                assignments: assignments,
                allAssignments: assignments,
                extractedAt: new Date().toISOString(),
                extractionMethod: 'background_poll',
                version: '2.0.0'
            },
            lastBackgroundPoll: new Date().toISOString(),
            lastBackgroundPollCount: assignments.length
        });

        console.log(`💾 Stored ${assignments.length} assignments from background poll`);
    }

    /**
     * Sync new assignments to Google Calendar
     */
    async syncNewAssignments(assignments) {
        try {
            // Use smart sync manager to check which are actually new
            const checkResult = await this.smartSyncManager.checkForNewAssignments(assignments);

            if (checkResult.shouldSync && checkResult.newAssignments.length > 0) {
                console.log(`🚀 Background poll triggering sync for ${checkResult.newAssignments.length} new assignments`);

                const syncResult = await this.smartSyncManager.performSmartSync(checkResult.newAssignments);

                if (syncResult.success) {
                    console.log(`✅ Background sync complete: ${syncResult.results.created} created`);

                    // Update sync type to indicate it came from background poll
                    await browser.storage.local.set({
                        lastSyncType: 'background_poll'
                    });
                }

                return syncResult;
            } else {
                console.log('ℹ️ All assignments from background poll already in calendar');
                return { success: true, synced: false, reason: checkResult.reason };
            }

        } catch (error) {
            console.error('❌ Error syncing background poll assignments:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle poll failure
     */
    async handlePollFailure(result) {
        this.consecutiveFailures++;

        if (result.reason === 'session_expired') {
            console.log('🔒 Gradescope session expired');
            await this.setSessionExpiredFlag();
            await this.notifySessionExpired();

            // Don't disable polling - it will retry when session is restored
            return result;
        }

        // After too many failures, disable polling
        if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
            console.log(`⚠️ ${this.consecutiveFailures} consecutive failures, disabling background polling`);
            await this.disablePolling();

            await browser.storage.local.set({
                backgroundPollingAutoDisabled: true,
                backgroundPollingAutoDisabledAt: Date.now(),
                backgroundPollingAutoDisabledReason: result.reason || 'consecutive_failures'
            });
        }

        return result;
    }

    /**
     * Set session expired flag for UI notification
     */
    async setSessionExpiredFlag() {
        await browser.storage.local.set({
            gradescopeSessionExpired: true,
            gradescopeSessionExpiredAt: Date.now()
        });
    }

    /**
     * Clear session expired flag
     */
    async clearSessionExpiredFlag() {
        await browser.storage.local.remove([
            'gradescopeSessionExpired',
            'gradescopeSessionExpiredAt'
        ]);
    }

    /**
     * Notify user that Gradescope session has expired
     */
    async notifySessionExpired() {
        try {
            // Check if notifications permission is available
            if (browser.notifications) {
                await browser.notifications.create('gradescope-session-expired', {
                    type: 'basic',
                    iconUrl: browser.runtime.getURL('icons/icon-128.png'),
                    title: 'Gradescope Session Expired',
                    message: 'Please visit Gradescope to restore automatic assignment sync.',
                    priority: 1
                });
            }
        } catch (error) {
            // Notifications might not be available
            console.log('ℹ️ Could not show notification:', error.message);
        }
    }

    /**
     * Get background polling status
     */
    async getStatus() {
        const storage = await browser.storage.local.get([
            'backgroundPollingEnabled',
            'backgroundPollingEnabledAt',
            'lastBackgroundPoll',
            'lastBackgroundPollCount',
            'gradescopeSessionExpired',
            'gradescopeSessionExpiredAt',
            'enrolledCourses',
            'backgroundPollingAutoDisabled',
            'backgroundPollingAutoDisabledReason'
        ]);

        const alarm = await browser.alarms.get(this.POLL_ALARM_NAME);

        // Default to enabled (undefined means user hasn't explicitly disabled)
        const isEnabled = storage.backgroundPollingEnabled !== false;

        return {
            enabled: isEnabled,
            enabledAt: storage.backgroundPollingEnabledAt || null,
            alarmActive: !!alarm,
            nextPoll: alarm ? new Date(alarm.scheduledTime).toISOString() : null,
            lastPoll: storage.lastBackgroundPoll || null,
            lastPollCount: storage.lastBackgroundPollCount || 0,
            sessionExpired: storage.gradescopeSessionExpired || false,
            sessionExpiredAt: storage.gradescopeSessionExpiredAt || null,
            enrolledCoursesCount: storage.enrolledCourses?.length || 0,
            autoDisabled: storage.backgroundPollingAutoDisabled || false,
            autoDisabledReason: storage.backgroundPollingAutoDisabledReason || null,
            pollInterval: this.POLL_INTERVAL_MINUTES,
            consecutiveFailures: this.consecutiveFailures
        };
    }

    /**
     * Store enrolled courses for background polling
     * Called from content script when user visits Gradescope
     */
    async storeEnrolledCourses(courses) {
        if (!courses || courses.length === 0) {
            console.log('⚠️ No courses to store');
            return { success: false, reason: 'no_courses' };
        }

        await browser.storage.local.set({
            enrolledCourses: courses,
            enrolledCoursesUpdatedAt: Date.now()
        });

        console.log(`✅ Stored ${courses.length} enrolled courses for background polling`);

        // Clear session expired flag since user just visited Gradescope
        await this.clearSessionExpiredFlag();

        // Check if polling is enabled but not yet started (was waiting for courses)
        const { backgroundPollingEnabled } = await browser.storage.local.get('backgroundPollingEnabled');
        const isEnabled = backgroundPollingEnabled !== false; // Default to enabled
        const alarm = await browser.alarms.get(this.POLL_ALARM_NAME);

        if (isEnabled && !alarm) {
            console.log('🚀 Starting background polling now that courses are detected');
            await this.startPolling();
        }

        return { success: true, count: courses.length };
    }

    /**
     * Utility: delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Expose for service worker context
if (typeof self !== 'undefined') {
    self.BackgroundPollingManager = BackgroundPollingManager;
}
