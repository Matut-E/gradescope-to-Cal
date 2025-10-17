/**
 * Gradescope Calendar Sync - Content Script
 * Features: Assignment extraction + calendar sync (no grade calculator)
 *
 * This is the main coordinator that uses the extracted utility modules
 */

console.log('🎯 Gradescope Calendar Sync: Content script loaded');

// =============================================================================
// DEPENDENCIES
// =============================================================================

/**
 * Required modules (loaded via manifest.json):
 * - DateParser (utils/dateParser.js) - Date parsing utilities
 * - AssignmentParser (utils/assignmentParser.js) - Assignment parsing utilities
 * - PageDetector (utils/pageDetector.js) - Page detection and DOM observation
 * - TestFunctions (utils/testFunctions.js) - Testing and debug functions
 * - PinBannerInjector (utils/pinBannerInjector.js) - Pin reminder banner
 *
 * All modules are available via window.ModuleName
 */

// =============================================================================
// GLOBAL STATE AND LISTENERS
// =============================================================================

let extractionInProgress = false;
let lastExtractionUrl = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'manualSync') {
        console.log('📬 Received manual sync request from popup');
        main();
        sendResponse({status: 'sync_started'});
    }
});

// =============================================================================
// ONBOARDING: PIN BANNER HELPER
// =============================================================================

/**
 * Show pin banner if needed after extraction
 * @param {Array} calendarAssignments - Calendar-ready assignments (upcoming only)
 */
async function showPinBannerIfNeeded(calendarAssignments) {
    try {
        // Mark that we have assignments
        await chrome.storage.local.set({ hasAssignments: calendarAssignments.length > 0 });

        // Check if first-time extraction (or no dismissal yet)
        const data = await chrome.storage.local.get([
            'dismissedExtractionBanner',
            'sawExtractionBanner'
        ]);

        // Only show banner on first few extractions
        if (data.dismissedExtractionBanner || data.sawExtractionBanner) {
            return;
        }

        // Calculate counts for banner (using calendar assignments to match popup)
        const courseTitles = calendarAssignments.map(a => a.course);
        const uniqueCourseTitles = [...new Set(courseTitles.filter(title => title && title.trim()))];
        const courseCount = uniqueCourseTitles.length;
        const assignmentCount = calendarAssignments.length;

        console.log(`📊 Banner counts: ${assignmentCount} assignments across ${courseCount} courses`);

        // Check pin status from background
        chrome.runtime.sendMessage({ action: 'checkPinStatus' }, (response) => {
            if (response && response.success && !response.isPinned) {
                // Show the banner
                const bannerInjector = new PinBannerInjector();
                bannerInjector.showBanner(assignmentCount, courseCount);
                console.log('📌 Pin banner shown to user');
            }
        });
    } catch (error) {
        console.error('Error showing pin banner:', error);
    }
}

// =============================================================================
// ASSIGNMENT DEDUPLICATION
// =============================================================================

/**
 * Check for existing assignments to avoid duplicates
 */
async function checkExistingAssignments(assignments) {
    try {
        const storage = await chrome.storage.local.get(null);
        const existingIds = new Set();

        for (const [key, value] of Object.entries(storage)) {
            if (key.startsWith('assignments_') && value.assignments) {
                value.assignments.forEach(a => {
                    if (a.id) existingIds.add(a.id);
                });
            }
        }

        const newAssignments = assignments.filter(a => !existingIds.has(a.id));
        return newAssignments;
    } catch (error) {
        console.error('Error checking existing assignments:', error);
        return assignments;
    }
}

// =============================================================================
// MAIN EXECUTION FUNCTION
// =============================================================================

/**
 * Main execution coordinating all extraction and storage logic
 */
