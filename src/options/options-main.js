/**
 * Options Page Main - Public Version
 * Simplified initialization for calendar sync settings only (no grade calculator)
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Options Page (Calendar Sync)...');

    try {
        // Note: Theme manager is self-initializing (loaded via options-theme.js)
        // No manual initialization needed

        // Initialize settings (static methods, not a class instance)
        // IMPORTANT: Load settings and check auth status BEFORE setting up event listeners
        // This ensures the UI is in the correct state before user interaction is enabled
        console.log('🔧 [options-main] Loading settings...');
        await OptionsSettings.loadSettings();
        console.log('🔧 [options-main] Initializing color picker...');
        OptionsSettings.initializeColorPicker();
        console.log('🔧 [options-main] Checking auth status...');
        await OptionsSettings.checkAuthStatus();
        console.log('🔧 [options-main] Updating auto-sync status...');
        await OptionsSettings.updateAutoSyncStatus();

        // Setup event listeners AFTER UI state is initialized
        console.log('🔧 [options-main] Setting up event listeners...');
        OptionsSettings.setupEventListeners();

        // Set up periodic status checks to detect auth changes from popup
        setInterval(() => OptionsSettings.checkAuthStatus(), 60000); // Check every minute (matches dev version)
        setInterval(() => OptionsSettings.updateAutoSyncStatus(), 30000); // Check every 30 seconds

        // Initialize pin prompt helper (uses static methods)
        await PinPromptManager.initialize();

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

        console.log('✅ Options page initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing options page:', error);
    }
});
