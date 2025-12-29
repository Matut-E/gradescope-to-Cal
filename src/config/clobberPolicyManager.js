/**
 * Clobber Policy Manager Module
 * Handles conditional weight redistribution based on missing/skipped assignments
 *
 * Policy Types:
 * - 'redistribute': If category X is missing, redistribute its weight to category Y
 * - 'best_of': Only count best N assignments in a category
 * - 'require_one': Must complete at least one assignment in category
 *
 * Part of courseConfigManager.js refactoring
 */

class ClobberPolicyManager {
    /**
     * Create a clobber policy
     *
     * @param {string} policyType - Type: 'redistribute', 'best_of', 'require_one', or 'z_score_clobber'
     * @param {string} sourceCategory - Category this policy applies to
     * @param {Object} config - Type-specific configuration
     * @returns {Object} Policy configuration object
     */
    static createClobberPolicy(policyType, sourceCategory, config) {
        const validTypes = ['redistribute', 'best_of', 'require_one', 'z_score_clobber'];

        if (!validTypes.includes(policyType)) {
            throw new Error(`Invalid clobber policy type: ${policyType}`);
        }

        return {
            type: policyType,
            sourceCategory: sourceCategory,
            config: config, // Type-specific configuration
            enabled: true
        };
    }

    /**
     * Apply clobber policies to grade calculation
     *
     * @param {Array} assignments - All assignments
     * @param {Object} baseWeights - Base category weights
     * @param {Object} clobberPolicies - Policy definitions
     * @returns {Object} Adjusted weights, applied policies, and modified assignments
     */
    static applyClobberPolicies(assignments, baseWeights, clobberPolicies) {
        if (!clobberPolicies || Object.keys(clobberPolicies).length === 0) {
            return { adjustedWeights: baseWeights, appliedPolicies: [], modifiedAssignments: assignments };
        }

        console.log('🔄 Applying clobber policies...');

        let adjustedWeights = { ...baseWeights };
        let modifiedAssignments = [...assignments]; // Create copy for z-score modifications
        const appliedPolicies = [];

        // Group assignments by category
        const categorized = {};
        modifiedAssignments.forEach(assignment => {
            const category = assignment.category || 'other';
            if (!categorized[category]) {
                categorized[category] = [];
            }
            categorized[category].push(assignment);
        });

        // Process each clobber policy
        Object.entries(clobberPolicies).forEach(([policyName, policy]) => {
            if (!policy.enabled) return;

            try {
                const result = this.applySingleClobberPolicy(
                    policy,
                    categorized,
                    adjustedWeights,
                    modifiedAssignments
                );

                if (result.applied) {
                    adjustedWeights = result.newWeights;

                    // Update assignments if policy modified them (z-score clobber)
                    if (result.modifiedAssignments) {
                        modifiedAssignments = result.modifiedAssignments;
                        // Re-categorize for next policy
                        const newCategorized = {};
                        modifiedAssignments.forEach(assignment => {
                            const category = assignment.category || 'other';
                            if (!newCategorized[category]) {
                                newCategorized[category] = [];
                            }
                            newCategorized[category].push(assignment);
                        });
                        Object.assign(categorized, newCategorized);
                    }

                    appliedPolicies.push({
                        name: policyName,
                        type: policy.type,
                        description: result.description
                    });

                    console.log(`✅ Applied: ${result.description}`);
                }
            } catch (error) {
                console.error(`❌ Error applying policy "${policyName}":`, error);
            }
        });

        return { adjustedWeights, appliedPolicies, modifiedAssignments };
    }

