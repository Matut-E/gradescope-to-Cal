/**
 * Main Popup Initialization
 * Coordinates all popup modules (theme, tabs, grades, calendar, storage)
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Enhanced Popup...');

    // Debug: Check if all required classes are available
    console.log('📦 Checking dependencies:');
    console.log('   - ThemeManager:', typeof ThemeManager !== 'undefined');
    console.log('   - TabManager:', typeof TabManager !== 'undefined');
    console.log('   - GradeManager:', typeof GradeManager !== 'undefined');
    console.log('   - CalendarManager:', typeof CalendarManager !== 'undefined');
    console.log('   - IcalExportManager:', typeof IcalExportManager !== 'undefined');
    console.log('   - CourseConfigManager:', typeof CourseConfigManager !== 'undefined');
    console.log('   - GradeCalculator:', typeof GradeCalculator !== 'undefined');

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

    console.log('✅ Enhanced popup with Grade Calculator and iCal Export initialized');
});
