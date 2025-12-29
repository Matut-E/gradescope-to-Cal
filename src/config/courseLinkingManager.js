/**
 * Course Linking Manager Module
 * Handles aggregating assignments from multiple Gradescope courses
 * Allows treating multiple course sections as one unified course
 *
 * Example: Link "Math 53" and "Math 53-Yu" together for unified grade calculation
 *
 * Part of courseConfigManager.js refactoring
 */

class CourseLinkingManager {
    /**
     * Link multiple courses together for unified grade calculation
     *
     * @param {string} primaryCourseName - The main course (e.g., "Math 53")
     * @param {string[]} linkedCourseNames - Courses to link (e.g., ["Math 53-Yu"])
     * @param {Object} categoryRules - Optional category mapping rules per linked course
     * @returns {Promise<Object>} Link data configuration
     * @example
     * await linkCourses("Math 53", ["Math 53-Yu"], {
     *   "Math 53-Yu": { importAllAs: "quiz" }
     * });
     */
    static async linkCourses(primaryCourseName, linkedCourseNames, categoryRules = {}) {
        try {
            // Validation: Check for circular links
            const validationError = await this.validateCourseLink(primaryCourseName, linkedCourseNames);
            if (validationError) {
                throw new Error(validationError);
            }

            // Safety: Remove primary from linked list (can't link to itself)
            const filteredLinkedCourses = linkedCourseNames.filter(name => name !== primaryCourseName);

            if (filteredLinkedCourses.length === 0) {
                throw new Error('No valid linked courses provided');
            }

            const linkData = {
                primaryCourse: primaryCourseName,
                linkedCourses: filteredLinkedCourses,
                categoryRules: categoryRules || {},
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };

            // Store with unique key
            await browser.storage.local.set({
                [`courseLinks_${primaryCourseName}`]: linkData
            });

            console.log(`✅ Linked ${filteredLinkedCourses.length} course(s) to ${primaryCourseName}`);
            return linkData;

        } catch (error) {
            console.error('Error linking courses:', error);
            throw error;
        }
    }

    /**
     * Get course link data for a given course
     *
     * @param {string} courseName - Course name to lookup
     * @returns {Promise<Object|null>} Link data or null if not found
     */
    static async getCourseLinks(courseName) {
        try {
            const linkKey = `courseLinks_${courseName}`;
            const storage = await browser.storage.local.get(linkKey);

            return storage[linkKey] || null;
        } catch (error) {
            console.error('Error getting course links:', error);
            return null;
        }
    }

    /**
     * Get all course links from storage
     *
     * @returns {Promise<Object>} All link data keyed by primary course name
     */
    static async getAllCourseLinks() {
        try {
            const storage = await browser.storage.local.get();
            const linkKeys = Object.keys(storage).filter(key => key.startsWith('courseLinks_'));

            const allLinks = {};
            linkKeys.forEach(key => {
                const courseName = key.replace('courseLinks_', '');
                allLinks[courseName] = storage[key];
            });

            return allLinks;
        } catch (error) {
            console.error('Error getting all course links:', error);
            return {};
        }
    }

    /**
     * Update category rules for a linked course
     *
     * @param {string} primaryCourseName - Primary course name
     * @param {string} linkedCourseName - Linked course to update rules for
     * @param {Object} newRules - New category mapping rules
     * @returns {Promise<Object>} Updated link data
     */
    static async updateCategoryRules(primaryCourseName, linkedCourseName, newRules) {
        try {
            const linkData = await this.getCourseLinks(primaryCourseName);

            if (!linkData) {
                throw new Error(`No links found for ${primaryCourseName}`);
            }

            if (!linkData.linkedCourses.includes(linkedCourseName)) {
                throw new Error(`${linkedCourseName} is not linked to ${primaryCourseName}`);
            }

            // Update category rules
            linkData.categoryRules[linkedCourseName] = newRules;
            linkData.lastModified = new Date().toISOString();

            await browser.storage.local.set({
                [`courseLinks_${primaryCourseName}`]: linkData
            });

            console.log(`✅ Updated category rules for ${linkedCourseName} in ${primaryCourseName}`);
            return linkData;

        } catch (error) {
            console.error('Error updating category rules:', error);
            throw error;
        }
    }

