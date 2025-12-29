/**
 * Enhanced Gradescope Calendar Sync - Content Script with Grade Calculator
 * Features: Fast comprehensive grade extraction + filtered calendar sync + assignment categorization
 *
 * This is the main coordinator that uses the extracted utility modules
 */

console.log('🎯 Enhanced Gradescope Calendar Sync: Content script loaded with grade calculator');

// =============================================================================
// DEPENDENCIES
// =============================================================================

/**
 * Required modules (loaded via manifest.json):
 * - AssignmentCategorizer (assignmentCategorizer.js) - Assignment categorization engine
 * - DateParser (utils/dateParser.js) - Date parsing utilities
 * - GradeExtractor (utils/gradeExtractor.js) - Grade extraction utilities
 * - AssignmentParser (utils/assignmentParser.js) - Assignment parsing utilities
 * - PageDetector (utils/pageDetector.js) - Page detection and DOM observation
 * - TestFunctions (utils/testFunctions.js) - Testing and debug functions
 *
 * All modules are available via window.ModuleName
 */

// =============================================================================
// GLOBAL STATE AND LISTENERS
// =============================================================================

let extractionInProgress = false;
let lastExtractionUrl = null;

// Listen for messages from popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'manualSync') {
        console.log('📬 Received manual sync request from popup');
        main();
        sendResponse({status: 'sync_started'});
    }
});

// =============================================================================
// BACKGROUND POLLING: COURSE LIST STORAGE
// =============================================================================

/**
 * Store enrolled courses for background polling feature
 * This enables the extension to fetch assignments without user visiting Gradescope
 * @param {Array} courses - Array of course objects from dashboard extraction
 */
async function storeCoursesForBackgroundPolling(courses) {
    if (!courses || courses.length === 0) {
        return;
    }

    try {
        // Store courses for background polling
        await browser.runtime.sendMessage({
            action: 'storeEnrolledCourses',
            courses: courses
        });
        console.log(`📡 Stored ${courses.length} courses for background polling`);
    } catch (error) {
        // Background polling might not be enabled, that's fine
        console.log('ℹ️ Could not store courses for background polling:', error.message);
    }
}

/**
 * Extract and store courses on dashboard visit
 */
async function updateEnrolledCoursesIfNeeded() {
    try {
        const pageType = PageDetector.detectPageType();

        // Only update courses from dashboard (most complete view)
        if (pageType !== 'dashboard') {
            return;
        }

        const courses = AssignmentParser.extractCoursesFromDashboard();
        if (courses.length > 0) {
            await storeCoursesForBackgroundPolling(courses);
        }
    } catch (error) {
        console.log('ℹ️ Could not update enrolled courses:', error.message);
    }
}

// =============================================================================
// ONBOARDING: PIN BANNER HELPER
// =============================================================================

/**
 * Show pin banner if needed after extraction
 * @param {Array} allAssignments - All extracted assignments
 */
async function showPinBannerIfNeeded(allAssignments) {
    try {
        // Mark that we have assignments
        await browser.storage.local.set({ hasAssignments: allAssignments.length > 0 });

        // Check if first-time extraction (or no dismissal yet)
        const data = await browser.storage.local.get([
            'dismissedExtractionBanner',
            'sawExtractionBanner'
        ]);

        // Only show banner on first few extractions
        if (data.dismissedExtractionBanner || data.sawExtractionBanner) {
            return;
        }

        // Calculate counts for banner
        const courseTitles = allAssignments.map(a => a.course);
        console.log('🔍 Course titles in assignments:', courseTitles.slice(0, 5)); // Show first 5

        const uniqueCourseTitles = [...new Set(courseTitles.filter(title => title && title.trim()))];
        const courseCount = uniqueCourseTitles.length;
        const assignmentCount = allAssignments.length;

        console.log(`📊 Banner counts: ${assignmentCount} assignments across ${courseCount} courses`);
        console.log('📚 Unique courses:', uniqueCourseTitles);

        // Check pin status from background (Promise-based API)
        try {
            const response = await browser.runtime.sendMessage({ action: 'checkPinStatus' });
            if (response && response.success && !response.isPinned) {
                // Show the banner
                const bannerInjector = new PinBannerInjector();
                bannerInjector.showBanner(assignmentCount, courseCount);
                console.log('📌 Pin banner shown to user');
            }
        } catch (err) {
            console.warn('Could not check pin status:', err);
        }
    } catch (error) {
        console.error('Error showing pin banner:', error);
    }
}