    /**
     * Apply a single clobber policy
     *
     * @param {Object} policy - Policy configuration
     * @param {Object} categorized - Assignments grouped by category
     * @param {Object} currentWeights - Current category weights
     * @param {Array} assignments - All assignments (for z-score modifications)
     * @returns {Object} Result with newWeights if applied
     */
    static applySingleClobberPolicy(policy, categorized, currentWeights, assignments) {
        const { type, sourceCategory, config } = policy;

        switch (type) {
            case 'redistribute':
                return this.applyRedistributePolicy(sourceCategory, config, categorized, currentWeights);

            case 'best_of':
                return this.applyBestOfPolicy(sourceCategory, config, categorized, currentWeights);

            case 'require_one':
                return this.applyRequireOnePolicy(sourceCategory, config, categorized, currentWeights);

            case 'z_score_clobber':
                return this.applyZScoreClobberPolicy(sourceCategory, config, categorized, currentWeights, assignments);

            default:
                return { applied: false };
        }
    }

    /**
     * REDISTRIBUTE POLICY
     * If source category has no submissions, redistribute its weight to target(s)
     * Example: "If you miss MT1, MT2 weight becomes 40%"
     *
     * @param {string} sourceCategory - Category to check
     * @param {Object} config - Policy configuration with targetCategories
     * @param {Object} categorized - Assignments grouped by category
     * @param {Object} currentWeights - Current category weights
     * @returns {Object} Result with newWeights if applied
     */
    static applyRedistributePolicy(sourceCategory, config, categorized, currentWeights) {
        const { targetCategories, condition } = config;
        // condition can be: 'no_submissions', 'no_grades', 'all_zero'

        const sourceAssignments = categorized[sourceCategory] || [];

        // Check condition
        let shouldRedistribute = false;

        if (condition === 'no_submissions') {
            const submitted = sourceAssignments.filter(a => a.isSubmitted);
            shouldRedistribute = submitted.length === 0;
        } else if (condition === 'no_grades') {
            const graded = sourceAssignments.filter(a => a.isGraded);
            shouldRedistribute = graded.length === 0;
        } else if (condition === 'all_zero') {
            const graded = sourceAssignments.filter(a => a.isGraded && a.earnedPoints > 0);
            shouldRedistribute = graded.length === 0 && sourceAssignments.some(a => a.isGraded);
        }

        if (!shouldRedistribute) {
            return { applied: false };
        }

        // Redistribute weight
        const sourceWeight = currentWeights[sourceCategory] || 0;
        const newWeights = { ...currentWeights };

        if (sourceWeight > 0) {
            // Remove weight from source
            newWeights[sourceCategory] = 0;

            // Distribute to targets
            const weightPerTarget = sourceWeight / targetCategories.length;
            targetCategories.forEach(target => {
                newWeights[target] = (newWeights[target] || 0) + weightPerTarget;
            });

            // Import TemplateManager for category info (will be available after loading)
            const getCategoryInfo = window.TemplateManager?.getCategoryInfo || ((cat) => ({ name: cat }));
            const targetNames = targetCategories.map(t => getCategoryInfo(t).name).join(', ');

            return {
                applied: true,
                newWeights: newWeights,
                description: `Redistributed ${(sourceWeight * 100).toFixed(0)}% from ${getCategoryInfo(sourceCategory).name} to ${targetNames} (no submissions)`
            };
        }

        return { applied: false };
    }

    /**
     * BEST OF POLICY
     * Only count best N assignments in category
     * Example: "Best 2 out of 3 midterms count"
     *
     * @param {string} sourceCategory - Category to apply policy to
     * @param {Object} config - Policy configuration with count
     * @param {Object} categorized - Assignments grouped by category
     * @param {Object} currentWeights - Current category weights
     * @returns {Object} Result (doesn't change weights, but flags policy)
     */
    static applyBestOfPolicy(sourceCategory, config, categorized, currentWeights) {
        const { count } = config; // Number of assignments to keep

        const sourceAssignments = categorized[sourceCategory] || [];
        const graded = sourceAssignments.filter(a => a.isGraded && a.earnedPoints !== null);

        if (graded.length <= count) {
            // All assignments count anyway
            return { applied: false };
        }

        // This policy doesn't change weights, but marks which assignments to exclude
        // The calculation engine needs to handle this in calculateWeightedGrades

        const getCategoryInfo = window.TemplateManager?.getCategoryInfo || ((cat) => ({ name: cat }));

        return {
            applied: true,
            newWeights: currentWeights, // Weights unchanged, but we flag the policy
            description: `Using best ${count} of ${graded.length} ${getCategoryInfo(sourceCategory).name}`,
            assignmentsToKeep: count
        };
    }

