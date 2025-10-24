/**
 * Token Manager Module
 * Manages OAuth token storage, validation, and refresh
 *
 * Handles both Chrome native tokens and PKCE refresh tokens
 * Persistent storage with automatic token refresh
 *
 * Part of background.js refactoring
 */

class TokenManager {
    constructor(config) {
        this.config = config;
        this.accessToken = null;
        this.refreshToken = null;
        this.tokenExpiry = null;
        this.authMethod = null; // 'chrome_native' or 'pkce'
    }

    // ============================================================================
    // STORAGE MANAGEMENT
    // ============================================================================

    async initializeFromStorage() {
        try {
            const stored = await browser.storage.local.get([
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
            const dataToSave = {
                google_access_token: this.accessToken,
                google_refresh_token: this.refreshToken,
                google_token_expiry: this.tokenExpiry,
                google_auth_method: this.authMethod
            };

            await browser.storage.local.set(dataToSave);

            // Diagnostic logging: Confirm what was written to storage
            console.log('');
            console.log('💾 TokenManager.saveTokenState() - Writing to browser.storage.local:');
            console.log('   Storage Keys:');
            console.log('     - google_access_token:', this.accessToken ? `SAVED ✓ (${this.accessToken.substring(0, 20)}...)` : 'NULL (not saved)');
            console.log('     - google_refresh_token:', this.refreshToken ? `SAVED ✓ (${this.refreshToken.substring(0, 20)}...)` : 'NULL (not saved)');
            console.log('     - google_token_expiry:', this.tokenExpiry ? `SAVED ✓ (${new Date(this.tokenExpiry).toISOString()})` : 'NULL');
            console.log('     - google_auth_method:', this.authMethod || 'NULL');
            console.log('');

            // Verify by reading back immediately
            const verification = await browser.storage.local.get([
                'google_access_token',
                'google_refresh_token',
                'google_token_expiry',
                'google_auth_method'
            ]);

            console.log('✅ Verification - Reading back from storage:');
            console.log('   - google_access_token:', !!verification.google_access_token ? 'EXISTS ✓' : 'MISSING ✗');
            console.log('   - google_refresh_token:', !!verification.google_refresh_token ? 'EXISTS ✓' : 'MISSING ✗');
            console.log('   - google_token_expiry:', !!verification.google_token_expiry ? 'EXISTS ✓' : 'MISSING ✗');
            console.log('   - google_auth_method:', verification.google_auth_method || 'MISSING ✗');
            console.log('');

        } catch (error) {
            console.error('❌ Error saving token state:', error);
        }
    }

    async clearStoredAuth() {
        try {
            await browser.storage.local.remove([
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

    // ============================================================================
    // TOKEN REFRESH & VALIDATION
    // ============================================================================

    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        const refreshParams = new URLSearchParams({
            client_id: this.config.WEB_CLIENT_ID,
            client_secret: this.config.WEB_CLIENT_SECRET,
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

    async getValidToken(chromeTokenCallback) {
        // Check current token validity
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
            return this.accessToken;
        }

        // Try Chrome cache for native method
        if (this.authMethod === 'chrome_native' && chromeTokenCallback) {
            try {
                return await chromeTokenCallback();
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

    // ============================================================================
    // TOKEN STATE SETTERS
    // ============================================================================

    setTokens(accessToken, refreshToken, expiresIn, authMethod) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
        this.authMethod = authMethod;

        // Diagnostic logging: Confirm tokens are set in memory
        console.log('');
        console.log('💾 TokenManager.setTokens() called:');
        console.log('   - Access Token:', accessToken ? `SET ✓ (${accessToken.substring(0, 20)}...)` : 'NOT SET ✗');
        console.log('   - Refresh Token:', refreshToken ? `SET ✓ (${refreshToken.substring(0, 20)}...)` : 'NOT SET ✗');
        console.log('   - Expires In:', expiresIn, 'seconds');
        console.log('   - Token Expiry:', new Date(this.tokenExpiry).toISOString());
        console.log('   - Auth Method:', authMethod);
        console.log('');
    }

    setChromeToken(token) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (3600 * 1000);
        this.authMethod = 'chrome_native';
    }

    // ============================================================================
    // TOKEN STATE GETTERS
    // ============================================================================

    isAuthenticated() {
        return !!(this.accessToken || this.refreshToken);
    }

    hasRefreshToken() {
        return !!this.refreshToken;
    }

    getExpiryDate() {
        return this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null;
    }

    getAuthMethod() {
        return this.authMethod;
    }

    getAccessToken() {
        return this.accessToken;
    }
}

// Expose for service worker context
if (typeof self !== 'undefined') {
    self.TokenManager = TokenManager;
}
