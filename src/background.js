/**
 * Enhanced Background Script with Dual Authentication Strategy
 * 
 * AUTHENTICATION METHODS:
 * - Chrome: Native getAuthToken (fast, 500ms, no popups)
 * - Others: PKCE + Refresh Tokens (persistent, universal compatibility)
 * 
 * ARCHITECTURE:
 * - Clean separation between auth methods
 * - Persistent token storage with auto-refresh
 * - Event caching for performance
 * - Comprehensive error handling
 */

const CONFIG = {
    CALENDAR_API_BASE: 'https://www.googleapis.com/calendar/v3',
    
    // Chrome Extension clients - mapped by extension ID
    CHROME_EXTENSION_CLIENTS: {
        // Development version (unpacked extension)
        'pembhpamnbbklhjdimchmgoogfddabbi': '589515007396-aje4t3afip1e9piitlp817t0g9ro4kab.apps.googleusercontent.com',
        // Chrome Web Store version  
        'bbepekfgnpdfclkpfoojmfclnbkkbbco': '589515007396-0frm2bh6mhobpqiuec8p2dlb2gs10gla.apps.googleusercontent.com'
    },
    
    // Web Application client (for PKCE on all other browsers)
    WEB_CLIENT_ID: '589515007396-nofmk5v0dhegv5fmp1700v8ve94624ih.apps.googleusercontent.com',
    WEB_CLIENT_SECRET: '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',
    
    SCOPE: 'https://www.googleapis.com/auth/calendar',
    AUTO_SYNC_INTERVAL: 1440, // 24 hours (optimal for assignment posting frequency)
    ALARM_NAME: 'gradescope_auto_sync'
};

console.log('🚀 Enhanced background script with dual authentication loaded');
console.log(`📱 Extension ID: ${chrome.runtime.id}`);
console.log(`🔑 Chrome Client ID: ${CONFIG.CHROME_EXTENSION_CLIENTS[chrome.runtime.id] || 'not configured'}`);
console.log(`🌐 Web Client ID: ${CONFIG.WEB_CLIENT_ID}`);

// ============================================================================
// EVENT CACHE CLASS
// ============================================================================

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

// ============================================================================
// BROWSER DETECTION & CAPABILITY TESTING
// ============================================================================

class BrowserCapabilityDetector {
    /**
     * Get the correct Chrome Extension client ID for the current extension
     */
    static getChromeExtensionClientId() {
        const extensionId = chrome.runtime.id;
        const clientId = CONFIG.CHROME_EXTENSION_CLIENTS[extensionId];
        
        if (!clientId) {
            console.warn(`⚠️ No Chrome client ID configured for extension ID: ${extensionId}`);
            console.warn('Available extension IDs:', Object.keys(CONFIG.CHROME_EXTENSION_CLIENTS));
            return null;
        }
        
        console.log(`🔑 Using Chrome client ID for extension ${extensionId}: ${clientId}`);
        return clientId;
    }

    /**
     * Detect if this is actual Google Chrome (not Chromium-based browsers)
     */
    static isActualChrome() {
        // Brave detection (most reliable)
        if (navigator.brave && navigator.brave.isBrave) {
            return false;
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
     * Test if Chrome's getAuthToken actually works with our configuration
     */
    static async testChromeAuthCapability() {
        const clientId = this.getChromeExtensionClientId();
        if (!clientId) {
            console.log('❌ Chrome getAuthToken not available - no client ID for this extension');
            return false;
        }

        return new Promise((resolve) => {
            console.log('🔍 Testing Chrome getAuthToken capability...');
            console.log(`   - Extension ID: ${chrome.runtime.id}`);
            console.log(`   - Client ID: ${clientId}`);
            
            chrome.identity.getAuthToken({
                interactive: false
            }, (token) => {
                const error = chrome.runtime.lastError?.message || '';
                
                console.log('🔍 Chrome getAuthToken test result:');
                console.log('   - Token received:', !!token);
                console.log('   - Error message:', error || 'none');
                
                if (token) {
                    console.log('✅ Chrome getAuthToken works - token received');
                    resolve(true);
                    return;
                }
                
                if (error.includes('Invalid OAuth2 Client ID')) {
                    console.log('❌ Chrome getAuthToken failed - Invalid client ID');
                    console.log('   - Check Google Cloud Console configuration');
                    console.log(`   - Extension ID: ${chrome.runtime.id} should be configured for client: ${clientId}`);
                    resolve(false);
                    return;
                }
                
                // These errors indicate getAuthToken is supported but needs user interaction
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
                    console.log('✅ Chrome getAuthToken supported - needs user interaction');
                    console.log('   - Matching error pattern found');
                } else {
                    console.log('❌ Chrome getAuthToken not supported');
                    console.log('   - Unknown error pattern:', error);
                }
                
                resolve(isSupported);
            });
            
            // Timeout fallback
            setTimeout(() => {
                console.log('⏰ Chrome getAuthToken test timed out');
                resolve(false);
            }, 5000);
        });
    }

    /**
     * Determine the recommended authentication method
     */
    static async getRecommendedAuthMethod() {
        const isChrome = this.isActualChrome();
        
        if (isChrome) {
            const chromeWorking = await this.testChromeAuthCapability();
            if (chromeWorking) {
                console.log('🚀 Using Chrome native authentication (fastest)');
                return 'chrome_native';
            }
        }
        
        console.log('🌐 Using PKCE authentication (persistent with refresh tokens)');
        return 'pkce';
    }
}

// ============================================================================
// PKCE UTILITIES
// ============================================================================

class PKCEHelper {
    static generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64UrlEncode(array);
    }

