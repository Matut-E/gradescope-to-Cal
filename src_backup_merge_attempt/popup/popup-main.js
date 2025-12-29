/**
 * Main Popup Initialization
 * Coordinates all popup modules (theme, tabs, grades, calendar, storage)
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Enhanced Popup...');

    // Initialize all modules
    const themeManager = new ThemeManager();
    const tabManager = new TabManager();
    const gradeManager = new GradeManager();
    const calendarManager = new CalendarManager();
    const icalExportManager = new IcalExportManager();

    // Expose instances globally for cross-module access
    window.gradeManagerInstance = gradeManager;
    window.calendarManagerInstance = calendarManager;
    window.icalExportManagerInstance = icalExportManager;

    // Initialize each module
    await themeManager.initialize();
    tabManager.initialize();
    gradeManager.initialize();
    calendarManager.initialize();
    icalExportManager.initialize();

    // Initial data load
    await calendarManager.countStoredAssignments();
    await calendarManager.checkAuthStatus();
    await calendarManager.updateAutoSyncStatus();

    // Check and show feedback banner if conditions are met
    try {
        const feedbackBanner = new FeedbackBanner();
        if (await feedbackBanner.shouldShow()) {
            const container = document.querySelector('.header');
            feedbackBanner.show(container);
        }
    } catch (error) {
        console.error('Error checking feedback banner:', error);
    }

    console.log('✅ Enhanced popup with Grade Calculator and iCal Export initialized');
});
