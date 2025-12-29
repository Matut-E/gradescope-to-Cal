/**
 * Course Configuration Manager - Modular Architecture
 * Coordinates storage and delegates functionality to specialized modules
 *
 * REFACTORED: Split from 1500+ lines into focused modules
 * - GradeCalculator: Grade calculations
 * - CategoryGroupManager: Category grouping
 * - CourseLinkingManager: Multi-course aggregation
 * - ClobberPolicyManager: Conditional weight redistribution
 * - TemplateManager: Berkeley course templates
 * - ValidationManager: Configuration validation
 * - AssignmentExclusionManager: Assignment exclusion and disclaimers
 *
 * STORAGE STRUCTURE:
 * - assignments_* keys: Raw extraction data
 * - courseConfigs: Per-course grading configurations
 * - courseLinks_*: Course linking configurations
 */

class CourseConfigManager {
    static STORAGE_KEY = 'courseConfigs';

    // =============================================================================
    // CORE STORAGE METHODS
    // =============================================================================

    /**
     * Get configuration for a specific course
     */
    static async getCourseConfig(courseName) {
        try {
            const storage = await browser.storage.local.get(this.STORAGE_KEY);
            const configs = storage[this.STORAGE_KEY] || {};

            return configs[courseName] || this.getDefaultConfig();
        } catch (error) {
            console.error('Error getting course config:', error);
            return this.getDefaultConfig();
        }
    }

    /**
     * Get all course configurations
     */
    static async getAllConfigs() {
        try {
            const storage = await browser.storage.local.get(this.STORAGE_KEY);
            return storage[this.STORAGE_KEY] || {};
        } catch (error) {
            console.error('Error getting all configs:', error);
            return {};
        }
    }

    /**
     * Save configuration for a specific course
     */
    static async saveCourseConfig(courseName, config, skipStrictValidation = false) {
        try {
            const storage = await browser.storage.local.get(this.STORAGE_KEY);
            const configs = storage[this.STORAGE_KEY] || {};

            // Validate config before saving (delegate to ValidationManager)
            const validationError = ValidationManager.validateConfig(config, skipStrictValidation);
            if (validationError) {
                throw new Error(`Invalid configuration: ${validationError}`);
            }

            configs[courseName] = {
                ...config,
                lastModified: new Date().toISOString()
            };

            await browser.storage.local.set({
                [this.STORAGE_KEY]: configs
            });

            console.log(`✅ Saved configuration for ${courseName}`);
            return true;

        } catch (error) {
            console.error('Error saving course config:', error);
            throw error;
        }
    }

    /**
     * Delete configuration for a specific course (reset to defaults)
     */
    static async deleteCourseConfig(courseName) {
        try {
            const storage = await browser.storage.local.get(this.STORAGE_KEY);
            const configs = storage[this.STORAGE_KEY] || {};

            // Delete the course configuration
            delete configs[courseName];

            await browser.storage.local.set({
                [this.STORAGE_KEY]: configs
            });

            console.log(`✅ Deleted configuration for ${courseName}`);
            return true;

        } catch (error) {
            console.error('Error deleting course config:', error);
            throw error;
        }
    }

    /**
     * Update manual category override for a single assignment
     */
    static async updateCategoryOverride(courseName, assignmentId, newCategory) {
        try {
            const config = await this.getCourseConfig(courseName);

            if (!config.manualOverrides) {
                config.manualOverrides = {};
            }

            config.manualOverrides[assignmentId] = newCategory;

            // Skip strict validation - just updating override, not changing weights
            await this.saveCourseConfig(courseName, config, true);
            console.log(`✅ Updated category for assignment ${assignmentId} → ${newCategory}`);

        } catch (error) {
            console.error('Error updating category override:', error);
            throw error;
        }
    }


    /**
     * Get default configuration
     */
    static getDefaultConfig() {
        return {
            system: 'percentage', // 'percentage' or 'points'
            totalPoints: undefined, // Total points for class (only for points-based system)
            weights: null, // null = use simple average
            categoryGroups: null, // { "Group Name": { categories: [...], totalWeight: 0.X, distributionMethod: 'equal' } }
            dropPolicies: {}, // { categoryName: { enabled: true, count: 2 } }
            clobberPolicies: {}, // { "Policy Name": { type, sourceCategory, config, enabled } }
            manualOverrides: {}, // { assignmentId: 'newCategory' }
            excludedAssignments: [], // Array of assignment IDs to exclude from grade calculation
            templateUsed: null,
            lastModified: null
        };
    }

