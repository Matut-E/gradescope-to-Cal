/**
 * Grade Extractor Utilities
 * Handles grade data extraction from assignment table rows
 *
 * Extracted from contentScript.js for better maintainability
 */

class GradeExtractor {
    /**
     * Extract comprehensive grade information from assignment table row
     */
    static extractGradeDataFromRow(row, cells) {
        const gradeData = {
            isSubmitted: false,
            isGraded: false,
            earnedPoints: null,
            maxPoints: null,
            gradePercentage: null,
            submissionStatus: 'not_submitted',
            gradedAt: null,
            isLate: false
        };

        let statusCell = null;

        // Find the status/grade column
        for (let i = 1; i < cells.length && !statusCell; i++) {
            const cell = cells[i];
            const cellText = cell.textContent?.trim().toLowerCase();

            if (!cellText || cellText.includes('at ') || cellText.includes('pdt') || cellText.includes('pst')) {
                continue;
            }

            if (cellText.includes('submission') ||
                cellText.includes('submitted') ||
                cellText.includes('ungraded') ||
                cellText.includes('/') ||
                cell.querySelector('.score, .status, .submission-status')) {
                statusCell = cell;
                break;
            }
        }

        if (!statusCell) {
            return gradeData;
        }

        const statusText = statusCell.textContent?.trim() || '';
        const statusLower = statusText.toLowerCase();

        if (statusLower.includes('no submission')) {
            gradeData.submissionStatus = 'not_submitted';
            gradeData.isSubmitted = false;

            // CRITICAL FIX: Extract max points for "No Submission" assignments
            gradeData.maxPoints = this.extractMaxPointsFromRow(row, cells, statusText);

            if (gradeData.maxPoints) {
                console.log(`📝 No Submission with maxPoints: ${gradeData.maxPoints}`);
            }

        } else if (statusLower.includes('submitted')) {
            // FIX: Use .includes() instead of === to handle late submissions
            // e.g., "Submitted\n1 Hour, 2 Minutes Late"
            gradeData.submissionStatus = 'submitted';
            gradeData.isSubmitted = true;
            gradeData.isGraded = false;

            // Also try to extract max points for submitted but not graded
            gradeData.maxPoints = this.extractMaxPointsFromRow(row, cells, statusText);

            console.log(`✅ Detected submission (including late): "${statusText.substring(0, 50)}..."`);

        } else if (statusLower.includes('ungraded')) {
            // FIX: Use .includes() instead of === for consistency
            gradeData.submissionStatus = 'submitted';
            gradeData.isSubmitted = true;
            gradeData.isGraded = false;

            // Also try to extract max points for ungraded
            gradeData.maxPoints = this.extractMaxPointsFromRow(row, cells, statusText);

        } else {
            // Look for grade pattern (e.g., "87/100")
            const scoreMatch = statusText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);

            if (scoreMatch) {
                const earnedPoints = parseFloat(scoreMatch[1]);
                const maxPoints = parseFloat(scoreMatch[2]);

                gradeData.submissionStatus = 'graded';
                gradeData.isSubmitted = true;
                gradeData.isGraded = true;
                gradeData.earnedPoints = earnedPoints;
                gradeData.maxPoints = maxPoints;
                gradeData.gradePercentage = maxPoints > 0 ? (earnedPoints / maxPoints) * 100 : 0;
                gradeData.gradedAt = new Date().toISOString();

                console.log(`✅ Extracted grade: ${earnedPoints}/${maxPoints} (${gradeData.gradePercentage.toFixed(1)}%)`);
            }
        }

        // Check for late submission indicators
        const rowHTML = row.innerHTML.toLowerCase();
        if (rowHTML.includes('late') || rowHTML.includes('overdue')) {
            gradeData.isLate = true;
        }

