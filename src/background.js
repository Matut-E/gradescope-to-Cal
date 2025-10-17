/**
 * Enhanced Background Script with Dual Authentication Strategy
 *
 * REFACTORED: Modular architecture with specialized modules
 * - TokenManager: Token storage and refresh
 * - AuthenticationManager: Chrome native + PKCE authentication
 * - CalendarAPIClient: Calendar operations and sync
 * - EventCache: Performance optimization
 * - AutoSyncManager: Scheduled background sync
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

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    CALENDAR_API_BASE: 'https://www.googleapis.com/calendar/v3',

    // Chrome Extension clients - mapped by extension ID
    CHROME_EXTENSION_CLIENTS: {
        // Development version (unpacked extension)
        'daelaebdndkaepjmcffbijdffmmbmnlh': '589515007396-h3m48dfo08d16b0t4d2l0bkindklukru.apps.googleusercontent.com',
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
// IMPORT MODULES (Service Worker)
// ============================================================================

// Service workers need to use importScripts for loading modules
importScripts(
    'auth/eventCache.js',
    'auth/tokenManager.js',
    'auth/authenticationManager.js',
    'auth/calendarAPIClient.js',
    'auth/autoSyncManager.js',
    'auth/smartSyncManager.js'
);

console.log('✅ All authentication modules loaded');

// ============================================================================
// INITIALIZE INSTANCES
// ============================================================================

// Create module instances
const tokenManager = new TokenManager(CONFIG);
const authManager = new AuthenticationManager(CONFIG, tokenManager);
const calendarClient = new CalendarAPIClient(CONFIG, tokenManager, authManager);
const autoSyncManager = new AutoSyncManager(CONFIG);
const smartSyncManager = new SmartSyncManager(CONFIG, calendarClient, calendarClient.eventCache);

console.log('✅ Module instances created');

// ============================================================================
// EXTENSION EVENT HANDLERS
// ============================================================================

// Auto-sync alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === CONFIG.ALARM_NAME) {
        console.log('⏰ Auto-sync alarm triggered');
        await calendarClient.performBackgroundSync();
    } else if (alarm.name === 'checkPinStatus') {
        // Check if should show badge reminder to pin extension
        await checkAndShowPinBadge();
    }
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handleMessage = async () => {
        switch (request.action) {
            case 'authenticate':
                await authManager.authenticate();
                await autoSyncManager.setupAutoSync();
                return { success: true, message: 'Authentication successful' };

            case 'getAuthStatus':
                const authStatus = await authManager.getAuthStatus();
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
                await autoSyncManager.disableAutoSync();
                await authManager.clearAuth();
                return { success: true, message: 'Authentication cleared' };

            case 'enableAutoSync':
                await autoSyncManager.setupAutoSync();
                return { success: true, message: 'Auto-sync enabled' };

            case 'disableAutoSync':
                await autoSyncManager.disableAutoSync();
                return { success: true, message: 'Auto-sync disabled' };

            case 'getAutoSyncStatus':
                const status = await autoSyncManager.getAutoSyncStatus();
                return { success: true, status };

            case 'performBackgroundSync':
                const result = await calendarClient.performBackgroundSync();
                return result;

            case 'checkForNewAssignments':
                return await handleCheckForNewAssignments(request.assignments);

            case 'getSmartSyncStats':
                const smartSyncStats = await smartSyncManager.getStats();
                return { success: true, stats: smartSyncStats };

            case 'getCacheStats':
                const stats = calendarClient.getCacheStats();
                return { success: true, cacheStats: stats };

            case 'forceCacheRefresh':
                await calendarClient.forceCacheRefresh();
                return { success: true, message: 'Cache refresh complete' };

            case 'checkPinStatus':
                const pinStatus = await checkIfPinned();
                // Clear badge immediately if extension is pinned
                if (pinStatus) {
                    await chrome.action.setBadgeText({ text: '' });
                    console.log('✅ Pin status checked - extension is pinned, badge cleared');
                }
                return { success: true, isPinned: pinStatus };

            case 'openPopup':
                // Attempt to open the extension popup programmatically
                // Note: This may not work in all contexts, but we try
                try {
                    await chrome.action.openPopup();
                    return { success: true, message: 'Popup opened' };
                } catch (error) {
                    // Popup couldn't be opened (likely user gesture required)
                    return { success: false, error: 'Could not open popup - user gesture required' };
                }

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

// Smart sync helper - checks for new assignments and triggers sync if needed
async function handleCheckForNewAssignments(assignments) {
    try {
        console.log(`🧠 Smart sync check: received ${assignments.length} assignments from content script`);

        // Check if user is authenticated
        const authStatus = await authManager.getAuthStatus();
        if (!authStatus.authenticated) {
            console.log('⏭️ User not authenticated, skipping smart sync check');
            return {
                success: true,
                synced: false,
                reason: 'Not authenticated'
            };
        }

        // Check if there are new assignments that should trigger a sync
        const checkResult = await smartSyncManager.checkForNewAssignments(assignments);

        if (!checkResult.shouldSync) {
            return {
                success: true,
                synced: false,
                reason: checkResult.reason,
                newAssignmentsCount: 0
            };
        }

        // Perform smart sync
        console.log(`🚀 Triggering smart sync for ${checkResult.newAssignments.length} new assignments`);
        const syncResult = await smartSyncManager.performSmartSync(checkResult.newAssignments);

        if (syncResult.success) {
            console.log(`✅ Smart sync successful: ${syncResult.results.created} created, ${syncResult.results.skipped} skipped`);
            return {
                success: true,
                synced: true,
                reason: checkResult.reason,
                newAssignmentsCount: checkResult.newAssignments.length,
                results: syncResult.results
            };
        } else {
            console.error('❌ Smart sync failed:', syncResult.error);
            return {
                success: true,
                synced: false,
                reason: `Sync failed: ${syncResult.error}`,
                newAssignmentsCount: checkResult.newAssignments.length
            };
        }

    } catch (error) {
        console.error('❌ Error in handleCheckForNewAssignments:', error);
        return {
            success: false,
            synced: false,
            error: error.message
        };
    }
}

// Startup handler
chrome.runtime.onStartup.addListener(async () => {
    console.log('🌟 Extension startup - checking auto-sync...');

    const authStatus = await authManager.getAuthStatus();
    if (authStatus.authenticated) {
        await autoSyncManager.setupAutoSync();
        console.log('✅ Auto-sync enabled on startup');
    }
});

// ============================================================================
// ONBOARDING: WELCOME PAGE & PIN REMINDERS
// ============================================================================

// Extension installation handler - show welcome page
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('🎉 Extension installed! Opening welcome page...');
        chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    } else if (details.reason === 'update') {
        console.log('🔄 Extension updated to version', chrome.runtime.getManifest().version);
    }
});

/**
 * Check if extension is pinned to toolbar
 */
