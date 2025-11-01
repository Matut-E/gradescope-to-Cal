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

// ============================================================================
// IMPORT MODULES
// ============================================================================

// Chrome MV3 service workers use importScripts
// Firefox MV2 loads scripts via manifest.json (no importScripts needed)
if (typeof importScripts === 'function') {
    // Chrome service worker - load all modules
    importScripts(
        'lib/browser-polyfill.js',
        'utils/browserDetector.js',
        'utils/icalGenerator.js',
        'auth/eventCache.js',
        'auth/tokenManager.js',
        'auth/authenticationManager.js',
        'auth/calendarAPIClient.js',
        'auth/autoSyncManager.js',
        'auth/smartSyncManager.js'
    );
    console.log('✅ Chrome: Modules loaded via importScripts');
} else {
    // Firefox background script - modules already loaded via manifest
    console.log('✅ Firefox: Modules loaded via manifest.json');
}

// Log configuration AFTER polyfill is loaded
console.log('');
console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║  🚀 BACKGROUND SCRIPT WAKE/LOAD EVENT                                  ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('📊 Script Initialization:');
console.log('   - Timestamp:', new Date().toISOString());
console.log('   - Extension ID:', browser.runtime.id);
console.log('   - Chrome Client ID:', CONFIG.CHROME_EXTENSION_CLIENTS[browser.runtime.id] || 'not configured');
console.log('   - Web Client ID:', CONFIG.WEB_CLIENT_ID);
console.log('   - Browser:', typeof browser.runtime.getBrowserInfo !== 'undefined' ? 'Firefox' : 'Chrome-based');
console.log('');

// Log browser detection results
browserDetector.logDetection();

// ============================================================================
// CROSS-BROWSER COMPATIBILITY HELPERS
// ============================================================================

/**
 * Get the correct browser action API
 * Chrome MV3: browser.action
 * Firefox MV2: browser.browserAction
 */
function getBrowserAction() {
    // Chrome MV3 uses browser.action
    if (typeof browser.action !== 'undefined') {
        return browser.action;
    }
    // Firefox MV2 uses browser.browserAction
    if (typeof browser.browserAction !== 'undefined') {
        return browser.browserAction;
    }
    // Fallback (shouldn't happen)
    console.error('❌ Neither browser.action nor browser.browserAction is available!');
    return null;
}

// ============================================================================
// INITIALIZE INSTANCES
// ============================================================================

// Create module instances
console.log('🔧 Creating module instances...');
const tokenManager = new TokenManager(CONFIG);
console.log('   ✓ TokenManager created');
const authManager = new AuthenticationManager(CONFIG, tokenManager);
console.log('   ✓ AuthenticationManager created');
const calendarClient = new CalendarAPIClient(CONFIG, tokenManager, authManager);
console.log('   ✓ CalendarAPIClient created');
const autoSyncManager = new AutoSyncManager(CONFIG);
console.log('   ✓ AutoSyncManager created');
const smartSyncManager = new SmartSyncManager(CONFIG, calendarClient, calendarClient.eventCache);
console.log('   ✓ SmartSyncManager created');
console.log('');

// CRITICAL: Initialize TokenManager from storage to prevent race conditions
// This ensures auth tokens are loaded from storage BEFORE any popup opens
// Fixes visual bug where popup shows "disconnected" after service worker wakes
console.log('🔄 Initializing TokenManager from storage...');
const storageInitPromise = tokenManager.initializeFromStorage().then(() => {
    console.log('✅ TokenManager initialized from storage');
});

console.log('✅ All modules initialized and ready');

// ============================================================================
// EXTENSION EVENT HANDLERS
// ============================================================================

// Auto-sync alarm handler
browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === CONFIG.ALARM_NAME) {
        console.log('⏰ Auto-sync alarm triggered');
        await calendarClient.performBackgroundSync();
    } else if (alarm.name === 'checkPinStatus') {
        // Check if should show badge reminder to pin extension
        await checkAndShowPinBadge();
    }
});

