/**
 * Enhanced Background Script with Dual OAuth Client Support
 * UPDATED: Supports both Chrome native getAuthToken AND universal launchWebAuthFlow
 */

const CONFIG = {
    CALENDAR_API_BASE: 'https://www.googleapis.com/calendar/v3',
    
    // 🔧 DUAL CLIENT CONFIGURATION
    // Web Application client (for launchWebAuthFlow - universal compatibility)
    WEB_CLIENT_ID: '589515007396-nofmk5v0dhegv5fmp1700v8ve94624ih.apps.googleusercontent.com',
    
    // Chrome Extension client (for getAuthToken - Chrome native)
    
    CHROME_EXTENSION_CLIENT_ID: '589515007396-0frm2bh6mhobpqiuec8p2dlb2gs10gla.apps.googleusercontent.com',
    
    SCOPE: 'https://www.googleapis.com/auth/calendar',
    
    // Auto-sync settings
    AUTO_SYNC_INTERVAL: 1440, // minutes
    ALARM_NAME: 'gradescope_auto_sync'
};

console.log('🌟 Enhanced background script with dual OAuth clients loaded');

class EventCache {
    constructor(calendarClient) {
        this.client = calendarClient;
        this.cache = new Map(); // assignmentId -> { eventId, lastUpdated, eventData }
        this.lastFullRefresh = null;
        this.CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
        this.MAX_CACHE_SIZE = 1000; // Prevent memory leaks
        this.refreshPromise = null; // Prevent concurrent refreshes
        
        console.log('💾 Event cache initialized');
    }

    /**
     * Main entry point - get existing event with smart caching
     */
    async getExistingEvent(assignmentId) {
        try {
            await this.ensureCacheValid();
            
            const cachedData = this.cache.get(assignmentId);
            if (cachedData) {
                console.log(`💾 Cache hit for assignment ${assignmentId} -> event ${cachedData.eventId}`);
                return { id: cachedData.eventId, ...cachedData.eventData };
            }
            
            console.log(`💾 Cache miss for assignment ${assignmentId}`);
            return null;
            
        } catch (cacheError) {
            console.warn('🔄 Event cache failed, falling back to direct API:', cacheError.message);
            
            // Graceful degradation - use original method
            return await this.fallbackToDirectAPI(assignmentId);
        }
    }

    /**
     * Ensure cache is valid, refresh if needed
     */
    async ensureCacheValid() {
        const now = Date.now();
        const cacheAge = this.lastFullRefresh ? (now - this.lastFullRefresh) : Infinity;
        
        // Cache is still fresh
        if (cacheAge < this.CACHE_DURATION) {
            return;
        }
        
        // Prevent concurrent refresh requests
        if (this.refreshPromise) {
            return await this.refreshPromise;
        }
        
        console.log('🔄 Event cache expired, refreshing...');
        this.refreshPromise = this.refreshCache();
        
        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }
    }


/**
 * Refresh the entire cache with a single efficient API call
 */
    async refreshCache() {
        console.log('🔄 Starting cache refresh...');
        
        try {
            console.log('📡 Calling getAllGradescopeEvents...');
            const events = await this.getAllGradescopeEvents();
            
            console.log(`📡 getAllGradescopeEvents returned ${events.length} events`);
            
            // Clear old cache and rebuild
            this.cache.clear();
            console.log('🧹 Cache cleared, rebuilding...');

            let cachedCount = 0;
            events.forEach(event => {
                const assignmentId = event.extendedProperties?.private?.gradescope_assignment_id;
                if (assignmentId) {
                    // FIXED: Only cache the first occurrence of each assignment ID
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
                        console.log(`💾 Cached event: "${event.summary}" with ID: ${assignmentId}`);
                    } else {
                        console.log(`🔄 Duplicate assignment ID ${assignmentId} found for "${event.summary}", using first occurrence`);
                    }
                }
            });
            
            this.lastFullRefresh = Date.now();
            console.log(`✅ Cache refresh complete: ${cachedCount} events cached out of ${events.length} total`);
            
            // Enforce cache size limit
            this.enforceCacheLimit();
            
        } catch (error) {
            console.error('❌ Cache refresh failed with error:', error);
            console.error('❌ Error stack:', error.stack);
            throw error;
        }
    }


