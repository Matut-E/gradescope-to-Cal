/**
 * Event Cache Module
 * Performance optimization for Calendar API - caches Gradescope events
 *
 * Reduces API calls by maintaining an in-memory cache of existing events
 * Full refresh every 10 minutes, with fallback to direct API on cache miss
 *
 * Part of background.js refactoring
 */

class EventCache {
    constructor(calendarClient) {
        this.client = calendarClient;
        this.cache = new Map();
        this.lastFullRefresh = null;
        this.CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
        this.MAX_CACHE_SIZE = 1000;
        this.refreshPromise = null;

        console.log('💾 Event cache initialized');
    }

    async getExistingEvent(assignmentId) {
        try {
            await this.ensureCacheValid();

            const cachedData = this.cache.get(assignmentId);
            if (cachedData) {
                console.log(`💾 Cache hit for assignment ${assignmentId}`);
                console.log(`   ✅ Found event: ${cachedData.eventId}`);
                console.log(`   📅 Summary: "${cachedData.eventData.summary}"`);
                return { id: cachedData.eventId, ...cachedData.eventData };
            }

            console.log(`💾 Cache miss for assignment ${assignmentId}`);
            console.log(`   🔍 Diagnostic: Assignment ${assignmentId} not found in cache`);
            console.log(`   📊 Current cache contents (${this.cache.size} entries):`);

            // Show first 10 cached assignment IDs for comparison (increased from 5)
            let count = 0;
            for (const [cachedId, data] of this.cache.entries()) {
                if (count < 10) {
                    console.log(`      • Cached ID: ${cachedId} → "${data.eventData.summary}"`);
                    count++;
                }
            }
            if (this.cache.size > 10) {
                console.log(`      • ... and ${this.cache.size - 10} more`);
            }
            console.log(`   ⚠️ Looking for: ${assignmentId} (not in cache)`);
            console.log(`   🔬 Assignment ID type: ${typeof assignmentId}`);
            console.log(`   🔬 Assignment ID length: ${String(assignmentId).length}`);

            // Try fallback API search
            console.log(`   🔄 Attempting fallback API search...`);
            return await this.fallbackToDirectAPI(assignmentId);

        } catch (cacheError) {
            console.error('❌ Cache failed with error:', cacheError);
            console.error('   Error type:', cacheError.name);
            console.error('   Error message:', cacheError.message);
            console.warn('🔄 Using fallback API...');
            return await this.fallbackToDirectAPI(assignmentId);
        }
    }