async function main() {
    if (extractionInProgress) {
        console.log('⏸️ Extraction already in progress, skipping...');
        return;
    }

    const currentUrl = window.location.href;
    if (lastExtractionUrl === currentUrl && extractionInProgress === false) {
        console.log('⏸️ Same URL recently processed, skipping...');
        return;
    }

    extractionInProgress = true;
    lastExtractionUrl = currentUrl;

    try {
        const pageType = PageDetector.detectPageType();
        console.log(`📄 Page type: ${pageType}`);

        let result;
        let method = '';

        if (pageType === 'dashboard') {
            result = await AssignmentParser.fastComprehensiveExtraction();
            method = 'fast_comprehensive_extraction';
        } else if (pageType === 'course_main' || pageType === 'course_assignments') {
            result = AssignmentParser.extractFromCoursePage();
            method = 'individual_course_page';
        } else {
            console.log('ℹ️ Not a relevant Gradescope page, skipping extraction');
            return;
        }

        const { allAssignments, calendarAssignments } = result;

        if (allAssignments.length > 0) {
            // Check for duplicates only on calendar assignments
            const uniqueCalendarAssignments = await checkExistingAssignments(calendarAssignments);

            if (uniqueCalendarAssignments.length > 0 || allAssignments.length > 0) {
                const storageKey = `assignments_${method}_${Date.now()}`;

                await chrome.storage.local.set({
                    [storageKey]: {
                        // Store calendar assignments (for calendar sync functionality)
                        assignments: uniqueCalendarAssignments,

                        // Store ALL assignments
                        allAssignments: allAssignments,

                        extractedAt: new Date().toISOString(),
                        pageUrl: window.location.href,
                        method: method,
                        semester: DateParser.getCurrentSemester(),

                        stats: {
                            totalExtracted: allAssignments.length,
                            calendarTotal: calendarAssignments.length,
                            calendarUnique: uniqueCalendarAssignments.length,
                            calendarDuplicates: calendarAssignments.length - uniqueCalendarAssignments.length,
                            submitted: allAssignments.filter(a => a.isSubmitted).length,
                            pending: allAssignments.filter(a => !a.isSubmitted).length
                        }
                    }
                });

                const submitted = allAssignments.filter(a => a.isSubmitted).length;
                const pending = allAssignments.filter(a => !a.isSubmitted).length;

                console.log(`💾 Stored assignment data:`);
                console.log(`   📊 ${allAssignments.length} total assignments extracted`);
                console.log(`   🗓️ ${uniqueCalendarAssignments.length} calendar assignments (${calendarAssignments.length - uniqueCalendarAssignments.length} duplicates)`);
                console.log(`   📈 Status: ${submitted} submitted, ${pending} pending`);

                // Show pin banner after successful extraction (use calendar assignments to match popup counts)
                await showPinBannerIfNeeded(calendarAssignments);

                // =================================================================
                // SMART SYNC: Check if new assignments should trigger immediate sync
                // =================================================================
                if (uniqueCalendarAssignments.length > 0) {
                    console.log('🧠 Checking for new assignments to trigger smart sync...');
                    chrome.runtime.sendMessage({
                        action: 'checkForNewAssignments',
                        assignments: uniqueCalendarAssignments,
                        allAssignments: allAssignments
                    }, (response) => {
                        if (response && response.success) {
                            if (response.synced) {
                                console.log(`✅ Smart sync triggered: ${response.results.created} events created`);
                            } else {
                                console.log(`ℹ️ Smart sync not triggered: ${response.reason}`);
                            }
                        }
                    });
                }

            } else {
                console.log('ℹ️ All calendar assignments were duplicates');
            }
        } else {
            console.log('📭 No assignments found');
        }

    } catch (error) {
        console.error('❌ Error during extraction:', error);
    } finally {
        extractionInProgress = false;
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

console.log('✅ Calendar sync extraction ready!');
console.log('🧪 Available test functions:');
console.log('   • testGradeExtraction() - Basic extraction test');
console.log('   • testEnhancedStorage() - Check stored data');

// Initialize extension
if (window.gradescopeCalendarSyncLoadedV4) {
    console.log('🔄 Manual sync triggered');
    main();
} else {
    window.gradescopeCalendarSyncLoadedV4 = true;

    console.log('🎯 Starting calendar sync content script...');

    const initializeExtension = () => {
        PageDetector.setupOptimizedDOMObserver(main);
        main();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeExtension, 1000);
        });
    } else {
        setTimeout(initializeExtension, 1000);
    }
}

console.log('✅ Gradescope Calendar Sync initialized (V1.8.0)');
