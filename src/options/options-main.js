/**
 * Options Page Main Coordinator
 * Thin coordinator that initializes and orchestrates all options modules
 *
 * This file replaces the monolithic options.js (3433 lines) with a modular architecture.
 * All functionality has been extracted into specialized modules in the options/ directory.
 *
 * Required modules (loaded via options.html):
 * - OptionsStorage - Course sidebar and data loading
 * - OptionsTemplates - Berkeley course templates
 * - OptionsUIBuilders - DOM creation and UI building
 * - OptionsWeightEditor - Weight configuration and validation
 * - OptionsCategoryManager - Manual category overrides
 * - OptionsDropPolicies - Drop policy configuration
 * - OptionsAdvanced - Category groups and clobber policies
 * - OptionsCourseLinking - Course linking system
 * - OptionsSettings - Settings, auth, color picker, data management
 */

// =============================================================================
// GLOBAL STATE MANAGEMENT
// =============================================================================

/**
 * Global state variables used across modules
 * Note: These are set on window object for cross-module access
 * Access via window.currentConfigCourse and window.currentCourseData
 */
window.currentConfigCourse = null;  // Currently selected course name
window.currentCourseData = null;    // Current course data with assignments
let weightInputsDebounce = null;    // Debounce timer for weight inputs

/**
 * Course UI State Manager
 * Manages course selection, configuration caching, and UI state
 */
const CourseConfigUI = {
    currentCourseId: null,
    configCache: new Map(), // Store unsaved changes

    selectCourse(courseId) {
        // Save current course's state to cache if there's one loaded
        if (this.currentCourseId) {
            this.configCache.set(this.currentCourseId, this.getCurrentConfig());
        }

        // Load new course
        this.currentCourseId = courseId;
        window.currentConfigCourse = courseId;

        // Update sidebar active state
        document.querySelectorAll('.course-item').forEach(item => {
            item.classList.toggle('active', item.dataset.courseId === courseId);
        });

        // Load course configuration (from OptionsStorage module)
        OptionsStorage.loadCourseForConfiguration(courseId);

        // Show config panel
        document.getElementById('courseConfigPanel').style.display = 'block';

        // Update header
        document.getElementById('configCourseName').textContent = `${courseId} Configuration`;

        // Note: Config sharing menu is always available in the course header
        // No need to enable/disable buttons based on course selection

        // Scroll to top of config panel
        document.querySelector('.config-main-panel').scrollTop = 0;
    },

    getCurrentConfig() {
        // Gather all form values from current panel
        const weightInputs = {};
        document.querySelectorAll('.weight-input').forEach(input => {
            const category = input.dataset.category;
            if (category) {
                weightInputs[category] = parseFloat(input.value) || 0;
            }
        });

        return {
            system: document.querySelector('input[name="gradingSystem"]:checked')?.value,
            weights: weightInputs
            // Can be extended with dropPolicies, etc.
        };
    },

    async saveCurrentCourse() {
        if (!this.currentCourseId) return;

        await saveCourseConfiguration();
        this.configCache.delete(this.currentCourseId); // Clear cache
        await OptionsStorage.updateSidebarStatus(this.currentCourseId);
    }
};

// Expose CourseConfigUI globally for modules
window.CourseConfigUI = CourseConfigUI;

// =============================================================================
// COURSE CONFIGURATION INITIALIZATION
// =============================================================================

/**
 * Initialize course configuration section with event listeners
 */
