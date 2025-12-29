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
            await browser.storage.local.set({
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
