/**
 * Browser Detection Utility
 * Detects the current browser environment (Firefox vs Chrome/Chromium)
 *
 * Used for browser-specific features:
 * - Pin detection (Chrome has getUserSettings(), Firefox doesn't)
 * - Pin UI instructions (different UX between browsers)
 * - API compatibility checks
 */

class BrowserDetector {
    constructor() {
        this._browserInfo = null;
        this._isFirefox = null;
        this._isChrome = null;
    }

    /**
     * Check if running in Firefox
     * @returns {boolean}
     */
    isFirefox() {
        if (this._isFirefox !== null) {
            return this._isFirefox;
        }

        // Method 1: Check for Firefox-specific APIs
        const hasFirefoxAPI = typeof browser !== 'undefined' &&
                             browser.runtime &&
                             typeof browser.runtime.getBrowserInfo === 'function';

        // Method 2: Check user agent (fallback)
        const userAgent = navigator.userAgent.toLowerCase();
        const userAgentFirefox = userAgent.includes('firefox') || userAgent.includes('gecko/');

        // Method 3: Check for Chrome-specific features (Chrome has these, Firefox doesn't)
        const hasGoogleAPIs = typeof chrome !== 'undefined' &&
                              chrome.identity &&
                              typeof chrome.identity.getAuthToken === 'function';

        // Firefox if: has Firefox API OR (user agent matches AND no Chrome APIs)
        this._isFirefox = hasFirefoxAPI || (userAgentFirefox && !hasGoogleAPIs);

        console.log('[BrowserDetector] Detection results:');
        console.log('  - Has Firefox API (getBrowserInfo):', hasFirefoxAPI);
        console.log('  - User Agent matches Firefox:', userAgentFirefox);
        console.log('  - Has Chrome-specific APIs:', hasGoogleAPIs);
        console.log('  - Final result: isFirefox =', this._isFirefox);

        return this._isFirefox;
    }

    /**
     * Check if running in Chrome/Chromium
     * @returns {boolean}
     */
    isChrome() {
        if (this._isChrome !== null) {
            return this._isChrome;
        }

        this._isChrome = !this.isFirefox();
        return this._isChrome;
    }

    /**
     * Get detailed browser info (async, Firefox only)
     * @returns {Promise<Object|null>}
     */
    async getBrowserInfo() {
        if (this._browserInfo) {
            return this._browserInfo;
        }

        try {
            if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getBrowserInfo) {
                this._browserInfo = await browser.runtime.getBrowserInfo();
                console.log('[BrowserDetector] Browser info:', this._browserInfo);
                return this._browserInfo;
            }
        } catch (error) {
            console.warn('[BrowserDetector] Could not get browser info:', error);
        }

        return null;
    }

    /**
     * Get browser name as string
     * @returns {string} 'firefox', 'chrome', or 'unknown'
     */
    getBrowserName() {
        if (this.isFirefox()) {
            return 'firefox';
        } else if (this.isChrome()) {
            return 'chrome';
        } else {
            return 'unknown';
        }
    }

    /**
     * Check if browser supports getUserSettings API (Chrome 90+)
     * @returns {boolean}
     */
    supportsGetUserSettings() {
        try {
            const action = typeof browser !== 'undefined' ? browser.action : chrome?.action;
            return action && typeof action.getUserSettings === 'function';
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if browser supports Chrome-native OAuth (chrome.identity.getAuthToken)
     * @returns {boolean}
     */
    supportsChromeNativeAuth() {
        return typeof chrome !== 'undefined' &&
               chrome.identity &&
               typeof chrome.identity.getAuthToken === 'function';
    }

    /**
     * Get browser-specific configuration
     * @returns {Object} Configuration object with browser-specific settings
     */
    getConfig() {
        return {
            browser: this.getBrowserName(),
            isFirefox: this.isFirefox(),
            isChrome: this.isChrome(),
            supportsGetUserSettings: this.supportsGetUserSettings(),
            supportsChromeNativeAuth: this.supportsChromeNativeAuth(),
            shouldShowPinPrompts: !this.isFirefox(), // Firefox auto-pins, so don't show prompts
            pinInstructions: this.isFirefox() ? 'firefox' : 'chrome'
        };
    }

    /**
     * Log browser detection results
     */
    logDetection() {
        const config = this.getConfig();
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════════════╗');
        console.log('║  🔍 BROWSER DETECTION                                                  ║');
        console.log('╚════════════════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('  Browser:', config.browser);
        console.log('  Is Firefox:', config.isFirefox);
        console.log('  Is Chrome:', config.isChrome);
        console.log('  Supports getUserSettings():', config.supportsGetUserSettings);
        console.log('  Supports Chrome Native Auth:', config.supportsChromeNativeAuth);
        console.log('  Should show pin prompts:', config.shouldShowPinPrompts);
        console.log('  Pin instructions type:', config.pinInstructions);
        console.log('');
    }
}

// Create singleton instance
const browserDetector = new BrowserDetector();

// Expose for use in other modules (service worker and content scripts)
if (typeof self !== 'undefined') {
    self.BrowserDetector = BrowserDetector;
    self.browserDetector = browserDetector;
}

// Also expose as window property for HTML pages
if (typeof window !== 'undefined') {
    window.BrowserDetector = BrowserDetector;
    window.browserDetector = browserDetector;
}