    /**
     * REQUIRE ONE POLICY
     * Must complete at least one assignment in category, otherwise weight redistributes
     * Example: "Must take at least one midterm"
     *
     * @param {string} sourceCategory - Category with requirement
     * @param {Object} config - Policy configuration
     * @param {Object} categorized - Assignments grouped by category
     * @param {Object} currentWeights - Current category weights
     * @returns {Object} Result with newWeights if requirement not met
     */
    static applyRequireOnePolicy(sourceCategory, config, categorized, currentWeights) {
        const { targetCategories, failureWeight } = config;

        const sourceAssignments = categorized[sourceCategory] || [];
        const graded = sourceAssignments.filter(a => a.isGraded);

        if (graded.length >= 1) {
            // Requirement satisfied
            return { applied: false };
        }

        // Requirement not met - apply penalty or redistribute
        const newWeights = { ...currentWeights };
        const sourceWeight = currentWeights[sourceCategory] || 0;

        if (failureWeight !== undefined) {
            // Set category to specific weight (e.g., 0 for failure)
            newWeights[sourceCategory] = failureWeight;

            // Redistribute difference to targets
            const difference = sourceWeight - failureWeight;
            if (difference > 0 && targetCategories && targetCategories.length > 0) {
                const weightPerTarget = difference / targetCategories.length;
                targetCategories.forEach(target => {
                    newWeights[target] = (newWeights[target] || 0) + weightPerTarget;
                });
            }

            const getCategoryInfo = window.TemplateManager?.getCategoryInfo || ((cat) => ({ name: cat }));

            return {
                applied: true,
                newWeights: newWeights,
                description: `${getCategoryInfo(sourceCategory).name} requirement not met (no submissions)`
            };
        }

        return { applied: false };
    }