    static async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return this.base64UrlEncode(new Uint8Array(digest));
    }

    static base64UrlEncode(array) {
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
}

// ============================================================================
// MAIN GOOGLE CALENDAR CLIENT
// ============================================================================

class GoogleCalendarClient {
    constructor() {
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.authMethod = null;
        this.eventCache = new EventCache(this);
    }

    // ------------------------------------------------------------------------
    // STORAGE MANAGEMENT
    // ------------------------------------------------------------------------

    async initializeFromStorage() {
        try {
            const stored = await chrome.storage.local.get([
                'google_access_token',
                'google_refresh_token',
                'google_token_expiry',
                'google_auth_method'
            ]);

            if (stored.google_access_token && stored.google_token_expiry) {
                this.accessToken = stored.google_access_token;
                this.refreshToken = stored.google_refresh_token;
                this.tokenExpiry = stored.google_token_expiry;
                this.authMethod = stored.google_auth_method;
                
                console.log('🔄 Restored auth state from storage');
                
                // Clear expired access tokens but keep refresh tokens
                if (Date.now() >= this.tokenExpiry - 60000) {
                    console.log('⚠️ Access token expired');
                    this.accessToken = null;
                }
            }
        } catch (error) {
            console.error('Error loading stored auth:', error);
        }
    }

    async saveTokenState() {
        try {
            await chrome.storage.local.set({
                google_access_token: this.accessToken,
                google_refresh_token: this.refreshToken,
                google_token_expiry: this.tokenExpiry,
                google_auth_method: this.authMethod
            });
            console.log('💾 Auth state saved');
        } catch (error) {
            console.error('Error saving token state:', error);
        }
    }

    async clearStoredAuth() {
        try {
            await chrome.storage.local.remove([
                'google_access_token',
                'google_refresh_token',
                'google_token_expiry',
                'google_auth_method'
            ]);
            
            this.accessToken = null;
            this.refreshToken = null;
            this.tokenExpiry = null;
            this.authMethod = null;
            
            console.log('🗑️ Auth state cleared');
        } catch (error) {
            console.error('Error clearing auth:', error);
        }
    }

    // ------------------------------------------------------------------------
    // CHROME NATIVE AUTHENTICATION
    // ------------------------------------------------------------------------

