// =============================================================================
// OPTIONS ADVANCED MODULE
// =============================================================================
// Advanced feature functions for grade calculator configuration
// Includes category groups, clobber policies, and weight distribution
//
// Extracted from options.js.backup (lines 555-567, 825-890, 1055-1685, 2174-2195)
//
// Dependencies:
// - CourseConfigManager (global) - config storage and validation
// - currentCourseData (global) - current course data
// - currentConfigCourse (global) - current course being configured
// - loadCourseForConfiguration (global) - reload UI after changes
// - validateWeights (global) - weight validation function
// =============================================================================

class OptionsAdvanced {

    // =========================================================================
    // CLOBBER POLICIES - Grade replacement and redistribution policies
    // =========================================================================

    /**
     * Populate clobber policies UI
     */
    static populateClobberPolicies(config, assignments) {
        const clobberSection = document.getElementById('clobberPoliciesSection');
        const existingPoliciesList = document.getElementById('existingClobberPolicies');

        if (!clobberSection) return;

        // Show the section
        clobberSection.style.display = 'block';

        // Show existing clobber policies
        if (config.clobberPolicies && Object.keys(config.clobberPolicies).length > 0) {
            existingPoliciesList.innerHTML = '';

            Object.entries(config.clobberPolicies).forEach(([policyName, policy]) => {
                const policyItem = OptionsAdvanced.createClobberPolicyItem(policyName, policy);
                existingPoliciesList.appendChild(policyItem);
            });
        } else {
            existingPoliciesList.innerHTML = `
                <div class="empty-state-compact">
                    ℹ️ No clobber policies created yet. Create one below to handle conditional weight redistribution.
                </div>
            `;
        }

        // Setup form visibility toggle
        const showFormBtn = document.getElementById('showAddClobberPolicyBtn');
        if (showFormBtn) {
            const newBtn = showFormBtn.cloneNode(true);
            showFormBtn.parentNode.replaceChild(newBtn, showFormBtn);
            newBtn.addEventListener('click', OptionsAdvanced.showAddClobberPolicyForm);
        }

        // Setup cancel button
        const cancelBtn = document.getElementById('cancelClobberPolicyBtn');
        if (cancelBtn) {
            const newBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newBtn, cancelBtn);
            newBtn.addEventListener('click', OptionsAdvanced.hideAddClobberPolicyForm);
        }

        // Setup create button
        const createBtn = document.getElementById('createClobberPolicyBtn');
        if (createBtn) {
            const newBtn = createBtn.cloneNode(true);
            createBtn.parentNode.replaceChild(newBtn, createBtn);
            newBtn.addEventListener('click', OptionsAdvanced.handleCreateClobberPolicy);
        }

        // Setup policy type change handler
        const typeSelect = document.getElementById('clobberPolicyType');
        if (typeSelect) {
            const newSelect = typeSelect.cloneNode(true);
            typeSelect.parentNode.replaceChild(newSelect, typeSelect);
            newSelect.addEventListener('change', OptionsAdvanced.handleClobberPolicyTypeChange);
        }

        // Populate checkboxes for target categories
        OptionsAdvanced.populateTargetCheckboxes('redistributeTargets');
        OptionsAdvanced.populateTargetCheckboxes('requireOneTargets');
        OptionsAdvanced.populateTargetCheckboxes('zScoreClobberTargets');

