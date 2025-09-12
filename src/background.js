const CONFIG = {
    CALENDAR_API_BASE: 'https://www.googleapis.com/calendar/v3',
    CLIENT_ID: '589515007396-nofmk5v0dhegv5fmp1700v8ve94624ih.apps.googleusercontent.com', 
    SCOPE: 'https://www.googleapis.com/auth/calendar',
    AUTO_SYNC_INTERVAL: 30, // minutes
    ALARM_NAME: 'gradescope_auto_sync'
};

console.log('🌟 Enhanced background script with auto-sync loaded');
console.log('🔑 Using Client ID:', CONFIG.CLIENT_ID);

/**
 * OPTIMIZATION: Event Caching System
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
                console.log(`💾 Cache hit for assignment ${assignmentId} -> event ${cachedData.eventId}`);
                return { id: cachedData.eventId, ...cachedData.eventData };
            }
            
            console.log(`💾 Cache miss for assignment ${assignmentId}`);
            return null;
            
        } catch (cacheError) {
            console.warn('🔄 Event cache failed, falling back to direct API:', cacheError.message);
            return await this.fallbackToDirectAPI(assignmentId);
        }
    }

    async ensureCacheValid() {
        const now = Date.now();
        const cacheAge = this.lastFullRefresh ? (now - this.lastFullRefresh) : Infinity;
        
        if (cacheAge < this.CACHE_DURATION) {
            return;
        }
        
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

    async refreshCache() {
        console.log('🔄 Starting cache refresh...');
        
        try {
            const events = await this.getAllGradescopeEvents();
            
            this.cache.clear();
            console.log('🧹 Cache cleared, rebuilding...');

            let cachedCount = 0;
            events.forEach(event => {
                const assignmentId = event.extendedProperties?.private?.gradescope_assignment_id;
                if (assignmentId) {
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
                    }
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
        console.log('📡 getAllGradescopeEvents: Starting API call...');
        
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
            console.log(`📡 API returned ${allEvents.length} total calendar events`);
            
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
            
            console.log(`📡 Found ${gradescopeEvents.length} Gradescope-like events out of ${allEvents.length} total`);
            return gradescopeEvents;
            
        } catch (error) {
            console.error('❌ getAllGradescopeEvents API call failed:', error);
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
            console.error('❌ Fallback API also failed:', error);
            return null;
        }
    }

    enforceCacheLimit() {
        if (this.cache.size <= this.MAX_CACHE_SIZE) {
            return;
        }
        
        console.log(`🧹 Cache size (${this.cache.size}) exceeded limit, cleaning up...`);
        
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
        const removed = this.cache.delete(assignmentId);
        if (removed) {
            console.log(`🗑️ Invalidated cache entry for assignment ${assignmentId}`);
        }
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

/**
 * Enhanced Google Calendar Client with Automatic Token Refresh
 */
