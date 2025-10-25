/**
 * Grade Extractor Stub - Public Version
 * Minimal implementation for assignment parsing (no grade calculation)
 */

class GradeExtractor {
    /**
     * Extract submission status and basic grade data from a table row
     * Minimal version for calendar sync - detects submission status but no grade calculation
     * @param {HTMLElement} row - The table row element
     * @param {NodeList} cells - The cells in the row
     * @returns {Object} Basic grade data with submission status
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

            // Skip cells that look like dates
            if (!cellText || cellText.includes('at ') || cellText.includes('pdt') || cellText.includes('pst')) {
                continue;
            }

            // Look for status indicators or grades
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

        // Detect submission status
        if (statusLower.includes('no submission')) {
            gradeData.submissionStatus = 'not_submitted';
            gradeData.isSubmitted = false;

        } else if (statusLower === 'submitted') {
            gradeData.submissionStatus = 'submitted';
            gradeData.isSubmitted = true;
            gradeData.isGraded = false;

        } else if (statusLower === 'ungraded') {
            gradeData.submissionStatus = 'submitted';
            gradeData.isSubmitted = true;
            gradeData.isGraded = false;

        } else {
            // Look for grade pattern (e.g., "87/100")
            const scoreMatch = statusText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);

            if (scoreMatch) {
                // Assignment has a grade, so it was submitted
                gradeData.submissionStatus = 'graded';
                gradeData.isSubmitted = true;
                gradeData.isGraded = true;
                // Note: Not extracting point values for public version (calendar sync only)
            }
        }

        // Check for late submission indicators (use textContent instead of innerHTML for safety)
        const rowText = row.textContent.toLowerCase();
        if (rowText.includes('late') || rowText.includes('overdue')) {
            gradeData.isLate = true;
        }

        return gradeData;
    }

    /**
     * Check for existing assignments (deduplication)
     * @param {Array} assignments - Array of assignments to check
     * @returns {Promise<Array>} Filtered assignments
     */
    static async checkExistingAssignments(assignments) {
        try {
            const storage = await browser.storage.local.get(null);
            const existingIds = new Set();

            for (const [key, value] of Object.entries(storage)) {
                if (key.startsWith('assignments_') && value.assignments) {
                    value.assignments.forEach(a => {
                        if (a.id) existingIds.add(a.id);
                    });
                }
            }

            const newAssignments = assignments.filter(a => !existingIds.has(a.id));
            return newAssignments;
        } catch (error) {
            console.error('Error checking existing assignments:', error);
            return assignments;
        }
    }

    /**
     * Calculate basic statistics (no grade calculation)
     * @param {Array} assignments - Array of assignments
     * @returns {Object} Basic statistics
     */
    static calculateEnhancedGradeStatistics(assignments) {
        return {
            hasGrades: false,
            averagePercentage: 0,
            totalCount: assignments.length,
            gradedCount: 0,
            categoryStats: {}
        };
    }

    /**
     * Filter assignments for calendar sync (upcoming, non-submitted assignments only)
     * @param {Array} assignments - Array of assignments
     * @returns {Array} Filtered assignments suitable for calendar sync
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

            try {
                const dueDate = new Date(assignment.dueDate);

                // Check if date is valid
                if (isNaN(dueDate.getTime())) {
                    console.log(`⚠️ Skipping ${assignment.title} (invalid due date)`);
                    return;
                }

                const daysDifference = (dueDate - now) / (1000 * 60 * 60 * 24);

                // Only include upcoming assignments
                if (daysDifference > 0) {
                    calendarAssignments.push(assignment);
                    console.log(`📅 Including for calendar: ${assignment.title} (due in ${Math.ceil(daysDifference)} days)`);
                } else {
                    console.log(`🗂️ Skipping ${assignment.title} (${Math.abs(Math.floor(daysDifference))} days overdue)`);
                }
            } catch (error) {
                console.error(`❌ Error parsing due date for ${assignment.title}:`, assignment.dueDate, error);
            }
        });

        console.log(`🗓️ Calendar sync: ${calendarAssignments.length}/${assignments.length} assignments`);
        return calendarAssignments;
    }
}

// Expose to window for browser extension context
if (typeof window !== 'undefined') {
    window.GradeExtractor = GradeExtractor;
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GradeExtractor;
}
