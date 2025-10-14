/**
 * Main Popup Initialization
 * Coordinates all popup modules (theme, calendar, storage)
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Popup...');

    // Initialize all modules
    const themeManager = new ThemeManager();
    const calendarManager = new CalendarManager();

    // Expose instances globally for cross-module access
    window.calendarManagerInstance = calendarManager;

    // Initialize each module
    await themeManager.initialize();
    calendarManager.initialize();

    // Initial data load
    await calendarManager.countStoredAssignments();
    await calendarManager.checkAuthStatus();
    await calendarManager.updateAutoSyncStatus();

    console.log('✅ Popup with Calendar Sync initialized');
});
