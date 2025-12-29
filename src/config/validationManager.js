/**
 * Validation Manager Module
 * Handles configuration validation for grading systems
 * Validates weights, policies, and future category configurations
 *
 * Part of courseConfigManager.js refactoring
 */

class ValidationManager {
    /**
     * Validate configuration object
     *
     * @param {Object} config - Configuration to validate
     * @param {boolean} skipStrictValidation - If true, allows partial configurations
     * @returns {string|null} Error message or null if valid
     */
    static validateConfig(config, skipStrictValidation = false) {
        // Determine target total based on system
        const isPoints = config.system === 'points';
        const targetTotal = isPoints ? (config.totalPoints || 100) : 100;
        const epsilon = 0.001; // Allow small floating point errors

        // Check weights sum to target total if weights are configured
        if (config.weights) {
            const totalWeight = Object.values(config.weights).reduce((sum, w) => sum + w, 0);

            // IMPORTANT: Weights are ALWAYS stored as fractions (0.0-1.0) regardless of mode
            // See options-main.js:615 where weights are divided by divisor before storage
            const expectedSum = 1.0; // Always expect fractions to sum to 1.0
            const actualSum = totalWeight;

            // Only enforce sum requirement if NOT skipping strict validation
            if (!skipStrictValidation && Math.abs(actualSum - expectedSum) > epsilon) {
                const unit = isPoints ? 'pts' : '%';
                // Convert fraction to display value for error message
                const displaySum = isPoints ? (actualSum * targetTotal).toFixed(1) : (actualSum * 100).toFixed(1);
                const displayTarget = isPoints ? targetTotal : 100;
                return `Weights must sum to ${displayTarget}${unit} (currently ${displaySum}${unit})`;
            }

            // Always check all weights are within valid range (0.0 to 1.0 as fractions)
            for (const [category, weight] of Object.entries(config.weights)) {
                if (weight < 0 || weight > 1.0) {
                    const unit = isPoints ? 'pts' : '%';
                    const displayMax = isPoints ? targetTotal : 100;
                    return `Weight for ${category} must be between 0${unit} and ${displayMax}${unit}`;
                }
            }
        }

        // Validate drop policies
        if (config.dropPolicies) {
            for (const [category, policy] of Object.entries(config.dropPolicies)) {
                if (policy.enabled && (!policy.count || policy.count < 1)) {
                    return `Drop count for ${category} must be at least 1`;
                }
            }
        }

        return null; // Valid
    }

    /**
     * Validate configuration accounting for future categories
     * Future categories are categories in the config that don't have assignments yet
     *
     * @param {Object} config - Configuration to validate
     * @param {Array} currentAssignments - Current assignments to check against
     * @returns {Object} Validation result with valid flag, errors, warnings, and category lists
     */
    static validateConfigurationForFuture(config, currentAssignments) {
        const errors = [];
        const warnings = [];

        if (!config.weights) {
            return { valid: true, errors: [], warnings: [] };
        }

        // Determine mode and target
        const isPoints = config.system === 'points';
        const targetTotal = isPoints ? (config.totalPoints || 100) : 100;
        const epsilon = 0.001;
        const unit = isPoints ? 'pts' : '%';

        // Check: weights sum to 1.0 (they're always stored as fractions)
        const totalWeight = Object.values(config.weights).reduce((sum, w) => sum + w, 0);
        const expectedSum = 1.0;  // Weights always stored as fractions

        if (Math.abs(totalWeight - expectedSum) > epsilon) {
            // Convert fractions to display format
            const displaySum = isPoints ? (totalWeight * targetTotal).toFixed(1) : (totalWeight * 100).toFixed(1);
            const displayTarget = isPoints ? targetTotal : 100;
            errors.push(`Weights must sum to ${displayTarget}${unit} (currently ${displaySum}${unit})`);
        }

        // Check: all weights are within valid range (0.0 to 1.0)
        for (const [category, weight] of Object.entries(config.weights)) {
            if (weight < 0 || weight > 1.0) {
                const displayMax = isPoints ? targetTotal : 100;
                errors.push(`Weight for ${category} must be between 0${unit} and ${displayMax}${unit}`);
            }
        }

        // Get categories from assignments
        const assignmentCategories = new Set();
        currentAssignments.forEach(a => {
            if (a.category && a.category !== 'other') {
                assignmentCategories.add(a.category);
            }
        });

        const weightCategories = new Set(Object.keys(config.weights));

        // Categories with assignments but no weight
        const unweightedCategories = [...assignmentCategories].filter(cat =>
            !weightCategories.has(cat)
        );

        if (unweightedCategories.length > 0) {
            warnings.push(`These categories have assignments but no weight: ${unweightedCategories.join(', ')}`);
        }

        // Categories with weights but no assignments (future categories)
        const futureCategories = [...weightCategories].filter(cat =>
            !assignmentCategories.has(cat)
        );

        if (futureCategories.length > 0) {
            // Import TemplateManager for category names (will be available after loading)
            const getCategoryInfo = window.TemplateManager?.getCategoryInfo || ((cat) => ({ name: cat }));
            const categoryNames = futureCategories.map(cat => getCategoryInfo(cat).name).join(', ');
            warnings.push(`Configured for future assignments: ${categoryNames} (will be included once posted)`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            futureCategories,
            currentCategories: Array.from(assignmentCategories)
        };
    }

    /**
     * Validate that there's at least one drop policy configured
     * (Helper method for UI validation)
     *
     * @param {Object} dropPolicies - Drop policy configuration
     * @returns {boolean} True if at least one policy is enabled
     */
    static hasDropPolicies(dropPolicies) {
        if (!dropPolicies || Object.keys(dropPolicies).length === 0) {
            return false;
        }

        return Object.values(dropPolicies).some(policy => policy.enabled && policy.count > 0);
    }

    /**
     * Validate weight totals match expected sum
     * (Helper method for real-time validation in UI)
     *
     * @param {Object} weights - Category weights
     * @param {string} system - 'percentage' or 'points'
     * @param {number} totalPoints - Total points for points-based system
     * @returns {Object} Validation result with valid flag and message
     */
    static validateWeightSum(weights, system = 'percentage', totalPoints = 100) {
        if (!weights || Object.keys(weights).length === 0) {
            return { valid: true, message: '' };
        }

        const isPoints = system === 'points';
        const epsilon = 0.001;

        // Weights are ALWAYS stored as fractions (0.0-1.0)
        const expectedSum = 1.0;
        const actualSum = Object.values(weights).reduce((sum, w) => sum + w, 0);

        if (Math.abs(actualSum - expectedSum) < epsilon) {
            return { valid: true, message: 'Weights sum correctly' };
        }

        const unit = isPoints ? 'pts' : '%';
        // Convert fraction to display value
        const displaySum = isPoints ? (actualSum * totalPoints).toFixed(1) : (actualSum * 100).toFixed(1);
        const displayExpected = isPoints ? totalPoints : 100;

        return {
            valid: false,
            message: `Weights must sum to ${displayExpected}${unit} (currently ${displaySum}${unit})`,
            difference: actualSum - expectedSum
        };
    }
}

// Expose to window for browser extension context
if (typeof window !== 'undefined') {
    window.ValidationManager = ValidationManager;
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationManager;
}