    /**
     * Unlink a course from a primary course
     *
     * @param {string} primaryCourseName - Primary course name
     * @param {string} courseToRemove - Course to unlink
     * @returns {Promise<Object|null>} Updated link data or null if all links removed
     */
    static async unlinkCourse(primaryCourseName, courseToRemove) {
        try {
            const linkData = await this.getCourseLinks(primaryCourseName);

            if (!linkData) {
                throw new Error(`No links found for ${primaryCourseName}`);
            }

            // Remove the specified course from linked list
            const updatedLinkedCourses = linkData.linkedCourses.filter(
                name => name !== courseToRemove
            );

            // Remove category rules for this course
            if (linkData.categoryRules && linkData.categoryRules[courseToRemove]) {
                delete linkData.categoryRules[courseToRemove];
            }

            // If no linked courses left, delete the entire link
            if (updatedLinkedCourses.length === 0) {
                await browser.storage.local.remove(`courseLinks_${primaryCourseName}`);
                console.log(`✅ Removed all links for ${primaryCourseName}`);
                return null;
            }

            // Otherwise, update with new list
            const updatedLinkData = {
                ...linkData,
                linkedCourses: updatedLinkedCourses,
                lastModified: new Date().toISOString()
            };

            await browser.storage.local.set({
                [`courseLinks_${primaryCourseName}`]: updatedLinkData
            });

            console.log(`✅ Unlinked ${courseToRemove} from ${primaryCourseName}`);
            return updatedLinkData;

        } catch (error) {
            console.error('Error unlinking course:', error);
            throw error;
        }
    }

    /**
     * Delete all course links for a primary course
     *
     * @param {string} primaryCourseName - Primary course name
     * @returns {Promise<void>}
     */
    static async deleteAllCourseLinks(primaryCourseName) {
        try {
            await browser.storage.local.remove(`courseLinks_${primaryCourseName}`);
            console.log(`✅ Deleted all course links for ${primaryCourseName}`);
        } catch (error) {
            console.error('Error deleting course links:', error);
            throw error;
        }
    }

    /**
     * Validate course link to prevent circular dependencies and conflicts
     *
     * @param {string} primaryCourseName - Primary course name
     * @param {string[]} linkedCourseNames - Courses to link
     * @returns {Promise<string|null>} Error message or null if valid
     */
    static async validateCourseLink(primaryCourseName, linkedCourseNames) {
        try {
            const allLinks = await this.getAllCourseLinks();

            // Check 1: Linked courses can't already be primaries elsewhere
            for (const linkedCourse of linkedCourseNames) {
                if (allLinks[linkedCourse]) {
                    return `Cannot link ${linkedCourse}: it's already a primary course with its own links`;
                }
            }

            // Check 2: Linked courses can't already be linked to another primary
            for (const [existingPrimary, linkData] of Object.entries(allLinks)) {
                if (existingPrimary === primaryCourseName) continue; // Skip self

                for (const linkedCourse of linkedCourseNames) {
                    if (linkData.linkedCourses.includes(linkedCourse)) {
                        return `Cannot link ${linkedCourse}: it's already linked to ${existingPrimary}`;
                    }
                }
            }

            // Check 3: Primary can't be in its own linked list (should be filtered, but double-check)
            if (linkedCourseNames.includes(primaryCourseName)) {
                return `Cannot link a course to itself`;
            }

            return null; // Valid
        } catch (error) {
            console.error('Error validating course link:', error);
            return 'Validation error occurred';
        }
    }

