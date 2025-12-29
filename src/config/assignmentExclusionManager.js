/**
 * Assignment Exclusion Manager Module
 * Handles assignment exclusion from grade calculations and setup disclaimers
 *
 * RESPONSIBILITIES:
 * - Toggle assignment exclusion (individual)
 * - Bulk exclusion by pattern
 * - Exclusion status checks
 * - Setup disclaimer management
 *
 * Extracted from courseConfigManager.js to keep coordinator focused
 */

class AssignmentExclusionManager {
    // =========================================================================
    // ASSIGNMENT EXCLUSION MANAGEMENT
    // =========================================================================

    /**
     * Toggle whether an assignment is excluded from grade calculation
     * @param {string} courseName - Name of the course
     * @param {string} assignmentId - ID of the assignment
     * @param {Function} getCourseConfig - Reference to CourseConfigManager.getCourseConfig
     * @param {Function} saveCourseConfig - Reference to CourseConfigManager.saveCourseConfig
     * @returns {Promise<boolean>} - New excluded state (true = excluded, false = included)
     */
    static async toggleAssignmentExclusion(courseName, assignmentId, getCourseConfig, saveCourseConfig) {
        try {
            const config = await getCourseConfig(courseName);

            if (!config.excludedAssignments) {
                config.excludedAssignments = [];
            }

            const index = config.excludedAssignments.indexOf(assignmentId);
            let newState;

            if (index > -1) {
                // Remove from excluded list
                config.excludedAssignments.splice(index, 1);
                newState = false; // Now included
                console.log(`✅ Assignment ${assignmentId} is now INCLUDED in grades`);
            } else {
                // Add to excluded list
                config.excludedAssignments.push(assignmentId);
                newState = true; // Now excluded
                console.log(`🚫 Assignment ${assignmentId} is now EXCLUDED from grades`);
            }

            // Skip strict validation - just updating exclusion, not changing weights
            await saveCourseConfig(courseName, config, true);

            return newState;
        } catch (error) {
            console.error('Error toggling assignment exclusion:', error);
            throw error;
        }
    }

    /**
     * Check if assignment is excluded from grade calculation
     * @param {string} courseName - Name of the course
     * @param {string} assignmentId - ID of the assignment
     * @param {Function} getCourseConfig - Reference to CourseConfigManager.getCourseConfig
     * @returns {Promise<boolean>} - True if excluded, false if included
     */
    static async isAssignmentExcluded(courseName, assignmentId, getCourseConfig) {
        try {
            const config = await getCourseConfig(courseName);
            return config.excludedAssignments?.includes(assignmentId) || false;
        } catch (error) {
            console.error('Error checking assignment exclusion:', error);
            return false;
        }
    }

    /**
     * Bulk exclude assignments by pattern (e.g., "Quiz A-*")
     * @param {string} courseName
     * @param {string} pattern - Wildcard pattern (* supported)
     * @param {Array} allAssignments - All assignments for this course
     * @param {Function} getCourseConfig - Reference to CourseConfigManager.getCourseConfig
     * @param {Function} saveCourseConfig - Reference to CourseConfigManager.saveCourseConfig
     * @returns {Promise<number>} - Number of assignments excluded
     */
    static async bulkExcludeByPattern(courseName, pattern, allAssignments, getCourseConfig, saveCourseConfig) {
        try {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
            const config = await getCourseConfig(courseName);

            if (!config.excludedAssignments) {
                config.excludedAssignments = [];
            }

            let count = 0;
            allAssignments.forEach(assignment => {
                const id = assignment.assignmentId || assignment.id;
                const title = assignment.title || '';

                if (regex.test(title) && !config.excludedAssignments.includes(id)) {
                    config.excludedAssignments.push(id);
                    count++;
                    console.log(`🚫 Bulk excluded: ${title}`);
                }
            });

            if (count > 0) {
                await saveCourseConfig(courseName, config, true);
                console.log(`✅ Bulk excluded ${count} assignment(s) matching pattern: ${pattern}`);
            }

            return count;
        } catch (error) {
            console.error('Error bulk excluding assignments:', error);
            throw error;
        }
    }

    /**
     * Clear all exclusions for a course
     * @param {string} courseName
     * @param {Function} getCourseConfig - Reference to CourseConfigManager.getCourseConfig
     * @param {Function} saveCourseConfig - Reference to CourseConfigManager.saveCourseConfig
     * @returns {Promise<number>} - Number of exclusions cleared
     */
    static async clearAllExclusions(courseName, getCourseConfig, saveCourseConfig) {
        try {
            const config = await getCourseConfig(courseName);
            const count = config.excludedAssignments?.length || 0;

            config.excludedAssignments = [];

            if (count > 0) {
                await saveCourseConfig(courseName, config, true);
                console.log(`✅ Cleared ${count} exclusion(s) for ${courseName}`);
            }

            return count;
        } catch (error) {
            console.error('Error clearing exclusions:', error);
            throw error;
        }
    }

    // =========================================================================
    // DISCLAIMER AND FIRST-TIME SETUP
    // =========================================================================

    /**
     * Check if user has dismissed setup modal for a course
     * @param {string} courseName
     * @returns {Promise<boolean>}
     */
    static async hasSeenGradeSetup(courseName) {
        try {
            const key = `dismissedGradeSetup_${courseName}`;
            const storage = await browser.storage.local.get(key);
            return storage[key] === true;
        } catch (error) {
            console.error('Error checking setup dismissal:', error);
            return false;
        }
    }

    /**
     * Mark setup modal as dismissed for a course
     * @param {string} courseName
     * @returns {Promise<void>}
     */
    static async dismissGradeSetup(courseName) {
        try {
            const key = `dismissedGradeSetup_${courseName}`;
            await browser.storage.local.set({ [key]: true });
            console.log(`✅ Dismissed grade setup for ${courseName}`);
        } catch (error) {
            console.error('Error saving setup dismissal:', error);
        }
    }

    /**
     * Check if configuration has complex policies (should re-show disclaimer)
     * @param {Object} config - Course configuration
     * @returns {boolean}
     */
    static hasComplexPolicies(config) {
        const hasClobber = config.clobberPolicies && Object.keys(config.clobberPolicies).length > 0;
        const hasGroups = config.categoryGroups && Object.keys(config.categoryGroups).length > 0;
        return hasClobber || hasGroups;
    }
}

// Export to window for browser extension context
if (typeof window !== 'undefined') {
    window.AssignmentExclusionManager = AssignmentExclusionManager;
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AssignmentExclusionManager;
}
