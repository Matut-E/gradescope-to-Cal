/**
 * Main Popup Initialization
 * Coordinates all popup modules (theme, calendar, storage)
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Popup...');

    // Initialize all modules
    const themeManager = new ThemeManager();
    const calendarManager = new CalendarManager();
    const icalExportManager = new IcalExportManager();

    // Expose instances globally for cross-module access
    window.calendarManagerInstance = calendarManager;
    window.icalExportManagerInstance = icalExportManager;

    // Initialize each module
    await themeManager.initialize();
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

    console.log('✅ Popup with Calendar Sync and iCal Export initialized');
});