    // =============================================================================
    // DELEGATION METHODS - Forward to specialized modules
    // =============================================================================

    // --- Validation (ValidationManager) ---
    static validateConfig(config, skipStrictValidation = false) {
        return ValidationManager.validateConfig(config, skipStrictValidation);
    }

    static validateConfigurationForFuture(config, currentAssignments) {
        return ValidationManager.validateConfigurationForFuture(config, currentAssignments);
    }

    // --- Category Groups (CategoryGroupManager) ---
    static createCategoryGroup(groupName, categories, totalWeight) {
        return CategoryGroupManager.createCategoryGroup(groupName, categories, totalWeight);
    }

    static expandCategoryGroups(categoryGroups, assignments) {
        return CategoryGroupManager.expandCategoryGroups(categoryGroups, assignments);
    }

    static validateCategoryGroups(categoryGroups, individualWeights) {
        return CategoryGroupManager.validateCategoryGroups(categoryGroups, individualWeights);
    }

    static mergeCategoryWeights(individualWeights, categoryGroups, assignments) {
        return CategoryGroupManager.mergeCategoryWeights(individualWeights, categoryGroups, assignments);
    }

    // --- Clobber Policies (ClobberPolicyManager) ---
    static createClobberPolicy(policyType, sourceCategory, config) {
        return ClobberPolicyManager.createClobberPolicy(policyType, sourceCategory, config);
    }

    static applyClobberPolicies(assignments, baseWeights, clobberPolicies) {
        return ClobberPolicyManager.applyClobberPolicies(assignments, baseWeights, clobberPolicies);
    }

    static applySingleClobberPolicy(policy, categorized, currentWeights) {
        return ClobberPolicyManager.applySingleClobberPolicy(policy, categorized, currentWeights);
    }

    static applyRedistributePolicy(sourceCategory, config, categorized, currentWeights) {
        return ClobberPolicyManager.applyRedistributePolicy(sourceCategory, config, categorized, currentWeights);
    }

    static applyBestOfPolicy(sourceCategory, config, categorized, currentWeights) {
        return ClobberPolicyManager.applyBestOfPolicy(sourceCategory, config, categorized, currentWeights);
    }

    static applyRequireOnePolicy(sourceCategory, config, categorized, currentWeights) {
        return ClobberPolicyManager.applyRequireOnePolicy(sourceCategory, config, categorized, currentWeights);
    }

    static validateClobberPolicies(clobberPolicies, weights) {
        return ClobberPolicyManager.validateClobberPolicies(clobberPolicies, weights);
    }

    static findBestOfPolicyForCategory(category, clobberPolicies) {
        return ClobberPolicyManager.findBestOfPolicyForCategory(category, clobberPolicies);
    }

    // --- Templates (TemplateManager) ---
    static getCategoryInfo(category) {
        return TemplateManager.getCategoryInfo(category);
    }

    static suggestTemplate(courseName) {
        return TemplateManager.suggestTemplate(courseName);
    }

    static getBerkeleyTemplates() {
        return TemplateManager.getBerkeleyTemplates();
    }

    // --- Course Linking (CourseLinkingManager) ---
    static async linkCourses(primaryCourseName, linkedCourseNames, categoryRules = {}) {
        return await CourseLinkingManager.linkCourses(primaryCourseName, linkedCourseNames, categoryRules);
    }

    static async getCourseLinks(courseName) {
        return await CourseLinkingManager.getCourseLinks(courseName);
    }

    static async getAllCourseLinks() {
        return await CourseLinkingManager.getAllCourseLinks();
    }

    static async updateCategoryRules(primaryCourseName, linkedCourseName, newRules) {
        return await CourseLinkingManager.updateCategoryRules(primaryCourseName, linkedCourseName, newRules);
    }

    static async unlinkCourse(primaryCourseName, courseToRemove) {
        return await CourseLinkingManager.unlinkCourse(primaryCourseName, courseToRemove);
    }

    static async deleteAllCourseLinks(primaryCourseName) {
        return await CourseLinkingManager.deleteAllCourseLinks(primaryCourseName);
    }

