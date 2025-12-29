/**
 * Options Course Linking Module
 * Handles course linking functionality for combining multiple course instances
 *
 * Extracted from options.js for better maintainability
 *
 * Dependencies (must be loaded before this module):
 * - CourseConfigManager (global) - Course configuration management
 * - browser.storage.local - Chrome storage API
 *
 * DOM Dependencies:
 * - #linkPrimaryCourse - Primary course selector
 * - #linkCoursesCheckboxes - Checkboxes for linked courses
 * - #categoryRulesContainer - Category rules container
 * - #categoryRulesList - Category rules list
 * - #existingLinksList - Existing links display
 * - #createLinkBtn - Create link button
 */

class OptionsCourseLinking {
    /**
     * Initialize course linking UI
     */
    static async initializeCourseLinking() {
        await OptionsCourseLinking.loadAvailableCourses();
        await OptionsCourseLinking.displayExistingLinks();
        OptionsCourseLinking.setupCourseLinkingListeners();
    }

    /**
     * Load available courses from storage
     */
    static async loadAvailableCourses() {
        try {
            const storage = await browser.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

            const courses = new Set();
            assignmentKeys.forEach(key => {
                const data = storage[key];
                if (data.allAssignments) {
                    data.allAssignments.forEach(assignment => {
                        if (assignment.course) {
                            courses.add(assignment.course);
                        }
                    });
                }
            });

            // Populate primary course selector
            const primarySelect = document.getElementById('linkPrimaryCourse');
            primarySelect.innerHTML = '<option value="">Select primary course...</option>';

            Array.from(courses).sort().forEach(course => {
                const option = document.createElement('option');
                option.value = course;
                option.textContent = course;
                primarySelect.appendChild(option);
            });

            // Populate checkboxes (will update based on primary selection)
            OptionsCourseLinking.updateLinkCoursesCheckboxes(Array.from(courses).sort(), null);

        } catch (error) {
            console.error('Error loading courses:', error);
        }
    }

    /**
     * Update checkboxes based on primary course selection
     */
    static updateLinkCoursesCheckboxes(allCourses, primaryCourse) {
        const container = document.getElementById('linkCoursesCheckboxes');
        container.innerHTML = '';

        if (!primaryCourse) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">Select a primary course first</div>';
            return;
        }

        // Filter out primary course
        const availableCourses = allCourses.filter(course => course !== primaryCourse);

        if (availableCourses.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">No other courses available to link</div>';
            return;
        }

