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
    CHROME_EXTENSION_CLIENT_ID: '589515007396-aje4t3afip1e9piitlp817t0g9ro4kab.apps.googleusercontent.com',
    
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
        this.authMethod = null; // Track which method was used
        this.eventCache = new EventCache(this); 
    }

    /**
     * 🆔 Get appropriate client ID for authentication method
     */
    getClientIdForMethod(method) {
        if (method === 'getAuthToken') {
            console.log('🔑 Using Chrome Extension client ID for getAuthToken');
            return CONFIG.CHROME_EXTENSION_CLIENT_ID;
        } else {
            console.log('🌐 Using Web Application client ID for launchWebAuthFlow');
            return CONFIG.WEB_CLIENT_ID;
        }
    }

    /**
     * 🔍 Validate client ID configuration
     */
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
    
    async detectBrowserCapabilities() {
        if (this.browserCapabilities) {
            console.log('🔄 Using cached browser capabilities:', this.browserCapabilities);
            return this.browserCapabilities;
        }

        console.log('🔍 Detecting browser capabilities...');
        
        // Check client ID configuration first
        const configIssues = this.validateClientIdConfiguration();
        if (configIssues.length > 0) {
            console.warn('⚠️ Client ID configuration issues:', configIssues);
        }
        
        const capabilities = {
            browser: this.detectBrowserType(),
            extensionId: chrome.runtime.id,
            redirectUri: chrome.identity.getRedirectURL(),
            hasIdentityAPI: !!chrome.identity,
            hasGetAuthToken: !!(chrome.identity && chrome.identity.getAuthToken),
            hasLaunchWebAuthFlow: !!(chrome.identity && chrome.identity.launchWebAuthFlow),
            getAuthTokenWorks: false,
            recommendedMethod: 'launchWebAuthFlow'
        };

        console.log('📊 Browser Capability Detection Results:');
        console.log(`   🌐 Browser Type: ${capabilities.browser}`);
        console.log(`   🆔 Extension ID: ${capabilities.extensionId}`);
        console.log(`   🔧 Has chrome.identity: ${capabilities.hasIdentityAPI}`);
        console.log(`   🔑 Has getAuthToken function: ${capabilities.hasGetAuthToken}`);
        console.log(`   🌍 Has launchWebAuthFlow function: ${capabilities.hasLaunchWebAuthFlow}`);
        console.log(`   🔗 Redirect URI: ${capabilities.redirectUri}`);

        if (capabilities.hasGetAuthToken && configIssues.length === 0) {
            try {
                console.log('🧪 Testing getAuthToken capability with Chrome Extension client...');
                capabilities.getAuthTokenWorks = await this.testGetAuthTokenCapability();
                console.log(`✅ getAuthToken test result: ${capabilities.getAuthTokenWorks}`);
                
                if (capabilities.getAuthTokenWorks) {
                    console.log('🎉 getAuthToken is available and working!');
                } else {
                    console.log('❌ getAuthToken test returned false');
                }
                
            } catch (error) {
                console.log('⚠️ getAuthToken test threw an error:', error.message);
                console.log('📜 Full error details:', error);
                capabilities.getAuthTokenWorks = false;
            }
        } else {
            console.log('❌ Skipping getAuthToken test - missing function or configuration issues');
        }

        // 🔧 ENHANCED DECISION LOGIC
        console.log('🤔 Making authentication method decision...');
        
        if (capabilities.getAuthTokenWorks && capabilities.browser === 'Chrome' && configIssues.length === 0) {
            capabilities.recommendedMethod = 'getAuthToken';
            console.log('🏆 DECISION: Chrome native getAuthToken will be used!');
            console.log('   ✅ Reason: getAuthToken available, working, Chrome detected, clients configured');
        } else {
            capabilities.recommendedMethod = 'launchWebAuthFlow';
            console.log('🔄 DECISION: Universal launchWebAuthFlow will be used');
            
            const reasons = [];
            if (!capabilities.getAuthTokenWorks) reasons.push('getAuthToken test failed');
            if (capabilities.browser !== 'Chrome') reasons.push(`browser is ${capabilities.browser}`);
            if (configIssues.length > 0) reasons.push(`config issues: ${configIssues.join(', ')}`);
            
            console.log('   📝 Reasons:', reasons.join(', '));
        }

        console.log('📋 Final capability summary:', {
            browser: capabilities.browser,
            method: capabilities.recommendedMethod,
            getAuthTokenAvailable: capabilities.hasGetAuthToken,
            getAuthTokenWorks: capabilities.getAuthTokenWorks
        });

        this.browserCapabilities = capabilities;
        return capabilities;
    }

    detectBrowserType() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Brave')) return 'Brave';
        if (userAgent.includes('Edg/')) return 'Edge';
        if (userAgent.includes('Chrome/')) return 'Chrome';
        if (userAgent.includes('Chromium/')) return 'Chromium';
        return 'Unknown';
    }

    /**
     * 🧪 Enhanced getAuthToken test with proper client validation
     */
    async testGetAuthTokenCapability() {
        console.log('🔬 Testing getAuthToken with Chrome Extension client...');
        
        const chromeClientId = CONFIG.CHROME_EXTENSION_CLIENT_ID;
        console.log('🔑 Testing with Chrome Extension client ID:', chromeClientId);
        
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            chrome.identity.getAuthToken({
                interactive: false
            }, (token) => {
                const duration = Date.now() - startTime;
                const error = chrome.runtime.lastError?.message || '';
                
                console.log('🔬 getAuthToken test results:');
                console.log(`   ⏱️ Duration: ${duration}ms`);
                console.log(`   🎫 Token received: ${!!token}`);
                console.log(`   ⚠️ Error: ${error || 'None'}`);
                
                if (token) {
                    console.log('✅ getAuthToken working perfectly with Chrome Extension client!');
                    resolve(true);
                    return;
                }
                
                // Handle specific errors
                if (error.includes('Invalid OAuth2 Client ID')) {
                    console.log('❌ Invalid OAuth2 Client ID for Chrome Extension');
                    console.log('   💡 Verify Chrome Extension client is created in Google Cloud Console');
                    console.log('   💡 Check extension ID matches: pembhpamnbbklhjdimchmgoogfddabbi');
                    resolve(false);
                    return;
                }
                
                // Standard OAuth errors (these mean getAuthToken works, just no cached token)
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
                
                if (isSupported) {
                    console.log('✅ getAuthToken supported - just needs user authentication');
                    resolve(true);
                } else {
                    console.log(`❌ Unsupported error: ${error}`);
                    resolve(false);
                }
            });
            
            setTimeout(() => {
                console.log('⏰ getAuthToken test timeout');
                resolve(false);
            }, 5000);
        });
    }

    /**
     * 🔐 Main authentication method - chooses best approach
     */
    async authenticate() {
        const capabilities = await this.detectBrowserCapabilities();
        
        console.log(`🔐 Starting authentication using ${capabilities.recommendedMethod} method`);
        
        if (capabilities.recommendedMethod === 'getAuthToken' && capabilities.getAuthTokenWorks) {
            const success = await this.authenticateWithGetAuthToken();
            if (success) {
                this.authMethod = 'getAuthToken';
                console.log('🎉 Successfully authenticated with Chrome native method!');
            }
            return success;
        } else {
            const success = await this.authenticateWithLaunchWebAuthFlow();
            if (success) {
                this.authMethod = 'launchWebAuthFlow';
                console.log('🎉 Successfully authenticated with universal method!');
            }
            return success;
        }
    }

    /**
     * 🔑 Chrome native authentication using getAuthToken
     */
    async authenticateWithGetAuthToken() {
        console.log('🔐 Authenticating with Chrome native getAuthToken...');
        
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({
                interactive: true
            }, (token) => {
                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError.message;
                    console.error('❌ getAuthToken failed:', error);
                    
                    if (error.includes('Invalid OAuth2 Client ID')) {
                        console.error('💡 Solution: Create Chrome Extension OAuth client in Google Cloud Console');
                    }
                    
                    reject(new Error(error));
                    return;
                }

                if (!token) {
                    reject(new Error('No token received from getAuthToken'));
                    return;
                }

                this.accessToken = token;
                this.tokenExpiry = Date.now() + (3600 * 1000);
                
                console.log('✅ Chrome native authentication successful!');
                console.log(`🎫 Token length: ${token.length} characters`);
                
                resolve(true);
            });
        });
    }

    /**
     * 🌐 Universal authentication using launchWebAuthFlow
     */
    async authenticateWithLaunchWebAuthFlow() {
        console.log('🌐 Authenticating with universal launchWebAuthFlow...');
        
        const redirectUri = chrome.identity.getRedirectURL();
        const clientId = this.getClientIdForMethod('launchWebAuthFlow');
        
        console.log('🔗 Using redirect URI:', redirectUri);
        console.log('🆔 Using Web Application client ID:', clientId);
        
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
                    console.error('❌ launchWebAuthFlow failed:', chrome.runtime.lastError.message);
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
                    
                    console.log('✅ Universal authentication successful!');
                    console.log(`🎫 Token length: ${accessToken.length} characters`);
                    
                    resolve(true);

                } catch (error) {
                    console.error('❌ Token parsing failed:', error);
                    reject(error);
                }
            });
        });
    }

    /**
     * 📊 Enhanced auth status with method tracking
     */
    async getAuthStatus() {
        const capabilities = await this.detectBrowserCapabilities();
        const hasValidToken = this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry;

        return {
            authenticated: !!this.accessToken,
            tokenValid: hasValidToken,
            expiresAt: this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null,
            authMethod: capabilities.recommendedMethod,
            actualMethodUsed: this.authMethod, // Which method was actually used for current token
            browserInfo: {
                type: capabilities.browser,
                extensionId: capabilities.extensionId,
                supportsGetAuthToken: capabilities.getAuthTokenWorks,
                supportsLaunchWebAuthFlow: capabilities.hasLaunchWebAuthFlow,
                clientConfiguration: {
                    chromeExtensionClientConfigured: !CONFIG.CHROME_EXTENSION_CLIENT_ID.includes('YOUR_NEW_CHROME_EXTENSION_CLIENT_ID'),
                    webApplicationClientConfigured: !!CONFIG.WEB_CLIENT_ID
                }
            }
        };
    }

    /**
     * 🔧 ENHANCED: Smart token validation optimized for daily sync intervals
     */
    async getValidToken() {
        if (!this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry - 60000) {
            throw new Error('Token is expired or missing. Please authenticate again.');
        }
        return this.accessToken;
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

        console.log(`📡 API Request: ${options.method || 'GET'} ${endpoint}`);

        const response = await fetch(url, requestOptions);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ API Error: ${response.status} ${response.statusText}`, errorText);
            
            if (response.status === 401) {
                console.warn('🔐 Token appears to be invalid, clearing cache');
                this.accessToken = null;
                this.tokenExpiry = null;
            }
            
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * ⭐ ENHANCED: Create ALL-DAY calendar events for better visibility
     */
    async createEventFromAssignment(assignment) {
        console.log('📅 Creating ALL-DAY calendar event for:', assignment.title);

        // Parse the due date to create an all-day event
        const dueDate = new Date(assignment.dueDate);

        // 🔧 FIX: Use Pacific Time date to avoid timezone shift issues
        // Berkeley assignments should appear on the correct date for Pacific Time users
        const dueDateOnly = dueDate.toLocaleDateString('en-CA', {
            timeZone: 'America/Los_Angeles'
        }); // en-CA format gives YYYY-MM-DD in specified timezone

        console.log(`📅 Due date conversion: ${assignment.dueDate} → ${dueDateOnly} (Pacific Time)`);
        const event = {
            summary: `${assignment.course}: ${assignment.title}`,
            description: `Gradescope Assignment: ${assignment.title}\n\nCourse: ${assignment.course}\n\nDue: ${dueDate.toLocaleString('en-US', { 
                timeZone: 'America/Los_Angeles',
                dateStyle: 'full',
                timeStyle: 'short'
            })}\n\nSubmit at: ${assignment.url}\n\nExtracted from: ${assignment.pageUrl}`,
            
            // 🌟 ALL-DAY EVENT: Use date format instead of dateTime
            start: {
                date: dueDateOnly // This makes it an all-day event
            },
            end: {
                date: dueDateOnly // Same date for single-day event
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
                    gradescope_due_time: assignment.dueDate // Keep exact due time for reference
                }
            },
            // Add color coding for assignments
            colorId: '9' // Blue color for assignments
        };

        const response = await this.makeAPIRequest('/calendars/primary/events', {
            method: 'POST',
            body: JSON.stringify(event)
        });

        // Invalidate cache for this assignment after creating event
        this.eventCache.invalidateAssignment(assignment.assignmentId);

        console.log('✅ ALL-DAY calendar event created:', response.id);
        return response;
    }

    /**
     * OPTIMIZED: Find existing calendar event by assignment ID using cache
     * Converts O(n²) API calls to O(1) cached lookups
     */
    async findExistingEvent(assignmentId) {
        console.log(`🔍 Looking for existing event for assignment: ${assignmentId}`);
        
        try {
            // Use cache-first approach
            const cachedEvent = await this.eventCache.getExistingEvent(assignmentId);
            
            if (cachedEvent) {
                console.log(`✅ Found existing event via cache: ${cachedEvent.id}`);
                return cachedEvent;
            }
            
            console.log(`❌ No existing event found for assignment: ${assignmentId}`);
            return null;
            
        } catch (error) {
            console.error(`❌ Error searching for existing event ${assignmentId}:`, error.message);
            // Return null to allow creation - better to have potential duplicates than miss assignments
            return null;
        }
    }

    async syncAssignments(assignments) {
        console.log(`🔄 Starting calendar sync for ${assignments.length} assignments...`);
        
        const results = {
            created: 0,
            skipped: 0,
            errors: 0,
            details: []
        };

        for (const assignment of assignments) {
            try {
                if (!assignment.dueDate) {
                    console.log(`⭐️ Skipping ${assignment.title} (no due date)`);
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
                    console.log(`⭐️ Skipping ${assignment.title} (already exists: ${existingEvent.id})`);
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

        console.log('✅ Sync completed:', results);
        return results;
    }

    /**
     * 🔧 ENHANCED: Background sync optimized for daily intervals
     */
    async performBackgroundSync() {
        console.log('🔄 Starting daily background sync...');
        
        try {
            // Simple auth check - with daily sync, we don't need complex persistence
            const authStatus = await this.getAuthStatus();
            if (!authStatus.authenticated || !authStatus.tokenValid) {
                console.log('⚠️ Background sync skipped: authentication needed');
                // Don't disable auto-sync - just skip this attempt
                // User will re-auth next time they use the extension
                return { 
                    success: false, 
                    reason: 'Authentication needed - please reconnect Google Calendar',
                    needsReauth: true,
                    silent: true // Don't treat as failure for daily sync
                };
            }

            // Get all stored assignments
            const assignments = await this.getAllStoredAssignments();
            if (assignments.length === 0) {
                console.log('ℹ️ Background sync: no assignments to sync');
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

            // Perform sync
            const results = await this.syncAssignments(assignments);
            console.log('✅ Background sync completed:', results);
            
            // Store last sync timestamp
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
            
            // For daily sync, we don't need to disable on first failure
            // Just log it and try again tomorrow
            return { 
                success: false, 
                error: error.message, 
                silent: true // Don't treat as critical failure
            };
        }
    }

    /**
     * Get all unique assignments from storage
     */
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

            // Remove duplicates based on assignment ID
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

/**
 * 🌟 AUTO-SYNC MANAGEMENT
 */
class AutoSyncManager {
    static async setupAutoSync() {
        console.log('⚙️ Setting up automatic sync...');
        
        // Clear any existing alarms
        await chrome.alarms.clear(CONFIG.ALARM_NAME);
        
        // Create periodic alarm
        await chrome.alarms.create(CONFIG.ALARM_NAME, {
            delayInMinutes: CONFIG.AUTO_SYNC_INTERVAL,
            periodInMinutes: CONFIG.AUTO_SYNC_INTERVAL
        });
        
        console.log(`✅ Auto-sync scheduled every ${CONFIG.AUTO_SYNC_INTERVAL} minutes`);
    }

    static async disableAutoSync() {
        console.log('🛑 Disabling automatic sync...');
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

/**
 * 🌟 ALARM LISTENER: Handles automatic background sync
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === CONFIG.ALARM_NAME) {
        console.log('⏰ Auto-sync alarm triggered');
        await calendarClient.performBackgroundSync();
    }
});

/**
 * Enhanced message handler with consistent response format
 * Fixed version that ensures all responses have { success: boolean } format
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Background script received message:', request.action);

    const handleMessage = async () => {
        switch (request.action) {
            case 'authenticate':
                await calendarClient.authenticate();
                // Automatically enable auto-sync after successful authentication
                await AutoSyncManager.setupAutoSync();
                return { success: true, message: 'Authentication successful, auto-sync enabled' };

            case 'getAuthStatus':
                // 🔧 FIX: Wrap the auth status in success format
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
                // Clear stored tokens
                await chrome.storage.local.remove([
                    'google_access_token',
                    'google_refresh_token', 
                    'google_token_expiry'
                ]);
                // Clear client tokens
                calendarClient.accessToken = null;
                calendarClient.refreshToken = null;
                calendarClient.tokenExpiry = null;
                return { success: true, message: 'Authentication cleared, auto-sync disabled' };

            case 'testAPI':
                // If this method exists
                if (typeof calendarClient.testAPIAccess === 'function') {
                    const testResult = await calendarClient.testAPIAccess();
                    return { success: true, testResult };
                } else {
                    return { success: false, error: 'Test API method not implemented' };
                }

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
                const isForceSync = request.forceSync === true;
                const result = await calendarClient.performBackgroundSync(isForceSync);
                return result; // This method already returns proper format

            case 'getCacheStats':
                const stats = calendarClient.eventCache.getStats();
                return { success: true, cacheStats: stats };

            case 'forceCacheRefresh':
                await calendarClient.eventCache.forceRefresh();
                return { success: true, message: 'Cache forcefully refreshed' };

            default:
                console.warn('⚠️ Unknown message action:', request.action);
                return { success: false, error: 'Unknown action' };
        }
    };

    handleMessage()
        .then(result => {
            // 🔧 SAFETY CHECK: Ensure all responses have success property
            if (typeof result === 'object' && result !== null && !result.hasOwnProperty('success')) {
                console.warn(`⚠️ Handler for ${request.action} returned object without success property:`, result);
                // Wrap in success format
                result = { success: true, data: result };
            }
            
            console.log(`✅ Message ${request.action} handled successfully`);
            sendResponse(result);
        })
        .catch(error => {
            console.error(`❌ Message ${request.action} handler error:`, error);
            sendResponse({ success: false, error: error.message });
        });

    return true; // Keep message channel open for async response
});

/**
 * Handle calendar sync request - FIXED to update last sync time
 */
async function handleCalendarSync(assignments) {
    try {
        console.log('📅 Handling calendar sync request...');
        const results = await calendarClient.syncAssignments(assignments);
        
        // 🌟 FIX: Also update last sync timestamp for manual syncs
        await chrome.storage.local.set({
            last_auto_sync: new Date().toISOString(),
            last_sync_results: results
        });
        
        return { success: true, results };
    } catch (error) {
        console.error('❌ Calendar sync failed:', error);
        
        // Store error for manual syncs too
        await chrome.storage.local.set({
            last_auto_sync_error: {
                timestamp: new Date().toISOString(),
                error: error.message
            }
        });
        
        return { success: false, error: error.message };
    }
}

// Initialize auto-sync on extension startup (if user is already authenticated)
chrome.runtime.onStartup.addListener(async () => {
    console.log('🌟 Extension startup - checking auto-sync status...');
    
    const authStatus = await calendarClient.getAuthStatus();
    if (authStatus.authenticated && authStatus.tokenValid) {
        await AutoSyncManager.setupAutoSync();
        console.log('✅ Auto-sync re-enabled on startup');
    }
});

console.log('✅ Enhanced background script with dual OAuth clients initialized');