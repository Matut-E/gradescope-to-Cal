/**
 * options-ui-builders.js
 * UI Building and DOM Creation Functions
 *
 * This module contains all functions that create, build, and render UI elements
 * for the options page. Extracted from options.js (lines ~227-2435).
 *
 * Dependencies:
 * - CourseConfigManager (global)
 * - currentCourseData (global from options.js)
 * - currentConfigCourse (global from options.js)
 */

class OptionsUIBuilders {
    // =============================================================================
    // COURSE ITEM BUILDERS
    // =============================================================================

    /**
     * Create a course item for the sidebar
     * @param {string} courseName - Name of the course
     * @param {Object} courseInfo - Course information
     * @param {boolean} isConfigured - Whether course is configured
     * @param {string} gradeDisplay - Grade display text
     * @returns {HTMLElement} Course item element
     */
    static createCourseItem(courseName, courseInfo, isConfigured, gradeDisplay) {
        const item = document.createElement('div');
        item.className = 'course-item';
        if (isConfigured) {
            item.classList.add('configured');
        }
        item.dataset.courseId = courseName;

        // Status icon
        const statusIcon = document.createElement('div');
        statusIcon.className = 'course-status-icon';
        if (isConfigured) {
            statusIcon.textContent = '✓';
            statusIcon.setAttribute('aria-label', 'Configured');
        } else {
            statusIcon.textContent = '○';
            statusIcon.setAttribute('aria-label', 'Not configured');
        }

        // Course info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'course-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'course-name';
        nameDiv.textContent = courseName;

        const metaDiv = document.createElement('div');
        if (gradeDisplay) {
            metaDiv.className = 'course-grade';
            metaDiv.textContent = gradeDisplay;
        } else {
            metaDiv.className = 'course-meta';
            metaDiv.textContent = 'Configure →';
        }

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(metaDiv);

        item.appendChild(statusIcon);
        item.appendChild(infoDiv);

        // Click handler
        item.addEventListener('click', () => {
            if (window.CourseConfigUI && window.CourseConfigUI.selectCourse) {
                window.CourseConfigUI.selectCourse(courseName);
            }
        });

        return item;
    }

    // =============================================================================
    // TEMPLATE SUGGESTION UI
    // =============================================================================

    /**
     * Show Berkeley template suggestion
     * @param {Object} template - Template object with name, weights, notes
     */
    static showTemplateSuggestion(template) {
        const templateSuggestion = document.getElementById('templateSuggestion');
        const templateDescription = document.getElementById('templateDescription');

        const weightStr = Object.entries(template.weights)
            .map(([cat, weight]) => `${cat}: ${(weight * 100).toFixed(0)}%`)
            .join(', ');

        templateDescription.innerHTML = `
            <strong>${template.name}</strong><br>
            Suggested weights: ${weightStr}<br>
            <small>${template.notes}</small>
        `;

        templateSuggestion.style.display = 'block';
    }

    /**
     * Hide template suggestion
     */
    static hideTemplateSuggestion() {
        const templateSuggestion = document.getElementById('templateSuggestion');
        templateSuggestion.style.display = 'none';
    }

    // =============================================================================
    // WEIGHT INPUT ROW BUILDERS
    // =============================================================================

