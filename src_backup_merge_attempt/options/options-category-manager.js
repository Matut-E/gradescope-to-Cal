/**
 * Options Category Manager Module
 *
 * Handles manual category override functionality for assignment review.
 * Allows users to review and manually categorize assignments with low confidence
 * or no automatic categorization.
 *
 * Extracted from options.js.backup (lines 1857-1941, 2140-2168, 2406-2435)
 */

class OptionsCategoryManager {
    /**
     * Populate assignment review list - ENHANCED WITH EXCLUSION TOGGLE
     *
     * Displays all assignments with:
     * - Category override dropdown
     * - Inclusion/exclusion toggle button
     *
     * @param {Array} assignments - All assignments from the course
     * @param {Object} manualOverrides - Map of assignmentId -> category overrides
     * @param {Array} excludedAssignments - Array of excluded assignment IDs
     */
    static populateAssignmentReview(assignments, manualOverrides, excludedAssignments = []) {
        const container = document.getElementById('assignmentReviewList');
        const reviewCount = document.getElementById('reviewCount');
        const assignmentCount = document.getElementById('assignmentCount');
        const excludedCount = document.getElementById('excludedCount');

        // Ensure parameters are proper types
        const overrides = manualOverrides || {};
        const excluded = excludedAssignments || [];

        // Update counts
        assignmentCount.textContent = assignments.length;
        excludedCount.textContent = excluded.length;

        // Find assignments needing category review (low confidence OR not yet categorized)
        const needsReview = assignments.filter(a => {
            const hasCategory = a.category && a.category !== 'other';
            const confidence = a.categoryConfidence || 0;
            return !hasCategory || confidence < 0.6 || overrides[a.assignmentId];
        });

        reviewCount.textContent = needsReview.length;

        if (assignments.length === 0) {
            container.innerHTML = `
                <div class="no-review-needed">
                    No assignments found for this course.
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        // Display ALL assignments (not just needsReview)
        assignments.forEach(assignment => {
            const item = document.createElement('div');
            item.className = 'review-item';
            item.dataset.assignmentId = assignment.assignmentId;

            // Get current category from manual override OR original categorization
            const currentCategory = overrides[assignment.assignmentId] || assignment.category || 'other';
            const confidence = ((assignment.categoryConfidence || 0) * 100).toFixed(0);
            const isExcluded = excluded.includes(assignment.assignmentId);

            // Check if assignment is past due
            const now = new Date();
            const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
            const isPastDue = dueDate && dueDate < now;
            const hasGrade = assignment.isGraded || assignment.isSubmitted;

            // Determine button state and text
            let buttonClass, buttonText, buttonTitle;
            if (isExcluded) {
                buttonClass = 'inclusion-toggle-btn excluded';
                buttonText = '❌ Excluded';
                buttonTitle = 'Click to include in grade calculation';
            } else if (!hasGrade && isPastDue) {
                buttonClass = 'inclusion-toggle-btn zero-grade';
                buttonText = '⚠️ (counts as 0)';
                buttonTitle = 'No submission on past-due assignment - counts as 0 points. Click to exclude.';
            } else {
                buttonClass = 'inclusion-toggle-btn included';
                buttonText = '✅ Included';
                buttonTitle = 'Click to exclude from grade calculation';
            }

            item.innerHTML = `
                <div style="display: grid; grid-template-columns: 2fr 2fr 1fr; gap: 15px; align-items: center;">
                    <div>
                        <div class="assignment-title">${assignment.title}</div>
                        <div class="confidence-info" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                            ${OptionsCategoryManager.getCategoryDisplayName(currentCategory)} (${confidence}% confidence)
                        </div>
                    </div>
                    <div class="category-selector">
                        <select class="category-override" data-assignment-id="${assignment.assignmentId}" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
                            <option value="">-- Auto --</option>
                            <option value="homework" ${currentCategory === 'homework' ? 'selected' : ''}>📝 Homework</option>
                            <option value="lab" ${currentCategory === 'lab' ? 'selected' : ''}>🔬 Labs</option>
                            <option value="midterm" ${currentCategory === 'midterm' ? 'selected' : ''}>📊 Midterms</option>
                            <option value="final" ${currentCategory === 'final' ? 'selected' : ''}>🎓 Final Exam</option>
                            <option value="project" ${currentCategory === 'project' ? 'selected' : ''}>🚀 Projects</option>
                            <option value="quiz" ${currentCategory === 'quiz' ? 'selected' : ''}>❓ Quizzes</option>
                            <option value="participation" ${currentCategory === 'participation' ? 'selected' : ''}>👥 Participation</option>
                            <option value="other" ${currentCategory === 'other' ? 'selected' : ''}>❓ Other</option>
                        </select>
                    </div>
                    <div style="text-align: center;">
                        <button class="${buttonClass}" data-assignment-id="${assignment.assignmentId}" title="${buttonTitle}">
                            ${buttonText}
                        </button>
                    </div>
                </div>
            `;

            container.appendChild(item);
        });

        // Add event listeners for category overrides
        document.querySelectorAll('.category-override').forEach(select => {
            select.addEventListener('change', OptionsCategoryManager.handleCategoryOverride);
        });

        // Add event listeners for inclusion toggles
        document.querySelectorAll('.inclusion-toggle-btn').forEach(button => {
            button.addEventListener('click', OptionsCategoryManager.handleInclusionToggle);
        });
    }

    /**
     * Handle category override selection - FIXED VERSION
     *
     * Called when user changes the category dropdown for an assignment.
     * Saves the manual override and reloads the course configuration UI.
     *
     * @param {Event} event - Change event from category select dropdown
     *
     * Dependencies:
     * - currentConfigCourse (global variable from options.js)
     * - CourseConfigManager.getCourseConfig()
     * - CourseConfigManager.saveCourseConfig()
     * - CourseConfigManager.updateCategoryOverride()
     * - loadCourseForConfiguration() (global function from options.js)
     */
    static async handleCategoryOverride(event) {
        const assignmentId = event.target.dataset.assignmentId;
        const newCategory = event.target.value;

        if (!window.currentConfigCourse) {
            console.error('No course selected');
            return;
        }

        console.log(`📝 Manual override: Assignment ${assignmentId} → ${newCategory || '(keep current)'}`);

        // If empty string, remove the override
        if (!newCategory) {
            // Get current config and remove this override
            const config = await window.CourseConfigManager.getCourseConfig(window.currentConfigCourse);
            if (config.manualOverrides) {
                delete config.manualOverrides[assignmentId];
                await window.CourseConfigManager.saveCourseConfig(window.currentConfigCourse, config, true);
            }
        } else {
            // Save the override
            await window.CourseConfigManager.updateCategoryOverride(window.currentConfigCourse, assignmentId, newCategory);
        }

        // Immediately reload the UI to show the change
        await window.loadCourseForConfiguration(window.currentConfigCourse);

        console.log(`✅ Category override saved and UI refreshed`);
    }

    /**
     * Handle inclusion/exclusion toggle
     *
     * Toggles whether an assignment is included or excluded from grade calculation.
     *
     * @param {Event} event - Click event from toggle button
     */
    static async handleInclusionToggle(event) {
        const assignmentId = event.target.dataset.assignmentId;

        if (!window.currentConfigCourse) {
            console.error('No course selected');
            return;
        }

        console.log(`🔄 Toggling inclusion for assignment ${assignmentId}`);

        try {
            // Toggle the exclusion state
            const newState = await window.CourseConfigManager.toggleAssignmentExclusion(
                window.currentConfigCourse,
                assignmentId
            );

            console.log(`✅ Assignment ${assignmentId} is now ${newState ? 'EXCLUDED' : 'INCLUDED'}`);

            // Reload the UI to show the change
            await window.loadCourseForConfiguration(window.currentConfigCourse);
        } catch (error) {
            console.error('Error toggling assignment inclusion:', error);
            alert('Failed to toggle assignment inclusion. Please try again.');
        }
    }

    /**
     * Get display name for category
     *
     * Converts internal category keys to human-readable display names.
     *
     * @param {string} category - Category key (e.g., 'homework', 'lab')
     * @returns {string} Display name (e.g., 'Homework', 'Labs')
     */
    static getCategoryDisplayName(category) {
        const names = {
            homework: 'Homework',
            lab: 'Labs',
            midterm: 'Midterms',
            final: 'Final Exam',
            project: 'Projects',
            quiz: 'Quizzes',
            participation: 'Participation',
            other: 'Other'
        };
        return names[category] || 'Other';
    }

    /**
     * Get emoji icon for category
     *
     * Returns the emoji icon associated with each category type.
     *
     * @param {string} category - Category key (e.g., 'homework', 'lab')
     * @returns {string} Emoji icon (e.g., '📝', '🔬')
     */
    static getCategoryIcon(category) {
        const icons = {
            homework: '📝',
            lab: '🔬',
            midterm: '📊',
            final: '🎓',
            project: '🚀',
            quiz: '❓',
            participation: '👥',
            other: '❓'
        };
        return icons[category] || '❓';
    }
}

// Export to window for HTML script tag loading
if (typeof window !== 'undefined') {
    window.OptionsCategoryManager = OptionsCategoryManager;
}