class EnhancedGoogleCalendarClient {
    constructor() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.browserCapabilities = null;
        this.eventCache = new EventCache(this);
    }

    async detectBrowserCapabilities() {
        if (this.browserCapabilities) {
            return this.browserCapabilities;
        }

        console.log('🔍 Detecting browser capabilities...');
        
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

        if (capabilities.hasGetAuthToken) {
            try {
                capabilities.getAuthTokenWorks = await this.testGetAuthTokenCapability();
            } catch (error) {
                console.log('⚠️ getAuthToken test failed:', error.message);
                capabilities.getAuthTokenWorks = false;
            }
        }

        if (capabilities.getAuthTokenWorks && capabilities.browser === 'Chrome') {
            capabilities.recommendedMethod = 'getAuthToken';
            console.log('✅ Chrome native getAuthToken available and working');
        } else {
            capabilities.recommendedMethod = 'launchWebAuthFlow';
            console.log('✅ Using universal launchWebAuthFlow for cross-browser compatibility');
        }

        this.browserCapabilities = capabilities;
        return capabilities;
    }

    async testGetAuthTokenCapability() {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({
                interactive: false
            }, (token) => {
                const error = chrome.runtime.lastError?.message || '';
                
                const supportedErrors = [
                    'OAuth2 not granted or revoked',
                    'OAuth2 request was rejected', 
                    'The user is not signed in',
                    'No such OAuth2 token in cache'
                ];
                
                const unsupportedErrors = [
                    'not supported',
                    'not available',
                    'not implemented', 
                    'turned off browser signin',
                    'Custom URI scheme',
                    'invalid_request'
                ];

                const isSupported = !!token || supportedErrors.some(err => 
                    error.toLowerCase().includes(err.toLowerCase())
                );

                const isUnsupported = unsupportedErrors.some(err => 
                    error.toLowerCase().includes(err.toLowerCase())
                );
                
                resolve(isSupported && !isUnsupported);
            });
        });
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
     * 🔧 ENHANCED: Authentication with refresh token support
     */
    async authenticate() {
        const capabilities = await this.detectBrowserCapabilities();
        
        console.log(`🔐 Starting enhanced authentication with refresh token support...`);
        
        // Try the more reliable method that can get refresh tokens
        if (capabilities.getAuthTokenWorks) {
            return await this.authenticateWithGetAuthToken();
        } else {
            return await this.authenticateWithAuthorizationCode();
        }
    }

    /**
     * Authorization code flow for refresh token support
     */
    async authenticateWithAuthorizationCode() {
        console.log('🔐 Using authorization code flow for refresh tokens...');
        
        const redirectUri = chrome.identity.getRedirectURL();
        console.log('🔗 Using redirect URI:', redirectUri);
        
        // Generate PKCE parameters for security
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        
        const authParams = new URLSearchParams({
            client_id: CONFIG.CLIENT_ID,
            response_type: 'code',  // Use 'code' instead of 'token'
            scope: CONFIG.SCOPE,
            redirect_uri: redirectUri,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            access_type: 'offline',  // Request refresh token
            prompt: 'consent'        // Force consent to ensure refresh token
        });

        const authURL = `https://accounts.google.com/o/oauth2/v2/auth?${authParams}`;
        console.log('🌐 Auth URL constructed:', authURL);

        return new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow({
                url: authURL,
                interactive: true
            }, async (redirectURL) => {
                console.log('🌐 OAuth callback received');
                
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
                    // Extract authorization code from redirect URL
                    const url = new URL(redirectURL);
                    const code = url.searchParams.get('code');
                    
                    if (!code) {
                        throw new Error('No authorization code received');
                    }

                    // Exchange code for tokens
                    await this.exchangeCodeForTokens(code, codeVerifier, redirectUri);
                    
                    console.log('✅ Authorization code authentication successful with refresh token');
                    resolve(true);

                } catch (error) {
                    console.error('❌ Token exchange failed:', error);
                    reject(error);
                }
            });
        });
    }

    /**
     * Exchange authorization code for access + refresh tokens
     */
    async exchangeCodeForTokens(authCode, codeVerifier, redirectUri) {
        console.log('🔄 Exchanging authorization code for tokens...');

        const tokenParams = new URLSearchParams({
            client_id: CONFIG.CLIENT_ID,
            code: authCode,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
        });

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: tokenParams
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`Token exchange failed: ${response.status} - ${errorData}`);
        }

        const tokens = await response.json();
        console.log('📨 Token response:', {
            access_token: tokens.access_token ? 'received' : 'missing',
            refresh_token: tokens.refresh_token ? 'received' : 'missing',
            expires_in: tokens.expires_in
        });

        // Store tokens
        this.accessToken = tokens.access_token;
        this.refreshToken = tokens.refresh_token; // Critical: Now we have refresh token!
        this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);

        await this.saveTokens();
        console.log('✅ Tokens saved with refresh capability');
    }

    /**
     * Chrome's getAuthToken with better error handling
     */
    async authenticateWithGetAuthToken() {
        console.log('🔐 Using Chrome native getAuthToken...');
        
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({
                interactive: true,
                scopes: [CONFIG.SCOPE]
            }, (token) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ getAuthToken failed:', chrome.runtime.lastError.message);
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (!token) {
                    reject(new Error('No token received from getAuthToken'));
                    return;
                }

                this.accessToken = token;
                this.tokenExpiry = Date.now() + (3600 * 1000); // Chrome manages refresh internally
                
                console.log('✅ Chrome native authentication successful');
                resolve(true);
            });
        });
    }

    /**
     * Automatic token refresh using stored refresh token
     */
    async refreshAccessToken() {
        if (!this.refreshToken) {
            console.log('⚠️ No refresh token available, need to re-authenticate');
            throw new Error('No refresh token available - please re-authenticate');
        }

        console.log('🔄 Refreshing access token using refresh token...');

        const refreshParams = new URLSearchParams({
            client_id: CONFIG.CLIENT_ID,
            refresh_token: this.refreshToken,
            grant_type: 'refresh_token'
        });

        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: refreshParams
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error('❌ Token refresh failed:', response.status, errorData);
                
                // If refresh token is invalid, clear everything and require re-auth
                if (response.status === 400 || response.status === 401) {
                    await this.clearTokens();
                    throw new Error('Refresh token expired - please re-authenticate');
                }
                
                throw new Error(`Token refresh failed: ${response.status} - ${errorData}`);
            }

            const tokens = await response.json();
            
            // Update tokens
            this.accessToken = tokens.access_token;
            this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            
            // Refresh token might be rotated
            if (tokens.refresh_token) {
                this.refreshToken = tokens.refresh_token;
            }

            await this.saveTokens();
            console.log('✅ Access token refreshed successfully');
            
        } catch (error) {
            console.error('❌ Token refresh failed:', error);
            throw error;
        }
    }

    /**
     * Get valid token with automatic refresh
     */
    async getValidToken() {
        // Load tokens if not in memory
        if (!this.accessToken) {
            const hasTokens = await this.loadTokens();
            if (!hasTokens) {
                throw new Error('No authentication tokens found - please authenticate');
            }
        }

        // Check if token is expired or about to expire (5 min buffer)
        const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
        
        if (!this.tokenExpiry || this.tokenExpiry < fiveMinutesFromNow) {
            console.log('🔄 Token expired or expiring soon, attempting refresh...');
            
            try {
                await this.refreshAccessToken();
            } catch (error) {
                // If refresh fails, clear tokens and throw error for re-authentication
                await this.clearTokens();
                throw new Error('Token refresh failed - authentication required');
            }
        }

        return this.accessToken;
    }

    /**
     * Save tokens to secure storage
     */
    async saveTokens() {
        try {
            await chrome.storage.local.set({
                'google_access_token': this.accessToken,
                'google_refresh_token': this.refreshToken,
                'google_token_expiry': this.tokenExpiry,
                'token_saved_at': new Date().toISOString()
            });
            console.log('💾 Tokens saved securely');
        } catch (error) {
            console.error('❌ Failed to save tokens:', error);
            throw error;
        }
    }

    /**
     * Load tokens from secure storage
     */
    async loadTokens() {
        try {
            const result = await chrome.storage.local.get([
                'google_access_token',
                'google_refresh_token', 
                'google_token_expiry',
                'token_saved_at'
            ]);

            this.accessToken = result.google_access_token;
            this.refreshToken = result.google_refresh_token;
            this.tokenExpiry = result.google_token_expiry;

            const hasTokens = !!(this.accessToken && this.refreshToken);
            
            if (hasTokens) {
                const savedAt = result.token_saved_at;
                console.log(`📥 Tokens loaded from storage (saved: ${savedAt})`);
                console.log(`🕐 Token expires: ${new Date(this.tokenExpiry).toLocaleString()}`);
            }

            return hasTokens;
        } catch (error) {
            console.error('❌ Failed to load tokens:', error);
            return false;
        }
    }

    /**
     * Clear all authentication tokens
     */
    async clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        
        await chrome.storage.local.remove([
            'google_access_token',
            'google_refresh_token',
            'google_token_expiry',
            'token_saved_at'
        ]);
        
        console.log('🧹 All tokens cleared');
    }

    /**
     * Auth status with better token validation
     */
    async getAuthStatus() {
        await this.loadTokens(); // Always load latest tokens
        
        const hasTokens = !!(this.accessToken && this.refreshToken);
        const isValid = hasTokens && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000;
        
        const status = {
            authenticated: hasTokens,
            tokenValid: isValid,
            expiresAt: this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null,
            hasRefreshToken: !!this.refreshToken,
            authMethod: hasTokens ? 'stored' : 'none'
        };
        
        console.log('🔍 Auth status check:', status);
        return status;
    }

    /**
     * Enhanced API request method
     */
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
     * Create ALL-DAY calendar events for better visibility
     */
    async createEventFromAssignment(assignment) {
        console.log('📅 Creating ALL-DAY calendar event for:', assignment.title);

        const dueDate = new Date(assignment.dueDate);
        const dueDateOnly = dueDate.toLocaleDateString('en-CA', {
            timeZone: 'America/Los_Angeles'
        });

        console.log(`📅 Due date conversion: ${assignment.dueDate} → ${dueDateOnly} (Pacific Time)`);
        
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
     * Find existing calendar event by assignment ID using cache
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
            return null;
        }
    }

    /**
     * Sync assignments to calendar
     */
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
     * Background sync with better error handling
     */
    async performBackgroundSync() {
        console.log('🔄 Starting automatic background sync...');
        
        try {
            // Check authentication with automatic refresh
            const token = await this.getValidToken();
            console.log('✅ Valid authentication token obtained for background sync');

            // Get all stored assignments
            const assignments = await this.getAllStoredAssignments();
            if (assignments.length === 0) {
                console.log('ℹ️ Background sync: no assignments found');
                return { success: true, reason: 'No assignments to sync', results: { created: 0, skipped: 0, errors: 0 } };
            }

            // Perform sync
            const results = await this.syncAssignments(assignments);
            console.log('✅ Background sync completed successfully:', results);
            
            // Store successful sync timestamp
            await chrome.storage.local.set({
                last_auto_sync: new Date().toISOString(),
                last_sync_results: results,
                last_auto_sync_error: null // Clear any previous errors
            });

            return { success: true, results };

        } catch (error) {
            console.error('❌ Background sync failed:', error);
            
            // Store error details
            await chrome.storage.local.set({
                last_auto_sync_error: {
                    timestamp: new Date().toISOString(),
                    error: error.message
                }
            });
            
            return { success: false, error: error.message };
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

    /**
     * PKCE helper methods
     */
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64URLEncode(array);
    }

    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return this.base64URLEncode(new Uint8Array(digest));
    }

    base64URLEncode(array) {
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
}