// Message handler
console.log('📝 Registering message handler...');
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Log every message received
    console.log('');
    console.log('📨 MESSAGE RECEIVED from', sender.tab ? `tab ${sender.tab.id}` : 'extension');
    console.log('   - Action:', request.action);
    console.log('   - Timestamp:', new Date().toISOString());
    if (request.action === 'checkForNewAssignments') {
        console.log('   - Assignments count:', request.assignments?.length || 0);
    }
    console.log('');

    const handleMessage = async () => {
        switch (request.action) {
            case 'authenticate':
                await authManager.authenticate();
                await autoSyncManager.setupAutoSync();

                // Post-authentication diagnostics: Verify storage state
                const postAuthStorage = await browser.storage.local.get([
                    'google_access_token',
                    'google_refresh_token',
                    'google_token_expiry',
                    'google_auth_method'
                ]);

                console.log('');
                console.log('╔════════════════════════════════════════════════════════════════════════╗');
                console.log('║  ✅ AUTHENTICATION COMPLETE - Final Storage State                     ║');
                console.log('╚════════════════════════════════════════════════════════════════════════╝');
                console.log('');
                console.log('📊 browser.storage.local contents:');
                console.log('   - google_access_token:', !!postAuthStorage.google_access_token ? '✓ STORED' : '✗ MISSING');
                console.log('   - google_refresh_token:', !!postAuthStorage.google_refresh_token ? '✓ STORED' : '✗ MISSING');
                console.log('   - google_token_expiry:', postAuthStorage.google_token_expiry ? `✓ STORED (${new Date(postAuthStorage.google_token_expiry).toISOString()})` : '✗ MISSING');
                console.log('   - google_auth_method:', postAuthStorage.google_auth_method || '✗ MISSING');
                console.log('');

                if (!postAuthStorage.google_refresh_token) {
                    console.warn('⚠️ WARNING: No refresh token in storage!');
                    console.warn('   You will need to re-authenticate when the access token expires (in ~1 hour).');
                    console.warn('');
                    console.warn('   To get a refresh token:');
                    console.warn('   1. Revoke app access: https://myaccount.google.com/permissions');
                    console.warn('   2. Clear authentication in extension');
                    console.warn('   3. Reconnect to Google Calendar');
                    console.warn('');
                }

                // First-time sync: If assignments already extracted, sync immediately
                const firstTimeSyncResult = await handleFirstTimeSync();
                if (firstTimeSyncResult.synced) {
                    return {
                        success: true,
                        message: 'Authentication successful',
                        firstTimeSync: true,
                        syncResults: firstTimeSyncResult.results
                    };
                }

                return { success: true, message: 'Authentication successful' };

            case 'getAuthStatus':
                // CRITICAL: Ensure storage is initialized before checking auth status
                // Wait for initial storage load if still in progress
                await storageInitPromise;

                // Then reload from storage to get the most current state
                // This prevents race conditions where popup checks auth before storage is loaded
                await tokenManager.initializeFromStorage();

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
                    const action = getBrowserAction();
                    if (action) {
                        await action.setBadgeText({ text: '' });
                        console.log('✅ Pin status checked - extension is pinned, badge cleared');
                    }
                }
                return { success: true, isPinned: pinStatus };

            case 'openPopup':
                // Attempt to open the extension popup programmatically
                // Note: This may not work in all contexts, but we try
                try {
                    const action = getBrowserAction();
                    if (action && action.openPopup) {
                        await action.openPopup();
                        return { success: true, message: 'Popup opened' };
                    } else {
                        return { success: false, error: 'openPopup API not available' };
                    }
                } catch (error) {
                    // Popup couldn't be opened (likely user gesture required)
                    return { success: false, error: 'Could not open popup - user gesture required' };
                }

            case 'generateIcal':
                return await handleIcalGeneration(request.assignments);

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
console.log('✅ Message handler registered and ready to receive messages');
console.log('');

// Calendar sync helper
async function handleCalendarSync(assignments) {
    try {
        const results = await calendarClient.syncAssignments(assignments);

        await browser.storage.local.set({
            last_auto_sync: new Date().toISOString(),
            last_sync_results: results,
            lastSyncType: 'manual'
        });

        return { success: true, results };
    } catch (error) {
        console.error('❌ Calendar sync failed:', error);

        await browser.storage.local.set({
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

// First-time sync helper - syncs immediately after first authentication if assignments exist
async function handleFirstTimeSync() {
    try {
        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════════════╗');
        console.log('║  🔍 FIRST-TIME SYNC CHECK                                              ║');
        console.log('╚════════════════════════════════════════════════════════════════════════╝');
        console.log('');

        // Check if this is first-time authentication (no previous sync)
        const storage = await browser.storage.local.get(['last_auto_sync', 'lastSyncType']);
        const hasExistingSync = storage.last_auto_sync;

        console.log('📊 Storage check:');
        console.log('   - last_auto_sync:', hasExistingSync || 'NOT SET');
        console.log('   - lastSyncType:', storage.lastSyncType || 'NOT SET');

        if (hasExistingSync) {
            console.log('');
            console.log('⏭️ Not first-time authentication, skipping first-time sync');
            console.log('   (last sync was:', hasExistingSync, ')');
            console.log('');
            console.log('💡 TIP: To test first-time sync, clear storage:');
            console.log('   browser.storage.local.remove([\'last_auto_sync\', \'lastSyncType\'])');
            console.log('');
            return { synced: false, reason: 'Not first-time authentication' };
        }

        console.log('✅ First-time authentication detected! (no previous sync found)');
        console.log('');

        // Check if assignments have already been extracted
        console.log('🔍 Searching for extracted assignments in storage...');
        const allStorage = await browser.storage.local.get(null);
        const assignmentKeys = Object.keys(allStorage).filter(key =>
            key.startsWith('assignments_') && allStorage[key].assignments
        );

        console.log(`   - Found ${assignmentKeys.length} assignment storage keys:`);
        assignmentKeys.forEach(key => {
            console.log(`      • ${key}: ${allStorage[key].assignments?.length || 0} assignments`);
        });

        if (assignmentKeys.length === 0) {
            console.log('');
            console.log('📭 No assignments extracted yet, skipping first-time sync');
            console.log('   User needs to extract assignments first (click "Extract Assignments Now")');
            console.log('');
            return { synced: false, reason: 'No assignments extracted yet' };
        }

        // Collect all assignments from storage
        console.log('');
        console.log('📦 Collecting all assignments from storage...');
        const allAssignments = [];
        for (const key of assignmentKeys) {
            const data = allStorage[key];
            if (data.assignments && Array.isArray(data.assignments)) {
                allAssignments.push(...data.assignments);
            }
        }
        console.log(`   ✓ Collected ${allAssignments.length} total assignments`);

        // Deduplicate by assignmentId
        const uniqueAssignments = Array.from(
            new Map(allAssignments.map(a => [a.assignmentId, a])).values()
        );
        console.log(`   ✓ ${uniqueAssignments.length} unique assignments (after deduplication)`);

        // Filter for calendar-eligible assignments (upcoming, not submitted)
        const calendarEligible = uniqueAssignments.filter(a =>
            a.dueDate && !a.isSubmitted
        );
        console.log(`   ✓ ${calendarEligible.length} calendar-eligible assignments (upcoming + not submitted)`);

        if (calendarEligible.length === 0) {
            console.log('');
            console.log('📭 No calendar-eligible assignments found, skipping first-time sync');
            console.log('   All assignments may be:');
            console.log('   - Already submitted');
            console.log('   - Missing due dates');
            console.log('   - Past due date');
            console.log('');
            return { synced: false, reason: 'No calendar-eligible assignments' };
        }

        console.log('');
        console.log(`🚀 Starting first-time sync for ${calendarEligible.length} assignments!`);
        console.log('');

        // Perform the sync
        const results = await calendarClient.syncAssignments(calendarEligible);

        const syncTimestamp = new Date().toISOString();
        await browser.storage.local.set({
            last_auto_sync: syncTimestamp,
            last_sync_results: results,
            lastSyncType: 'first_time'
        });

        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ FIRST-TIME SYNC COMPLETE                                           ║');
        console.log('╚════════════════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('📊 Results:');
        console.log(`   - Created: ${results.created} events`);
        console.log(`   - Skipped: ${results.skipped} events`);
        console.log(`   - Failed: ${results.failed} events`);
        console.log('');

        return {
            synced: true,
            reason: 'First-time sync completed',
            assignmentCount: calendarEligible.length,
            results: results
        };

    } catch (error) {
        console.error('');
        console.error('❌ Error in handleFirstTimeSync:', error);
        console.error('   Error type:', error.name);
        console.error('   Error message:', error.message);
        console.error('   Stack:', error.stack);
        console.error('');
        return {
            synced: false,
            reason: `Error: ${error.message}`,
            error: error.message
        };
    }
}

// iCal generation helper - generates content and returns it to popup for download
async function handleIcalGeneration(assignments) {
    try {
        console.log(`📥 Generating iCal content for ${assignments.length} assignments...`);

        // Get user settings for event customization
        const localSettings = await browser.storage.local.get([
            'eventDisplayTime',
            'reminderSchedule',
            'customReminders',
            'settings_create_reminders'
        ]);

        const settings = {
            eventDisplayTime: localSettings.eventDisplayTime || 'deadline',
            reminderSchedule: localSettings.reminderSchedule || 'double',
            customReminders: localSettings.customReminders || [1440, 60],
            settings_create_reminders: localSettings.settings_create_reminders !== false
        };

        console.log('🎨 Using settings:', settings);

        // Generate iCalendar content
        const icalContent = IcalGenerator.generate(assignments, settings);

        console.log(`✅ iCal content generated successfully (${icalContent.length} characters)`);

        // Return content to popup for download (can't use URL.createObjectURL in service worker)
        return {
            success: true,
            message: 'iCal content generated successfully',
            icalContent: icalContent,
            assignmentCount: assignments.length
        };

    } catch (error) {
        console.error('❌ iCal generation failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Startup handler
browser.runtime.onStartup.addListener(async () => {
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
browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        console.log('🎉 Extension installed! Opening welcome page...');
        browser.tabs.create({ url: browser.runtime.getURL('welcome.html') });

        // Set install date for feedback prompt system (only on first install)
        const data = await browser.storage.local.get('installDate');
        if (!data.installDate) {
            await browser.storage.local.set({ installDate: Date.now() });
            console.log('📬 Install date recorded for feedback system');
        }
    } else if (details.reason === 'update') {
        console.log('🔄 Extension updated to version', browser.runtime.getManifest().version);
    }
});

/**
 * Check if extension is pinned to toolbar
 * Firefox: Always returns true (auto-pinned by Firefox)
 * Chrome: Uses getUserSettings() API to detect pin status
 */
async function checkIfPinned() {
    try {
        // Firefox auto-pins extensions, so always return true
        if (browserDetector.isFirefox()) {
            console.log('🦊 Firefox detected - extensions are auto-pinned, returning true');
            return true;
        }

        // Chrome: Use getUserSettings API (available Chrome 90+)
        const action = getBrowserAction();
        if (action && action.getUserSettings) {
            const settings = await action.getUserSettings();
            const isPinned = settings.isOnToolbar || false;
            console.log('📌 Pin status (getUserSettings):', isPinned);
            return isPinned;
        } else {
            // Older Chrome versions without getUserSettings
            console.warn('⚠️ getUserSettings API not available, assuming pinned');
            return true;
        }
    } catch (error) {
        console.error('Error checking pin status:', error);
        // If API not available, assume pinned to avoid showing unnecessary prompts
        return true;
    }
}

/**
 * Check if badge should be shown and update it
 */
async function checkAndShowPinBadge() {
    try {
        const action = getBrowserAction();
        if (!action) {
            console.warn('⚠️ Browser action API not available, skipping badge check');
            return;
        }

        // Check if already pinned
        const isPinned = await checkIfPinned();
        if (isPinned) {
            // Clear badge if pinned
            if (action.setBadgeText) {
                await action.setBadgeText({ text: '' });
            }
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
            if (action.setBadgeText) {
                await action.setBadgeText({ text: '!' });
            }
            if (action.setBadgeBackgroundColor) {
                await action.setBadgeBackgroundColor({ color: '#FDB515' }); // California Gold
            }
            console.log('📌 Pin reminder badge shown');
        }
    } catch (error) {
        console.error('Error checking pin badge status:', error);
    }
}

// Set up pin status check alarm (runs every 5 minutes to detect pinning quickly)
browser.alarms.create('checkPinStatus', { periodInMinutes: 5 });

// Track when popup is opened (check pin status and clear badge if pinned)
const action = getBrowserAction();
if (action && action.onClicked) {
    action.onClicked.addListener(async () => {
        await browser.storage.local.set({ lastPopupOpen: Date.now() });

        // Check if extension is now pinned
        const isPinned = await checkIfPinned();
        if (isPinned) {
            // Clear badge immediately if pinned
            if (action.setBadgeText) {
                await action.setBadgeText({ text: '' });
            }
            console.log('✅ Extension is pinned - badge cleared');
        }
    });
}

// Initialize on service worker start
(async () => {
    try {
        console.log('🔄 Running async initialization...');
        await tokenManager.initializeFromStorage();
        console.log('   ✓ Token manager initialized from storage');

        // Initial pin status check
        await checkAndShowPinBadge();
        console.log('   ✓ Pin status checked');

        console.log('');
        console.log('╔════════════════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ BACKGROUND SCRIPT FULLY READY                                      ║');
        console.log('╚════════════════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('📡 Ready to receive messages:');
        console.log('   - authenticate');
        console.log('   - getAuthStatus');
        console.log('   - syncToCalendar');
        console.log('   - checkForNewAssignments  ← Smart sync trigger');
        console.log('   - performBackgroundSync   ← 24-hour auto-sync');
        console.log('');
        console.log('🕐 Current time:', new Date().toISOString());
        console.log('');
    } catch (error) {
        console.error('');
        console.error('❌ INITIALIZATION ERROR:', error);
        console.error('   Background script may not function correctly!');
        console.error('');
    }
})();