        // Populate source category dropdown
        OptionsAdvanced.populateSourceCategoryDropdown();
    }

    /**
     * Populate source category dropdown
     */
    static populateSourceCategoryDropdown() {
        const dropdown = document.getElementById('clobberSourceCategory');
        if (!dropdown || !window.currentCourseData) return;

        // Get all categories
        const allCategories = CourseConfigManager.getAllPossibleCategories(
            window.currentCourseData.assignments,
            CourseConfigManager.suggestTemplate(window.currentCourseData.courseName)
        );

        // Clear existing options except the first one
        dropdown.innerHTML = '<option value="">-- Select category --</option>';

        allCategories.forEach(category => {
            if (category === 'other') return; // Skip 'other'

            const categoryInfo = CourseConfigManager.getCategoryInfo(category);
            const option = document.createElement('option');
            option.value = category;
            option.textContent = `${categoryInfo.icon} ${categoryInfo.name}`;
            dropdown.appendChild(option);
        });
    }

    /**
     * Create a clobber policy display item
     */
    static createClobberPolicyItem(policyName, policy) {
        const item = document.createElement('div');
        item.className = 'clobber-policy-item';

        const policyDescription = OptionsAdvanced.generatePolicyDescription(policy);
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

        // Add event handlers
        item.querySelector('.toggle-policy-btn').addEventListener('click', () => OptionsAdvanced.handleToggleClobberPolicy(policyName));
        item.querySelector('.delete-policy-btn').addEventListener('click', () => OptionsAdvanced.handleDeleteClobberPolicy(policyName));

        return item;
    }

    /**
     * Generate human-readable description for a clobber policy
     */
    static generatePolicyDescription(policy) {
        const sourceInfo = CourseConfigManager.getCategoryInfo(policy.sourceCategory);

        if (policy.type === 'redistribute') {
            const conditionText = policy.config.condition === 'no_submissions'
                ? 'no submissions'
                : 'no grades';
            const targetNames = policy.config.targetCategories.map(cat =>
                CourseConfigManager.getCategoryInfo(cat).name
            ).join(', ');
            return `If ${sourceInfo.name} has ${conditionText}, redistribute weight to: ${targetNames}`;
        } else if (policy.type === 'best_of') {
            return `Count only best ${policy.config.count} of ${sourceInfo.name} assignments`;
        } else if (policy.type === 'require_one') {
            const targetNames = policy.config.targetCategories.map(cat =>
                CourseConfigManager.getCategoryInfo(cat).name
            ).join(', ');
            return `If no ${sourceInfo.name} submitted, redistribute to: ${targetNames}`;
        } else if (policy.type === 'z_score_clobber') {
            const targetNames = policy.config.targetCategories.map(cat =>
                CourseConfigManager.getCategoryInfo(cat).name
            ).join(', ');
            const modeText = policy.config.mode === 'partial'
                ? ` (${(policy.config.percentage * 100).toFixed(0)}% scaling)`
                : '';
            return `Use ${sourceInfo.name} z-score to replace ${targetNames}${modeText}`;
        }

        return 'Unknown policy type';
    }

    /**
     * Show add clobber policy form
     */
    static showAddClobberPolicyForm() {
        document.getElementById('addClobberPolicyForm').style.display = 'block';
        document.getElementById('showAddClobberPolicyBtn').style.display = 'none';
    }

    /**
     * Hide add clobber policy form
     */
    static hideAddClobberPolicyForm() {
        document.getElementById('addClobberPolicyForm').style.display = 'none';
        document.getElementById('showAddClobberPolicyBtn').style.display = 'block';

        // Reset form
        document.getElementById('clobberPolicyName').value = '';
        document.getElementById('clobberPolicyType').value = '';
        OptionsAdvanced.handleClobberPolicyTypeChange({ target: { value: '' } });
    }

    /**
     * Handle clobber policy type change (show/hide type-specific fields)
     */
    static handleClobberPolicyTypeChange(event) {
        const type = event.target.value;

        // Hide all type-specific sections
        document.getElementById('redistributeFields').style.display = 'none';
        document.getElementById('bestOfFields').style.display = 'none';
        document.getElementById('requireOneFields').style.display = 'none';
        document.getElementById('zScoreClobberFields').style.display = 'none';

        // Show relevant section
        if (type === 'redistribute') {
            document.getElementById('redistributeFields').style.display = 'block';
        } else if (type === 'best_of') {
            document.getElementById('bestOfFields').style.display = 'block';
        } else if (type === 'require_one') {
            document.getElementById('requireOneFields').style.display = 'block';
        } else if (type === 'z_score_clobber') {
            document.getElementById('zScoreClobberFields').style.display = 'block';

            // Setup mode change handler for z-score clobber
            const modeSelect = document.getElementById('zScoreClobberMode');
            if (modeSelect) {
                const newModeSelect = modeSelect.cloneNode(true);
                modeSelect.parentNode.replaceChild(newModeSelect, modeSelect);
                newModeSelect.addEventListener('change', OptionsAdvanced.handleZScoreClobberModeChange);

                // Trigger initial state
                OptionsAdvanced.handleZScoreClobberModeChange({ target: { value: 'full' } });
            }
        }
    }

    /**
     * Handle z-score clobber mode change (show/hide percentage field)
     */
    static handleZScoreClobberModeChange(event) {
        const mode = event.target.value;
        const percentageField = document.getElementById('zScoreClobberPercentageField');

        if (percentageField) {
            percentageField.style.display = mode === 'partial' ? 'block' : 'none';
        }
    }

    /**
     * Populate target category checkboxes
     */
    static populateTargetCheckboxes(containerId) {
        const container = document.getElementById(containerId);
        if (!container || !window.currentCourseData) return;

        // Get all categories
        const allCategories = CourseConfigManager.getAllPossibleCategories(
            window.currentCourseData.assignments,
            CourseConfigManager.suggestTemplate(window.currentCourseData.courseName)
        );

        container.innerHTML = '';

        allCategories.forEach(category => {
            if (category === 'other') return; // Skip 'other'

            const categoryInfo = CourseConfigManager.getCategoryInfo(category);
            const label = document.createElement('label');
            label.innerHTML = `
                <input type="checkbox" value="${category}">
                <span>${categoryInfo.icon} ${categoryInfo.name}</span>
            `;
            container.appendChild(label);
        });
    }

    /**
     * Handle creating a new clobber policy
     */
    static async handleCreateClobberPolicy() {
        const policyName = document.getElementById('clobberPolicyName')?.value?.trim();
        const policyType = document.getElementById('clobberPolicyType')?.value;
        const sourceCategory = document.getElementById('clobberSourceCategory')?.value;

        // Validation
        if (!policyName) {
            alert('Please enter a policy name');
            return;
        }

        if (!sourceCategory) {
            alert('Please select a source category');
            return;
        }

        try {
            const config = await CourseConfigManager.getCourseConfig(window.currentConfigCourse);

            if (!config.clobberPolicies) {
                config.clobberPolicies = {};
            }

            // Check for duplicate policy name
            if (config.clobberPolicies[policyName]) {
                if (!confirm(`Policy "${policyName}" already exists. Replace it?`)) {
                    return;
                }
            }

            // Build policy config based on type
            let policyConfig = {
                type: policyType,
                sourceCategory: sourceCategory,
                enabled: true,
                config: {}
            };

            if (policyType === 'redistribute') {
                const condition = document.getElementById('redistributeCondition')?.value;
                const checkboxes = document.querySelectorAll('#redistributeTargets input[type="checkbox"]:checked');
                const targetCategories = Array.from(checkboxes).map(cb => cb.value);

                if (targetCategories.length === 0) {
                    alert('Please select at least one target category for redistribution');
                    return;
                }

                policyConfig.config = {
                    condition: condition,
                    targetCategories: targetCategories
                };
            } else if (policyType === 'best_of') {
                const count = parseInt(document.getElementById('bestOfCount')?.value);

                if (isNaN(count) || count < 1) {
                    alert('Please enter a valid count (at least 1)');
                    return;
                }

                policyConfig.config = {
                    count: count
                };
            } else if (policyType === 'require_one') {
                const checkboxes = document.querySelectorAll('#requireOneTargets input[type="checkbox"]:checked');
                const targetCategories = Array.from(checkboxes).map(cb => cb.value);

                if (targetCategories.length === 0) {
                    alert('Please select at least one target category');
                    return;
                }

                const failureWeight = parseFloat(document.getElementById('requireOneFailureWeight')?.value) / 100;

                policyConfig.config = {
                    targetCategories: targetCategories,
                    failureWeight: failureWeight
                };
            } else if (policyType === 'z_score_clobber') {
                const checkboxes = document.querySelectorAll('#zScoreClobberTargets input[type="checkbox"]:checked');
                const targetCategories = Array.from(checkboxes).map(cb => cb.value);

                if (targetCategories.length === 0) {
                    alert('Please select at least one target category for z-score clobbering');
                    return;
                }

                const mode = document.getElementById('zScoreClobberMode')?.value;
                let percentage = 1.0; // Default for full mode

                if (mode === 'partial') {
                    const percentageInput = parseInt(document.getElementById('zScoreClobberPercentage')?.value);
                    if (isNaN(percentageInput) || percentageInput < 1 || percentageInput > 100) {
                        alert('Please enter a valid percentage between 1 and 100');
                        return;
                    }
                    percentage = percentageInput / 100;
                }

                policyConfig.config = {
                    targetCategories: targetCategories,
                    mode: mode,
                    percentage: percentage
                };
            }

            console.log(`🔄 Creating clobber policy: ${policyName}`, policyConfig);

            // Create the policy
            config.clobberPolicies[policyName] = policyConfig;

            // Validate
            const validation = CourseConfigManager.validateClobberPolicies(config.clobberPolicies, config.weights);
            if (!validation.valid) {
                alert(`❌ Policy validation failed:\n\n${validation.errors.join('\n')}`);
                return;
            }

            // Save config (skip strict validation during edit)
            await CourseConfigManager.saveCourseConfig(window.currentConfigCourse, config, true);

            // Reload UI
            await window.loadCourseForConfiguration(window.currentConfigCourse);

            // Hide form
            OptionsAdvanced.hideAddClobberPolicyForm();

            // Show warnings to user if any exist
            if (validation.warnings.length > 0) {
                console.warn('⚠️ Policy warnings:', validation.warnings);
                alert(`⚠️ Policy created with warnings:\n\n${validation.warnings.join('\n')}\n\nPolicy: ${OptionsAdvanced.generatePolicyDescription(policyConfig)}`);
            } else {
                // Show complex policy disclaimer
                OptionsAdvanced.showComplexPolicyDisclaimer('clobber');
                alert(`✅ Created clobber policy "${policyName}"!\n\n${OptionsAdvanced.generatePolicyDescription(policyConfig)}`);
            }

        } catch (error) {
            console.error('Error creating clobber policy:', error);
            alert(`❌ Error creating policy: ${error.message}`);
        }
    }

    /**
     * Handle toggling a clobber policy on/off
     */
    static async handleToggleClobberPolicy(policyName) {
        try {
            const config = await CourseConfigManager.getCourseConfig(window.currentConfigCourse);

            if (config.clobberPolicies && config.clobberPolicies[policyName]) {
                config.clobberPolicies[policyName].enabled = !config.clobberPolicies[policyName].enabled;

                await CourseConfigManager.saveCourseConfig(window.currentConfigCourse, config, true);
                await window.loadCourseForConfiguration(window.currentConfigCourse);

                const status = config.clobberPolicies[policyName].enabled ? 'enabled' : 'disabled';
                console.log(`✅ Clobber policy "${policyName}" ${status}`);
            }
        } catch (error) {
            console.error('Error toggling policy:', error);
            alert(`❌ Error toggling policy: ${error.message}`);
        }
    }

    /**
     * Handle deleting a clobber policy
     */
    static async handleDeleteClobberPolicy(policyName) {
        if (!confirm(`Delete clobber policy "${policyName}"?`)) {
            return;
        }

        try {
            const config = await CourseConfigManager.getCourseConfig(window.currentConfigCourse);

            if (config.clobberPolicies && config.clobberPolicies[policyName]) {
                delete config.clobberPolicies[policyName];

                // If no policies left, remove the property
                if (Object.keys(config.clobberPolicies).length === 0) {
                    config.clobberPolicies = null;
                }

                await CourseConfigManager.saveCourseConfig(window.currentConfigCourse, config, true);
                await window.loadCourseForConfiguration(window.currentConfigCourse);

                alert(`✅ Deleted clobber policy "${policyName}"`);
            }
        } catch (error) {
            console.error('Error deleting policy:', error);
            alert(`❌ Error deleting policy: ${error.message}`);
        }
    }

    // =========================================================================
    // CATEGORY GROUPING - Combine multiple categories with shared weight
    // =========================================================================

    /**
     * Populate category grouping UI
     */
    static populateCategoryGrouping(config, assignments) {
        const groupingSection = document.getElementById('categoryGroupingSection');
        const existingGroupsList = document.getElementById('existingGroupsList');
        const checkboxesContainer = document.getElementById('groupCategoryCheckboxes');

        if (!groupingSection) return;

        // Show the section
        groupingSection.style.display = 'block';

        // Show existing groups
        if (config.categoryGroups && Object.keys(config.categoryGroups).length > 0) {
            existingGroupsList.innerHTML = '';

            Object.entries(config.categoryGroups).forEach(([groupName, groupConfig]) => {
                const groupItem = OptionsAdvanced.createCategoryGroupItem(groupName, groupConfig);
                existingGroupsList.appendChild(groupItem);
            });
        } else {
            existingGroupsList.innerHTML = `
                <div class="empty-state-compact">
                    ℹ️ No category groups created yet. Create one below to combine categories.
                </div>
            `;
        }

        // Populate available categories for grouping
        const allCategories = CourseConfigManager.getAllPossibleCategories(
            assignments,
            CourseConfigManager.suggestTemplate(window.currentCourseData.courseName)
        );

        // Filter out categories already in groups
        const categoriesInGroups = new Set();
        if (config.categoryGroups) {
            Object.values(config.categoryGroups).forEach(group => {
                group.categories.forEach(cat => categoriesInGroups.add(cat));
            });
        }

        const availableCategories = allCategories.filter(cat =>
            cat !== 'other' && !categoriesInGroups.has(cat)
        );

        checkboxesContainer.innerHTML = '';

        if (availableCategories.length === 0) {
            checkboxesContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; color: #666; padding: 10px;">
                    All categories are either grouped or unavailable
                </div>
            `;
        } else {
            availableCategories.forEach(category => {
                const categoryInfo = CourseConfigManager.getCategoryInfo(category);
                const label = document.createElement('label');
                label.innerHTML = `
                    <input type="checkbox" value="${category}">
                    <span>${categoryInfo.icon} ${categoryInfo.name}</span>
                `;
                checkboxesContainer.appendChild(label);
            });
        }

        // Setup create group button
        const createBtn = document.getElementById('createGroupBtn');
        if (createBtn) {
            // Remove existing listeners
            const newBtn = createBtn.cloneNode(true);
            createBtn.parentNode.replaceChild(newBtn, createBtn);
            newBtn.addEventListener('click', OptionsAdvanced.handleCreateGroup);
        }
    }

    /**
     * Create a category group display item
     */
    static createCategoryGroupItem(groupName, groupConfig) {
        const item = document.createElement('div');
        item.className = 'category-group-item';

        const categoriesHTML = groupConfig.categories.map(cat => {
            const info = CourseConfigManager.getCategoryInfo(cat);
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

        // Add delete handler
        item.querySelector('.delete-group-btn').addEventListener('click', () => OptionsAdvanced.handleDeleteGroup(groupName));

        return item;
    }

    /**
     * Handle creating a new category group
     */
    static async handleCreateGroup() {
        const groupName = document.getElementById('newGroupName')?.value?.trim();
        const groupWeight = parseFloat(document.getElementById('newGroupWeight')?.value) / 100;
        const distributionMethod = document.getElementById('groupDistributionMethod')?.value;

        // Get selected categories
        const checkboxes = document.querySelectorAll('#groupCategoryCheckboxes input[type="checkbox"]:checked');
        const selectedCategories = Array.from(checkboxes).map(cb => cb.value);

        // Validation
        if (!groupName) {
            alert('Please enter a group name');
            return;
        }

        if (selectedCategories.length === 0) {
            alert('Please select at least one category for the group');
            return;
        }

        if (isNaN(groupWeight) || groupWeight <= 0 || groupWeight > 1) {
            alert('Please enter a valid weight between 1% and 100%');
            return;
        }

        try {
            console.log(`📦 Creating group: ${groupName} (${selectedCategories.join(', ')}) = ${(groupWeight * 100).toFixed(0)}%`);

            // Get current config
            const config = await CourseConfigManager.getCourseConfig(window.currentConfigCourse);

            if (!config.categoryGroups) {
                config.categoryGroups = {};
            }

            // Check for duplicate group name
            if (config.categoryGroups[groupName]) {
                if (!confirm(`Group "${groupName}" already exists. Replace it?`)) {
                    return;
                }
            }

            // Create the group
            config.categoryGroups[groupName] = {
                categories: selectedCategories,
                totalWeight: groupWeight,
                distributionMethod: distributionMethod
            };

            // Validate
            const validation = CourseConfigManager.validateCategoryGroups(config.categoryGroups, config.weights);
            if (!validation.valid) {
                alert(`❌ Group validation failed:\n\n${validation.errors.join('\n')}`);
                return;
            }

            // Save config (skip strict validation during edit)
            await CourseConfigManager.saveCourseConfig(window.currentConfigCourse, config, true);

            // Reload UI
            await window.loadCourseForConfiguration(window.currentConfigCourse);

            // Clear form
            document.getElementById('newGroupName').value = '';
            document.getElementById('newGroupWeight').value = '20';

            // Show warnings to user if any exist
            if (validation.warnings.length > 0) {
                console.warn('⚠️ Group warnings:', validation.warnings);
                alert(`⚠️ Group created with warnings:\n\n${validation.warnings.join('\n')}\n\nIndividual category weights will be calculated automatically based on this group.`);
            } else {
                // Show complex policy disclaimer
                OptionsAdvanced.showComplexPolicyDisclaimer('groups');
                alert(`✅ Created group "${groupName}"!\n\nIndividual category weights will be calculated automatically based on this group.`);
            }

        } catch (error) {
            console.error('Error creating group:', error);
            alert(`❌ Error creating group: ${error.message}`);
        }
    }

    /**
     * Handle deleting a category group
     */
    static async handleDeleteGroup(groupName) {
        if (!confirm(`Delete group "${groupName}"?\n\nCategories will return to individual weight configuration.`)) {
            return;
        }

        try {
            const config = await CourseConfigManager.getCourseConfig(window.currentConfigCourse);

            if (config.categoryGroups && config.categoryGroups[groupName]) {
                delete config.categoryGroups[groupName];

                // If no groups left, remove the property
                if (Object.keys(config.categoryGroups).length === 0) {
                    config.categoryGroups = null;
                }

                await CourseConfigManager.saveCourseConfig(window.currentConfigCourse, config, true);
                await window.loadCourseForConfiguration(window.currentConfigCourse);

                alert(`✅ Deleted group "${groupName}"`);
            }

        } catch (error) {
            console.error('Error deleting group:', error);
            alert(`❌ Error deleting group: ${error.message}`);
        }
    }

    // =========================================================================
    // GROUP WEIGHT RENDERING - Display groups in weight inputs section
    // =========================================================================

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
            </div>
        `;

        // Add input event listener for validation
        const input = row.querySelector('.weight-input');
        if (input) {
            input.addEventListener('input', validateWeights);
        }

        container.appendChild(row);
        console.log('✅ Group weight input row added for:', groupName);
    }

    // =========================================================================
    // WEIGHT DISTRIBUTION - Even distribution across categories
    // =========================================================================

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

        validateWeights();
    }

    // =========================================================================
    // UTILITY FUNCTIONS
    // =========================================================================

    /**
     * Show complex policy disclaimer after creating advanced features
     */
    static showComplexPolicyDisclaimer(policyType) {
        const policyName = {
            'clobber': 'conditional policies',
            'groups': 'category groups'
        }[policyType] || 'complex policies';

        alert(
            `✅ Configuration saved!\n\n` +
            `You're using ${policyName}. Double-check your setup ` +
            `matches how your professor actually calculates.\n\n` +
            `When in doubt, ask your GSI.`
        );
    }
}

// Export to window for HTML script loading
if (typeof window !== 'undefined') {
    window.OptionsAdvanced = OptionsAdvanced;
}