    async ensureCacheValid() {
        const now = Date.now();
        const cacheAge = this.lastFullRefresh ? (now - this.lastFullRefresh) : Infinity;

        console.log('');
        console.log('🔍 EventCache.ensureCacheValid() called:');
        console.log('   - Current cache size:', this.cache.size);
        console.log('   - Last refresh:', this.lastFullRefresh ? new Date(this.lastFullRefresh).toISOString() : 'NEVER');
        console.log('   - Cache age:', cacheAge === Infinity ? 'NEVER REFRESHED' : `${Math.round(cacheAge / 1000)}s`);
        console.log('   - Cache duration limit:', this.CACHE_DURATION / 1000, 'seconds');
        console.log('   - Cache valid?:', cacheAge < this.CACHE_DURATION);

        if (cacheAge < this.CACHE_DURATION) {
            console.log('   ✅ Cache is still valid, skipping refresh');
            console.log('');
            return;
        }

        if (this.refreshPromise) {
            console.log('   ⏳ Refresh already in progress, waiting...');
            return await this.refreshPromise;
        }

        console.log('   🔄 Cache needs refresh, starting...');
        console.log('');
        this.refreshPromise = this.refreshCache();

        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }
    }

    async refreshCache() {
        try {
            console.log('📡 EventCache.refreshCache() - Fetching events from Google Calendar API...');
            const events = await this.getAllGradescopeEvents();
            console.log(`   ✓ Received ${events.length} events from API`);

            this.cache.clear();
            console.log('   ✓ Cache cleared');

            let cachedCount = 0;
            let withAssignmentId = 0;
            let withoutAssignmentId = 0;

            events.forEach(event => {
                const assignmentId = event.extendedProperties?.private?.gradescope_assignment_id;
                if (assignmentId) {
                    withAssignmentId++;
                    if (!this.cache.has(assignmentId)) {
                        this.cache.set(assignmentId, {
                            eventId: event.id,
                            lastUpdated: Date.now(),
                            eventData: {
                                summary: event.summary,
                                start: event.start,
                                end: event.end,
                                htmlLink: event.htmlLink
                            }
                        });
                        cachedCount++;
                        console.log(`   ✓ Cached assignment ${assignmentId}: "${event.summary}"`);
                    }
                } else {
                    withoutAssignmentId++;
                }
            });

            this.lastFullRefresh = Date.now();
            console.log('');
            console.log('✅ Cache refresh complete:');
            console.log(`   - Total events fetched: ${events.length}`);
            console.log(`   - With gradescope_assignment_id: ${withAssignmentId}`);
            console.log(`   - Without gradescope_assignment_id: ${withoutAssignmentId}`);
            console.log(`   - Actually cached: ${cachedCount}`);
            console.log(`   - Final cache size: ${this.cache.size}`);
            console.log('');

            this.enforceCacheLimit();

        } catch (error) {
            console.error('');
            console.error('❌ Cache refresh failed:', error);
            console.error('   Error details:', error.message);
            console.error('   Stack:', error.stack);
            console.error('');
            throw error;
        }
    }

    async getAllGradescopeEvents() {
        const now = new Date();
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(now.getMonth() - 6);

        const sixMonthsFromNow = new Date(now);
        sixMonthsFromNow.setMonth(now.getMonth() + 6);

        const params = new URLSearchParams({
            timeMin: sixMonthsAgo.toISOString(),
            timeMax: sixMonthsFromNow.toISOString(),
            singleEvents: 'true',
            maxResults: '1000'
        });

        console.log('');
        console.log('📡 getAllGradescopeEvents() - Fetching calendar events:');
        console.log('   - Time range:', sixMonthsAgo.toISOString().split('T')[0], 'to', sixMonthsFromNow.toISOString().split('T')[0]);
        console.log('   - Max results: 1000');

        try {
            console.log('   - Making API request...');
            const response = await this.client.makeAPIRequest(`/calendars/primary/events?${params}`);
            const allEvents = response.items || [];
            console.log(`   ✓ API returned ${allEvents.length} total events`);

            let filterStats = {
                hasAssignmentId: 0,
                summaryMatch: 0,
                descriptionMatch: 0,
                locationMatch: 0
            };

            const gradescopeEvents = allEvents.filter(event => {
                const hasAssignmentId = !!event.extendedProperties?.private?.gradescope_assignment_id;
                const summaryMatches = event.summary && (
                    event.summary.includes('Gradescope') ||
                    event.summary.includes('EE105:') ||
                    event.summary.includes('Math 53:') ||
                    event.summary.includes('Lab') ||
                    event.summary.includes('Homework') ||
                    event.summary.includes('HW')
                );
                const descriptionMatches = event.description && event.description.includes('Gradescope');
                const locationMatches = event.location && event.location.includes('Gradescope');

                if (hasAssignmentId) filterStats.hasAssignmentId++;
                if (summaryMatches) filterStats.summaryMatch++;
                if (descriptionMatches) filterStats.descriptionMatch++;
                if (locationMatches) filterStats.locationMatch++;

                return hasAssignmentId || summaryMatches || descriptionMatches || locationMatches;
            });

            console.log('');
            console.log('   ✅ Filter results:');
            console.log(`      - Total events: ${allEvents.length}`);
            console.log(`      - Gradescope events: ${gradescopeEvents.length}`);
            console.log(`      - With gradescope_assignment_id: ${filterStats.hasAssignmentId}`);
            console.log(`      - With Gradescope in summary: ${filterStats.summaryMatch}`);
            console.log(`      - With Gradescope in description: ${filterStats.descriptionMatch}`);
            console.log(`      - With Gradescope in location: ${filterStats.locationMatch}`);
            console.log('');

            return gradescopeEvents;

        } catch (error) {
            console.error('');
            console.error('❌ getAllGradescopeEvents() API call failed:', error);
            console.error('   Error type:', error.name);
            console.error('   Error message:', error.message);
            if (error.response) {
                console.error('   HTTP status:', error.response.status);
                console.error('   Response:', await error.response.text());
            }
            console.error('');
            return [];
        }
    }

    async fallbackToDirectAPI(assignmentId) {
        try {
            console.log('   🔍 Fallback API: Searching by assignment ID in extended properties...');
            const searchParams = new URLSearchParams({
                q: `gradescope_assignment_id:${assignmentId}`,
                singleEvents: 'true',
                maxResults: '10'
            });

            const response = await this.client.makeAPIRequest(`/calendars/primary/events?${searchParams}`);

            if (response.items && response.items.length > 0) {
                console.log(`   📝 Found ${response.items.length} potential matches via extended properties`);
                const exactMatch = response.items.find(event =>
                    event.extendedProperties?.private?.gradescope_assignment_id === assignmentId
                );

                if (exactMatch) {
                    console.log(`   ✅ Fallback API found exact match: ${exactMatch.id}`);
                    return exactMatch;
                }
            } else {
                console.log('   ⚠️ No events found via extended properties search');
            }

            return null;

        } catch (error) {
            console.error('❌ Fallback API failed:', error);
            return null;
        }
    }

    /**
     * Search for event by summary and date (fallback when extended properties don't work)
     * Used when extended properties aren't being returned properly (e.g., Firefox issues)
     * @param {string} course - Course name
     * @param {string} title - Assignment title
     * @param {string} dueDate - ISO date string
     */
    async searchBySummaryAndDate(course, title, dueDate) {
        try {
            console.log('   🔍 Fallback search by summary and date...');

            // Construct the expected summary format: "[Course] Title"
            const expectedSummary = `${course}: ${title}`;
            console.log(`   🔍 Looking for summary: "${expectedSummary}"`);

            // Parse the due date to get the date range for search
            const due = new Date(dueDate);
            const dayBefore = new Date(due);
            dayBefore.setDate(due.getDate() - 1);
            const dayAfter = new Date(due);
            dayAfter.setDate(due.getDate() + 1);

            console.log(`   📅 Searching in date range: ${dayBefore.toISOString()} to ${dayAfter.toISOString()}`);

            // Search for all Gradescope events in the date range
            const searchParams = new URLSearchParams({
                timeMin: dayBefore.toISOString(),
                timeMax: dayAfter.toISOString(),
                singleEvents: 'true',
                maxResults: '50'
            });

            const response = await this.client.makeAPIRequest(`/calendars/primary/events?${searchParams}`);

            if (!response.items || response.items.length === 0) {
                console.log('   ⚠️ No events found in date range');
                return null;
            }

            console.log(`   📝 Found ${response.items.length} events in date range, checking summaries...`);

            // Find event with matching summary
            for (const event of response.items) {
                console.log(`      - Event: "${event.summary}"`);

                // Exact match
                if (event.summary === expectedSummary) {
                    console.log(`   ✅ Found exact summary match: ${event.id}`);
                    return event;
                }

                // Partial match (in case summary format changed)
                if (event.summary && event.summary.includes(course) && event.summary.includes(title)) {
                    console.log(`   ✅ Found partial summary match: ${event.id}`);
                    return event;
                }
            }

            console.log('   ⚠️ No matching event found by summary and date');
            return null;

        } catch (error) {
            console.error('❌ Search by summary and date failed:', error);
            return null;
        }
    }

    enforceCacheLimit() {
        if (this.cache.size <= this.MAX_CACHE_SIZE) return;

        const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);

        const keepCount = Math.floor(this.MAX_CACHE_SIZE * 0.8);
        const toKeep = entries.slice(-keepCount);

        this.cache.clear();
        toKeep.forEach(([key, value]) => {
            this.cache.set(key, value);
        });

        console.log(`✅ Cache cleaned up: ${this.cache.size} entries retained`);
    }

    invalidateAssignment(assignmentId) {
        this.cache.delete(assignmentId);
    }

    async forceRefresh() {
        this.lastFullRefresh = null;
        this.cache.clear();
        await this.ensureCacheValid();
    }

    getStats() {
        return {
            size: this.cache.size,
            lastRefresh: this.lastFullRefresh ? new Date(this.lastFullRefresh).toISOString() : 'Never',
            cacheAge: this.lastFullRefresh ? Date.now() - this.lastFullRefresh : null,
            maxSize: this.MAX_CACHE_SIZE,
            isValid: this.lastFullRefresh && (Date.now() - this.lastFullRefresh) < this.CACHE_DURATION
        };
    }
}

// Expose for service worker context
if (typeof self !== 'undefined') {
    self.EventCache = EventCache;
}
