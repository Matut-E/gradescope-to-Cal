/**
 * Options Tabs Module
 * Handles tab navigation for the redesigned options page
 *
 * Tab Structure:
 * - Calendar Sync: Authentication, auto-sync, calendar preferences
 * - Grade Calculator: Course configuration with sub-tabs
 * - Advanced: Power-user features, templates
 * - Data & Privacy: Storage, data management, privacy info
 *
 * Features:
 * - URL hash routing (#tab=calendar)
 * - Keyboard navigation (Left/Right arrows)
 * - Active tab highlighting
 * - Smooth transitions
 *
 * Exported to window for access by other modules
 */

class OptionsTabManager {
    /**
     * Initialize the tab system
     */
    static init() {
        console.log('🗂️ Initializing tab system...');

        // Get all tab buttons and panels
        this.tabButtons = document.querySelectorAll('[data-tab]');
        this.tabPanels = document.querySelectorAll('[data-tab-panel]');

        if (this.tabButtons.length === 0) {
            console.error('❌ No tab buttons found! Check data-tab attributes.');
            return;
        }

        if (this.tabPanels.length === 0) {
            console.error('❌ No tab panels found! Check data-tab-panel attributes.');
            return;
        }

        // Setup event listeners
        this.setupEventListeners();

        // Load initial tab from URL hash or default to first tab
        this.loadTabFromURL();

        console.log(`✅ Tab system initialized with ${this.tabButtons.length} tabs`);
    }

    /**
     * Setup event listeners for tabs
     */
    static setupEventListeners() {
        // Tab button clicks
        this.tabButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                const tabName = event.currentTarget.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });

        // URL hash changes (browser back/forward buttons)
        window.addEventListener('hashchange', () => {
            this.loadTabFromURL();
        });

        // Keyboard navigation (Left/Right arrows when focused on tab bar)
        document.querySelector('.tab-nav')?.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                this.handleKeyboardNavigation(event);
            }
        });

        console.log('✅ Tab event listeners attached');
    }

    /**
     * Switch to a specific tab
     * @param {string} tabName - Name of the tab to switch to
     */
    static switchTab(tabName) {
        console.log(`🗂️ Switching to tab: ${tabName}`);

        // Update active button
        this.tabButtons.forEach(button => {
            const isActive = button.getAttribute('data-tab') === tabName;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', isActive);
        });

        // Show/hide panels
        this.tabPanels.forEach(panel => {
            const isActive = panel.getAttribute('data-tab-panel') === tabName;
            if (isActive) {
                panel.style.display = 'block';
                // Fade in animation
                panel.style.opacity = '0';
                setTimeout(() => {
                    panel.style.opacity = '1';
                }, 10);
            } else {
                panel.style.display = 'none';
            }
        });

        // Update URL hash without scrolling
        if (window.location.hash !== `#tab=${tabName}`) {
            history.pushState(null, null, `#tab=${tabName}`);
        }

        // Emit custom event for other modules to listen to
        window.dispatchEvent(new CustomEvent('tab-changed', {
            detail: { tabName }
        }));

        console.log(`✅ Switched to tab: ${tabName}`);
    }

    /**
     * Load tab from URL hash
     */
    static loadTabFromURL() {
        const hash = window.location.hash;

        // Parse hash like #tab=calendar
        const match = hash.match(/#tab=([^&]+)/);

        if (match) {
            const tabName = match[1];
            // Verify tab exists before switching
            const tabExists = Array.from(this.tabButtons).some(
                btn => btn.getAttribute('data-tab') === tabName
            );

            if (tabExists) {
                this.switchTab(tabName);
                return;
            }
        }

        // Default to first tab
        if (this.tabButtons.length > 0) {
            const firstTab = this.tabButtons[0].getAttribute('data-tab');
            this.switchTab(firstTab);
        }
    }

    /**
     * Handle keyboard navigation between tabs
     * @param {KeyboardEvent} event - Keyboard event
     */
    static handleKeyboardNavigation(event) {
        const currentTabButton = document.querySelector('[data-tab].active');
        if (!currentTabButton) return;

        const tabsArray = Array.from(this.tabButtons);
        const currentIndex = tabsArray.indexOf(currentTabButton);

        let newIndex;
        if (event.key === 'ArrowLeft') {
            newIndex = currentIndex > 0 ? currentIndex - 1 : tabsArray.length - 1;
        } else if (event.key === 'ArrowRight') {
            newIndex = currentIndex < tabsArray.length - 1 ? currentIndex + 1 : 0;
        }

        if (newIndex !== undefined) {
            const newTab = tabsArray[newIndex].getAttribute('data-tab');
            this.switchTab(newTab);
            tabsArray[newIndex].focus();
            event.preventDefault();
        }
    }

    /**
     * Get currently active tab name
     * @returns {string|null} Active tab name or null
     */
    static getActiveTab() {
        const activeButton = document.querySelector('[data-tab].active');
        return activeButton ? activeButton.getAttribute('data-tab') : null;
    }
}

/**
 * Grade Calculator Sub-Tabs Manager
 * Handles sub-tabs within the Grade Calculator tab (Basic Setup, Drop Policies, Advanced)
 */
class GradeSubTabManager {
    /**
     * Initialize sub-tab system
     */
    static init() {
        console.log('🗂️ Initializing grade calculator sub-tabs...');

        // Get sub-tab buttons and panels
        this.subTabButtons = document.querySelectorAll('[data-subtab]');
        this.subTabPanels = document.querySelectorAll('[data-subtab-panel]');

        if (this.subTabButtons.length === 0) {
            console.warn('⚠️ No sub-tab buttons found (this is OK if not on grade calculator tab)');
            return;
        }

        // Setup event listeners
        this.setupEventListeners();

        // Default to first sub-tab
        if (this.subTabButtons.length > 0) {
            const firstSubTab = this.subTabButtons[0].getAttribute('data-subtab');
            this.switchSubTab(firstSubTab);
        }

        console.log(`✅ Sub-tab system initialized with ${this.subTabButtons.length} sub-tabs`);
    }

    /**
     * Setup event listeners for sub-tabs
     */
    static setupEventListeners() {
        this.subTabButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                const subTabName = event.currentTarget.getAttribute('data-subtab');
                this.switchSubTab(subTabName);
            });
        });
    }

    /**
     * Switch to a specific sub-tab
     * @param {string} subTabName - Name of the sub-tab to switch to
     */
    static switchSubTab(subTabName) {
        console.log(`📂 Switching to sub-tab: ${subTabName}`);

        // Update active button
        this.subTabButtons.forEach(button => {
            const isActive = button.getAttribute('data-subtab') === subTabName;
            button.classList.toggle('active', isActive);
        });

        // Show/hide panels
        this.subTabPanels.forEach(panel => {
            const isActive = panel.getAttribute('data-subtab-panel') === subTabName;
            panel.style.display = isActive ? 'block' : 'none';
        });

        console.log(`✅ Switched to sub-tab: ${subTabName}`);
    }

    /**
     * Get currently active sub-tab name
     * @returns {string|null} Active sub-tab name or null
     */
    static getActiveSubTab() {
        const activeButton = document.querySelector('[data-subtab].active');
        return activeButton ? activeButton.getAttribute('data-subtab') : null;
    }
}

// Expose to window for access by other modules
window.OptionsTabManager = OptionsTabManager;
window.GradeSubTabManager = GradeSubTabManager;