        return gradeData;
    }

    /**
     * Extract max points from row for ungraded/unsubmitted assignments
     * Looks in: status cell, title cell, separate points column
     */
    static extractMaxPointsFromRow(row, cells, statusText) {
        // Strategy 1: Look for pattern like "No Submission (-/2.0)" or "Submitted (-/2.0)"
        const statusMatch = statusText.match(/[-–]\s*\/\s*(\d+(?:\.\d+)?)/);
        if (statusMatch) {
            const points = parseFloat(statusMatch[1]);
            console.log(`  → Found maxPoints in status: ${points}`);
            return points;
        }

        // Strategy 2: Look in assignment title for "(X pts)" or "(X points)"
        const titleCell = row.querySelector('th, td');
        if (titleCell) {
            const titleText = titleCell.textContent?.trim() || '';
            const titleMatch = titleText.match(/\((\d+(?:\.\d+)?)\s*(?:pts?|points?)\)/i);
            if (titleMatch) {
                const points = parseFloat(titleMatch[1]);
                console.log(`  → Found maxPoints in title: ${points}`);
                return points;
            }
        }

        // Strategy 3: Look for a dedicated "Points" column
        for (const cell of cells) {
            const cellText = cell.textContent?.trim() || '';
            // Match standalone numbers that might be max points (e.g., "2", "10.0")
            if (/^\d+(?:\.\d+)?$/.test(cellText)) {
                const points = parseFloat(cellText);
                // Reasonable range for assignment points (0.5 to 500)
                if (points >= 0.5 && points <= 500) {
                    console.log(`  → Found maxPoints in column: ${points}`);
                    return points;
                }
            }
        }

        // Strategy 4: Look in row HTML for data attributes
        const rowHTML = row.innerHTML;
        const dataMatch = rowHTML.match(/data-max-?points?=["'](\d+(?:\.\d+)?)["']/i);
        if (dataMatch) {
            const points = parseFloat(dataMatch[1]);
            console.log(`  → Found maxPoints in data attribute: ${points}`);
            return points;
        }

        console.log(`  ⚠️ Could not extract maxPoints from row`);
        return null;
    }

    /**
     * Calculate basic grade statistics
     */
    static calculateGradeStatistics(assignments) {
        const gradedAssignments = assignments.filter(a => a.isGraded && a.earnedPoints !== null);

        if (gradedAssignments.length === 0) {
            return {
                hasGrades: false,
                averagePercentage: null,
                totalPoints: null,
                earnedPoints: null,
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
     * Calculate enhanced grade statistics with categorization
     * Requires AssignmentCategorizer to be available
     */
    static calculateEnhancedGradeStatistics(assignments) {
        const basicStats = this.calculateGradeStatistics(assignments);

        if (assignments.length === 0) {
            return {
                ...basicStats,
                categories: {},
                categoryStats: {},
                categorization: {
                    total: 0,
                    highConfidence: 0,
                    needsReview: []
                }
            };
        }

        // Run batch categorization (requires AssignmentCategorizer)
        const categorizationResult = AssignmentCategorizer.categorizeAssignments(assignments);

        // Calculate category-specific grade stats
        const categoryStats = {};
        Object.entries(categorizationResult.categories).forEach(([category, categoryAssignments]) => {
            const gradedInCategory = categoryAssignments.filter(a => a.isGraded && a.earnedPoints !== null);

            if (gradedInCategory.length > 0) {
                const totalEarned = gradedInCategory.reduce((sum, a) => sum + a.earnedPoints, 0);
                const totalPossible = gradedInCategory.reduce((sum, a) => sum + a.maxPoints, 0);

                categoryStats[category] = {
                    name: AssignmentCategorizer.getCategoryInfo(category).name,
                    icon: AssignmentCategorizer.getCategoryInfo(category).icon,
                    averagePercentage: totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0,
                    totalPoints: totalPossible,
                    earnedPoints: totalEarned,
                    gradedCount: gradedInCategory.length,
                    totalCount: categoryAssignments.length,
                    assignments: categoryAssignments.map(a => ({
                        title: a.title,
                        earnedPoints: a.earnedPoints,
                        maxPoints: a.maxPoints,
                        isGraded: a.isGraded,
                        confidence: a.categoryConfidence || 0
                    }))
                };
            }
        });

        return {
            ...basicStats,
            categories: categorizationResult.categories,
            categoryStats,
            categorization: {
                total: categorizationResult.stats.total,
                categorized: categorizationResult.stats.categorized,
                highConfidence: categorizationResult.stats.highConfidence,
                mediumConfidence: categorizationResult.stats.mediumConfidence,
                lowConfidence: categorizationResult.stats.lowConfidence,
                averageConfidence: categorizationResult.confidence.average,
                needsReview: categorizationResult.needsReview,
                suggestedWeights: categorizationResult.suggestedWeights
            }
        };
    }

    /**
     * Filter assignments for calendar sync (only upcoming, non-submitted)
     */
    static filterForCalendarSync(assignments) {
        console.log(`🗓️ Filtering ${assignments.length} assignments for calendar sync...`);

        const now = new Date();
        const calendarAssignments = [];

        assignments.forEach(assignment => {
            // Skip if no due date
            if (!assignment.dueDate) {
                console.log(`⚠️ Skipping ${assignment.title} (no due date)`);
                return;
            }

            // Skip if already submitted
            if (assignment.isSubmitted) {
                console.log(`📝 Skipping ${assignment.title} (already submitted)`);
                return;
            }

            const dueDate = new Date(assignment.dueDate);
            const daysDifference = (dueDate - now) / (1000 * 60 * 60 * 24);

            // Only include upcoming assignments
            if (daysDifference > 0) {
                calendarAssignments.push(assignment);
                console.log(`📅 Including for calendar: ${assignment.title} (due in ${Math.ceil(daysDifference)} days)`);
            } else {
                console.log(`🗂️ Skipping ${assignment.title} (${Math.abs(Math.floor(daysDifference))} days overdue)`);
            }
        });

        console.log(`🗓️ Calendar sync: ${calendarAssignments.length}/${assignments.length} assignments`);
        return calendarAssignments;
    }

    /**
     * Check for duplicate assignments to avoid calendar duplication
     */
    static async checkExistingAssignments(newAssignments) {
        try {
            const storage = await browser.storage.local.get();
            const existingIds = new Set();

            Object.keys(storage).forEach(key => {
                if (key.startsWith('assignments_') && storage[key].assignments) {
                    storage[key].assignments.forEach(assignment => {
                        if (assignment.assignmentId) {
                            existingIds.add(assignment.assignmentId);
                        }
                    });
                }
            });

            const uniqueAssignments = newAssignments.filter(assignment => {
                const isUnique = !existingIds.has(assignment.assignmentId);
                if (!isUnique) {
                    console.log(`🔄 Skipping duplicate: ${assignment.title} (ID: ${assignment.assignmentId})`);
                }
                return isUnique;
            });

            console.log(`🔍 Deduplication: ${newAssignments.length} total → ${uniqueAssignments.length} unique`);
            return uniqueAssignments;

        } catch (error) {
            console.log('⚠️ Error checking existing assignments, proceeding with all:', error);
            return newAssignments;
        }
    }
}

// Expose to window for contentScript usage
if (typeof window !== 'undefined') {
    window.GradeExtractor = GradeExtractor;
}