async function initializeCourseConfiguration() {
    // Get DOM elements
    const applyTemplateBtn = document.getElementById('applyTemplateBtn');
    const dismissTemplateBtn = document.getElementById('dismissTemplateBtn');
    const evenDistributeBtn = document.getElementById('evenDistributeBtn');
    const saveCourseConfigBtn = document.getElementById('saveCourseConfig');
    const resetCourseConfigBtn = document.getElementById('resetConfig');
    const applyQuickSetupBtn = document.getElementById('applyQuickSetup');
    const dismissQuickSetupBtn = document.getElementById('dismissQuickSetup');

    // Populate course sidebar (from OptionsStorage module)
    await OptionsStorage.populateCourseSidebar();

    // Event listeners for templates
    applyTemplateBtn?.addEventListener('click', OptionsTemplates.applyBerkeleyTemplate);
    dismissTemplateBtn?.addEventListener('click', OptionsTemplates.dismissTemplate);
    applyQuickSetupBtn?.addEventListener('click', OptionsTemplates.applyQuickSetupSettings);
    dismissQuickSetupBtn?.addEventListener('click', OptionsTemplates.dismissQuickSetup);

    // Event listeners for weight operations
    evenDistributeBtn?.addEventListener('click', () => OptionsWeightEditor.distributeWeightsEvenly());

    // Event listeners for configuration save/reset
    console.log('Setting up save button event listener:', saveCourseConfigBtn);
    if (saveCourseConfigBtn) {
        saveCourseConfigBtn.addEventListener('click', saveCourseConfiguration);
        console.log('✅ Save button event listener attached');
    } else {
        console.error('❌ Save button not found! ID: saveCourseConfig');
    }
    resetCourseConfigBtn?.addEventListener('click', resetCourseConfiguration);

    // Event listeners for bulk operations (Assignment Overrides section)
    const bulkExcludeBtn = document.getElementById('bulkExcludeBtn');
    const clearExclusionsBtn = document.getElementById('clearExclusionsBtn');

    if (bulkExcludeBtn) {
        bulkExcludeBtn.addEventListener('click', async () => {
            const pattern = document.getElementById('bulkExcludePattern')?.value.trim();

            if (!pattern) {
                showBulkResult('Please enter a pattern', 'error');
                return;
            }

            if (!window.currentConfigCourse || !window.currentCourseData) {
                showBulkResult('No course loaded', 'error');
                return;
            }

            try {
                const count = await CourseConfigManager.bulkExcludeByPattern(
                    window.currentConfigCourse,
                    pattern,
                    window.currentCourseData.assignments
                );

                showBulkResult(`Excluded ${count} assignment(s) matching "${pattern}"`, 'success');

                // Reload the course configuration UI to show changes
                await OptionsStorage.loadCourseForConfiguration(window.currentConfigCourse);
            } catch (error) {
                console.error('Error in bulk exclude:', error);
                showBulkResult('Error: ' + error.message, 'error');
            }
        });
    }

    if (clearExclusionsBtn) {
        clearExclusionsBtn.addEventListener('click', async () => {
            if (!window.currentConfigCourse) {
                showBulkResult('No course loaded', 'error');
                return;
            }

            if (!confirm('Clear all exclusions? All assignments will count towards grades.')) {
                return;
            }

            try {
                const count = await CourseConfigManager.clearAllExclusions(window.currentConfigCourse);

                showBulkResult(`Cleared ${count} exclusion(s)`, 'success');

                // Reload the course configuration UI to show changes
                await OptionsStorage.loadCourseForConfiguration(window.currentConfigCourse);
            } catch (error) {
                console.error('Error clearing exclusions:', error);
                showBulkResult('Error: ' + error.message, 'error');
            }
        });
    }

    // JSON toggle buttons
    const toggleConfigJSONBtn = document.getElementById('toggleConfigJSON');
    const hideConfigJSONBtn = document.getElementById('hideConfigJSON');
    if (toggleConfigJSONBtn) {
        toggleConfigJSONBtn.addEventListener('click', () => {
            const display = document.getElementById('currentConfigDisplay');
            if (display) {
                display.style.display = 'block';
            }
        });
    }
    if (hideConfigJSONBtn) {
        hideConfigJSONBtn.addEventListener('click', () => {
            const display = document.getElementById('currentConfigDisplay');
            if (display) {
                display.style.display = 'none';
            }
        });
    }

    // Grading system radio buttons (from OptionsWeightEditor module)
    document.querySelectorAll('input[name="gradingSystem"]').forEach(radio => {
        radio.addEventListener('change', (event) => OptionsWeightEditor.handleGradingSystemChange(event));
    });

    // Total points input - update validation when changed
    const totalPointsInput = document.getElementById('totalPointsInput');
    if (totalPointsInput) {
        totalPointsInput.addEventListener('input', () => {
            OptionsWeightEditor.updateWeightLabels('points'); // Update help text with new total
            OptionsWeightEditor.validateWeights(); // Revalidate with new total
        });
    }

    console.log('✅ Course configuration UI initialized');
}

// =============================================================================
// STICKY SAVE BAR
// =============================================================================

