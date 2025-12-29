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
                return { id: cachedData.eventId, ...cachedData.eventData };
            }

            console.log(`💾 Cache miss for assignment ${assignmentId}`);
            return null;

        } catch (cacheError) {
            console.warn('🔄 Cache failed, using fallback API:', cacheError.message);
            return await this.fallbackToDirectAPI(assignmentId);
        }
    }

    async ensureCacheValid() {
        const now = Date.now();
        const cacheAge = this.lastFullRefresh ? (now - this.lastFullRefresh) : Infinity;

        if (cacheAge < this.CACHE_DURATION) return;

        if (this.refreshPromise) return await this.refreshPromise;

        console.log('🔄 Cache expired, refreshing...');
        this.refreshPromise = this.refreshCache();

        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }
    }

    async refreshCache() {
        try {
            const events = await this.getAllGradescopeEvents();
            this.cache.clear();

            let cachedCount = 0;
            events.forEach(event => {
                const assignmentId = event.extendedProperties?.private?.gradescope_assignment_id;
                if (assignmentId && !this.cache.has(assignmentId)) {
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
                }
            });

            this.lastFullRefresh = Date.now();
            console.log(`✅ Cache refresh complete: ${cachedCount} events cached`);
            this.enforceCacheLimit();

        } catch (error) {
            console.error('❌ Cache refresh failed:', error);
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

        try {
            const response = await this.client.makeAPIRequest(`/calendars/primary/events?${params}`);
            const allEvents = response.items || [];

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

                return hasAssignmentId || summaryMatches || descriptionMatches || locationMatches;
            });

            console.log(`📡 Found ${gradescopeEvents.length} Gradescope events out of ${allEvents.length} total`);
            return gradescopeEvents;

        } catch (error) {
            console.error('❌ API call failed:', error);
            return [];
        }
    }

    async fallbackToDirectAPI(assignmentId) {
        try {
            const searchParams = new URLSearchParams({
                q: `gradescope_assignment_id:${assignmentId}`,
                singleEvents: 'true',
                maxResults: '10'
            });

            const response = await this.client.makeAPIRequest(`/calendars/primary/events?${searchParams}`);

            if (response.items && response.items.length > 0) {
                const exactMatch = response.items.find(event =>
                    event.extendedProperties?.private?.gradescope_assignment_id === assignmentId
                );

                if (exactMatch) {
                    console.log(`✅ Fallback API found event: ${exactMatch.id}`);
                    return exactMatch;
                }
            }

            return null;

        } catch (error) {
            console.error('❌ Fallback API failed:', error);
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