    /**
     * Render a single weight input row
     * @param {string} category - Category name
     * @param {number} count - Number of assignments in category
     * @param {Object} weights - Current weights configuration
     * @param {boolean} isFuture - Whether this is a future category
     */
    static renderWeightInputRow(category, count, weights, isFuture) {
        const container = document.getElementById('weightInputsContainer');
        const row = document.createElement('div');
        row.className = 'weight-input-row' + (isFuture ? ' future-category' : '');
        row.dataset.category = category;

        // Get current mode and calculate display value
        const config = window.currentCourseData?.config || {};
        const isPoints = config.system === 'points';
        const totalPoints = config.totalPoints || 100;

        // Convert stored fraction to display value
        let displayValue;
        if (weights && weights[category]) {
            if (isPoints) {
                // For points: multiply fraction by total points
                displayValue = (weights[category] * totalPoints).toFixed(0);
            } else {
                // For percentage: multiply fraction by 100
                displayValue = (weights[category] * 100).toFixed(0);
            }
        } else {
            displayValue = '0';
        }

        const unit = isPoints ? 'pts' : '%';
        const maxValue = isPoints ? totalPoints : 100;

        const categoryInfo = window.CourseConfigManager.getCategoryInfo(category);
        const icon = categoryInfo.icon;
        const displayName = categoryInfo.name;
        const countText = isFuture ? 'Not yet posted' : `${count} assignment${count !== 1 ? 's' : ''}`;

        row.innerHTML = `
            <div class="category-info">
                <span class="category-icon">${icon}</span>
                <div>
                    <div class="category-name">${displayName}</div>
                    <div class="category-count">${countText}</div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 5px;">
                <input type="number"
                       class="weight-input"
                       data-category="${category}"
                       value="${displayValue}"
                       min="0"
                       max="${maxValue}"
                       step="1">
                <span class="weight-symbol" style="margin-left: 5px; font-weight: bold;">${unit}</span>
                ${isFuture ? `<button class="remove-category-btn" data-category="${category}" title="Remove this future category">✕</button>` : ''}
            </div>
        `;

        container.appendChild(row);
    }

    /**
     * Render a category group as a weight input row
     * Groups appear inline with individual categories in the weights section
     * @param {string} groupName - Name of the group
     * @param {Object} groupConfig - Group configuration
     * @param {Array} assignments - All assignments
     */
    static renderGroupWeightInputRow(groupName, groupConfig, assignments) {
        console.log('🎨 renderGroupWeightInputRow called for:', groupName, groupConfig);
        const container = document.getElementById('weightInputsContainer');
        if (!container) {
            console.error('❌ weightInputsContainer not found!');
            return;
        }
        const row = document.createElement('div');
        row.className = 'weight-input-row category-group';
        row.dataset.isGroup = 'true';
        row.dataset.groupName = groupName;

        // Get current mode and calculate display value
        const config = window.currentCourseData?.config || {};
        const isPoints = config.system === 'points';
        const totalPoints = config.totalPoints || 100;

        // Convert stored fraction to display value
        let displayValue;
        if (isPoints) {
            displayValue = (groupConfig.totalWeight * totalPoints).toFixed(0);
        } else {
            displayValue = (groupConfig.totalWeight * 100).toFixed(0);
        }

        const unit = isPoints ? 'pts' : '%';
        const maxValue = isPoints ? totalPoints : 100;
        console.log('📊 Group weight:', displayValue, unit);

        // Build description of included categories with counts
        const categoryDescriptions = groupConfig.categories.map(cat => {
            const categoryInfo = window.CourseConfigManager.getCategoryInfo(cat);
            const count = assignments.filter(a => a.category === cat).length;
            if (count === 0) {
                return `${categoryInfo.name} (future)`;
            }
            return `${categoryInfo.name} (${count})`;
        });

        const includesText = categoryDescriptions.join(', ');
        const distributionText = groupConfig.distributionMethod === 'proportional'
            ? 'proportional distribution'
            : 'equal distribution';

        row.innerHTML = `
            <div class="category-info">
                <span class="category-icon">📦</span>
                <div>
                    <div class="category-name">${groupName}</div>
                    <div class="category-count" style="font-size: 11px;">
                        ${includesText}
                        <span style="opacity: 0.7; margin-left: 4px;">(${distributionText})</span>
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="number"
                       class="weight-input group-weight-input"
                       data-is-group="true"
                       data-group-name="${groupName}"
                       value="${displayValue}"
                       min="0"
                       max="${maxValue}"
                       step="1">
                <span class="weight-symbol" style="margin-left: 5px; font-weight: bold;">${unit}</span>
                <button class="remove-group-btn"
                        data-group-name="${groupName}"
                        title="Delete this group"
                        style="padding: 4px 8px; font-size: 11px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer; margin-left: 4px;">
                    ✕
                </button>
            </div>
        `;

        container.appendChild(row);
        console.log('✅ Group row appended to container:', groupName);
    }

