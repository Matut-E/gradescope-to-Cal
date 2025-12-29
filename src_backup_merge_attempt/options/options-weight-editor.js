/**
 * Options Weight Editor Module
 * Handles weight input editing, validation, and UI for grade configuration
 *
 * Functions:
 * - Weight input population and rendering
 * - Weight validation (percentage/points modes)
 * - Weight distribution and normalization
 * - Category add/remove operations
 * - Grading system switching (percentage ↔ points)
 * - Weight display updates
 *
 * Dependencies:
 * - CourseConfigManager (global)
 * - currentConfigCourse (global state)
 * - currentCourseData (global state)
 * - loadCourseForConfiguration (from options.js)
 * - validateAndShowWarnings (from options.js)
 * - handleDeleteGroup (from options-grouping.js)
 */

class OptionsWeightEditor {
    // =============================================================================
    // STATE MANAGEMENT
    // =============================================================================

    static weightInputsDebounce = null;

    // =============================================================================
    // WEIGHT INPUT POPULATION & RENDERING
    // =============================================================================

    /**
     * Populate weight inputs container with categories and groups
     * Handles both existing and future categories, plus category groups
     */
    static populateWeightInputs(categories, weights) {
        const container = document.getElementById('weightInputsContainer');
        container.innerHTML = '';

        if (!window.currentCourseData || !window.currentCourseData.assignments) {
            console.error('No current course data available');
            return;
        }

        // Get ALL possible categories (including future ones from template/config)
        const config = window.currentCourseData.config || {};
        const template = CourseConfigManager.suggestTemplate(window.currentCourseData.courseName);

        const allCategories = CourseConfigManager.getAllPossibleCategories(
            window.currentCourseData.assignments,
            template
        );

        console.log('📊 All possible categories:', allCategories);

        // Get categories in groups
        const categoriesInGroups = new Set();
        if (config.categoryGroups) {
            Object.values(config.categoryGroups).forEach(group => {
                group.categories.forEach(cat => categoriesInGroups.add(cat));
            });
        }

        console.log('📦 Categories in groups:', Array.from(categoriesInGroups));

        // Count assignments per category (accounting for manual overrides)
        const manualOverrides = config.manualOverrides || {};
        const categoryCounts = {};

        allCategories.forEach(category => {
            categoryCounts[category] = 0;
        });

        window.currentCourseData.assignments.forEach(assignment => {
            // Use manual override if exists, otherwise use detected category
            const category = manualOverrides[assignment.assignmentId] || assignment.category || 'other';
            if (categoryCounts.hasOwnProperty(category)) {
                categoryCounts[category]++;
            } else {
                categoryCounts[category] = 1;
            }
        });

        console.log('📊 Category counts:', categoryCounts);

        // Filter out grouped categories and separate existing vs future
        const ungroupedCategories = allCategories.filter(cat => !categoriesInGroups.has(cat));
        const existingCategories = ungroupedCategories.filter(cat => categoryCounts[cat] > 0);
        const futureCategories = ungroupedCategories.filter(cat => categoryCounts[cat] === 0);

        console.log('✅ Ungrouped existing:', existingCategories);
        console.log('⏳ Ungrouped future:', futureCategories);

        // Render existing ungrouped categories
        existingCategories.forEach(category => {
            this.renderWeightInputRow(category, categoryCounts[category], weights, false);
        });

        // Render category groups as weight input rows
        console.log('📦 Checking for category groups:', config.categoryGroups);
        if (config.categoryGroups && Object.keys(config.categoryGroups).length > 0) {
            console.log('📦 Rendering', Object.keys(config.categoryGroups).length, 'category groups');
            Object.entries(config.categoryGroups).forEach(([groupName, groupConfig]) => {
                console.log('📦 Rendering group:', groupName, groupConfig);
                this.renderGroupWeightInputRow(groupName, groupConfig, window.currentCourseData.assignments);
            });
        } else {
            console.log('📦 No category groups to render');
        }

        // Render future categories
        futureCategories.forEach(category => {
            // Show if it has a weight configured (including 0, meaning user explicitly added it)
            if (weights && weights.hasOwnProperty(category)) {
                this.renderWeightInputRow(category, 0, weights, true);
            }
        });

        // Add "Add Category" section
        this.addCategoryAdder(container, allCategories, weights);

        // Add event listeners to weight inputs
        document.querySelectorAll('.weight-input').forEach(input => {
            input.addEventListener('input', (e) => this.handleWeightInputChange(e));
        });

        // Add event listeners to remove buttons
        document.querySelectorAll('.remove-category-btn').forEach(button => {
            button.addEventListener('click', (e) => this.handleRemoveCategory(e));
        });

        // Add event listeners to group remove buttons
        document.querySelectorAll('.remove-group-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const groupName = event.target.dataset.groupName;
                handleDeleteGroup(groupName);
            });
        });

        // Initial validation
        this.validateWeights();
        // Note: validateAndShowWarnings was removed during refactoring
    }

    /**
     * Render a single weight input row
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

        const categoryInfo = CourseConfigManager.getCategoryInfo(category);
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
            const categoryInfo = CourseConfigManager.getCategoryInfo(cat);
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

    /**
     * Add section for adding new future categories
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
            <div class="add-category-title">
                ➕ Add Future Category
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <select id="newCategorySelect" style="padding: 6px; border-radius: 4px; border: 1px solid #dee2e6; flex: 1;">
                    <option value="">-- Select category from syllabus --</option>
                    ${availableCategories.map(cat => {
            const info = CourseConfigManager.getCategoryInfo(cat);
            return `<option value="${cat}">${info.icon} ${info.name}</option>`;
        }).join('')}
                </select>
                <button id="addCategoryBtn" class="button secondary" style="padding: 6px 12px; font-size: 13px;">
                    Add Category
                </button>
            </div>
            <div class="add-category-help">
                Add categories for assignments that will be posted later (e.g., midterms, finals)
            </div>
        `;

        container.appendChild(addSection);

        // Add event listener
        document.getElementById('addCategoryBtn')?.addEventListener('click', () => this.handleAddCategory());
    }

    // =============================================================================
    // CATEGORY ADD/REMOVE OPERATIONS
    // =============================================================================

    /**
     * Handle adding a new future category
     */
    static async handleAddCategory() {
        const select = document.getElementById('newCategorySelect');
        const category = select?.value;

        if (!category) {
            alert('Please select a category to add');
            return;
        }

        if (!window.currentConfigCourse) {
            alert('Please select a course first');
            return;
        }

        console.log(`➕ Adding future category: ${category}`);

        try {
            // Get current config from storage
            const config = await CourseConfigManager.getCourseConfig(window.currentConfigCourse);

            if (!config.weights) {
                config.weights = {};
            }

            // Check if already exists
            if (config.weights[category]) {
                alert(`Category "${CourseConfigManager.getCategoryInfo(category).name}" already has a weight configured.`);
                return;
            }

            // Add with 0 weight to preserve existing weight values
            // User can manually adjust weights to sum to 100%
            const categoryInfo = CourseConfigManager.getCategoryInfo(category);
            config.weights[category] = 0;

            // Save to storage immediately (skip strict validation during edit)
            await CourseConfigManager.saveCourseConfig(window.currentConfigCourse, config, true);

            // Reload the entire course configuration to reflect saved state
            await window.loadCourseForConfiguration(window.currentConfigCourse);

            // Show success message
            const status = document.getElementById('saveStatus');
            if (status) {
                status.textContent = `✅ Added ${categoryInfo.name} - Set weight to complete configuration`;
                status.className = 'save-status success show';
                setTimeout(() => status.classList.remove('show'), 3000);
            }

        } catch (error) {
            console.error('Error adding future category:', error);
            alert(`Failed to add category: ${error.message}`);
        }
    }

    /**
     * Handle removing a future category
     */
    static async handleRemoveCategory(event) {
        const category = event.target.dataset.category;

        if (!confirm(`Remove "${CourseConfigManager.getCategoryInfo(category).name}" from configuration?`)) {
            return;
        }

        if (!window.currentConfigCourse) {
            alert('Please select a course first');
            return;
        }

        console.log(`🗑️ Removing future category: ${category}`);

        try {
            // Get current config from storage
            const config = await CourseConfigManager.getCourseConfig(window.currentConfigCourse);

            // Remove the category weight
            if (config.weights && config.weights[category]) {
                delete config.weights[category];
            }

            // Save immediately (skip strict validation during edit)
            await CourseConfigManager.saveCourseConfig(window.currentConfigCourse, config, true);

            // Reload the course configuration
            await window.loadCourseForConfiguration(window.currentConfigCourse);

            // Show success message
            const status = document.getElementById('saveStatus');
            if (status) {
                status.textContent = `✅ Removed ${CourseConfigManager.getCategoryInfo(category).name}`;
                status.className = 'save-status success show';
                setTimeout(() => status.classList.remove('show'), 3000);
            }

        } catch (error) {
            console.error('Error removing future category:', error);
            alert(`Failed to remove category: ${error.message}`);
        }
    }

    // =============================================================================
    // GRADING SYSTEM SWITCHING
    // =============================================================================

    /**
     * Handle grading system change (percentage ↔ points)
     */
    static handleGradingSystemChange(event) {
        const system = event.target.value;
        console.log(`📊 Grading system changed to: ${system}`);

        // Show/hide total points field
        const totalPointsContainer = document.getElementById('totalPointsContainer');
        if (totalPointsContainer) {
            totalPointsContainer.style.display = system === 'points' ? 'block' : 'none';
        }

        // Update weight input labels and validation help text
        OptionsWeightEditor.updateWeightLabels(system);

        // Clear all weights when switching modes (as requested by user)
        if (confirm(`Switch to ${system === 'points' ? 'points-based' : 'percentage-based'} grading?\n\nThis will clear all current category weights. You'll need to re-enter them.`)) {
            OptionsWeightEditor.clearAllWeights();
            OptionsWeightEditor.validateWeights();
            // Note: validateAndShowWarnings was removed during refactoring
        } else {
            // Revert radio selection
            document.querySelector(`input[name="gradingSystem"][value="${system === 'points' ? 'percentage' : 'points'}"]`).checked = true;
        }
    }

    /**
     * Update weight input labels between % and pts
     */
    static updateWeightLabels(system) {
        const isPoints = system === 'points';
        const totalPointsInput = document.getElementById('totalPointsInput');
        const totalPoints = parseInt(totalPointsInput?.value) || 100;

        // Update section help text
        const helpText = document.getElementById('weightSumHelpText');
        if (helpText) {
            helpText.textContent = isPoints ? `Weights must sum to ${totalPoints} pts` : 'Weights must sum to 100%';
        }

        // Update weight symbols next to each input (including group weight input)
        const weightSymbols = document.querySelectorAll('.weight-symbol');
        weightSymbols.forEach(symbol => {
            symbol.textContent = isPoints ? 'pts' : '%';
        });

        // Update new group weight input max value
        const newGroupWeightInput = document.getElementById('newGroupWeight');
        if (newGroupWeightInput) {
            newGroupWeightInput.max = isPoints ? totalPoints : 100;
            // Reset value if it exceeds new max
            if (parseInt(newGroupWeightInput.value) > parseInt(newGroupWeightInput.max)) {
                newGroupWeightInput.value = isPoints ? Math.floor(totalPoints / 5) : 20;
            }
        }

        // Revalidate with new mode
        this.validateWeights();
    }

    // =============================================================================
    // WEIGHT OPERATIONS
    // =============================================================================

    /**
     * Clear all weight inputs
     */
    static clearAllWeights() {
        const weightInputs = document.querySelectorAll('.weight-input');
        weightInputs.forEach(input => {
            input.value = 0;
        });
    }

    /**
     * Handle weight input change with debouncing
     */
    static handleWeightInputChange(event) {
        clearTimeout(this.weightInputsDebounce);
        this.weightInputsDebounce = setTimeout(() => {
            this.validateWeights();
            // Note: validateAndShowWarnings was removed during refactoring
        }, 300);
    }

    /**
     * Validate weight inputs
     * Handles both percentage-based and points-based modes
     * @returns {boolean} True if weights are valid
     */
    static validateWeights() {
        const weightInputs = document.querySelectorAll('.weight-input');
        const validationDiv = document.getElementById('weightValidation');
        const progressFill = document.getElementById('weightProgressFill');

        // Determine current mode
        const system = document.querySelector('input[name="gradingSystem"]:checked')?.value || 'percentage';
        const isPoints = system === 'points';

        // Get target total (100 for percentage, custom for points)
        const totalPointsInput = document.getElementById('totalPointsInput');
        const targetTotal = isPoints ? (parseInt(totalPointsInput?.value) || 100) : 100;

        // Sum all weight inputs (includes both individual categories and groups)
        let total = 0;
        weightInputs.forEach(input => {
            const value = parseFloat(input.value) || 0;
            total += value;
        });

        // Update progress bar (scale to 0-100% regardless of mode)
        if (progressFill) {
            const percentage = (total / targetTotal) * 100;
            progressFill.style.width = `${Math.min(percentage, 100)}%`;
        }

        // Update validation text based on mode
        const unit = isPoints ? 'pts' : '%';
        const tolerance = isPoints ? 0.5 : 0.5; // Allow small rounding errors

        if (Math.abs(total - targetTotal) < tolerance) {
            validationDiv.textContent = `Total: ${targetTotal}${unit} ✓`;
            validationDiv.className = 'validation-status valid';
        } else if (total < targetTotal) {
            const diff = targetTotal - total;
            validationDiv.textContent = `Total: ${total.toFixed(0)}${unit} (need ${diff.toFixed(0)}${unit} more)`;
            validationDiv.className = 'validation-status invalid';
        } else {
            const diff = total - targetTotal;
            validationDiv.textContent = `Total: ${total.toFixed(0)}${unit} (${diff.toFixed(0)}${unit} over limit)`;
            validationDiv.className = 'validation-status invalid';
        }

        return Math.abs(total - targetTotal) < tolerance;
    }

    /**
     * Distribute weights evenly across categories
     * Handles both percentage and points modes
     */
    static distributeWeightsEvenly() {
        const weightInputs = document.querySelectorAll('.weight-input');
        const count = weightInputs.length;

        if (count === 0) return;

        // Determine current mode and target total
        const system = document.querySelector('input[name="gradingSystem"]:checked')?.value || 'percentage';
        const isPoints = system === 'points';
        const totalPointsInput = document.getElementById('totalPointsInput');
        const targetTotal = isPoints ? (parseInt(totalPointsInput?.value) || 100) : 100;

        const evenWeight = Math.floor(targetTotal / count);
        const remainder = targetTotal - (evenWeight * count);

        weightInputs.forEach((input, index) => {
            // Give remainder to first category
            input.value = index === 0 ? evenWeight + remainder : evenWeight;
        });

        OptionsWeightEditor.validateWeights();
    }
}

// =============================================================================
// WINDOW EXPORT
// =============================================================================

if (typeof window !== 'undefined') {
    window.OptionsWeightEditor = OptionsWeightEditor;
}
