/**
 * Grade Calculator Module
 * Handles weighted and simple grade calculations with drop policies
 *
 * Part of courseConfigManager.js refactoring
 */

class GradeCalculator {
    /**
     * Calculate simple (unweighted) grade statistics
     *
     * @param {Array} assignments - Array of assignment objects with grade data
     * @returns {Object} Simple grade statistics
     */
    static calculateSimpleGrades(assignments) {
        const gradedAssignments = assignments.filter(a => a.isGraded && a.earnedPoints !== null);

        if (gradedAssignments.length === 0) {
            return {
                hasGrades: false,
                averagePercentage: 0,
                totalPoints: 0,
                earnedPoints: 0,
                gradedCount: 0,
                totalCount: assignments.length
            };
        }

        const totalEarned = gradedAssignments.reduce((sum, a) => sum + a.earnedPoints, 0);
        const totalPossible = gradedAssignments.reduce((sum, a) => sum + a.maxPoints, 0);

        return {
            hasGrades: true,
            averagePercentage: totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0,
            totalPoints: totalPossible,
            earnedPoints: totalEarned,
            gradedCount: gradedAssignments.length,
            totalCount: assignments.length
        };
    }

    /**
     * Calculate weighted grade with drop policies and clobber policies
     *
     * @param {Array} assignments - Array of assignment objects with grade data
     * @param {Object} config - Configuration object with weights, dropPolicies, etc.
     * @returns {Object} Weighted grade statistics with category details
     */
    static calculateWeightedGrades(assignments, config) {
        if (!config.weights) {
            return null;
        }

        // Import ClobberPolicyManager for policy application
        // (Will be available via window.ClobberPolicyManager once loaded)
        const ClobberPolicyManager = window.ClobberPolicyManager || {
            applyClobberPolicies: (a, w, p) => ({ adjustedWeights: w, appliedPolicies: [], modifiedAssignments: a }),
            findBestOfPolicyForCategory: () => null
        };

        // Apply clobber policies first (adjusts weights and may modify assignment scores via z-score)
        const clobberResult = ClobberPolicyManager.applyClobberPolicies(
            assignments,
            config.weights,
            config.clobberPolicies || {}
        );

        const effectiveWeights = clobberResult.adjustedWeights;
        const modifiedAssignments = clobberResult.modifiedAssignments || assignments;
        console.log('⚖️ Effective weights after clobber:', effectiveWeights);

        // Group assignments by category (using modified assignments from z-score clobbering)
        const categorized = {};
        modifiedAssignments.forEach(assignment => {
            const category = assignment.category || 'other';
            if (!categorized[category]) {
                categorized[category] = [];
            }
            categorized[category].push(assignment);
        });

        let weightedSum = 0;
        let totalWeightWithGrades = 0; // Only count weights for categories with grades
        const categoryDetails = {};

        // Process each category defined in weights
        for (const [category, weight] of Object.entries(effectiveWeights)) {
            if (!weight || weight === 0) {
                continue; // Skip zero-weight categories
            }

            const categoryAssignments = categorized[category] || [];

            // Check if this is a future category (no assignments yet)
            if (categoryAssignments.length === 0) {
                categoryDetails[category] = {
                    average: null,
                    weight: weight,
                    contribution: 0,
                    gradedCount: 0,
                    totalCount: 0,
                    dropped: [],
                    isFuture: true
                };
                continue;
            }

            // Filter to graded assignments
            let graded = categoryAssignments.filter(a => a.isGraded && a.earnedPoints !== null);

            if (graded.length === 0) {
                // Has assignments but none graded yet
                categoryDetails[category] = {
                    average: null,
                    weight: weight,
                    contribution: 0,
                    gradedCount: 0,
                    totalCount: categoryAssignments.length,
                    dropped: [],
                    isFuture: false
                };
                continue;
            }

            // Check for best_of clobber policy for this category
            const bestOfPolicy = ClobberPolicyManager.findBestOfPolicyForCategory(
                category,
                config.clobberPolicies
            );
            let dropped = [];

            if (bestOfPolicy) {
                // Sort by percentage (highest first for best_of)
                graded.sort((a, b) => {
                    const percB = (b.earnedPoints / b.maxPoints) * 100;
                    const percA = (a.earnedPoints / a.maxPoints) * 100;
                    return percB - percA;
                });

                // Keep only top N
                const keepCount = bestOfPolicy.config.count;
                if (graded.length > keepCount) {
                    dropped = graded.slice(keepCount);
                    graded = graded.slice(0, keepCount);
                    console.log(`🏆 Best ${keepCount} of ${graded.length + dropped.length} for ${category}`);
                }
            } else {
                // Apply regular drop policy if configured
                const dropPolicy = config.dropPolicies?.[category];

                if (dropPolicy && dropPolicy.enabled && dropPolicy.count > 0) {
                    // Sort by percentage (lowest first)
                    graded.sort((a, b) => {
                        const percA = (a.earnedPoints / a.maxPoints) * 100;
                        const percB = (b.earnedPoints / b.maxPoints) * 100;
                        return percA - percB;
                    });

                    // Drop the lowest N (but keep at least 1)
                    const dropCount = Math.min(dropPolicy.count, graded.length - 1);
                    dropped = graded.slice(0, dropCount);
                    graded = graded.slice(dropCount);
                }
            }

            // Calculate category average
            const totalEarned = graded.reduce((sum, a) => sum + a.earnedPoints, 0);
            const totalPossible = graded.reduce((sum, a) => sum + a.maxPoints, 0);
            const categoryAverage = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;

            // Add to weighted sum (only for categories with grades)
            const contribution = categoryAverage * weight;
            weightedSum += contribution;
            totalWeightWithGrades += weight;

            // Track z-score clobbered assignments in this category
            const clobberedInCategory = graded.filter(a => a.zScoreClobbered).map(a => ({
                title: a.title,
                original: a.zScoreClobberInfo?.clampedScore !== undefined
                    ? (a.earnedPoints - a.zScoreClobberInfo.clampedScore + (a.zScoreClobberInfo.originalScore || 0))
                    : null,
                clobbered: a.earnedPoints,
                fromZScore: a.zScoreClobberInfo?.zScore,
                sourceTitle: a.zScoreClobberInfo?.sourceTitle
            }));

            categoryDetails[category] = {
                average: categoryAverage,
                weight: weight,
                contribution: contribution,
                gradedCount: graded.length,
                totalCount: categoryAssignments.length,
                dropped: dropped.map(a => ({
                    title: a.title,
                    percentage: ((a.earnedPoints / a.maxPoints) * 100).toFixed(1)
                })),
                clobberedAssignments: clobberedInCategory.length > 0 ? clobberedInCategory : undefined,
                isFuture: false
            };
        }

        // Calculate weighted average based on completed work
        // If totalWeightWithGrades < 1.0, we scale up (since future categories don't count yet)
        const weightedAverage = totalWeightWithGrades > 0
            ? (weightedSum / totalWeightWithGrades)
            : 0;

        return {
            weightedAverage: weightedAverage,
            categoryDetails: categoryDetails,
            totalWeightGraded: totalWeightWithGrades,
            totalWeightConfigured: Object.values(config.weights).reduce((sum, w) => sum + w, 0),
            hasAllCategories: totalWeightWithGrades >= 0.99,
            hasFutureCategories: Object.values(categoryDetails).some(d => d.isFuture),
            appliedClobberPolicies: clobberResult.appliedPolicies
        };
    }
}

// Expose to window for browser extension context
if (typeof window !== 'undefined') {
    window.GradeCalculator = GradeCalculator;
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GradeCalculator;
}
