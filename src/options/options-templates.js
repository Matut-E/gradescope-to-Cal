// =============================================================================
// OPTIONS TEMPLATES MODULE
// =============================================================================
// Template system for Berkeley course suggestions and quick setup
// Handles template suggestion UI, applying templates, and first-time setup

/**
 * OptionsTemplates - Template system for course configuration
 *
 * Manages template suggestions and quick setup for course grading configurations.
 * Uses CourseConfigManager for template data and configuration application.
 *
 * Dependencies (via window):
 * - CourseConfigManager - Template suggestions and configuration management
 * - populateConfigurationUI - Updates UI with configuration (from options.js)
 * - currentConfigCourse - Currently selected course (from options.js)
 * - currentCourseData - Current course assignment data (from options.js)
 */
class OptionsTemplates {
    /**
     * Show template suggestion banner with template details
     * @param {Object} template - Template object from CourseConfigManager
     * @param {string} template.name - Template display name
     * @param {Object} template.weights - Category weights
     * @param {string} template.notes - Template description
     */
    static showTemplateSuggestion(template) {
        const templateSuggestion = document.getElementById('templateSuggestion');
        const templateDescription = document.getElementById('templateDescription');

        const weightStr = Object.entries(template.weights)
            .map(([cat, weight]) => `${cat}: ${(weight * 100).toFixed(0)}%`)
            .join(', ');

        templateDescription.innerHTML = `
            <strong>${template.name}</strong><br>
            Suggested weights: ${weightStr}<br>
            <small>${template.notes}</small>
        `;

        templateSuggestion.style.display = 'block';
    }

    /**
     * Hide template suggestion banner
     */
    static hideTemplateSuggestion() {
        const templateSuggestion = document.getElementById('templateSuggestion');
        templateSuggestion.style.display = 'none';
    }

    /**
     * Apply Berkeley template to current course configuration
     *
     * Gets suggested template from CourseConfigManager, applies weights and drop
     * policies, and updates UI. Hides template suggestion after application.
     *
     * Requires: window.currentConfigCourse, window.currentCourseData
     */
    static async applyBerkeleyTemplate() {
        if (!window.currentConfigCourse) return;

        const template = window.CourseConfigManager.suggestTemplate(window.currentConfigCourse);
        if (!template) return;

        // Apply template weights and drop policies
        const config = {
            system: 'percentage',
            weights: template.weights,
            dropPolicies: template.dropPolicies || {},
            manualOverrides: {},
            templateUsed: template.matched
        };

        // Populate UI
        window.populateConfigurationUI(config, window.currentCourseData.assignments);

        // Hide template suggestion
        OptionsTemplates.hideTemplateSuggestion();

        console.log(`✅ Applied template: ${template.name}`);
    }

    /**
     * Dismiss template suggestion banner
     */
    static dismissTemplate() {
        OptionsTemplates.hideTemplateSuggestion();
    }

    /**
     * Apply quick setup settings for first-time users
     *
     * Applies suggested template (if available) or default weights for new course
     * configurations. Marks course as seen and hides quick setup banner.
     *
     * Requires: window.currentConfigCourse, window.currentCourseData
     */
    static async applyQuickSetupSettings() {
        if (!window.currentConfigCourse || !window.currentCourseData) return;

        // Get suggested template or use default weights
        const template = window.CourseConfigManager.suggestTemplate(window.currentConfigCourse);

        const config = {
            system: 'percentage',
            weights: template ? template.weights : {},
            dropPolicies: template ? (template.dropPolicies || {}) : {},
            manualOverrides: {},
            quickSetupUsed: true
        };

        // Populate UI
        window.populateConfigurationUI(config, window.currentCourseData.assignments);

        // Hide quick setup banner
        OptionsTemplates.dismissQuickSetup();

        // Mark as seen
        await window.CourseConfigManager.markGradeSetupSeen(window.currentConfigCourse);

        console.log(`✅ Applied quick setup for ${window.currentConfigCourse}`);
    }

    /**
     * Dismiss quick setup banner
     *
     * Hides banner and marks as dismissed in localStorage for current course.
     *
     * Requires: window.currentConfigCourse
     */
    static dismissQuickSetup() {
        const banner = document.getElementById('quickSetupBanner');
        if (banner) {
            banner.style.display = 'none';
        }

        // Mark as dismissed in localStorage
        if (window.currentConfigCourse) {
            localStorage.setItem(`quickSetup_${window.currentConfigCourse}_dismissed`, 'true');
        }
    }
}

// Export to window for HTML script loading
window.OptionsTemplates = OptionsTemplates;