/**
 * AUTO-SYNC MANAGEMENT
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
 * ALARM LISTENER: Handles automatic background sync
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === CONFIG.ALARM_NAME) {
        console.log('⏰ Auto-sync alarm triggered');
        await calendarClient.performBackgroundSync();
    }
});

/**
 * Enhanced message handler with consistent response format
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Background script received message:', request.action);

    const handleMessage = async () => {
        switch (request.action) {
            case 'authenticate':
                await calendarClient.authenticate();
                await AutoSyncManager.setupAutoSync(); // Enable auto-sync after auth
                return { success: true, message: 'Authentication successful with refresh token support' };

            case 'getAuthStatus':
                const authStatus = await calendarClient.getAuthStatus();
                return { 
                    success: true, 
                    authenticated: authStatus.authenticated,
                    tokenValid: authStatus.tokenValid,
                    expiresAt: authStatus.expiresAt,
                    hasRefreshToken: authStatus.hasRefreshToken,
                    authMethod: authStatus.authMethod
                };

            case 'clearAuth':
                await AutoSyncManager.disableAutoSync();
                await calendarClient.clearTokens();
                return { success: true, message: 'Authentication cleared completely' };

            case 'syncToCalendar':
                return await handleCalendarSync(request.assignments);

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
                return result;

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
            // Ensure all responses have success property
            if (typeof result === 'object' && result !== null && !result.hasOwnProperty('success')) {
                console.warn(`⚠️ Handler for ${request.action} returned object without success property:`, result);
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
 * Handle calendar sync request
 */
async function handleCalendarSync(assignments) {
    try {
        console.log('📅 Handling calendar sync request...');
        const results = await calendarClient.syncAssignments(assignments);
        
        // Update last sync timestamp for manual syncs
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
    
    try {
        const authStatus = await calendarClient.getAuthStatus();
        if (authStatus.authenticated && authStatus.tokenValid) {
            await AutoSyncManager.setupAutoSync();
            console.log('✅ Auto-sync re-enabled on startup');
        }
    } catch (error) {
        console.log('⚠️ Could not check auth status on startup:', error.message);
    }
});

console.log('✅ Enhanced background script with automatic token refresh loaded');