/**
 * Single efficient API call to get all Gradescope events
 */
    async getAllGradescopeEvents() {
        console.log('📡 getAllGradescopeEvents: Starting API call...');
        
        // Get events from 6 months ago to 6 months in the future
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
            console.log('📡 Making Calendar API request...');
            const response = await this.client.makeAPIRequest(`/calendars/primary/events?${params}`);
            
            const allEvents = response.items || [];
            console.log(`📡 API returned ${allEvents.length} total calendar events`);
            
            // BROADENED FILTER: Look for any event that looks like a Gradescope assignment
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
                
                const isGradescopeEvent = hasAssignmentId || summaryMatches || descriptionMatches || locationMatches;
                
                if (isGradescopeEvent) {
                    console.log(`📊 Found potential Gradescope event: "${event.summary}"`);
                    console.log(`   - Has assignment ID: ${hasAssignmentId ? event.extendedProperties.private.gradescope_assignment_id : 'NO'}`);
                    console.log(`   - Summary matches: ${summaryMatches}`);
                    console.log(`   - Description matches: ${descriptionMatches}`);
                    console.log(`   - Event ID: ${event.id}`);
                }
                
                return isGradescopeEvent;
            });
            
            console.log(`📡 Found ${gradescopeEvents.length} Gradescope-like events out of ${allEvents.length} total`);
            
            // Show a few examples of what we're finding
            allEvents.slice(0, 5).forEach((event, i) => {
                console.log(`📋 Event ${i+1}: "${event.summary}" (description: ${event.description ? 'yes' : 'no'})`);
            });
            
            return gradescopeEvents;
            
        } catch (error) {
            console.error('❌ getAllGradescopeEvents API call failed:', error);
            return [];
        }
    }

    /**
     * Fallback to original direct API method
     */
    async fallbackToDirectAPI(assignmentId) {
        try {
            // Use the original strategy from findExistingEvent
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
            console.error('❌ Fallback API also failed:', error);
            return null;
        }
    }

    /**
     * Prevent cache from growing too large (memory management)
     */
    enforceCacheLimit() {
        if (this.cache.size <= this.MAX_CACHE_SIZE) {
            return;
        }
        
        console.log(`🧹 Cache size (${this.cache.size}) exceeded limit, cleaning up...`);
        
        // Convert to array and sort by last updated time
        const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
        
        // Keep only the most recent entries
        const keepCount = Math.floor(this.MAX_CACHE_SIZE * 0.8); // Keep 80% after cleanup
        const toKeep = entries.slice(-keepCount);
        
        this.cache.clear();
        toKeep.forEach(([key, value]) => {
            this.cache.set(key, value);
        });
        
        console.log(`✅ Cache cleaned up: ${this.cache.size} entries retained`);
    }

    /**
     * Invalidate specific assignment from cache (useful after creating new events)
     */
    invalidateAssignment(assignmentId) {
        const removed = this.cache.delete(assignmentId);
        if (removed) {
            console.log(`🗑️ Invalidated cache entry for assignment ${assignmentId}`);
        }
    }

    /**
     * Force full cache refresh (useful for testing or after bulk operations)
     */
    async forceRefresh() {
        this.lastFullRefresh = null;
        this.cache.clear();
        await this.ensureCacheValid();
    }

    /**
     * Get cache statistics for debugging
     */
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

    class EnhancedGoogleCalendarClient {
        constructor() {
            this.accessToken = null;
            this.refreshToken = null;
            this.tokenExpiry = null;
            this.browserCapabilities = null;
            this.authMethod = null;
            this.eventCache = new EventCache(this); 
        }

        /**
         * Load token state from persistent storage on startup
         */
        async initializeFromStorage() {
            try {
                const stored = await chrome.storage.local.get([
                    'google_access_token',
                    'google_token_expiry',
                    'google_auth_method'
                ]);

                if (stored.google_access_token && stored.google_token_expiry) {
                    this.accessToken = stored.google_access_token;
                    this.tokenExpiry = stored.google_token_expiry;
                    this.authMethod = stored.google_auth_method;
                    
                    console.log('🔄 Restored auth state from storage');
                    
                    // Clear if expired
                    if (Date.now() >= this.tokenExpiry - 60000) {
                        console.log('⚠️ Stored token expired, clearing');
                        await this.clearStoredAuth();
                    }
                }
            } catch (error) {
                console.error('Error loading stored auth:', error);
            }
        }

        /**
         * Save token state to persistent storage
         */
        async saveTokenState() {
            try {
                await chrome.storage.local.set({
                    google_access_token: this.accessToken,
                    google_token_expiry: this.tokenExpiry,
                    google_auth_method: this.authMethod
                });
                console.log('💾 Auth state saved');
            } catch (error) {
                console.error('Error saving token state:', error);
            }
        }

        /**
         * Try to get token from Chrome's cache without user interaction
         */
        async getTokenFromChromeCache() {
            if (this.authMethod !== 'getAuthToken') {
                return null;
            }

            return new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({
                    interactive: false
                }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    if (token) {
                        this.accessToken = token;
                        this.tokenExpiry = Date.now() + (3600 * 1000);
                        this.saveTokenState();
                        resolve(token);
                    } else {
                        reject(new Error('No token in cache'));
                    }
                });
            });
        }

        /**
         * Clear stored authentication
         */
        async clearStoredAuth() {
            try {
                await chrome.storage.local.remove([
                    'google_access_token',
                    'google_token_expiry', 
                    'google_auth_method'
                ]);
                
                this.accessToken = null;
                this.tokenExpiry = null;
                this.authMethod = null;
            } catch (error) {
                console.error('Error clearing stored auth:', error);
            }
        }

        getClientIdForMethod(method) {
            if (method === 'getAuthToken') {
                return CONFIG.CHROME_EXTENSION_CLIENT_ID;
            } else {
                return CONFIG.WEB_CLIENT_ID;
            }
        }

        validateClientIdConfiguration() {
            const chromeClientId = CONFIG.CHROME_EXTENSION_CLIENT_ID;
            const webClientId = CONFIG.WEB_CLIENT_ID;
            
            const issues = [];
            
            if (!chromeClientId || chromeClientId.includes('YOUR_NEW_CHROME_EXTENSION_CLIENT_ID')) {
                issues.push('Chrome Extension client ID not configured');
            }
            
            if (!webClientId || !webClientId.includes('apps.googleusercontent.com')) {
                issues.push('Web Application client ID invalid');
            }
            
            if (chromeClientId === webClientId) {
                issues.push('Both client IDs are the same - they should be different');
            }
            
            return issues;
        }
        
    /**
     * Simplified capability detection
     */
    async detectBrowserCapabilities() {
        if (this.browserCapabilities) {
            return this.browserCapabilities;
        }

        const configIssues = this.validateClientIdConfiguration();
        const isChrome = this.isActualChrome();
        
        const capabilities = {
            browser: isChrome ? 'Chrome' : 'Not-Chrome',
            extensionId: chrome.runtime.id,
            redirectUri: chrome.identity.getRedirectURL(),
            hasIdentityAPI: !!chrome.identity,
            hasGetAuthToken: !!(chrome.identity && chrome.identity.getAuthToken),
            hasLaunchWebAuthFlow: !!(chrome.identity && chrome.identity.launchWebAuthFlow),
            getAuthTokenWorks: false,
            recommendedMethod: 'launchWebAuthFlow'
        };

        console.log(`Browser: ${isChrome ? 'Google Chrome' : 'Not Chrome (using universal auth)'}`);

        // Only test getAuthToken for actual Chrome
        if (isChrome && capabilities.hasGetAuthToken && configIssues.length === 0) {
            try {
                capabilities.getAuthTokenWorks = await this.testGetAuthTokenCapability();
            } catch (error) {
                capabilities.getAuthTokenWorks = false;
            }
        }

        // Simple decision: Chrome with working getAuthToken = native, everything else = universal
        if (isChrome && capabilities.getAuthTokenWorks && configIssues.length === 0) {
            capabilities.recommendedMethod = 'getAuthToken';
            console.log('Using Chrome native authentication');
        } else {
            capabilities.recommendedMethod = 'launchWebAuthFlow';
            console.log('Using universal authentication');
        }

        this.browserCapabilities = capabilities;
        return capabilities;
    }

        /**
         * Simple binary check: Is this actually Google Chrome?
         */
        isActualChrome() {
            // First check: Brave detection (most reliable)
            if (navigator.brave && navigator.brave.isBrave) {
                return false; // Definitely not Chrome
            }
            
            const userAgent = navigator.userAgent;
            
            // Must contain Chrome/
            if (!userAgent.includes('Chrome/')) {
                return false;
            }
            
            // Must NOT contain any known Chromium browser identifiers
            const chromiumBrowsers = ['Brave', 'Edg', 'OPR', 'Vivaldi', 'Arc', 'Samsung', 'Chromium'];
            const hasChromiumIdentifier = chromiumBrowsers.some(browser => 
                userAgent.includes(browser + '/') || userAgent.toLowerCase().includes(browser.toLowerCase())
            );
            
            return !hasChromiumIdentifier;
        }

        /**
         * Simplified browser detection - just Chrome vs Everything Else
         */
        detectBrowserType() {
            return this.isActualChrome() ? 'Chrome' : 'Not-Chrome';
        }

        async testGetAuthTokenCapability() {
            return new Promise((resolve) => {
                chrome.identity.getAuthToken({
                    interactive: false
                }, (token) => {
                    const error = chrome.runtime.lastError?.message || '';
                    
                    if (token) {
                        resolve(true);
                        return;
                    }
                    
                    if (error.includes('Invalid OAuth2 Client ID')) {
                        resolve(false);
                        return;
                    }
                    
                    const supportedErrors = [
                        'OAuth2 not granted or revoked',
                        'OAuth2 request was rejected', 
                        'The user is not signed in',
                        'No such OAuth2 token in cache',
                        'OAuth2 access denied'
                    ];
                    
                    const isSupported = supportedErrors.some(err => 
                        error.toLowerCase().includes(err.toLowerCase())
                    );
                    
                    resolve(isSupported);
                });
                
                setTimeout(() => resolve(false), 5000);
            });
        }

        async authenticate() {
            const capabilities = await this.detectBrowserCapabilities();
            
            if (capabilities.recommendedMethod === 'getAuthToken' && capabilities.getAuthTokenWorks) {
                const success = await this.authenticateWithGetAuthToken();
                if (success) {
                    this.authMethod = 'getAuthToken';
                    await this.saveTokenState();
                }
                return success;
            } else {
                const success = await this.authenticateWithLaunchWebAuthFlow();
                if (success) {
                    this.authMethod = 'launchWebAuthFlow';
                    await this.saveTokenState();
                }
                return success;
            }
        }

        async authenticateWithGetAuthToken() {
            return new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({
                    interactive: true
                }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    if (!token) {
                        reject(new Error('No token received from getAuthToken'));
                        return;
                    }

                    this.accessToken = token;
                    this.tokenExpiry = Date.now() + (3600 * 1000);
                    
                    console.log('✅ Chrome native authentication successful');
                    resolve(true);
                });
            });
        }

        async authenticateWithLaunchWebAuthFlow() {
            const redirectUri = chrome.identity.getRedirectURL();
            const clientId = this.getClientIdForMethod('launchWebAuthFlow');
            
            const authParams = new URLSearchParams({
                client_id: clientId,
                response_type: 'token',
                scope: CONFIG.SCOPE,
                redirect_uri: redirectUri,
                prompt: 'select_account'
            });

            const authURL = `https://accounts.google.com/o/oauth2/v2/auth?${authParams}`;

            return new Promise((resolve, reject) => {
                chrome.identity.launchWebAuthFlow({
                    url: authURL,
                    interactive: true
                }, (redirectURL) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    if (!redirectURL) {
                        reject(new Error('Authorization was cancelled or failed'));
                        return;
                    }

                    try {
                        const url = new URL(redirectURL);
                        const fragment = url.hash.substring(1);
                        const params = new URLSearchParams(fragment);
                        
                        const accessToken = params.get('access_token');
                        const expiresIn = params.get('expires_in') || '3600';

                        if (!accessToken) {
                            throw new Error('No access token received from OAuth flow');
                        }

                        this.accessToken = accessToken;
                        this.tokenExpiry = Date.now() + (parseInt(expiresIn) * 1000);
                        
                        console.log('✅ Universal authentication successful');
                        resolve(true);

                    } catch (error) {
                        reject(error);
                    }
                });
            });
        }

        async getAuthStatus() {
            // Initialize from storage if needed
            if (!this.accessToken) {
                await this.initializeFromStorage();
            }

            const capabilities = await this.detectBrowserCapabilities();
            
            // Try to get a valid token (checks cache if needed)
            let hasValidToken = false;
            try {
                await this.getValidToken();
                hasValidToken = true;
            } catch (error) {
                hasValidToken = false;
            }

            return {
                authenticated: !!this.accessToken,
                tokenValid: hasValidToken,
                expiresAt: this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null,
                authMethod: capabilities.recommendedMethod,
                actualMethodUsed: this.authMethod,
                browserInfo: {
                    type: capabilities.browser,
                    extensionId: capabilities.extensionId,
                    supportsGetAuthToken: capabilities.getAuthTokenWorks,
                    supportsLaunchWebAuthFlow: capabilities.hasLaunchWebAuthFlow
                }
            };
        }

        async getValidToken() {
            // Check memory first
            if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
                return this.accessToken;
            }

            // Try Chrome cache if using native method
            if (this.authMethod === 'getAuthToken') {
                try {
                    const token = await this.getTokenFromChromeCache();
                    if (token) {
                        return token;
                    }
                } catch (error) {
                    // Fall through to error
                }
            }

            throw new Error('Token is expired or missing. Please authenticate again.');
        }

        async makeAPIRequest(endpoint, options = {}) {
            const token = await this.getValidToken();

            const url = `${CONFIG.CALENDAR_API_BASE}${endpoint}`;
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
                    this.accessToken = null;
                    this.tokenExpiry = null;
                }
                
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            return response.json();
        }

        async createEventFromAssignment(assignment) {
            const dueDate = new Date(assignment.dueDate);
            const dueDateOnly = dueDate.toLocaleDateString('en-CA', {
                timeZone: 'America/Los_Angeles'
            });

            const event = {
                summary: `${assignment.course}: ${assignment.title}`,
                description: `Gradescope Assignment: ${assignment.title}\n\nCourse: ${assignment.course}\n\nDue: ${dueDate.toLocaleString('en-US', { 
                    timeZone: 'America/Los_Angeles',
                    dateStyle: 'full',
                    timeStyle: 'short'
                })}\n\nSubmit at: ${assignment.url}\n\nExtracted from: ${assignment.pageUrl}`,
                
                start: {
                    date: dueDateOnly
                },
                end: {
                    date: dueDateOnly
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
                colorId: '9'
            };

            const response = await this.makeAPIRequest('/calendars/primary/events', {
                method: 'POST',
                body: JSON.stringify(event)
            });

            this.eventCache.invalidateAssignment(assignment.assignmentId);
            return response;
        }

        async findExistingEvent(assignmentId) {
            try {
                const cachedEvent = await this.eventCache.getExistingEvent(assignmentId);
                if (cachedEvent) {
                    return cachedEvent;
                }
                return null;
            } catch (error) {
                console.error(`❌ Error searching for existing event ${assignmentId}:`, error.message);
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
                const authStatus = await this.getAuthStatus();
                if (!authStatus.authenticated || !authStatus.tokenValid) {
                    return { 
                        success: false, 
                        reason: 'Authentication needed - please reconnect Google Calendar',
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
                console.error('Error getting stored assignments:', error);
                return [];
            }
        }
    }

class AutoSyncManager {
    static async setupAutoSync() {
        await chrome.alarms.clear(CONFIG.ALARM_NAME);
        await chrome.alarms.create(CONFIG.ALARM_NAME, {
            delayInMinutes: CONFIG.AUTO_SYNC_INTERVAL,
            periodInMinutes: CONFIG.AUTO_SYNC_INTERVAL
        });
        console.log(`✅ Auto-sync scheduled every ${CONFIG.AUTO_SYNC_INTERVAL} minutes`);
    }

    static async disableAutoSync() {
        await chrome.alarms.clear(CONFIG.ALARM_NAME);
        console.log('✅ Auto-sync disabled');
    }

    static async getAutoSyncStatus() {
        const alarm = await chrome.alarms.get(CONFIG.ALARM_NAME);
        const storage = await chrome.storage.local.get(['last_auto_sync', 'last_sync_results', 'last_auto_sync_error']);
        
        return {
            enabled: !!alarm,
            interval: CONFIG.AUTO_SYNC_INTERVAL,
            nextSync: alarm ? new Date(alarm.scheduledTime).toISOString() : null,
            lastSync: storage.last_auto_sync || null,
            lastResults: storage.last_sync_results || null,
            lastError: storage.last_auto_sync_error || null
        };
    }
}

// Global instance
const calendarClient = new EnhancedGoogleCalendarClient();

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === CONFIG.ALARM_NAME) {
        console.log('⏰ Auto-sync alarm triggered');
        await calendarClient.performBackgroundSync();
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handleMessage = async () => {
        switch (request.action) {
            case 'authenticate':
                await calendarClient.authenticate();
                await AutoSyncManager.setupAutoSync();
                return { success: true, message: 'Authentication successful, auto-sync enabled' };

            case 'getAuthStatus':
                const authStatus = await calendarClient.getAuthStatus();
                return { 
                    success: true, 
                    authenticated: authStatus.authenticated,
                    tokenValid: authStatus.tokenValid,
                    expiresAt: authStatus.expiresAt,
                    authMethod: authStatus.authMethod,
                    browserInfo: authStatus.browserInfo
                };

            case 'syncToCalendar':
                return await handleCalendarSync(request.assignments);

            case 'clearAuth':
                await AutoSyncManager.disableAutoSync();
                await calendarClient.clearStoredAuth();
                
                // Also clear Chrome's token cache if using native method
                if (calendarClient.authMethod === 'getAuthToken' && calendarClient.accessToken) {
                    try {
                        await new Promise((resolve) => {
                            chrome.identity.removeCachedAuthToken({
                                token: calendarClient.accessToken
                            }, resolve);
                        });
                    } catch (error) {
                        console.log('Error clearing Chrome token cache:', error);
                    }
                }
                
                return { success: true, message: 'Authentication cleared completely' };

            case 'enableAutoSync':
                await AutoSyncManager.setupAutoSync();
                return { success: true, message: 'Auto-sync enabled' };

            case 'disableAutoSync':
                await AutoSyncManager.disableAutoSync();
                return { success: true, message: 'Auto-sync disabled' };

            case 'getAutoSyncStatus':
                const status = await AutoSyncManager.getAutoSyncStatus();
                return { success: true, status };

            case 'performBackgroundSync':
                const result = await calendarClient.performBackgroundSync();
                return result;

            case 'getCacheStats':
                const stats = calendarClient.eventCache.getStats();
                return { success: true, cacheStats: stats };

            case 'forceCacheRefresh':
                await calendarClient.eventCache.forceRefresh();
                return { success: true, message: 'Cache forcefully refreshed' };

            default:
                return { success: false, error: 'Unknown action' };
        }
    };

    handleMessage()
        .then(result => {
            if (typeof result === 'object' && result !== null && !result.hasOwnProperty('success')) {
                result = { success: true, data: result };
            }
            sendResponse(result);
        })
        .catch(error => {
            console.error(`❌ Message ${request.action} handler error:`, error);
            sendResponse({ success: false, error: error.message });
        });

    return true;
});

async function handleCalendarSync(assignments) {
    try {
        const results = await calendarClient.syncAssignments(assignments);
        
        await chrome.storage.local.set({
            last_auto_sync: new Date().toISOString(),
            last_sync_results: results
        });
        
        return { success: true, results };
    } catch (error) {
        console.error('❌ Calendar sync failed:', error);
        
        await chrome.storage.local.set({
            last_auto_sync_error: {
                timestamp: new Date().toISOString(),
                error: error.message
            }
        });
        
        return { success: false, error: error.message };
    }
}

chrome.runtime.onStartup.addListener(async () => {
    console.log('🌟 Extension startup - checking auto-sync status...');
    
    const authStatus = await calendarClient.getAuthStatus();
    if (authStatus.authenticated && authStatus.tokenValid) {
        await AutoSyncManager.setupAutoSync();
        console.log('✅ Auto-sync re-enabled on startup');
    }
});

// Initialize token state when service worker starts
(async () => {
    try {
        await calendarClient.initializeFromStorage();
        console.log('✅ Background script initialized with stored auth state');
    } catch (error) {
        console.error('Error initializing background script:', error);
    }
})();

console.log('✅ Enhanced background script with persistent auth initialized');