/**
 * Initialize sticky save bar functionality
 * Shows a persistent bar at bottom of page when user makes changes across any tab
 */
function initializeStickySaveBar() {
    const stickyBar = document.getElementById('stickySaveBar');
    const cancelBtn = document.getElementById('cancelChanges');
    const saveBtn = document.getElementById('saveAllChanges');

    if (!stickyBar) {
        console.warn('⚠️ Sticky save bar not found in DOM');
        return;
    }

    // Track dirty state
    let isDirty = false;
    let originalValues = new Map();

    /**
     * Show the sticky save bar with animation
     */
    function showBar() {
        if (!isDirty) {
            isDirty = true;
            stickyBar.classList.add('show');
            console.log('📌 Sticky save bar shown');
        }
    }

    /**
     * Hide the sticky save bar with animation
     */
    function hideBar() {
        if (isDirty) {
            isDirty = false;
            stickyBar.classList.remove('show');
            console.log('📌 Sticky save bar hidden');
        }
    }

    /**
     * Capture original value of an input
     */
    function captureOriginalValue(element) {
        const id = element.id || element.name || element.dataset.category;
        if (!id) return;

        if (!originalValues.has(id)) {
            if (element.type === 'checkbox' || element.type === 'radio') {
                originalValues.set(id, element.checked);
            } else {
                originalValues.set(id, element.value);
            }
        }
    }

    /**
     * Restore all original values
     */
    function restoreOriginalValues() {
        originalValues.forEach((value, id) => {
            // Try different selectors
            const element = document.getElementById(id) ||
                           document.querySelector(`[name="${id}"]`) ||
                           document.querySelector(`[data-category="${id}"]`);

            if (element) {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    element.checked = value;
                } else {
                    element.value = value;
                }

                // Trigger change event to update UI
                element.dispatchEvent(new Event('change', { bubbles: true }));
                element.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        originalValues.clear();
        console.log('🔄 Original values restored');
    }

    /**
     * Handle form input changes
     */
    function handleInputChange(event) {
        const element = event.target;

        // Ignore changes from non-form elements
        if (!element.matches('input, select, textarea')) return;

        // Capture original value on first change
        captureOriginalValue(element);

        // Show bar
        showBar();
    }

    // Global change listener for all form inputs across all tabs
    document.addEventListener('input', handleInputChange);
    document.addEventListener('change', handleInputChange);

    /**
     * Cancel button - restore original values
     */
    cancelBtn?.addEventListener('click', () => {
        if (confirm('Discard all unsaved changes?')) {
            restoreOriginalValues();
            hideBar();
        }
    });

    /**
     * Save button - persist all changes
     */
    saveBtn?.addEventListener('click', async () => {
        console.log('💾 Sticky save bar: Save All clicked');

        // Determine which tab we're on and save accordingly
        const activeTab = OptionsTabManager.getActiveTab();

        try {
            if (activeTab === 'calendar') {
                // Save calendar settings
                await OptionsSettings.saveSettings();
            } else if (activeTab === 'grades') {
                // Save course configuration
                if (window.currentConfigCourse) {
                    await saveCourseConfiguration();
                }
            } else if (activeTab === 'data') {
                // No persistent settings to save in data tab
                console.log('ℹ️ No settings to save in Data tab');
            }

            // Clear original values and hide bar
            originalValues.clear();
            hideBar();

            // Show brief success message
            const saveText = stickyBar.querySelector('.sticky-save-bar-text');
            if (saveText) {
                const originalText = saveText.textContent;
                saveText.textContent = '✅ Changes saved successfully!';
                setTimeout(() => {
                    saveText.textContent = originalText;
                }, 2000);
            }

        } catch (error) {
            console.error('Error saving from sticky bar:', error);
            alert('Error saving changes: ' + error.message);
        }
    });

    /**
     * Hide bar when course configuration is successfully saved
     * Listen for successful saves from the main save button
     */
    window.addEventListener('course-config-saved', () => {
        originalValues.clear();
        hideBar();
    });

    console.log('✅ Sticky save bar initialized');
}

// =============================================================================
// MAIN INITIALIZATION (DOMContentLoaded)
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎯 Initializing modular options page...');

    // Initialize tab system (from OptionsTabManager module)
    if (window.OptionsTabManager) {
        OptionsTabManager.init();
        console.log('✅ Tab navigation system initialized');
    }

    // Initialize grade calculator sub-tabs
    if (window.GradeSubTabManager) {
        GradeSubTabManager.init();
        console.log('✅ Grade calculator sub-tabs initialized');
    }

    // Small delay to ensure tab transition completes before auth check
    await new Promise(resolve => setTimeout(resolve, 100));

    // Initialize all modules in order
    console.log('🔧 [options-main] Loading settings...');
    await OptionsSettings.loadSettings();
    console.log('🔧 [options-main] Initializing color picker...');
    OptionsSettings.initializeColorPicker();
    console.log('🔧 [options-main] Checking auth status...');
    await OptionsSettings.checkAuthStatus();
    console.log('🔧 [options-main] Updating auto-sync status...');
    await OptionsSettings.updateAutoSyncStatus();
    console.log('🔧 [options-main] Updating background polling status...');
    await OptionsSettings.updateBackgroundPollingStatus();
    console.log('🔧 [options-main] Initializing course configuration...');
    await initializeCourseConfiguration();
    console.log('🔧 [options-main] Initializing course linking...');
    await OptionsCourseLinking.initializeCourseLinking();

    // Setup all event listeners (from OptionsSettings module)
    OptionsSettings.setupEventListeners();

    // Initialize config menu dropdown
    OptionsSettings.initializeConfigMenu();

    // Initialize sticky save bar
    // TODO: Re-enable after testing
    // initializeStickySaveBar();

    // Initialize Pin to Toolbar prompt
    if (window.PinPromptManager) {
        await PinPromptManager.initialize();
    }

    // Periodic updates (less frequent for options page)
    setInterval(OptionsSettings.checkAuthStatus, 60000); // Every minute
    setInterval(OptionsSettings.updateAutoSyncStatus, 30000); // Every 30 seconds
    setInterval(OptionsSettings.updateBackgroundPollingStatus, 30000); // Every 30 seconds

    console.log('✅ Enhanced Options page initialized with modular architecture');
    console.log('📦 Modules loaded: Tabs, Storage, Templates, UI Builders, Weight Editor, Category Manager, Drop Policies, Advanced, Course Linking, Settings, Pin Prompt');
});

