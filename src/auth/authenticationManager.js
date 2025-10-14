/**
 * Authentication Manager Module
 * Handles dual authentication strategy: Chrome native + PKCE with refresh tokens
 *
 * AUTHENTICATION METHODS:
 * - Chrome: Native getAuthToken (fast, 500ms, no popups)
 * - Others: PKCE + Refresh Tokens (persistent, universal compatibility)
 *
 * Part of background.js refactoring
 */

// ============================================================================
// BROWSER DETECTION & CAPABILITY TESTING
// ============================================================================

class BrowserCapabilityDetector {
    /**
     * Get the correct Chrome Extension client ID for the current extension
     */
    static getChromeExtensionClientId(config) {
        const extensionId = chrome.runtime.id;
        const clientId = config.CHROME_EXTENSION_CLIENTS[extensionId];

        if (!clientId) {
            console.warn(`⚠️ No Chrome client ID configured for extension ID: ${extensionId}`);
            console.warn('Available extension IDs:', Object.keys(config.CHROME_EXTENSION_CLIENTS));
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
    static async testChromeAuthCapability(config) {
        // Firefox detection - getAuthToken not supported in Firefox
        // Firefox doesn't have chrome.identity.getAuthToken, must use PKCE
        if (typeof browser !== 'undefined' && typeof browser.runtime !== 'undefined') {
            console.log('🦊 Firefox detected - chrome.identity.getAuthToken not supported');
            console.log('   - Will use PKCE authentication flow');
            return false;
        }

        const clientId = this.getChromeExtensionClientId(config);
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
    static async getRecommendedAuthMethod(config) {
        const isChrome = this.isActualChrome();

        if (isChrome) {
            const chromeWorking = await this.testChromeAuthCapability(config);
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
// AUTHENTICATION MANAGER
// ============================================================================

class AuthenticationManager {
    constructor(config, tokenManager) {
        this.config = config;
        this.tokenManager = tokenManager;
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

                this.tokenManager.setChromeToken(token);

                console.log('✅ Chrome native authentication successful');
                resolve(true);
            });
        });
    }

    async getChromeToken() {
        if (this.tokenManager.getAuthMethod() !== 'chrome_native') {
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
                    this.tokenManager.setChromeToken(token);
                    this.tokenManager.saveTokenState();
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
                client_id: this.config.WEB_CLIENT_ID,
                response_type: 'code',
                scope: this.config.SCOPE,
                redirect_uri: redirectUri,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
                access_type: 'offline',
                prompt: 'consent'
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
            client_id: this.config.WEB_CLIENT_ID,
            client_secret: this.config.WEB_CLIENT_SECRET,
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

            this.tokenManager.setTokens(
                tokens.access_token,
                tokens.refresh_token,
                tokens.expires_in,
                'pkce'
            );

            console.log('✅ Token exchange successful, refresh token received:', !!tokens.refresh_token);

        } catch (error) {
            console.error('❌ Token exchange failed:', error);
            throw error;
        }
    }

    // ------------------------------------------------------------------------
    // MAIN AUTHENTICATION ENTRY POINTS
    // ------------------------------------------------------------------------

    async authenticate() {
        const method = await BrowserCapabilityDetector.getRecommendedAuthMethod(this.config);

        try {
            if (method === 'chrome_native') {
                await this.authenticateWithChrome();
            } else {
                await this.authenticateWithPKCE();
            }

            await this.tokenManager.saveTokenState();
            return true;

        } catch (error) {
            console.error('❌ Authentication failed:', error);
            throw error;
        }
    }

    async getAuthStatus() {
        const method = await BrowserCapabilityDetector.getRecommendedAuthMethod(this.config);

        let hasValidToken = false;
        try {
            await this.tokenManager.getValidToken(() => this.getChromeToken());
            hasValidToken = true;
        } catch (error) {
            hasValidToken = false;
        }

        return {
            authenticated: this.tokenManager.isAuthenticated(),
            tokenValid: hasValidToken,
            hasRefreshToken: this.tokenManager.hasRefreshToken(),
            expiresAt: this.tokenManager.getExpiryDate(),
            authMethod: method,
            actualMethodUsed: this.tokenManager.getAuthMethod(),
            browserInfo: {
                type: BrowserCapabilityDetector.isActualChrome() ? 'Chrome' : 'Not-Chrome',
                extensionId: chrome.runtime.id,
                chromeClientId: BrowserCapabilityDetector.getChromeExtensionClientId(this.config),
                supportsPKCE: true
            }
        };
    }

    async clearAuth() {
        await this.tokenManager.clearStoredAuth();

        // Also clear Chrome cache if using native method
        if (this.tokenManager.getAuthMethod() === 'chrome_native' && this.tokenManager.getAccessToken()) {
            try {
                await new Promise((resolve) => {
                    chrome.identity.removeCachedAuthToken({
                        token: this.tokenManager.getAccessToken()
                    }, resolve);
                });
            } catch (error) {
                console.log('Error clearing Chrome cache:', error);
            }
        }
    }
}

// Expose for service worker context
if (typeof self !== 'undefined') {
    self.AuthenticationManager = AuthenticationManager;
    self.BrowserCapabilityDetector = BrowserCapabilityDetector;
    self.PKCEHelper = PKCEHelper;
}