    async authenticateWithChrome() {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({
                interactive: true
            }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (!token) {
                    reject(new Error('No token received from Chrome'));
                    return;
                }

                this.accessToken = token;
                this.tokenExpiry = Date.now() + (3600 * 1000);
                this.authMethod = 'chrome_native';
                
                console.log('✅ Chrome native authentication successful');
                resolve(true);
            });
        });
    }

    async getChromeToken() {
        if (this.authMethod !== 'chrome_native') {
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
                    reject(new Error('No token in Chrome cache'));
                }
            });
        });
    }

    // ------------------------------------------------------------------------
    // PKCE AUTHENTICATION
    // ------------------------------------------------------------------------

    async authenticateWithPKCE() {
        try {
            console.log('🔐 Starting PKCE authentication flow...');
            
            const codeVerifier = PKCEHelper.generateCodeVerifier();
            const codeChallenge = await PKCEHelper.generateCodeChallenge(codeVerifier);
            
            const redirectUri = chrome.identity.getRedirectURL();
            const authParams = new URLSearchParams({
                client_id: CONFIG.WEB_CLIENT_ID,
                response_type: 'code',
                scope: CONFIG.SCOPE,
                redirect_uri: redirectUri,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
                prompt: 'select_account'
            });

            const authURL = `https://accounts.google.com/o/oauth2/v2/auth?${authParams}`;

            return new Promise((resolve, reject) => {
                chrome.identity.launchWebAuthFlow({
                    url: authURL,
                    interactive: true
                }, async (redirectURL) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    if (!redirectURL) {
                        reject(new Error('Authorization cancelled'));
                        return;
                    }

                    try {
                        const url = new URL(redirectURL);
                        const authCode = url.searchParams.get('code');
                        
                        if (!authCode) {
                            const error = url.searchParams.get('error');
                            throw new Error(`Authorization failed: ${error || 'No code received'}`);
                        }

                        console.log('🔑 Exchanging code for tokens...');
                        await this.exchangeCodeForTokens(authCode, codeVerifier);
                        
                        this.authMethod = 'pkce';
                        console.log('✅ PKCE authentication successful');
                        resolve(true);

                    } catch (error) {
                        console.error('❌ PKCE auth failed:', error);
                        reject(error);
                    }
                });
            });
            
        } catch (error) {
            console.error('❌ PKCE setup failed:', error);
            throw error;
        }
    }

    async exchangeCodeForTokens(authCode, codeVerifier) {
        const tokenParams = new URLSearchParams({
            client_id: CONFIG.WEB_CLIENT_ID,
            client_secret: CONFIG.WEB_CLIENT_SECRET,
            code: authCode,
            code_verifier: codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: chrome.identity.getRedirectURL()
        });

        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: tokenParams
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
            }

            const tokens = await response.json();
            
            if (!tokens.access_token) {
                throw new Error('No access token received');
            }

            this.accessToken = tokens.access_token;
            this.refreshToken = tokens.refresh_token;
            this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            
            console.log('✅ Token exchange successful, refresh token received:', !!tokens.refresh_token);
            
        } catch (error) {
            console.error('❌ Token exchange failed:', error);
            throw error;
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        const refreshParams = new URLSearchParams({
            client_id: CONFIG.WEB_CLIENT_ID,
            client_secret: CONFIG.WEB_CLIENT_SECRET,
            refresh_token: this.refreshToken,
            grant_type: 'refresh_token'
        });

        try {
            console.log('🔄 Refreshing access token...');
            
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: refreshParams
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Token refresh failed:', response.status, errorText);
                
                if (response.status === 400 || response.status === 401) {
                    await this.clearStoredAuth();
                    throw new Error('Refresh token expired. Please authenticate again.');
                }
                
                throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
            }

            const tokens = await response.json();
            
            if (!tokens.access_token) {
                throw new Error('No access token in refresh response');
            }

            this.accessToken = tokens.access_token;
            this.tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            
            // Update refresh token if provided
            if (tokens.refresh_token) {
                this.refreshToken = tokens.refresh_token;
            }
            
            await this.saveTokenState();
            console.log('✅ Access token refreshed successfully');
            
            return tokens.access_token;
            
        } catch (error) {
            console.error('❌ Token refresh failed:', error);
            throw error;
        }
    }

    // ------------------------------------------------------------------------
    // MAIN AUTHENTICATION ENTRY POINTS
    // ------------------------------------------------------------------------

    async authenticate() {
        const method = await BrowserCapabilityDetector.getRecommendedAuthMethod();
        
        try {
            if (method === 'chrome_native') {
                await this.authenticateWithChrome();
            } else {
                await this.authenticateWithPKCE();
            }
            
            await this.saveTokenState();
            return true;
            
        } catch (error) {
            console.error('❌ Authentication failed:', error);
            throw error;
        }
    }

    async getValidToken() {
        // Check current token validity
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
            return this.accessToken;
        }

        // Try Chrome cache for native method
        if (this.authMethod === 'chrome_native') {
            try {
                return await this.getChromeToken();
            } catch (error) {
                // Fall through to refresh attempt
            }
        }

        // Try refresh token for PKCE method
        if (this.authMethod === 'pkce' && this.refreshToken) {
            try {
                return await this.refreshAccessToken();
            } catch (error) {
                console.error('❌ Refresh failed:', error.message);
            }
        }

        throw new Error('Token expired. Please authenticate again.');
    }

    async getAuthStatus() {
        if (!this.accessToken && !this.refreshToken) {
            await this.initializeFromStorage();
        }

        const method = await BrowserCapabilityDetector.getRecommendedAuthMethod();
        
        let hasValidToken = false;
        try {
            await this.getValidToken();
            hasValidToken = true;
        } catch (error) {
            hasValidToken = false;
        }

        return {
            authenticated: !!(this.accessToken || this.refreshToken),
            tokenValid: hasValidToken,
            hasRefreshToken: !!this.refreshToken,
            expiresAt: this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null,
            authMethod: method,
            actualMethodUsed: this.authMethod,
            browserInfo: {
                type: BrowserCapabilityDetector.isActualChrome() ? 'Chrome' : 'Not-Chrome',
                extensionId: chrome.runtime.id,
                chromeClientId: BrowserCapabilityDetector.getChromeExtensionClientId(),
                supportsPKCE: true
            }
        };
    }

    // ------------------------------------------------------------------------
    // CALENDAR API OPERATIONS
    // ------------------------------------------------------------------------

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
            
            start: { date: dueDateOnly },
            end: { date: dueDateOnly },
            
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
            const authStatus = await this.getAuthStatus();
            if (!authStatus.authenticated) {
                return { 
                    success: false, 
                    reason: 'Authentication needed',
                    needsReauth: true,
                    silent: true
                };
            }

            try {
                await this.getValidToken();
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
}