    /**
     * Z-SCORE CLOBBER POLICY
     * Use final exam z-score to calculate scaled midterm scores
     * Example: "Final exam can replace midterm scores based on z-score distribution"
     *
     * @param {string} sourceCategory - Category containing source exam (e.g., 'final')
     * @param {Object} config - Policy configuration with targetCategories, mode, percentage
     * @param {Object} categorized - Assignments grouped by category
     * @param {Object} currentWeights - Current category weights
     * @param {Array} assignments - All assignments (to be modified)
     * @returns {Object} Result with modifiedAssignments if applied
     */
    static applyZScoreClobberPolicy(sourceCategory, config, categorized, currentWeights, assignments) {
        const { targetCategories, mode, percentage } = config;
        // mode: 'full' (100% clobber) or 'partial' (e.g., 90% of final z-score)
        // percentage: scaling factor for partial mode (default: 1.0 for full)

        const sourceAssignments = categorized[sourceCategory] || [];

        // Find graded source assignments with exam stats
        const gradedSource = sourceAssignments.filter(a =>
            a.isGraded &&
            a.earnedPoints !== null &&
            a.examStats &&
            a.examStats.isAvailable &&
            a.examStats.mean !== undefined &&
            a.examStats.stdDev !== undefined &&
            a.examStats.stdDev > 0
        );

        if (gradedSource.length === 0) {
            console.log(`📊 Z-score clobber skipped: No graded ${sourceCategory} with stats available`);
            return { applied: false };
        }

        console.log(`📊 Applying z-score clobber from ${sourceCategory} to ${targetCategories.join(', ')}`);

        // For each source exam (typically just one final, but could be multiple)
        let anyApplied = false;
        const clobberedAssignments = [];
        const modifiedAssignments = assignments.map(assignment => {
            // Check if this assignment is in a target category
            if (!targetCategories.includes(assignment.category)) {
                return assignment; // Not a target, return unchanged
            }

            // Check if target has exam stats
            if (!assignment.examStats || !assignment.examStats.isAvailable ||
                assignment.examStats.stdDev === undefined || assignment.examStats.stdDev <= 0) {
                console.log(`  ⚠️ Target "${assignment.title}" missing exam stats, skipping`);
                return assignment;
            }

            // Check if assignment has an original grade (or is ungraded)
            const hasOriginalGrade = assignment.isGraded && assignment.earnedPoints !== null;
            const originalScore = hasOriginalGrade ? assignment.earnedPoints : null;
            const originalPercentage = hasOriginalGrade
                ? ((assignment.earnedPoints / assignment.maxPoints) * 100)
                : 0;

            // Apply z-score clobber from each graded source
            let bestClobberedScore = originalScore;
            let bestSourceInfo = null;

            gradedSource.forEach(sourceExam => {
                // Calculate z-score from source exam
                const sourceScore = sourceExam.earnedPoints;
                const sourceMean = sourceExam.examStats.mean;
                const sourceStdDev = sourceExam.examStats.stdDev;

                // Calculate z-score: how many standard deviations above/below mean
                const zScore = (sourceScore - sourceMean) / sourceStdDev;

                // Apply scaling for partial mode
                const effectiveZScore = mode === 'partial'
                    ? zScore * (percentage || 1.0)
                    : zScore;

                // Scale to target exam's distribution
                const targetMean = assignment.examStats.mean;
                const targetStdDev = assignment.examStats.stdDev;
                const scaledScore = (effectiveZScore * targetStdDev) + targetMean;

                // Clamp to [0, maxPoints]
                const clampedScore = Math.max(0, Math.min(assignment.maxPoints, scaledScore));

                console.log(`  📊 Z-score calc for "${assignment.title}":`);
                console.log(`     Source: ${sourceScore.toFixed(1)}/${sourceExam.maxPoints} (mean=${sourceMean.toFixed(1)}, σ=${sourceStdDev.toFixed(1)}) → z=${zScore.toFixed(2)}`);
                console.log(`     Target: scaled=${scaledScore.toFixed(1)}/${assignment.maxPoints} (mean=${targetMean.toFixed(1)}, σ=${targetStdDev.toFixed(1)})`);
                console.log(`     Original: ${hasOriginalGrade ? originalScore.toFixed(1) : 'N/A'}, Clobbered: ${clampedScore.toFixed(1)}`);

                // Keep best clobbered score (or use if no original)
                if (bestClobberedScore === null || clampedScore > bestClobberedScore) {
                    bestClobberedScore = clampedScore;
                    bestSourceInfo = {
                        sourceTitle: sourceExam.title,
                        zScore: zScore,
                        effectiveZScore: effectiveZScore,
                        scaledScore: scaledScore,
                        clampedScore: clampedScore
                    };
                }
            });

            // Apply clobbering if beneficial (or if no original grade)
            if (bestClobberedScore !== null && (originalScore === null || bestClobberedScore > originalScore)) {
                const clobberedPercentage = (bestClobberedScore / assignment.maxPoints) * 100;

                console.log(`  ✅ Clobbered "${assignment.title}": ${hasOriginalGrade ? originalScore.toFixed(1) : 'N/A'} → ${bestClobberedScore.toFixed(1)} (${clobberedPercentage.toFixed(1)}%)`);

                anyApplied = true;
                clobberedAssignments.push({
                    title: assignment.title,
                    original: originalScore,
                    clobbered: bestClobberedScore,
                    fromZScore: bestSourceInfo.zScore,
                    sourceTitle: bestSourceInfo.sourceTitle
                });

                return {
                    ...assignment,
                    earnedPoints: bestClobberedScore,
                    isGraded: true, // Mark as graded even if it wasn't before
                    gradePercentage: clobberedPercentage,
                    zScoreClobbered: true,
                    zScoreClobberInfo: bestSourceInfo
                };
            }

            return assignment; // No improvement, return unchanged
        });

        if (!anyApplied) {
            console.log(`  ⚠️ Z-score clobber: No assignments improved or clobbered`);
            return { applied: false };
        }

        const getCategoryInfo = window.TemplateManager?.getCategoryInfo || ((cat) => ({ name: cat }));
        const targetNames = targetCategories.map(t => getCategoryInfo(t).name).join(', ');
        const sourceInfo = getCategoryInfo(sourceCategory);
        const modeText = mode === 'partial' ? ` (${(percentage * 100).toFixed(0)}% scaling)` : '';

        return {
            applied: true,
            newWeights: currentWeights, // Weights unchanged, but scores modified
            modifiedAssignments: modifiedAssignments,
            clobberedAssignments: clobberedAssignments,
            description: `Z-score clobber: ${sourceInfo.name} → ${targetNames}${modeText} (${clobberedAssignments.length} assignments affected)`
        };
    }