async function checkIfPinned() {
    try {
        const settings = await chrome.action.getUserSettings();
        return settings.isOnToolbar || false;
    } catch (error) {
        console.error('Error checking pin status:', error);
        // If API not available, assume pinned (older Chrome versions)
        return true;
    }
}

/**
 * Check if badge should be shown and update it
 */
async function checkAndShowPinBadge() {
    try {
        // Check if already pinned
        const isPinned = await checkIfPinned();
        if (isPinned) {
            // Clear badge if pinned
            await chrome.action.setBadgeText({ text: '' });
            return;
        }

        // Check conditions for showing badge
        const data = await chrome.storage.local.get([
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
            await chrome.action.setBadgeText({ text: '!' });
            await chrome.action.setBadgeBackgroundColor({ color: '#FDB515' }); // California Gold
            console.log('📌 Pin reminder badge shown');
        }
    } catch (error) {
        console.error('Error checking pin badge status:', error);
    }
}

// Set up pin status check alarm (runs every 5 minutes to detect pinning quickly)
chrome.alarms.create('checkPinStatus', { periodInMinutes: 5 });

// Track when popup is opened (check pin status and clear badge if pinned)
chrome.action.onClicked.addListener(async () => {
    await chrome.storage.local.set({ lastPopupOpen: Date.now() });

    // Check if extension is now pinned
    const isPinned = await checkIfPinned();
    if (isPinned) {
        // Clear badge immediately if pinned
        await chrome.action.setBadgeText({ text: '' });
        console.log('✅ Extension is pinned - badge cleared');
    }
});

// Initialize on service worker start
(async () => {
    try {
        await tokenManager.initializeFromStorage();
        console.log('✅ Background script initialized with dual authentication');

        // Initial pin status check
        await checkAndShowPinBadge();
    } catch (error) {
        console.error('Initialization error:', error);
    }
})();

console.log('✅ Enhanced background script with dual authentication ready');