// ============================================================================
// AUTO-SYNC MANAGER
// ============================================================================

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

// ============================================================================
// EXTENSION EVENT HANDLERS
// ============================================================================

// Global instance
const calendarClient = new GoogleCalendarClient();

// Auto-sync alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === CONFIG.ALARM_NAME) {
        console.log('⏰ Auto-sync alarm triggered');
        await calendarClient.performBackgroundSync();
    }
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handleMessage = async () => {
        switch (request.action) {
            case 'authenticate':
                await calendarClient.authenticate();
                await AutoSyncManager.setupAutoSync();
                return { success: true, message: 'Authentication successful' };

            case 'getAuthStatus':
                const authStatus = await calendarClient.getAuthStatus();
                return { 
                    success: true, 
                    authenticated: authStatus.authenticated,
                    tokenValid: authStatus.tokenValid,
                    hasRefreshToken: authStatus.hasRefreshToken,
                    expiresAt: authStatus.expiresAt,
                    authMethod: authStatus.authMethod,
                    browserInfo: authStatus.browserInfo
                };

            case 'syncToCalendar':
                return await handleCalendarSync(request.assignments);

            case 'clearAuth':
                await AutoSyncManager.disableAutoSync();
                await calendarClient.clearStoredAuth();
                
                // Also clear Chrome cache if using native method
                if (calendarClient.authMethod === 'chrome_native' && calendarClient.accessToken) {
                    try {
                        await new Promise((resolve) => {
                            chrome.identity.removeCachedAuthToken({
                                token: calendarClient.accessToken
                            }, resolve);
                        });
                    } catch (error) {
                        console.log('Error clearing Chrome cache:', error);
                    }
                }
                
                return { success: true, message: 'Authentication cleared' };

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
                return { success: true, message: 'Cache refresh complete' };

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
            console.error(`❌ Message handler error:`, error);
            sendResponse({ success: false, error: error.message });
        });

    return true;
});

// Calendar sync helper
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

// Startup handler
chrome.runtime.onStartup.addListener(async () => {
    console.log('🌟 Extension startup - checking auto-sync...');
    
    const authStatus = await calendarClient.getAuthStatus();
    if (authStatus.authenticated) {
        await AutoSyncManager.setupAutoSync();
        console.log('✅ Auto-sync enabled on startup');
    }
});

// Initialize on service worker start
(async () => {
    try {
        await calendarClient.initializeFromStorage();
        console.log('✅ Background script initialized with dual authentication');
    } catch (error) {
        console.error('Initialization error:', error);
    }
})();

console.log('✅ Enhanced background script with dual authentication ready');