// =============================================================================
// GRADE SETUP MODAL
// =============================================================================

/**
 * Show grade setup modal if this is the user's first time configuring a course
 * @param {string} courseName - Name of the course
 * @param {number} assignmentCount - Number of assignments
 */
async function showGradeSetupModalIfNeeded(courseName, assignmentCount) {
    // Check if user has already dismissed for this course
    const hasSeen = await CourseConfigManager.hasSeenGradeSetup(courseName);

    if (hasSeen) {
        console.log(`✓ User has already seen setup for ${courseName}`);
        return;
    }

    console.log(`📊 Showing grade setup modal for ${courseName}`);

    // Populate modal with course info
    const setupCourseName = document.getElementById('setupCourseName');
    const setupAssignmentCount = document.getElementById('setupAssignmentCount');

    if (setupCourseName) {
        setupCourseName.textContent = courseName;
    }
    if (setupAssignmentCount) {
        setupAssignmentCount.textContent = assignmentCount || '0';
    }

    // Show modal
    const modal = document.getElementById('gradeSetupModal');
    if (modal) {
        modal.style.display = 'flex';
    }

    // Setup event listener for continue button
    const continueBtn = document.getElementById('setupModalContinue');
    const dontShowCheckbox = document.getElementById('dontShowSetupAgain');

    if (!continueBtn || !dontShowCheckbox) {
        console.error('Modal elements not found');
        return;
    }

    // Remove old listeners by cloning the button
    const newContinueBtn = continueBtn.cloneNode(true);
    continueBtn.parentNode.replaceChild(newContinueBtn, continueBtn);

    newContinueBtn.addEventListener('click', async () => {
        // Check if user wants to dismiss
        if (dontShowCheckbox.checked) {
            await CourseConfigManager.dismissGradeSetup(courseName);
        }

        // Hide modal
        if (modal) {
            modal.style.display = 'none';
        }

        // Reset checkbox
        dontShowCheckbox.checked = false;
    });
}

// Expose to window for access by other modules
window.showGradeSetupModalIfNeeded = showGradeSetupModalIfNeeded;

