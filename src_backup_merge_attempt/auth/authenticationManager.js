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
        const extensionId = browser.runtime.id;
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
        // Firefox doesn't have browser.identity.getAuthToken, must use PKCE
        if (typeof browser !== 'undefined' && typeof browser.runtime !== 'undefined') {
            console.log('🦊 Firefox detected - browser.identity.getAuthToken not supported');
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
            console.log(`   - Extension ID: ${browser.runtime.id}`);
            console.log(`   - Client ID: ${clientId}`);

            browser.identity.getAuthToken({
                interactive: false
            }, (token) => {
                const error = browser.runtime.lastError?.message || '';

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
                    console.log(`   - Extension ID: ${browser.runtime.id} should be configured for client: ${clientId}`);
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
            browser.identity.getAuthToken({
                interactive: true
            }, (token) => {
                if (browser.runtime.lastError) {
                    reject(new Error(browser.runtime.lastError.message));
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
            browser.identity.getAuthToken({
                interactive: false
            }, (token) => {
                if (browser.runtime.lastError) {
                    reject(new Error(browser.runtime.lastError.message));
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
    // REDIRECT URI HELPER (CROSS-BROWSER COMPATIBILITY)
    // ------------------------------------------------------------------------

    /**
     * Get the correct redirect URI for the current browser
     *
     * Firefox: Uses loopback address (http://127.0.0.1/mozoauth2/[uuid]/)
     *   - Google does not accept extensions.allizom.org (requires domain verification)
     *   - Firefox 86+ supports loopback addresses per RFC 8252 section 7.3
     *   - Google exempts desktop apps from loopback deprecation
     *
     * Chrome: Uses standard extension URI (https://[extension-id].chromiumapp.org/)
     *   - Chrome extensions have verifiable redirect URIs
     *
     * @returns {string} Redirect URI for OAuth flow
     */
    getRedirectUri() {
        const baseUri = browser.identity.getRedirectURL();

        // Firefox detection - use loopback address
        if (baseUri.includes('extensions.allizom.org')) {
            const extensionUUID = baseUri.split('//')[1].split('.')[0];
            return `http://127.0.0.1/mozoauth2/${extensionUUID}/`;
        }

        // Chrome/Chromium - use standard extension URI
        return baseUri;
    }

    // ------------------------------------------------------------------------
    // PKCE AUTHENTICATION
    // ------------------------------------------------------------------------

    async authenticateWithPKCE() {
        try {
            console.log('🔐 Starting PKCE authentication flow...');

            const codeVerifier = PKCEHelper.generateCodeVerifier();
            const codeChallenge = await PKCEHelper.generateCodeChallenge(codeVerifier);

            // Use loopback address (Google requires this for Firefox extensions)
            const redirectUri = this.getRedirectUri();

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

            // ========================================================================
            // DIAGNOSTIC LOGGING - OAuth URL for Manual Testing
            // ========================================================================
            console.log('');
            console.log('╔════════════════════════════════════════════════════════════════════════╗');
            console.log('║  🔍 FIREFOX OAUTH DIAGNOSTIC MODE (PKCE + LOOPBACK)                   ║');
            console.log('╚════════════════════════════════════════════════════════════════════════╝');
            console.log('');
            console.log('📋 MANUAL TEST INSTRUCTIONS:');
            console.log('   1. Copy the OAuth URL below');
            console.log('   2. Open a NEW regular Firefox window (not private/incognito)');
            console.log('   3. Paste the URL into the address bar and press Enter');
            console.log('   4. Complete the Google sign-in and authorization');
            console.log('   5. Observe what happens:');
            console.log('      - Success: You\'ll see a redirect to http://127.0.0.1/mozoauth2/...?code=...');
            console.log('      - Failure: Google will show an error page with details');
            console.log('');
            console.log('🔗 OAUTH URL (copy everything below):');
            console.log('─'.repeat(80));
            console.log(authURL);
            console.log('─'.repeat(80));
            console.log('');
            console.log('🔧 Redirect URI configured for this session:');
            console.log('   ', redirectUri);
            console.log('');
            console.log('⚙️ Configuration check:');
            console.log('   - Client ID:', this.config.WEB_CLIENT_ID);
            console.log('   - Scope:', this.config.SCOPE);
            console.log('   - Challenge method: S256 (PKCE)');
            console.log('   - Redirect: LOOPBACK ADDRESS (http://127.0.0.1/mozoauth2/...)');
            console.log('');
            console.log('⚠️  CRITICAL: Add this URI to Google Cloud Console redirect URIs:');
            console.log('   ', redirectUri);
            console.log('');
            console.log('⏳ Now opening OAuth flow in Firefox popup...');
            console.log('');

            try {
                const redirectURL = await browser.identity.launchWebAuthFlow({
                    url: authURL,
                    interactive: true
                });

                // Log the raw result
                console.log('');
                console.log('╔════════════════════════════════════════════════════════════════════════╗');
                console.log('║  📥 OAUTH FLOW COMPLETED - Analyzing Result                            ║');
                console.log('╚════════════════════════════════════════════════════════════════════════╝');
                console.log('');

                if (browser.runtime.lastError) {
                    console.error('❌ launchWebAuthFlow Error:');
                    console.error('   Message:', browser.runtime.lastError.message);
                    console.error('');
                    console.error('📊 Error Analysis:');
                    const errorMsg = browser.runtime.lastError.message;

                    if (errorMsg.includes('User cancelled') || errorMsg.includes('denied access')) {
                        console.error('   This error means ONE of the following:');
                        console.error('   1. You clicked "Cancel" or "Deny" on Google\'s OAuth page');
                        console.error('   2. Google showed an error page and Firefox couldn\'t capture the redirect');
                        console.error('   3. The OAuth popup was closed before completing');
                        console.error('');
                        console.error('🔍 To diagnose:');
                        console.error('   - Try the MANUAL TEST (copy the OAuth URL logged above)');
                        console.error('   - In a regular Firefox window, you\'ll see Google\'s actual error');
                        console.error('   - Common Google errors:');
                        console.error('     • "redirect_uri_mismatch" → Check Google Cloud Console redirect URI');
                        console.error('     • "access_denied" → Check OAuth consent screen test users');
                        console.error('     • "invalid_client" → Check client ID configuration');
                    }

                    throw new Error(browser.runtime.lastError.message);
                }

                if (!redirectURL) {
                    console.error('❌ No redirect URL received (authorization was cancelled)');
                    throw new Error('Authorization cancelled');
                }

                // Parse redirect URL and log ALL parameters
                console.log('✅ Redirect URL received:', redirectURL);
                console.log('');

                const url = new URL(redirectURL);
                console.log('📊 Redirect URL Analysis:');
                console.log('   Protocol:', url.protocol);
                console.log('   Host:', url.host);
                console.log('   Pathname:', url.pathname);
                console.log('   Search params:', url.search);
                console.log('');

                // Log ALL query parameters
                if (url.searchParams.toString()) {
                    console.log('🔍 All Query Parameters:');
                    for (const [key, value] of url.searchParams.entries()) {
                        console.log(`   ${key}: ${value}`);
                    }
                    console.log('');
                }

                const authCode = url.searchParams.get('code');
                const error = url.searchParams.get('error');
                const errorDescription = url.searchParams.get('error_description');

                if (!authCode) {
                    console.error('❌ No authorization code in redirect URL');
                    console.error('');

                    if (error) {
                        console.error('🔴 Google OAuth Error Detected:');
                        console.error('   Error code:', error);
                        console.error('   Description:', errorDescription || 'No description provided');
                        console.error('');

                        // Provide specific fix instructions based on error type
                        if (error === 'redirect_uri_mismatch') {
                            console.error('🔧 FIX FOR redirect_uri_mismatch:');
                            console.error('   1. Go to: https://console.cloud.google.com/apis/credentials');
                            console.error('   2. Find your Web Application OAuth client');
                            console.error('   3. Add these EXACT values:');
                            console.error('');
                            console.error('   Authorized JavaScript origins (NO trailing slash):');
                            console.error(`      ${redirectUri.replace(/\/$/, '')}`);
                            console.error('');
                            console.error('   Authorized redirect URIs (WITH trailing slash):');
                            console.error(`      ${redirectUri}`);
                            console.error('');
                        } else if (error === 'access_denied') {
                            console.error('🔧 FIX FOR access_denied:');
                            console.error('   1. Check OAuth Consent Screen in Google Cloud Console');
                            console.error('   2. If in Testing mode: Add your Gmail as a test user');
                            console.error('   3. Verify calendar scope is enabled');
                            console.error('   4. Check privacy policy URL is accessible');
                        } else if (error === 'invalid_client') {
                            console.error('🔧 FIX FOR invalid_client:');
                            console.error('   1. Verify client_id matches in Google Cloud Console');
                            console.error(`   2. Current client_id: ${this.config.WEB_CLIENT_ID}`);
                            console.error('   3. Ensure OAuth client type is "Web application"');
                        } else {
                            console.error('🔧 UNKNOWN ERROR - Check Google Cloud Console:');
                            console.error('   1. Verify Calendar API is enabled');
                            console.error('   2. Check OAuth consent screen configuration');
                            console.error('   3. Try the manual test to see full error details');
                        }

                        throw new Error(`Google OAuth Error: ${error} - ${errorDescription || 'No description'}`);
                    } else {
                        throw new Error('No authorization code and no error parameter in redirect URL');
                    }
                }

                console.log('✅ Authorization code received successfully');
                console.log('   Code preview:', authCode.substring(0, 20) + '...');
                console.log('');

                console.log('🔑 Exchanging code for tokens...');
                await this.exchangeCodeForTokens(authCode, codeVerifier);

                console.log('✅ PKCE authentication successful');
                return true;

            } catch (error) {
                console.error('❌ PKCE auth failed:', error);

                if (error.message.includes('User cancelled') || error.message.includes('denied access')) {
                    throw new Error(
                        'OAuth authentication failed. If you completed the Google sign-in, ' +
                        'this might be caused by privacy extensions (uBlock Origin, Privacy Badger, etc.) ' +
                        'or Firefox Enhanced Tracking Protection. Try temporarily disabling them and reconnecting.'
                    );
                }

                throw error;
            }

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
            redirect_uri: this.getRedirectUri()
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

            // Diagnostic logging: Show exactly what Google returned
            console.log('');
            console.log('📦 Token Exchange Response from Google:');
            console.log('   - access_token:', tokens.access_token ? `YES ✓ (${tokens.access_token.substring(0, 20)}...)` : 'NO ✗');
            console.log('   - refresh_token:', tokens.refresh_token ? `YES ✓ (${tokens.refresh_token.substring(0, 20)}...)` : 'NO ✗');
            console.log('   - expires_in:', tokens.expires_in, 'seconds');
            console.log('   - token_type:', tokens.token_type);
            console.log('   - scope:', tokens.scope);
            console.log('');

            if (!tokens.access_token) {
                throw new Error('No access token received');
            }

            if (!tokens.refresh_token) {
                console.error('');
                console.error('⚠️ WARNING: NO REFRESH TOKEN RECEIVED FROM GOOGLE!');
                console.error('   This means you will need to re-authenticate when the access token expires.');
                console.error('');
                console.error('   Possible reasons:');
                console.error('   1. User previously granted consent (Google only issues refresh token on first consent)');
                console.error('   2. OAuth configuration issue in Google Cloud Console');
                console.error('   3. Missing access_type=offline in request (but we have it...)');
                console.error('');
                console.error('   To fix: Revoke access at https://myaccount.google.com/permissions');
                console.error('   Then try authenticating again - Google will issue a fresh refresh token.');
                console.error('');
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
                extensionId: browser.runtime.id,
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
                    browser.identity.removeCachedAuthToken({
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