    /**
     * Validate clobber policies
     *
     * @param {Object} clobberPolicies - Policy definitions to validate
     * @param {Object} weights - Category weights for cross-reference
     * @returns {Object} Validation result with errors and warnings
     */
    static validateClobberPolicies(clobberPolicies, weights) {
        const errors = [];
        const warnings = [];

        if (!clobberPolicies || Object.keys(clobberPolicies).length === 0) {
            return { valid: true, errors: [], warnings: [] };
        }

        Object.entries(clobberPolicies).forEach(([policyName, policy]) => {
            // Check: policy has required fields
            if (!policy.type || !policy.sourceCategory) {
                errors.push(`Policy "${policyName}" missing required fields`);
                return;
            }

            // Check: source category has weight configured
            if (!weights || !weights[policy.sourceCategory]) {
                warnings.push(`Policy "${policyName}" references category "${policy.sourceCategory}" which has no weight`);
            }

            // Type-specific validation
            if (policy.type === 'redistribute' || policy.type === 'require_one') {
                if (!policy.config.targetCategories || policy.config.targetCategories.length === 0) {
                    errors.push(`Policy "${policyName}" (${policy.type}) needs target categories`);
                }
            }

            if (policy.type === 'best_of') {
                if (!policy.config.count || policy.config.count < 1) {
                    errors.push(`Policy "${policyName}" (best_of) needs valid count`);
                }
            }

            if (policy.type === 'z_score_clobber') {
                // Validate z-score clobber configuration
                if (!policy.config.targetCategories || policy.config.targetCategories.length === 0) {
                    errors.push(`Policy "${policyName}" (z_score_clobber) needs target categories`);
                }

                if (!policy.config.mode || !['full', 'partial'].includes(policy.config.mode)) {
                    errors.push(`Policy "${policyName}" (z_score_clobber) needs valid mode ('full' or 'partial')`);
                }

                if (policy.config.mode === 'partial') {
                    if (policy.config.percentage === undefined ||
                        policy.config.percentage <= 0 ||
                        policy.config.percentage > 1) {
                        errors.push(`Policy "${policyName}" (z_score_clobber) partial mode needs percentage between 0 and 1`);
                    }
                }

                // Warn if source/target categories don't have exam stats yet
                warnings.push(`Policy "${policyName}" (z_score_clobber): Ensure exam statistics (mean, stdDev) are entered for both source and target exams`);
            }
        });

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * Find best_of policy for a specific category
     *
     * @param {string} category - Category to search for
     * @param {Object} clobberPolicies - All policy definitions
     * @returns {Object|null} Policy object if found, null otherwise
     */
    static findBestOfPolicyForCategory(category, clobberPolicies) {
        if (!clobberPolicies) return null;

        for (const policy of Object.values(clobberPolicies)) {
            if (policy.enabled && policy.type === 'best_of' && policy.sourceCategory === category) {
                return policy;
            }
        }

        return null;
    }
}

// Expose to window for browser extension context
if (typeof window !== 'undefined') {
    window.ClobberPolicyManager = ClobberPolicyManager;
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ClobberPolicyManager;
}