        availableCourses.forEach(course => {
            const checkbox = document.createElement('div');
            checkbox.className = 'link-course-checkbox';
            checkbox.innerHTML = `
                <input type="checkbox" id="link-${course}" value="${course}">
                <label for="link-${course}">${course}</label>
            `;
            container.appendChild(checkbox);

            // Add change listener to update category rules
            checkbox.querySelector('input').addEventListener('change', OptionsCourseLinking.updateCategoryRulesDisplay);
        });
    }

    /**
     * Update category rules display based on selected courses
     */
    static updateCategoryRulesDisplay() {
        const selectedCourses = OptionsCourseLinking.getSelectedLinkedCourses();
        const container = document.getElementById('categoryRulesContainer');
        const rulesList = document.getElementById('categoryRulesList');

        if (selectedCourses.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        rulesList.innerHTML = '';

        const categories = ['homework', 'quiz', 'lab', 'midterm', 'final', 'project', 'participation', 'other'];
        const categoryIcons = {
            homework: '📝', quiz: '❓', lab: '🔬', midterm: '📊',
            final: '🎓', project: '🚀', participation: '👥', other: '📌'
        };

        selectedCourses.forEach(course => {
            const ruleRow = document.createElement('div');
            ruleRow.className = 'category-rule-row';

            ruleRow.innerHTML = `
                <div class="category-rule-course">🔗 ${course}</div>
                <label style="display: block; margin-bottom: 5px; font-size: 12px; color: var(--text-secondary);">
                    Import all assignments from this course as:
                </label>
                <select class="category-rule-select" data-course="${course}">
                    <option value="">Keep original categories</option>
                    ${categories.map(cat =>
                        `<option value="${cat}">${categoryIcons[cat]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`
                    ).join('')}
                </select>
            `;

            rulesList.appendChild(ruleRow);
        });
    }

    /**
     * Get selected linked courses
     */
    static getSelectedLinkedCourses() {
        const checkboxes = document.querySelectorAll('#linkCoursesCheckboxes input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    /**
     * Get category rules from UI
     */
    static getCategoryRulesFromUI() {
        const rules = {};
        const selects = document.querySelectorAll('.category-rule-select');

        selects.forEach(select => {
            const course = select.dataset.course;
            const category = select.value;

            if (category) {
                rules[course] = { importAllAs: category };
            }
        });

        return rules;
    }

    /**
     * Display existing course links
     */
    static async displayExistingLinks() {
        const container = document.getElementById('existingLinksList');
        const allLinks = await CourseConfigManager.getAllCourseLinks();

        if (Object.keys(allLinks).length === 0) {
            container.innerHTML = `
                <div class="empty-state-compact">
                    🔗 No course links configured yet. Create a link below to combine courses.
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        Object.entries(allLinks).forEach(([primaryCourse, linkData]) => {
            const linkItem = OptionsCourseLinking.createLinkItemElement(primaryCourse, linkData);
            container.appendChild(linkItem);
        });
    }

    /**
     * Create a link item element for display
     */
    static createLinkItemElement(primaryCourse, linkData) {
        const item = document.createElement('div');
        item.className = 'link-item';

        const categoryIcons = {
            homework: '📝', quiz: '❓', lab: '🔬', midterm: '📊',
            final: '🎓', project: '🚀', participation: '👥', other: '📌'
        };

        // Create linked course tags with category rules
        const linkedCourseTags = linkData.linkedCourses.map(linkedCourse => {
            const rule = linkData.categoryRules && linkData.categoryRules[linkedCourse];
            const ruleText = rule?.importAllAs
                ? `→ ${categoryIcons[rule.importAllAs] || ''} ${rule.importAllAs}`
                : '';

            return `
                <div class="linked-course-tag">
                    <span class="course-name">${linkedCourse}</span>
                    ${ruleText ? `<span class="rule-badge">${ruleText}</span>` : ''}
                </div>
            `;
        }).join('');

        item.innerHTML = `
            <div class="link-item-header">
                <div class="link-item-primary">📚 ${primaryCourse}</div>
                <div class="link-item-controls">
                    <button class="link-edit-btn" data-primary="${primaryCourse}">✏️ Edit</button>
                    <button class="link-delete-btn" data-primary="${primaryCourse}">🗑️ Delete</button>
                </div>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">
                ${linkData.linkedCourses.length} linked course(s)
            </div>
            <div class="link-item-linked">
                ${linkedCourseTags}
            </div>
        `;

        // Add event listeners
        item.querySelector('.link-edit-btn').addEventListener('click', () => OptionsCourseLinking.editLink(primaryCourse, linkData));
        item.querySelector('.link-delete-btn').addEventListener('click', () => OptionsCourseLinking.deleteLink(primaryCourse));

        return item;
    }

    /**
     * Edit existing link (populate form with current data)
     */
    static editLink(primaryCourse, linkData) {
        // Delete the old link
        OptionsCourseLinking.deleteLink(primaryCourse, true);

        // Populate form
        document.getElementById('linkPrimaryCourse').value = primaryCourse;

        // Trigger primary course change to load checkboxes
        const event = new Event('change');
        document.getElementById('linkPrimaryCourse').dispatchEvent(event);

        // Wait for checkboxes to load, then select appropriate ones
        setTimeout(() => {
            linkData.linkedCourses.forEach(course => {
                const checkbox = document.getElementById(`link-${course}`);
                if (checkbox) {
                    checkbox.checked = true;
                }
            });

            // Trigger update to show category rules
            OptionsCourseLinking.updateCategoryRulesDisplay();

            // Set category rules
            setTimeout(() => {
                Object.entries(linkData.categoryRules || {}).forEach(([course, rule]) => {
                    const select = document.querySelector(`.category-rule-select[data-course="${course}"]`);
                    if (select && rule.importAllAs) {
                        select.value = rule.importAllAs;
                    }
                });
            }, 100);
        }, 100);

        // Scroll to form
        document.querySelector('.enhanced-feature').scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * Delete a course link
     */
    static async deleteLink(primaryCourse, silent = false) {
        if (!silent && !confirm(`Delete link for "${primaryCourse}"? This will not delete any assignment data.`)) {
            return;
        }

        try {
            await CourseConfigManager.deleteAllCourseLinks(primaryCourse);
            await OptionsCourseLinking.displayExistingLinks();

            if (!silent) {
                OptionsCourseLinking.showSuccessMessage('Link deleted successfully');
            }
        } catch (error) {
            console.error('Error deleting link:', error);
            alert('Error deleting link: ' + error.message);
        }
    }

    /**
     * Create a new course link
     */
    static async createCourseLink() {
        const primaryCourse = document.getElementById('linkPrimaryCourse').value;
        const linkedCourses = OptionsCourseLinking.getSelectedLinkedCourses();
        const categoryRules = OptionsCourseLinking.getCategoryRulesFromUI();

        // Validation
        if (!primaryCourse) {
            alert('Please select a primary course');
            return;
        }

        if (linkedCourses.length === 0) {
            alert('Please select at least one course to link');
            return;
        }

        try {
            // Create the link
            await CourseConfigManager.linkCourses(primaryCourse, linkedCourses, categoryRules);

            // Reset form
            document.getElementById('linkPrimaryCourse').value = '';
            document.getElementById('linkCoursesCheckboxes').innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-secondary);">Select a primary course first</div>';
            document.getElementById('categoryRulesContainer').style.display = 'none';

            // Refresh display
            await OptionsCourseLinking.displayExistingLinks();

            OptionsCourseLinking.showSuccessMessage(`Successfully linked ${linkedCourses.length} course(s) to ${primaryCourse}`);
        } catch (error) {
            console.error('Error creating link:', error);
            alert('Error creating link: ' + error.message);
        }
    }

    /**
     * Show success message
     */
    static showSuccessMessage(message) {
        const btn = document.getElementById('createLinkBtn');
        const originalText = btn.textContent;
        btn.textContent = '✅ ' + message;
        btn.style.background = 'var(--success)';

        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 3000);
    }

    /**
     * Setup event listeners for course linking
     */
    static setupCourseLinkingListeners() {
        // Primary course selection
        document.getElementById('linkPrimaryCourse').addEventListener('change', async (e) => {
            const primaryCourse = e.target.value;
            const storage = await browser.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

            const courses = new Set();
            assignmentKeys.forEach(key => {
                const data = storage[key];
                if (data.allAssignments) {
                    data.allAssignments.forEach(assignment => {
                        if (assignment.course) {
                            courses.add(assignment.course);
                        }
                    });
                }
            });

            OptionsCourseLinking.updateLinkCoursesCheckboxes(Array.from(courses).sort(), primaryCourse);
        });

        // Create link button
        document.getElementById('createLinkBtn').addEventListener('click', OptionsCourseLinking.createCourseLink);
    }
}

// Expose to window for options.html
if (typeof window !== 'undefined') {
    window.OptionsCourseLinking = OptionsCourseLinking;
} 
