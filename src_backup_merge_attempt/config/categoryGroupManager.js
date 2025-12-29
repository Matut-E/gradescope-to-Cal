/**
 * Category Group Manager Module
 * Handles grouping multiple categories under one weight
 * Example: "Homework & Quizzes: 20%" = homework 10% + quiz 10%
 *
 * Part of courseConfigManager.js refactoring
 */

class CategoryGroupManager {
    /**
     * Create or update a category group
     *
     * @param {string} groupName - Name of the group (e.g., "Homework & Quizzes")
     * @param {Array<string>} categories - List of categories to group
     * @param {number} totalWeight - Combined weight for all categories
     * @returns {Object} Group configuration object
     */
    static createCategoryGroup(groupName, categories, totalWeight) {
        if (!groupName || !Array.isArray(categories) || categories.length === 0) {
            throw new Error('Invalid group parameters');
        }

        return {
            name: groupName,
            categories: categories,
            totalWeight: totalWeight,
            distributionMethod: 'equal' // 'equal' or 'proportional'
        };
    }

    /**
     * Expand category groups into individual weights
     * Converts: { "HW & Quiz": { categories: [hw, quiz], totalWeight: 0.20 } }
     * Into: { homework: 0.10, quiz: 0.10 }
     *
     * @param {Object} categoryGroups - Group definitions
     * @param {Array} assignments - Assignments for proportional distribution
     * @returns {Object} Expanded individual category weights
     */
    static expandCategoryGroups(categoryGroups, assignments) {
        const expandedWeights = {};

        if (!categoryGroups || Object.keys(categoryGroups).length === 0) {
            return expandedWeights;
        }

        Object.entries(categoryGroups).forEach(([groupName, groupConfig]) => {
            const { categories, totalWeight, distributionMethod } = groupConfig;

            if (distributionMethod === 'equal') {
                // Equal distribution: split weight evenly
                const weightPerCategory = totalWeight / categories.length;
                categories.forEach(category => {
                    expandedWeights[category] = weightPerCategory;
                });
            } else if (distributionMethod === 'proportional') {
                // Proportional: distribute based on assignment count
                const categoryCounts = {};
                let totalCount = 0;

                // Count assignments per category in this group
                categories.forEach(category => {
                    const count = assignments.filter(a => a.category === category).length;
                    categoryCounts[category] = count;
                    totalCount += count;
                });

                // Distribute weight proportionally
                if (totalCount > 0) {
                    categories.forEach(category => {
                        const proportion = categoryCounts[category] / totalCount;
                        expandedWeights[category] = totalWeight * proportion;
                    });
                } else {
                    // No assignments yet, fall back to equal
                    const weightPerCategory = totalWeight / categories.length;
                    categories.forEach(category => {
                        expandedWeights[category] = weightPerCategory;
                    });
                }
            }
        });

        console.log('📊 Expanded category groups:', expandedWeights);
        return expandedWeights;
    }

    /**
     * Validate category groups
     *
     * @param {Object} categoryGroups - Group definitions to validate
     * @param {Object} individualWeights - Individual category weights
     * @returns {Object} Validation result with errors and warnings
     */
    static validateCategoryGroups(categoryGroups, individualWeights) {
        const errors = [];
        const warnings = [];

        if (!categoryGroups || Object.keys(categoryGroups).length === 0) {
            return { valid: true, errors: [], warnings: [] };
        }

        const categoriesInGroups = new Set();

        // Check each group
        Object.entries(categoryGroups).forEach(([groupName, groupConfig]) => {
            // Check: group has at least one category
            if (!groupConfig.categories || groupConfig.categories.length === 0) {
                errors.push(`Group "${groupName}" has no categories`);
                return;
            }

            // Check: weight is valid
            if (groupConfig.totalWeight < 0 || groupConfig.totalWeight > 1) {
                errors.push(`Group "${groupName}" weight must be between 0% and 100%`);
            }

            // Check: no category in multiple groups
            groupConfig.categories.forEach(category => {
                if (categoriesInGroups.has(category)) {
                    errors.push(`Category "${category}" appears in multiple groups`);
                }
                categoriesInGroups.add(category);
            });
        });

        // Check: categories with individual weights shouldn't be in groups
        if (individualWeights) {
            Object.keys(individualWeights).forEach(category => {
                if (categoriesInGroups.has(category)) {
                    warnings.push(`Category "${category}" has both individual weight and group weight (group will be used)`);
                }
            });
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * Merge individual weights and group weights for final calculation
     *
     * @param {Object} individualWeights - Direct category weights
     * @param {Object} categoryGroups - Group definitions
     * @param {Array} assignments - Assignments for proportional distribution
     * @returns {Object} Final merged weights
     */
    static mergeCategoryWeights(individualWeights, categoryGroups, assignments) {
        const finalWeights = {};

        // First, add expanded group weights
        const groupWeights = this.expandCategoryGroups(categoryGroups, assignments);
        Object.assign(finalWeights, groupWeights);

        // Then, add individual weights for categories not in groups
        const categoriesInGroups = new Set(Object.keys(groupWeights));

        if (individualWeights) {
            Object.entries(individualWeights).forEach(([category, weight]) => {
                if (!categoriesInGroups.has(category)) {
                    finalWeights[category] = weight;
                }
            });
        }

        console.log('⚖️ Final merged weights:', finalWeights);
        return finalWeights;
    }
}

// Expose to window for browser extension context
if (typeof window !== 'undefined') {
    window.CategoryGroupManager = CategoryGroupManager;
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CategoryGroupManager;
}