    static async validateCourseLink(primaryCourseName, linkedCourseNames) {
        return await CourseLinkingManager.validateCourseLink(primaryCourseName, linkedCourseNames);
    }

    static async getAggregatedAssignments(courseName) {
        return await CourseLinkingManager.getAggregatedAssignments(courseName);
    }

    static applyCategoryRules(assignments, rules, sourceCourse) {
        return CourseLinkingManager.applyCategoryRules(assignments, rules, sourceCourse);
    }

    static async isCourseLinked(courseName) {
        return await CourseLinkingManager.isCourseLinked(courseName);
    }

    // --- Grade Calculation (GradeCalculator) ---
    static calculateSimpleGrades(assignments) {
        return GradeCalculator.calculateSimpleGrades(assignments);
    }

    static calculateWeightedGrades(assignments, config) {
        return GradeCalculator.calculateWeightedGrades(assignments, config);
    }

    // --- Assignment Exclusion (AssignmentExclusionManager) ---
    static async toggleAssignmentExclusion(courseName, assignmentId) {
        return await AssignmentExclusionManager.toggleAssignmentExclusion(
            courseName,
            assignmentId,
            this.getCourseConfig.bind(this),
            this.saveCourseConfig.bind(this)
        );
    }

    static async isAssignmentExcluded(courseName, assignmentId) {
        return await AssignmentExclusionManager.isAssignmentExcluded(
            courseName,
            assignmentId,
            this.getCourseConfig.bind(this)
        );
    }

    static async bulkExcludeByPattern(courseName, pattern, allAssignments) {
        return await AssignmentExclusionManager.bulkExcludeByPattern(
            courseName,
            pattern,
            allAssignments,
            this.getCourseConfig.bind(this),
            this.saveCourseConfig.bind(this)
        );
    }

    static async clearAllExclusions(courseName) {
        return await AssignmentExclusionManager.clearAllExclusions(
            courseName,
            this.getCourseConfig.bind(this),
            this.saveCourseConfig.bind(this)
        );
    }

    static async hasSeenGradeSetup(courseName) {
        return await AssignmentExclusionManager.hasSeenGradeSetup(courseName);
    }

    static async dismissGradeSetup(courseName) {
        return await AssignmentExclusionManager.dismissGradeSetup(courseName);
    }

    static hasComplexPolicies(config) {
        return AssignmentExclusionManager.hasComplexPolicies(config);
    }

    // =============================================================================
    // ORCHESTRATION METHODS - Coordinate between modules
    // =============================================================================

    /**
     * Get all possible categories (existing + template-suggested + common)
     */
    static getAllPossibleCategories(assignments, template = null) {
        // Start with detected categories from assignments
        const detectedCategories = new Set();
        assignments.forEach(a => {
            if (a.category && a.category !== 'other') {
                detectedCategories.add(a.category);
            }
        });

        // Add template categories if provided
        if (template && template.weights) {
            Object.keys(template.weights).forEach(cat => detectedCategories.add(cat));
        }

        // Always include common categories as options
        const commonCategories = ['homework', 'lab', 'midterm', 'final', 'project', 'quiz', 'participation'];
        commonCategories.forEach(cat => detectedCategories.add(cat));

        // Sort for consistent display
        const sortedCategories = Array.from(detectedCategories).sort((a, b) => {
            const order = ['homework', 'lab', 'quiz', 'project', 'midterm', 'final', 'participation'];
            const aIndex = order.indexOf(a);
            const bIndex = order.indexOf(b);

            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.localeCompare(b);
        });

        return sortedCategories;
    }