    /**
     * Get aggregated assignments from primary course + all linked courses
     * Applies category rules automatically
     *
     * @param {string} courseName - Primary course name
     * @returns {Promise<Array>} Aggregated unique assignments
     */
    static async getAggregatedAssignments(courseName) {
        try {
            const linkData = await this.getCourseLinks(courseName);
            let coursesToAggregate = [courseName];

            if (linkData) {
                coursesToAggregate = [linkData.primaryCourse, ...linkData.linkedCourses];
                console.log(`📚 Aggregating assignments from: ${coursesToAggregate.join(', ')}`);
            }

            let allAssignments = [];

            // Collect assignments from each course
            for (const course of coursesToAggregate) {
                // Try multiple storage patterns to find assignments
                const storage = await browser.storage.local.get();
                const assignmentKeys = Object.keys(storage).filter(key =>
                    key.startsWith('assignments_') &&
                    storage[key].allAssignments?.some(a => a.course === course)
                );

                // Collect assignments for this specific course
                let courseAssignments = [];
                assignmentKeys.forEach(key => {
                    const data = storage[key];
                    if (data.allAssignments) {
                        const filtered = data.allAssignments.filter(a => a.course === course);
                        courseAssignments.push(...filtered);
                    }
                });

                if (courseAssignments.length > 0) {
                    console.log(`📋 Found ${courseAssignments.length} assignments from ${course}`);

                    // Apply category rules if this is a linked course
                    if (course !== linkData?.primaryCourse && linkData?.categoryRules?.[course]) {
                        console.log(`🔄 Applying category rules for ${course}:`, linkData.categoryRules[course]);
                        courseAssignments = this.applyCategoryRules(
                            courseAssignments,
                            linkData.categoryRules[course],
                            course
                        );
                    }

                    allAssignments.push(...courseAssignments);
                }
            }

            // Deduplicate by assignmentId
            const uniqueAssignments = Array.from(
                new Map(allAssignments.map(a => [a.assignmentId, a])).values()
            );

            console.log(`✅ Aggregated ${uniqueAssignments.length} unique assignments for ${courseName}`);
            return uniqueAssignments;

        } catch (error) {
            console.error('Error aggregating assignments:', error);
            // Fallback to just the primary course's assignments
            const storage = await browser.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key =>
                key.startsWith('assignments_') &&
                storage[key].allAssignments?.some(a => a.course === courseName)
            );

            let assignments = [];
            assignmentKeys.forEach(key => {
                const data = storage[key];
                if (data.allAssignments) {
                    assignments.push(...data.allAssignments.filter(a => a.course === courseName));
                }
            });

            return assignments;
        }
    }

    /**
     * Apply category import rules to assignments from linked courses
     *
     * @param {Array} assignments - Assignments from linked course
     * @param {Object} rules - Category rules to apply
     * @param {string} sourceCourse - Name of source course
     * @returns {Array} Transformed assignments
     */
    static applyCategoryRules(assignments, rules, sourceCourse) {
        if (!rules) return assignments;

        console.log(`🔧 Applying category rules to ${assignments.length} assignments from ${sourceCourse}`);

        return assignments.map(assignment => {
            let newCategory = assignment.category;
            const originalCategory = assignment.category;

            // Rule 1: Import all assignments as specific category
            if (rules.importAllAs) {
                newCategory = rules.importAllAs;
                console.log(`   "${assignment.title}": ${originalCategory} → ${newCategory} (importAllAs)`);
            }
            // Rule 2: Category mapping (old category → new category)
            else if (rules.categoryMapping && rules.categoryMapping[assignment.category]) {
                newCategory = rules.categoryMapping[assignment.category];
                console.log(`   "${assignment.title}": ${originalCategory} → ${newCategory} (mapping)`);
            }

            return {
                ...assignment,
                category: newCategory,
                categorySource: 'course_link_rule',  // Track that this was remapped
                originalCategory: originalCategory,   // Preserve original
                linkedFrom: sourceCourse              // Track source course
            };
        }).filter(assignment => {
            // Rule 3: Only import specific categories (if specified)
            if (rules.importCategories && Array.isArray(rules.importCategories)) {
                const shouldImport = rules.importCategories.includes(assignment.category);
                if (!shouldImport) {
                    console.log(`   Filtered out "${assignment.title}" (category: ${assignment.category})`);
                }
                return shouldImport;
            }
            return true;  // No filter, import all
        });
    }

    /**
     * Check if a course is linked (either as primary or linked course)
     *
     * @param {string} courseName - Course name to check
     * @returns {Promise<Object>} Link status information
     */
    static async isCourseLinked(courseName) {
        const allLinks = await this.getAllCourseLinks();

        // Check if it's a primary
        if (allLinks[courseName]) {
            return {
                linked: true,
                role: 'primary',
                linkData: allLinks[courseName]
            };
        }

        // Check if it's a linked course
        for (const [primary, linkData] of Object.entries(allLinks)) {
            if (linkData.linkedCourses.includes(courseName)) {
                return {
                    linked: true,
                    role: 'linked',
                    primaryCourse: primary,
                    linkData: linkData
                };
            }
        }

        return { linked: false };
    }
}

// Expose to window for browser extension context
if (typeof window !== 'undefined') {
    window.CourseLinkingManager = CourseLinkingManager;
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CourseLinkingManager;
}
