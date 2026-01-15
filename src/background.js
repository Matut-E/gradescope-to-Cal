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
        // Development version (unpacked extension - original)
        'daelaebdndkaepjmcffbijdffmmbmnlh': '589515007396-h3m48dfo08d16b0t4d2l0bkindklukru.apps.googleusercontent.com',
        // Development version (unpacked extension - current)
        'fihhegbokkbnoodajajabnmdkgedjmag': '589515007396-h3m48dfo08d16b0t4d2l0bkindklukru.apps.googleusercontent.com',
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
        'auth/onboardingManager.js',
        'auth/smartSyncManager.js',
        'auth/backgroundPollingManager.js'
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
console.log('');

// Log browser detection results
browserDetector.logDetection();

// ============================================================================
// INITIALIZE INSTANCES
// ============================================================================

// Create module instances
const tokenManager = new TokenManager(CONFIG);
const authManager = new AuthenticationManager(CONFIG, tokenManager);
const calendarClient = new CalendarAPIClient(CONFIG, tokenManager, authManager);
const autoSyncManager = new AutoSyncManager(CONFIG);
const onboardingManager = new OnboardingManager();
const smartSyncManager = new SmartSyncManager(CONFIG, calendarClient, calendarClient.eventCache);
const backgroundPollingManager = new BackgroundPollingManager(CONFIG, calendarClient, smartSyncManager, authManager);

console.log('✅ Module instances created');

// ============================================================================
// CRITICAL: INSTALL LISTENER MUST BE AT TOP LEVEL
// ============================================================================

// Register install listener IMMEDIATELY (before onInstalled event fires)
browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('🎉 Extension installed! Opening welcome page...');
        browser.tabs.create({ url: browser.runtime.getURL('welcome.html') });
    } else if (details.reason === 'update') {
        console.log('🔄 Extension updated to version', browser.runtime.getManifest().version);
    }
});

// ============================================================================
// EXTENSION EVENT HANDLERS
// ============================================================================

// Auto-sync alarm handler
browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === CONFIG.ALARM_NAME) {
        console.log('⏰ Auto-sync alarm triggered');
        await calendarClient.performBackgroundSync();
    } else if (alarm.name === onboardingManager.PIN_CHECK_ALARM) {
        await onboardingManager.handlePinCheckAlarm();
    } else if (alarm.name === backgroundPollingManager.POLL_ALARM_NAME) {
        console.log('🔄 Background poll alarm triggered');
        await backgroundPollingManager.handlePollAlarm();
    }
});

// Message handler
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handleMessage = async () => {
        switch (request.action) {
            case 'authenticate':
                await authManager.authenticate();
                await autoSyncManager.setupAutoSync();

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
                const pinStatus = await onboardingManager.checkIfPinned();
                return { success: true, isPinned: pinStatus };

            case 'openPopup':
                return await onboardingManager.openPopup();

            case 'generateIcal':
                return await handleIcalGeneration(request.assignments);

            // Background polling actions
            case 'enableBackgroundPolling':
                return await backgroundPollingManager.enablePolling();

            case 'disableBackgroundPolling':
                return await backgroundPollingManager.disablePolling();

            case 'getBackgroundPollingStatus':
                const pollingStatus = await backgroundPollingManager.getStatus();
                return { success: true, status: pollingStatus };

            case 'storeEnrolledCourses':
                return await backgroundPollingManager.storeEnrolledCourses(request.courses);

            case 'triggerBackgroundPoll':
                return await backgroundPollingManager.handlePollAlarm();

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
        // Check if this is first-time authentication (no previous sync)
        const storage = await browser.storage.local.get(['last_auto_sync']);
        const hasExistingSync = storage.last_auto_sync;

        if (hasExistingSync) {
            console.log('⏭️ Not first-time authentication, skipping first-time sync');
            return { synced: false, reason: 'Not first-time authentication' };
        }

        console.log('🎉 First-time authentication detected! Checking for existing assignments...');

        // Check if assignments have already been extracted
        const allStorage = await browser.storage.local.get(null);
        const assignmentKeys = Object.keys(allStorage).filter(key =>
            key.startsWith('assignments_') && allStorage[key].assignments
        );

        if (assignmentKeys.length === 0) {
            console.log('📭 No assignments extracted yet, skipping first-time sync');
            return { synced: false, reason: 'No assignments extracted yet' };
        }

        // Collect all assignments from storage
        const allAssignments = [];
        for (const key of assignmentKeys) {
            const data = allStorage[key];
            if (data.assignments && Array.isArray(data.assignments)) {
                allAssignments.push(...data.assignments);
            }
        }

        // Deduplicate by assignmentId
        const uniqueAssignments = Array.from(
            new Map(allAssignments.map(a => [a.assignmentId, a])).values()
        );

        // Filter for calendar-eligible assignments (upcoming, not submitted)
        const calendarEligible = uniqueAssignments.filter(a =>
            a.dueDate && !a.isSubmitted
        );

        if (calendarEligible.length === 0) {
            console.log('📭 No calendar-eligible assignments found, skipping first-time sync');
            return { synced: false, reason: 'No calendar-eligible assignments' };
        }

        console.log(`🚀 First-time sync: Found ${calendarEligible.length} assignments to sync!`);

        // Perform the sync
        const results = await calendarClient.syncAssignments(calendarEligible);

        const syncTimestamp = new Date().toISOString();
        await browser.storage.local.set({
            last_auto_sync: syncTimestamp,
            last_sync_results: results,
            lastSyncType: 'first_time'
        });

        console.log(`✅ First-time sync complete: ${results.created} created, ${results.skipped} skipped`);

        return {
            synced: true,
            reason: 'First-time sync completed',
            assignmentCount: calendarEligible.length,
            results: results
        };

    } catch (error) {
        console.error('❌ Error in handleFirstTimeSync:', error);
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

    // Re-initialize background polling if it was enabled
    await backgroundPollingManager.initialize();
});

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize on service worker start
(async () => {
    try {
        await tokenManager.initializeFromStorage();
        await onboardingManager.initialize();
        await backgroundPollingManager.initialize();
        console.log('✅ Background script initialized with dual authentication');
    } catch (error) {
        console.error('Initialization error:', error);
    }
})();

console.log('✅ Enhanced background script with dual authentication ready');