    /**
     * Apply configuration to raw assignments and calculate grades
     * ORCHESTRATOR: Coordinates course linking, manual overrides, and grade calculation
     */
    static async calculateGradesWithConfig(courseName, rawAssignments) {
        try {
            const config = await this.getCourseConfig(courseName);

            console.log(`📊 Calculating grades for ${courseName} with config:`, config);

            // Check if this course has linked courses (delegate to CourseLinkingManager)
            const linkData = await this.getCourseLinks(courseName);
            let assignments;

            if (linkData) {
                console.log(`🔗 Course has links - aggregating from ${linkData.linkedCourses.length + 1} course(s)`);
                // Use aggregated assignments (includes category rules)
                assignments = await this.getAggregatedAssignments(courseName);
            } else {
                // Use provided assignments (no linking)
                assignments = rawAssignments;
            }

            // Apply manual category overrides AFTER aggregation but BEFORE grade calculation
            assignments = assignments.map(assignment => {
                const hasOverride = config.manualOverrides && config.manualOverrides[assignment.assignmentId];

                if (hasOverride) {
                    console.log(`✏️ Applying manual override: "${assignment.title}" → ${config.manualOverrides[assignment.assignmentId]}`);

                    return {
                        ...assignment,
                        category: config.manualOverrides[assignment.assignmentId],
                        categoryOverridden: true,
                        categoryConfidence: 1.0 // Manual overrides have 100% confidence
                    };
                }

                // No override, use current category (may be from link rule or auto-categorization)
                return assignment;
            });

            // Filter out excluded assignments and handle ungraded past-due assignments
            const excludedIds = config.excludedAssignments || [];

            // First pass: Calculate average maxPoints per category for fallback
            const categoryMaxPoints = {};
            assignments.forEach(a => {
                if (a.maxPoints && a.category) {
                    if (!categoryMaxPoints[a.category]) {
                        categoryMaxPoints[a.category] = [];
                    }
                    categoryMaxPoints[a.category].push(a.maxPoints);
                }
            });

            // Calculate averages
            const categoryAverages = {};
            Object.entries(categoryMaxPoints).forEach(([category, points]) => {
                const sum = points.reduce((total, p) => total + p, 0);
                categoryAverages[category] = sum / points.length;
            });

            console.log(`📊 Category maxPoints averages:`, categoryAverages);

            assignments = assignments
                .filter(assignment => {
                    const isExcluded = excludedIds.includes(assignment.assignmentId);
                    if (isExcluded) {
                        console.log(`🚫 Excluding assignment from grades: "${assignment.title}"`);
                    }
                    return !isExcluded;
                })
                .map(assignment => {
                    // Check if assignment is past due, not graded, and not submitted
                    const now = new Date();
                    const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
                    const isPastDue = dueDate && dueDate < now;
                    const isUngraded = !assignment.isGraded;
                    const isNotSubmitted = !assignment.isSubmitted;

                    // If past due, ungraded, and not submitted, treat as 0/maxPoints
                    if (isPastDue && isUngraded && isNotSubmitted) {
                        let maxPoints = assignment.maxPoints;

                        // FALLBACK: Estimate maxPoints if missing
                        if (!maxPoints && assignment.category) {
                            maxPoints = categoryAverages[assignment.category];
                            if (maxPoints) {
                                console.log(`  ℹ️ Estimated maxPoints for "${assignment.title}": ${maxPoints.toFixed(1)} (from ${assignment.category} average)`);
                            }
                        }

                        if (maxPoints) {
                            console.log(`⚠️ Treating ungraded past-due as 0: "${assignment.title}" (0/${maxPoints})`);
                            return {
                                ...assignment,
                                isGraded: true,
                                earnedPoints: 0,
                                maxPoints: maxPoints,
                                gradePercentage: 0
                            };
                        } else {
                            console.log(`  ⚠️ Cannot treat "${assignment.title}" as 0 - no maxPoints available`);
                        }
                    }

                    return assignment;
                });

            // Calculate both simple and weighted grades (delegate to GradeCalculator)
            const simpleStats = this.calculateSimpleGrades(assignments);

            let weightedStats = null;

            // Calculate weighted grades using merged weights (groups + individual)
            if (config.weights || config.categoryGroups) {
                // Merge individual weights and category groups (delegate to CategoryGroupManager)
                const finalWeights = this.mergeCategoryWeights(
                    config.weights || {},
                    config.categoryGroups || {},
                    assignments
                );

                // Use merged weights for calculation
                const configWithMergedWeights = {
                    ...config,
                    weights: finalWeights
                };

                weightedStats = this.calculateWeightedGrades(assignments, configWithMergedWeights);
            }

            return {
                simple: simpleStats,
                weighted: weightedStats,
                config: config,
                assignments: assignments, // Return the modified assignments
                linkData: linkData,       // Include link info for UI display
                calculatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error calculating grades with config:', error);
            throw error;
        }
    }
}

// Expose to window for browser extension context
if (typeof window !== 'undefined') {
    window.CourseConfigManager = CourseConfigManager;
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CourseConfigManager;
}