// =============================================================================
// MAIN EXECUTION FUNCTION
// =============================================================================

/**
 * Send extraction progress update to popup via storage
 * @param {string} stage - Current stage identifier
 * @param {string} message - Human-readable progress message
 * @param {object} data - Optional additional data
 */
async function updateExtractionProgress(stage, message, data = {}) {
    try {
        await browser.storage.local.set({
            extraction_progress: {
                stage,
                message,
                timestamp: Date.now(),
                ...data
            }
        });
    } catch (error) {
        console.log('Could not update extraction progress:', error.message);
    }
}

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
        // Stage 1: Detect page type
        await updateExtractionProgress('detecting', '🔍 Detecting page type...');

        const pageType = PageDetector.detectPageType();
        console.log(`📄 Page type: ${pageType}`);

        let result;
        let method = '';

        if (pageType === 'dashboard') {
            // Stage 2: Dashboard - finding courses
            await updateExtractionProgress('finding_courses', '📚 Finding your courses...');
            result = await AssignmentParser.fastComprehensiveExtraction();
            method = 'fast_comprehensive_extraction';
        } else if (pageType === 'course_main' || pageType === 'course_assignments') {
            // Stage 2: Course page extraction
            await updateExtractionProgress('extracting_course', '📋 Extracting course assignments...');
            result = AssignmentParser.extractFromCoursePage();
            method = 'individual_course_page';
        } else {
            console.log('ℹ️ Not a relevant Gradescope page, skipping extraction');
            await updateExtractionProgress('not_applicable', '⚠️ Not on a Gradescope page with assignments');
            return;
        }

        const { allAssignments, calendarAssignments } = result;

        if (allAssignments.length > 0) {
            // Stage 3: Processing assignments
            await updateExtractionProgress('processing', `🔄 Processing ${allAssignments.length} assignments...`, {
                totalFound: allAssignments.length
            });

            // Check for duplicates only on calendar assignments
            const uniqueCalendarAssignments = await GradeExtractor.checkExistingAssignments(calendarAssignments);

            if (uniqueCalendarAssignments.length > 0 || allAssignments.length > 0) {
                // Stage 4: Saving data
                await updateExtractionProgress('saving', '💾 Saving assignment data...');

                const storageKey = `assignments_${method}_${Date.now()}`;
                const gradeStats = GradeExtractor.calculateEnhancedGradeStatistics(allAssignments);

                await browser.storage.local.set({
                    [storageKey]: {
                        // Store calendar assignments (for existing calendar sync functionality)
                        assignments: uniqueCalendarAssignments,

                        // Store ALL assignments for grade calculation
                        allAssignments: allAssignments,

                        extractedAt: new Date().toISOString(),
                        pageUrl: window.location.href,
                        method: method,
                        semester: DateParser.getCurrentSemester(),
                        gradeStats: gradeStats,

                        // Add category breakdown for quick access
                        categoryBreakdown: gradeStats.categoryStats,
                        needsReview: gradeStats.categorization?.needsReview || [],

                        stats: {
                            totalExtracted: allAssignments.length,
                            calendarTotal: calendarAssignments.length,
                            calendarUnique: uniqueCalendarAssignments.length,
                            calendarDuplicates: calendarAssignments.length - uniqueCalendarAssignments.length,
                            graded: allAssignments.filter(a => a.isGraded).length,
                            submitted: allAssignments.filter(a => a.isSubmitted).length,
                            pending: allAssignments.filter(a => !a.isSubmitted).length,

                            // Add categorization stats
                            categorized: gradeStats.categorization?.categorized || 0,
                            highConfidence: gradeStats.categorization?.highConfidence || 0,
                            needsManualReview: gradeStats.categorization?.needsReview?.length || 0
                        }
                    }
                });

                const graded = allAssignments.filter(a => a.isGraded).length;
                const submitted = allAssignments.filter(a => a.isSubmitted).length;
                const pending = allAssignments.filter(a => !a.isSubmitted).length;

                console.log(`💾 Stored comprehensive data:`);
                console.log(`   📊 ${allAssignments.length} total assignments extracted`);
                console.log(`   🗓️ ${uniqueCalendarAssignments.length} calendar assignments (${calendarAssignments.length - uniqueCalendarAssignments.length} duplicates)`);
                console.log(`   📈 Grades: ${graded} graded, ${submitted} submitted, ${pending} pending`);

                if (gradeStats.hasGrades) {
                    console.log(`   🎯 Overall average: ${gradeStats.averagePercentage.toFixed(1)}% (${gradeStats.gradedCount}/${gradeStats.totalCount} assignments)`);
                }

                // =================================================================
                // BACKGROUND POLLING: Update enrolled courses list
                // =================================================================
                await updateEnrolledCoursesIfNeeded();

                // =================================================================
                // ONBOARDING: Show pin banner after successful extraction
                // =================================================================
                await showPinBannerIfNeeded(allAssignments);

                // =================================================================
                // SMART SYNC: Check if new assignments should trigger immediate sync
                // =================================================================
                if (uniqueCalendarAssignments.length > 0) {
                    console.log('🧠 Checking for new assignments to trigger smart sync...');
                    try {
                        const response = await browser.runtime.sendMessage({
                            action: 'checkForNewAssignments',
                            assignments: uniqueCalendarAssignments,
                            allAssignments: allAssignments
                        });
                        if (response && response.success) {
                            if (response.synced) {
                                console.log(`✅ Smart sync triggered: ${response.results.created} events created`);
                            } else {
                                console.log(`ℹ️ Smart sync not triggered: ${response.reason}`);
                            }
                        }
                    } catch (err) {
                        console.warn('Smart sync check failed:', err);
                    }
                }

                // Stage 5: Complete - success with assignments
                await updateExtractionProgress('complete', `✅ Found ${calendarAssignments.length} upcoming assignments`, {
                    status: 'success',
                    totalAssignments: allAssignments.length,
                    calendarAssignments: calendarAssignments.length,
                    uniqueCalendarAssignments: uniqueCalendarAssignments.length
                });

            } else {
                console.log('ℹ️ All calendar assignments were duplicates, but stored comprehensive grade data');
                await updateExtractionProgress('complete', '✅ Data updated (no new upcoming assignments)', {
                    status: 'success',
                    totalAssignments: allAssignments.length,
                    calendarAssignments: 0
                });
            }
        } else {
            console.log('📭 No assignments found');
            await updateExtractionProgress('complete', '📭 No assignments found on this page', {
                status: 'empty'
            });
        }

    } catch (error) {
        console.error('❌ Error during extraction:', error);
        await updateExtractionProgress('error', '❌ Error during extraction', {
            status: 'error',
            errorMessage: error.message
        });
    } finally {
        extractionInProgress = false;
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

console.log('✅ Enhanced grade extraction with categorization ready!');
console.log('🧪 Available test functions:');
console.log('   • testGradeExtraction() - Basic grade extraction test');
console.log('   • testGradeExtractionWithCategories() - Enhanced test with categorization');
console.log('   • testEnhancedStorage() - Check stored data with categories');
console.log('   • AssignmentCategorizer.testCategorization() - Test categorization engine');

// Initialize extension
if (window.gradescopeCalendarSyncLoadedV4) {
    console.log('🔄 Manual sync triggered');
    main();
} else {
    window.gradescopeCalendarSyncLoadedV4 = true;

    console.log('🎯 Starting fast comprehensive content script with grade calculator...');

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

console.log('✅ Complete Gradescope Calendar Sync with Grade Calculator initialized (V1.5)');