// =============================================================================
// UI POPULATION COORDINATOR
// =============================================================================

/**
 * Populate all configuration UI elements
 * Coordinator function that delegates to various modules
 * @param {Object} config - Course configuration object
 * @param {Array} assignments - Array of assignments for this course
 */
function populateConfigurationUI(config, assignments) {
    // Set grading system radio button
    const systemRadio = document.querySelector(`input[name="gradingSystem"][value="${config.system}"]`);
    if (systemRadio) {
        systemRadio.checked = true;
    }

    // Set total points and show/hide field
    const totalPointsContainer = document.getElementById('totalPointsContainer');
    const totalPointsInput = document.getElementById('totalPointsInput');
    if (config.system === 'points') {
        if (totalPointsContainer) totalPointsContainer.style.display = 'block';
        if (totalPointsInput) totalPointsInput.value = config.totalPoints || 300;
    } else {
        if (totalPointsContainer) totalPointsContainer.style.display = 'none';
    }

    // Update weight labels to match current system (from OptionsWeightEditor)
    OptionsWeightEditor.updateWeightLabels(config.system);

    // Get categories from assignments (helper function below)
    const categories = getAssignmentCategories(assignments);

    // Populate weight inputs (from OptionsWeightEditor module)
    OptionsWeightEditor.populateWeightInputs(categories, config.weights);

    // Populate category grouping section (from OptionsAdvanced module)
    OptionsAdvanced.populateCategoryGrouping(config, assignments);

    // Populate clobber policies section (from OptionsAdvanced module)
    OptionsAdvanced.populateClobberPolicies(config, assignments);

    // Populate drop policies (from OptionsDropPolicies module)
    OptionsDropPolicies.populateDropPolicies(categories, config.dropPolicies, config.weights);

    // Populate assignment review (from OptionsCategoryManager module)
    OptionsCategoryManager.populateAssignmentReview(assignments, config.manualOverrides, config.excludedAssignments);

    // Show current config (helper function below)
    displayCurrentConfig(config);
}

/**
 * Get unique categories from assignments
 * @param {Array} assignments - Array of assignments
 * @returns {Object} Object mapping category names to category info
 */
function getAssignmentCategories(assignments) {
    const categoryCounts = {};

    assignments.forEach(assignment => {
        const category = assignment.category || 'other';
        if (!categoryCounts[category]) {
            categoryCounts[category] = {
                name: category,
                count: 0,
                icon: getCategoryIcon(category)
            };
        }
        categoryCounts[category].count++;
    });

    return categoryCounts;
}

/**
 * Get emoji icon for category
 * @param {string} category - Category name
 * @returns {string} Emoji icon
 */
function getCategoryIcon(category) {
    const icons = {
        homework: '📝',
        lab: '🔬',
        midterm: '📊',
        final: '🎓',
        project: '🚀',
        quiz: '❓',
        participation: '👥',
        other: '❓'
    };
    return icons[category] || '❓';
}

/**
 * Display current configuration as JSON
 * @param {Object} config - Course configuration object
 */
function displayCurrentConfig(config) {
    const configJSON = document.getElementById('configJSON');
    if (configJSON) {
        configJSON.textContent = JSON.stringify(config, null, 2);
    }
}

// Expose to window for access by other modules
window.populateConfigurationUI = populateConfigurationUI;

// =============================================================================
// SAVE AND RESET FUNCTIONS
// =============================================================================

/**
 * Save course configuration
 * Delegates to CourseConfigManager and updates UI via modules
 */