    // =============================================================================
    // CATEGORY ADDER UI
    // =============================================================================

    /**
     * Add section for adding new future categories
     * @param {HTMLElement} container - Container element
     * @param {Array} allCategories - All possible categories
     * @param {Object} currentWeights - Current weights configuration
     */
    static addCategoryAdder(container, allCategories, currentWeights) {
        const addSection = document.createElement('div');
        addSection.className = 'add-category-section';
        addSection.style.marginTop = '20px';

        // Find categories that aren't shown yet
        const shownCategories = new Set(
            Array.from(container.querySelectorAll('.weight-input-row')).map(row => row.dataset.category)
        );

        const availableCategories = allCategories.filter(cat =>
            !shownCategories.has(cat) && cat !== 'other'
        );

        if (availableCategories.length === 0) {
            return; // No categories to add
        }

        addSection.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: 600; color: #495057;">
                ➕ Add Future Category
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <select id="newCategorySelect" style="padding: 6px; border-radius: 4px; border: 1px solid #dee2e6; flex: 1;">
                    <option value="">-- Select category from syllabus --</option>
                    ${availableCategories.map(cat => {
            const info = window.CourseConfigManager.getCategoryInfo(cat);
            return `<option value="${cat}">${info.icon} ${info.name}</option>`;
        }).join('')}
                </select>
                <button id="addCategoryBtn" class="button secondary" style="padding: 6px 12px; font-size: 13px;">
                    Add Category
                </button>
            </div>
            <div style="font-size: 12px; color: #666; margin-top: 8px;">
                Add categories for assignments that will be posted later (e.g., midterms, finals)
            </div>
        `;

        container.appendChild(addSection);

        // Add event listener (requires handleAddCategory to be in global scope)
        document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
            if (window.handleAddCategory) {
                window.handleAddCategory();
            }
        });
    }

    // =============================================================================
    // CLOBBER POLICY UI BUILDERS
    // =============================================================================

    /**
     * Create a clobber policy display item
     * @param {string} policyName - Name of the policy
     * @param {Object} policy - Policy configuration
     * @returns {HTMLElement} Policy item element
     */
    static createClobberPolicyItem(policyName, policy) {
        const item = document.createElement('div');
        item.className = 'clobber-policy-item';

        const policyDescription = this.generatePolicyDescription(policy);
        const enabledClass = policy.enabled ? '' : ' style="opacity: 0.6;"';
        const enabledLabel = policy.enabled ? '✅ Enabled' : '❌ Disabled';

        item.innerHTML = `
            <div class="clobber-policy-header">
                <div>
                    <div class="clobber-policy-name">🔄 ${policyName}</div>
                    <div class="clobber-policy-description"${enabledClass}>${policyDescription}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button class="toggle-policy-btn" data-policy-name="${policyName}">${enabledLabel}</button>
                    <button class="delete-policy-btn" data-policy-name="${policyName}">Delete</button>
                </div>
            </div>
        `;

        // Add event handlers (requires handlers to be in global scope)
        item.querySelector('.toggle-policy-btn').addEventListener('click', () => {
            if (window.handleToggleClobberPolicy) {
                window.handleToggleClobberPolicy(policyName);
            }
        });
        item.querySelector('.delete-policy-btn').addEventListener('click', () => {
            if (window.handleDeleteClobberPolicy) {
                window.handleDeleteClobberPolicy(policyName);
            }
        });

        return item;
    }

    /**
     * Generate human-readable description for a clobber policy
     * @param {Object} policy - Policy configuration
     * @returns {string} Human-readable description
     */
    static generatePolicyDescription(policy) {
        const sourceInfo = window.CourseConfigManager.getCategoryInfo(policy.sourceCategory);

        if (policy.type === 'redistribute') {
            const conditionText = policy.config.condition === 'no_submissions'
                ? 'no submissions'
                : 'no grades';
            const targetNames = policy.config.targetCategories.map(cat =>
                window.CourseConfigManager.getCategoryInfo(cat).name
            ).join(', ');
            return `If ${sourceInfo.name} has ${conditionText}, redistribute weight to: ${targetNames}`;
        } else if (policy.type === 'best_of') {
            return `Count only best ${policy.config.count} of ${sourceInfo.name} assignments`;
        } else if (policy.type === 'require_one') {
            const targetNames = policy.config.targetCategories.map(cat =>
                window.CourseConfigManager.getCategoryInfo(cat).name
            ).join(', ');
            return `If no ${sourceInfo.name} submitted, redistribute to: ${targetNames}`;
        }

        return 'Unknown policy type';
    }

    /**
     * Populate target category checkboxes
     * @param {string} containerId - ID of container element
     */
    static populateTargetCheckboxes(containerId) {
        const container = document.getElementById(containerId);
        if (!container || !window.currentCourseData) return;

        // Get all categories
        const allCategories = window.CourseConfigManager.getAllPossibleCategories(
            window.currentCourseData.assignments,
            window.CourseConfigManager.suggestTemplate(window.currentCourseData.courseName)
        );

        container.innerHTML = '';

        allCategories.forEach(category => {
            if (category === 'other') return; // Skip 'other'

            const categoryInfo = window.CourseConfigManager.getCategoryInfo(category);
            const label = document.createElement('label');
            label.innerHTML = `
                <input type="checkbox" value="${category}">
                <span>${categoryInfo.icon} ${categoryInfo.name}</span>
            `;
            container.appendChild(label);
        });
    }

    // =============================================================================
    // CATEGORY GROUP UI BUILDERS
    // =============================================================================

    /**
     * Create a category group display item
     * @param {string} groupName - Name of the group
     * @param {Object} groupConfig - Group configuration
     * @returns {HTMLElement} Group item element
     */
    static createCategoryGroupItem(groupName, groupConfig) {
        const item = document.createElement('div');
        item.className = 'category-group-item';

        const categoriesHTML = groupConfig.categories.map(cat => {
            const info = window.CourseConfigManager.getCategoryInfo(cat);
            return `<span class="category-group-tag">${info.icon} ${info.name}</span>`;
        }).join('');

        const distributionText = groupConfig.distributionMethod === 'proportional'
            ? 'proportional to assignment count'
            : 'split equally';

        item.innerHTML = `
            <div class="category-group-header">
                <div>
                    <div class="category-group-name">📦 ${groupName}</div>
                    <div style="font-size: 11px; color: #666; margin-top: 2px;">
                        ${distributionText}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="category-group-weight">${(groupConfig.totalWeight * 100).toFixed(0)}%</span>
                    <button class="delete-group-btn" data-group-name="${groupName}">Delete</button>
                </div>
            </div>
            <div class="category-group-categories">
                ${categoriesHTML}
            </div>
        `;

        // Add delete handler (requires handler to be in global scope)
        item.querySelector('.delete-group-btn').addEventListener('click', () => {
            if (window.handleDeleteGroup) {
                window.handleDeleteGroup(groupName);
            }
        });

        return item;
    }

    // =============================================================================
    // DROP POLICY UI BUILDERS
    // =============================================================================

    /**
     * Populate drop policy toggles
     * @param {Object} categories - Category information
     * @param {Object} dropPolicies - Drop policies configuration
     * @param {Object} weights - Current weights (for future categories)
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
                    const categoryInfo = window.CourseConfigManager.getCategoryInfo(category);
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

        // Add event listeners (requires handlers to be in global scope)
        document.querySelectorAll('.drop-enabled').forEach(checkbox => {
            checkbox.addEventListener('change', window.handleDropPolicyToggle);
        });

        document.querySelectorAll('.drop-count').forEach(input => {
            input.addEventListener('blur', window.handleDropCountChange);
        });
    }

    // =============================================================================
    // ASSIGNMENT REVIEW UI BUILDERS
    // =============================================================================

    /**
     * Populate assignment review list
     * @param {Array} assignments - All assignments
     * @param {Object} manualOverrides - Manual category overrides
     */
    static populateAssignmentReview(assignments, manualOverrides) {
        const container = document.getElementById('assignmentReviewList');
        const reviewCount = document.getElementById('reviewCount');

        // Find assignments needing review (low confidence OR not yet categorized)
        const needsReview = assignments.filter(a => {
            // Check if assignment has categorization data
            const hasCategory = a.category && a.category !== 'other';
            const confidence = a.categoryConfidence || 0;

            // Needs review if: no category, low confidence, or manual override exists
            return !hasCategory || confidence < 0.6 || manualOverrides[a.assignmentId];
        });

        reviewCount.textContent = needsReview.length;

        if (needsReview.length === 0) {
            // Calculate average confidence for accurate reporting
            const avgConfidence = assignments.length > 0
                ? assignments.reduce((sum, a) => sum + (a.categoryConfidence || 0), 0) / assignments.length
                : 0;

            let message = '✅ All assignments categorized successfully!';
            if (avgConfidence >= 0.8) {
                message = '✅ All assignments categorized with high confidence!';
            } else if (avgConfidence >= 0.6) {
                message = '✅ All assignments categorized (average confidence: ' + Math.round(avgConfidence * 100) + '%)';
            }

            container.innerHTML = `
                <div class="no-review-needed">
                    ${message}
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        needsReview.forEach(assignment => {
            const item = document.createElement('div');
            item.className = 'review-item';
            item.dataset.assignmentId = assignment.assignmentId;

            // Get current category from manual override OR original categorization
            const currentCategory = manualOverrides[assignment.assignmentId] || assignment.category || 'other';
            const confidence = ((assignment.categoryConfidence || 0) * 100).toFixed(0);

            // Log for debugging
            console.log(`Assignment "${assignment.title}":`, {
                originalCategory: assignment.category,
                confidence: assignment.categoryConfidence,
                manualOverride: manualOverrides[assignment.assignmentId],
                currentCategory
            });

            item.innerHTML = `
                <div class="assignment-title">${assignment.title}</div>
                <div class="confidence-info">
                    Current: ${this.getCategoryDisplayName(currentCategory)} (${confidence}% confidence)
                </div>
                <div class="category-selector">
                    <label>Change to:</label>
                    <select class="category-override" data-assignment-id="${assignment.assignmentId}">
                        <option value="">-- Keep current --</option>
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
            `;

            container.appendChild(item);
        });

        // Add event listeners (requires handler to be in global scope)
        document.querySelectorAll('.category-override').forEach(select => {
            select.addEventListener('change', window.handleCategoryOverride);
        });
    }

    // =============================================================================
    // UTILITY FUNCTIONS
    // =============================================================================

    /**
     * Get display name for category
     * @param {string} category - Category identifier
     * @returns {string} Human-readable category name
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
     * @param {string} category - Category identifier
     * @returns {string} Emoji icon
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

    /**
     * Display current configuration as JSON
     * @param {Object} config - Configuration object
     */
    static displayCurrentConfig(config) {
        const jsonPre = document.getElementById('configJSON');
        if (jsonPre) {
            jsonPre.textContent = JSON.stringify(config, null, 2);
        }
        // Don't change display visibility - let the toggle buttons control that
    }
}

// Export for browser extension use (window pattern)
if (typeof window !== 'undefined') {
    window.OptionsUIBuilders = OptionsUIBuilders;
}
