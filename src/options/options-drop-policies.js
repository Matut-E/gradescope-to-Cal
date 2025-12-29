/**
 * Drop Policy Management Module
 * Handles drop policy UI population, toggles, count changes, and validation
 *
 * Extracted from options.js.backup (lines 1763-2135, 2291-2301)
 */

class OptionsDropPolicies {
    /**
     * Populate drop policy toggles - UPDATED to include future categories
     *
     * @param {Object} categories - Category information (name, icon, count)
     * @param {Object} dropPolicies - Drop policy configurations per category
     * @param {Object} weights - Category weights (to detect future categories)
     */
    static populateDropPolicies(categories, dropPolicies, weights = {}) {
        const container = document.getElementById('dropPoliciesContainer');
        container.innerHTML = '';

        // Combine existing categories with future categories from weights
        const allCategories = new Map();

        // Add existing categories (from assignments)
        Object.entries(categories).forEach(([category, info]) => {
            allCategories.set(category, { ...info, isFuture: false });
        });

        // Add future categories from weights (categories with no assignments yet)
        if (weights) {
            Object.keys(weights).forEach(category => {
                if (!allCategories.has(category)) {
                    // This is a future category
                    const categoryInfo = CourseConfigManager.getCategoryInfo(category);
                    allCategories.set(category, {
                        name: categoryInfo.name,
                        icon: categoryInfo.icon,
                        count: 0, // No assignments yet
                        isFuture: true
                    });
                }
            });
        }

        // Sort categories for consistent display
        const sortedCategories = Array.from(allCategories.entries()).sort((a, b) => {
            const order = ['homework', 'lab', 'quiz', 'project', 'midterm', 'final', 'participation'];
            const aIndex = order.indexOf(a[0]);
            const bIndex = order.indexOf(b[0]);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a[0].localeCompare(b[0]);
        });

        // Render each category
        sortedCategories.forEach(([category, info]) => {
            const policy = dropPolicies[category] || { enabled: false, count: 1 };
            const maxDropCount = info.count > 0 ? info.count - 1 : 99; // If no assignments, allow high max

            const row = document.createElement('div');
            row.className = 'drop-policy-row' + (info.isFuture ? ' future-category' : '');
            row.dataset.category = category;

            row.innerHTML = `
                <div class="category-info">
                    <span class="category-icon">${info.icon}</span>
                    <div class="category-name">
                        ${this.getCategoryDisplayName(category)}
                        ${info.isFuture ? '<span style="font-size: 11px; color: #666; font-style: italic;"> (future - no assignments yet)</span>' : ''}
                    </div>
                </div>
                <div class="drop-policy-controls">
                    <label>
                        <input type="checkbox"
                               class="drop-enabled"
                               data-category="${category}"
                               ${policy.enabled ? 'checked' : ''}>
                        Drop lowest
                    </label>
                    <input type="number"
                           class="drop-count"
                           data-category="${category}"
                           value="${policy.count}"
                           min="0"
                           max="${maxDropCount}"
                           ${!policy.enabled ? 'disabled' : ''}
                           style="width: 50px;"
                           placeholder="1">
                    <span>assignments</span>
                </div>
            `;

            container.appendChild(row);
        });

        // Add event listeners
        document.querySelectorAll('.drop-enabled').forEach(checkbox => {
            checkbox.addEventListener('change', this.handleDropPolicyToggle);
        });

        document.querySelectorAll('.drop-count').forEach(input => {
            input.addEventListener('blur', this.handleDropCountChange);
        });
    }

    /**
     * Handle drop policy toggle
     * Enables/disables the drop count input when checkbox is toggled
     *
     * @param {Event} event - Change event from checkbox
     */
    static handleDropPolicyToggle(event) {
        const category = event.target.dataset.category;
        const row = event.target.closest('.drop-policy-row');
        const countInput = row.querySelector('.drop-count');

        countInput.disabled = !event.target.checked;
    }

    /**
     * Handle drop count change
     * Validates only when user finishes editing (on blur)
     * Ensures count is at least 1
     *
     * @param {Event} event - Blur event from input
     */
    static handleDropCountChange(event) {
        // Allow empty during editing, but ensure valid number when done
        const value = parseInt(event.target.value);
        if (isNaN(value) || value < 1 || event.target.value === '') {
            event.target.value = 1;
        }
    }

    /**
     * Collect drop policies from UI
     * Used when saving configuration
     *
     * @returns {Object} Drop policies per category { category: { enabled, count } }
     */
    static collectDropPoliciesFromUI() {
        const dropPolicies = {};

        document.querySelectorAll('.drop-enabled').forEach(checkbox => {
            const category = checkbox.dataset.category;
            const enabled = checkbox.checked;
            const row = checkbox.closest('.drop-policy-row');
            const count = parseInt(row?.querySelector('.drop-count')?.value) || 1;

            dropPolicies[category] = {
                enabled: enabled,
                count: count
            };
        });

        return dropPolicies;
    }

    /**
     * Get display name for category
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

// Export for browser environment
if (typeof window !== 'undefined') {
    window.OptionsDropPolicies = OptionsDropPolicies;
}