async function saveCourseConfiguration() {
    console.log('💾 Save button clicked!');
    console.log('Current course:', window.currentConfigCourse);
    console.log('Current course data:', window.currentCourseData);

    if (!window.currentConfigCourse || !window.currentCourseData) {
        alert('No course loaded for configuration');
        return;
    }

    const saveStatus = document.getElementById('saveStatus');
    const saveCourseConfigBtn = document.getElementById('saveCourseConfig');

    try {
        const gradingSystem = document.querySelector('input[name="gradingSystem"]:checked')?.value || 'percentage';
        const totalPointsInput = document.getElementById('totalPointsInput');
        const totalPoints = gradingSystem === 'points' ? (parseFloat(totalPointsInput?.value) || 1000) : null;

        // Gather weights from UI and convert display values to fractions
        const weights = {};
        const isPoints = gradingSystem === 'points';
        const divisor = isPoints ? totalPoints : 100; // Convert display value to fraction

        document.querySelectorAll('.weight-input').forEach(input => {
            const category = input.dataset.category;
            if (category) {
                const displayValue = parseFloat(input.value) || 0;
                // Convert display value (20% or 60pts) to fraction (0.20)
                weights[category] = displayValue / divisor;
            }
        });

        // Validate weights before saving
        if (!OptionsWeightEditor.validateWeights()) {
            saveStatus.textContent = '❌ Please fix weight errors before saving';
            saveStatus.className = 'save-status error';
            setTimeout(() => {
                saveStatus.textContent = '';
                saveStatus.className = 'save-status';
            }, 3000);
            return;
        }

        // Collect drop policies from UI (from OptionsDropPolicies module)
        const dropPolicies = OptionsDropPolicies.collectDropPoliciesFromUI();

        // Build complete configuration object
        const config = {
            system: gradingSystem,
            weights: weights,
            dropPolicies: dropPolicies,
            totalPoints: totalPoints,
            lastModified: new Date().toISOString()
        };

        // Save to storage via CourseConfigManager
        await CourseConfigManager.saveCourseConfig(window.currentConfigCourse, config);

        // Update UI
        await OptionsStorage.updateSidebarStatus(window.currentConfigCourse);

        // Show success message
        saveStatus.textContent = '✅ Configuration saved successfully!';
        saveStatus.className = 'save-status success';
        saveCourseConfigBtn.textContent = '✅ Saved!';
        saveCourseConfigBtn.className = 'button success';

        setTimeout(() => {
            saveStatus.textContent = '';
            saveStatus.className = 'save-status';
            saveCourseConfigBtn.textContent = '💾 Save Configuration';
            saveCourseConfigBtn.className = 'button';
        }, 3000);

    } catch (error) {
        console.error('Error saving configuration:', error);
        // Show the actual error message to the user
        saveStatus.textContent = `❌ ${error.message || 'Error saving configuration'}`;
        saveStatus.className = 'save-status error';

        // Keep error visible longer (5 seconds) so user can read it
        setTimeout(() => {
            saveStatus.textContent = '';
            saveStatus.className = 'save-status';
        }, 5000);
    }
}

/**
 * Reset course configuration to defaults
 */
async function resetCourseConfiguration() {
    if (!window.currentConfigCourse) {
        alert('No course loaded');
        return;
    }

    if (confirm(`Reset configuration for "${window.currentConfigCourse}" to defaults? This cannot be undone.`)) {
        try {
            // Delete the configuration
            await CourseConfigManager.deleteCourseConfig(window.currentConfigCourse);

            // Reload the course to show default state
            await OptionsStorage.loadCourseForConfiguration(window.currentConfigCourse);

            // Update sidebar
            await OptionsStorage.updateSidebarStatus(window.currentConfigCourse);

            alert('✅ Configuration reset to defaults');
        } catch (error) {
            console.error('Error resetting configuration:', error);
            alert('Error resetting configuration: ' + error.message);
        }
    }
}

// =============================================================================
// BULK OPERATIONS HELPER
// =============================================================================

/**
 * Show bulk operation result message
 * Displays a temporary message in the bulk operations result div
 * @param {string} message - Message to display
 * @param {string} type - Message type ('success' or 'error')
 */
function showBulkResult(message, type) {
    const resultDiv = document.getElementById('bulkOperationResult');

    if (!resultDiv) {
        console.warn('Bulk operation result div not found');
        return;
    }

    resultDiv.textContent = message;
    resultDiv.style.display = 'block';

    // Set colors based on type
    if (type === 'success') {
        resultDiv.style.background = 'var(--success-bg, #d4edda)';
        resultDiv.style.color = 'var(--success-text, #155724)';
        resultDiv.style.borderColor = 'var(--success, #28a745)';
    } else {
        resultDiv.style.background = 'var(--danger-bg, #f8d7da)';
        resultDiv.style.color = 'var(--danger-text, #721c24)';
        resultDiv.style.borderColor = 'var(--danger, #dc3545)';
    }

    // Auto-hide after 3 seconds
    setTimeout(() => {
        resultDiv.style.display = 'none';
    }, 3000);
}
