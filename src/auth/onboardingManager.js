/**
 * Onboarding Manager Module
 * Handles welcome page, pin-to-toolbar prompts, and badge reminders
 *
 * RESPONSIBILITIES:
 * - Welcome page on install
 * - Pin status detection
 * - Badge reminders for unpinned users
 * - Alarm management for pin checks
 *
 * Extracted from background.js to keep coordinator thin
 */

class OnboardingManager {
    constructor() {
        this.PIN_CHECK_ALARM = 'checkPinStatus';
        this.PIN_CHECK_INTERVAL = 60; // minutes
        // Get the correct browser action API (Chrome MV3: action, Firefox MV2: browserAction)
        this.browserAction = browser.action || browser.browserAction;
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    /**
     * Initialize onboarding features
     * - Set up event listeners (except install listener - handled at top level)
     * - Create alarm for pin checks
     * - Perform initial pin badge check
     */
    async initialize() {
        try {
            console.log('🎯 Initializing onboarding manager...');

            // NOTE: Install listener is registered at TOP LEVEL in background.js
            // to ensure it catches the onInstalled event before async init completes

            // Set up popup click listener (clear badge)
            this.setupPopupClickListener();

            // Set up pin check alarm
            this.setupPinCheckAlarm();

            // Perform initial pin badge check
            await this.checkAndShowPinBadge();

            console.log('✅ Onboarding manager initialized');
        } catch (error) {
            console.error('❌ Error initializing onboarding manager:', error);
        }
    }

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================

    /**
     * Set up extension installation listener - show welcome page
     */
    setupInstallListener() {
        browser.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                console.log('🎉 Extension installed! Opening welcome page...');
                browser.tabs.create({ url: browser.runtime.getURL('welcome.html') });
            } else if (details.reason === 'update') {
                console.log('🔄 Extension updated to version', browser.runtime.getManifest().version);
            }
        });
    }

    /**
     * Set up popup click listener - track opens and clear badge
     */
    setupPopupClickListener() {
        this.browserAction.onClicked.addListener(async () => {
            await browser.storage.local.set({ lastPopupOpen: Date.now() });
            await this.browserAction.setBadgeText({ text: '' });
        });
    }

    /**
     * Set up pin check alarm (runs every hour)
     */
    setupPinCheckAlarm() {
        browser.alarms.create(this.PIN_CHECK_ALARM, { periodInMinutes: this.PIN_CHECK_INTERVAL });
        console.log(`⏰ Pin check alarm created (every ${this.PIN_CHECK_INTERVAL} minutes)`);
    }

    // =========================================================================
    // ALARM HANDLER
    // =========================================================================

    /**
     * Handle pin check alarm
     * Called from background.js alarm listener
     */
    async handlePinCheckAlarm() {
        console.log('⏰ Pin check alarm triggered');
        await this.checkAndShowPinBadge();
    }

    // =========================================================================
    // PIN STATUS DETECTION
    // =========================================================================

    /**
     * Check if extension is pinned to toolbar
     * @returns {Promise<boolean>} True if pinned, false otherwise
     */
    async checkIfPinned() {
        try {
            // getUserSettings is Chrome MV3 only - Firefox doesn't have this API
            if (this.browserAction.getUserSettings) {
                const settings = await this.browserAction.getUserSettings();
                return settings.isOnToolbar || false;
            }
            // Firefox: getUserSettings doesn't exist, assume pinned (Firefox extensions are visible by default)
            console.log('📌 getUserSettings not available (Firefox) - assuming pinned');
            return true;
        } catch (error) {
            console.error('Error checking pin status:', error);
            // If API not available, assume pinned (older Chrome versions or Firefox)
            return true;
        }
    }

    // =========================================================================
    // BADGE MANAGEMENT
    // =========================================================================

    /**
     * Check if badge should be shown and update it
     * Shows badge if:
     * - Extension is not pinned
     * - User has assignments
     * - User hasn't dismissed banner
     * - Popup hasn't been opened in 24 hours
     */
    async checkAndShowPinBadge() {
        try {
            // Check if already pinned
            const isPinned = await this.checkIfPinned();
            if (isPinned) {
                // Clear badge if pinned
                await this.browserAction.setBadgeText({ text: '' });
                return;
            }

            // Check conditions for showing badge
            const data = await browser.storage.local.get([
                'hasAssignments',
                'lastPopupOpen',
                'dismissedExtractionBanner'
            ]);

            // Don't show if user dismissed banner or no assignments
            if (data.dismissedExtractionBanner || !data.hasAssignments) {
                return;
            }

            // Check if popup hasn't been opened in 24 hours
            const dayInMs = 24 * 60 * 60 * 1000;
            const timeSinceOpen = data.lastPopupOpen ? Date.now() - data.lastPopupOpen : Infinity;

            console.log(`⏰ Badge check - unpinned: true, hasAssignments: ${data.hasAssignments}, dismissed: ${data.dismissedExtractionBanner}, timeSince: ${Math.round(timeSinceOpen / (60 * 60 * 1000))}h`);

            if (timeSinceOpen > dayInMs) {
                // Show badge - using '!' character
                await this.browserAction.setBadgeText({ text: '!' });
                await this.browserAction.setBadgeBackgroundColor({ color: '#FDB515' }); // California Gold
                console.log('📌 Pin reminder badge shown');
            }
        } catch (error) {
            console.error('Error checking pin badge status:', error);
        }
    }

    /**
     * Clear pin badge
     */
    async clearBadge() {
        try {
            await this.browserAction.setBadgeText({ text: '' });
        } catch (error) {
            console.error('Error clearing badge:', error);
        }
    }

    // =========================================================================
    // POPUP CONTROL (for message handlers)
    // =========================================================================

    /**
     * Attempt to open extension popup programmatically
     * Note: May not work in all contexts (user gesture required)
     * @returns {Promise<{success: boolean, message?: string, error?: string}>}
     */
    async openPopup() {
        try {
            // openPopup may not be available in all browsers/versions
            if (this.browserAction.openPopup) {
                await this.browserAction.openPopup();
                return { success: true, message: 'Popup opened' };
            }
            return { success: false, error: 'openPopup not available in this browser' };
        } catch (error) {
            // Popup couldn't be opened (likely user gesture required)
            return { success: false, error: 'Could not open popup - user gesture required' };
        }
    }
}

// Export to window for service worker context
if (typeof window !== 'undefined') {
    window.OnboardingManager = OnboardingManager;
}

// Export for module usage (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OnboardingManager;
}
