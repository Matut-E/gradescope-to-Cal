// =============================================================================
// OPTIONS STORAGE MODULE
// =============================================================================
// Handles course sidebar population and loading course data for configuration.
// Extracted from options.js as part of modular refactoring.

/**
 * OptionsStorage - Handles course sidebar and data loading
 *
 * This module manages:
 * - Populating the course sidebar with courses that have grade data
 * - Creating sidebar items with configuration status and grade display
 * - Updating sidebar status after configuration changes
 * - Loading course data for configuration editing
 */
class OptionsStorage {

    // =============================================================================
    // COURSE SIDEBAR POPULATION
    // =============================================================================

    /**
     * Populate course sidebar with courses that have grade data
     *
     * Loads all assignments from storage, groups by course, and displays:
     * - Configuration status (✓ = configured, ○ = not configured)
     * - Current grade (if configured)
     * - Assignment counts (graded/total)
     *
     * Only shows courses with at least one graded assignment.
     *
     * @returns {Promise<void>}
     */
    static async populateCourseSidebar() {
        const courseList = document.getElementById('courseList');
        const courseCount = document.getElementById('courseCount');

        try {
            const storage = await browser.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));
            const courseConfigs = storage.courseConfigs || {};

            const courses = {};

            assignmentKeys.forEach(key => {
                const data = storage[key];
                if (data.allAssignments && data.allAssignments.length > 0) {
                    data.allAssignments.forEach(assignment => {
                        const courseName = assignment.course || 'Unknown Course';

                        if (!courses[courseName]) {
                            courses[courseName] = {
                                assignmentIds: new Set(),
                                hasGrades: false,
                                gradedCount: 0,
                                totalCount: 0
                            };
                        }

                        courses[courseName].assignmentIds.add(assignment.assignmentId);
                        courses[courseName].totalCount = courses[courseName].assignmentIds.size;

                        if (assignment.isGraded) {
                            courses[courseName].hasGrades = true;
                            courses[courseName].gradedCount++;
                        }
                    });
                }
            });

            // Clear existing course items
            courseList.innerHTML = '';

            // Add course items to sidebar
            const courseNames = Object.keys(courses).sort();

            // Process courses sequentially to calculate grades
            for (const courseName of courseNames) {
                const courseInfo = courses[courseName];
                if (courseInfo.hasGrades) {
                    const config = courseConfigs[courseName];
                    const isConfigured = config && config.weights;

                    // Calculate grade if configured
                    let gradeDisplay = '';
                    if (isConfigured) {
                        try {
                            // Extract assignments for this course from storage
                            const assignments = [];
                            assignmentKeys.forEach(key => {
                                const data = storage[key];
                                if (data.allAssignments) {
                                    const courseAssignments = data.allAssignments.filter(a => a.course === courseName);
                                    assignments.push(...courseAssignments);
                                }
                            });

                            // Deduplicate by assignment ID
                            const uniqueAssignments = assignments.filter((assignment, index, array) =>
                                array.findIndex(a => a.assignmentId === assignment.assignmentId) === index
                            );

                            // Calculate grades with proper async call
                            const gradeData = await window.CourseConfigManager.calculateGradesWithConfig(courseName, uniqueAssignments);

                            // Use weighted grade if available, otherwise simple grade
                            const currentGrade = gradeData.weighted?.currentGrade ?? gradeData.simple?.currentGrade;

                            if (currentGrade !== null && currentGrade !== undefined) {
                                const isPoints = config.system === 'points';
                                if (isPoints && config.totalPoints) {
                                    // For points mode: show "earned/total pts (percentage%)"
                                    const earnedPoints = Math.round((currentGrade / 100) * config.totalPoints);
                                    gradeDisplay = `${earnedPoints}/${config.totalPoints} pts (${currentGrade.toFixed(1)}%) • ${courseInfo.gradedCount}/${courseInfo.totalCount} graded`;
                                } else {
                                    // For percentage mode: show percentage only
                                    gradeDisplay = `${currentGrade.toFixed(1)}% (${courseInfo.gradedCount}/${courseInfo.totalCount} graded)`;
                                }
                            }
                        } catch (error) {
                            console.error(`Error calculating grade for ${courseName}:`, error);
                        }
                    }

                    const courseItem = OptionsStorage.createCourseItem(courseName, courseInfo, isConfigured, gradeDisplay);
                    courseList.appendChild(courseItem);
                }
            }

            // Update course count
            const displayedCount = courseNames.length;
            courseCount.textContent = `${displayedCount} course${displayedCount !== 1 ? 's' : ''}`;

            console.log(`Added ${displayedCount} courses to sidebar`);

        } catch (error) {
            console.error('Error populating course sidebar:', error);
        }
    }

    /**
     * Create a course item element for the sidebar
     *
     * Creates a clickable sidebar item with:
     * - Status icon (✓ = configured, ○ = not configured)
     * - Course name
     * - Grade display (if configured) or "Configure →" prompt
     *
     * @param {string} courseName - Name of the course
     * @param {Object} courseInfo - Course information
     * @param {number} courseInfo.gradedCount - Number of graded assignments
     * @param {number} courseInfo.totalCount - Total number of assignments
     * @param {boolean} isConfigured - Whether course has grade configuration
     * @param {string} gradeDisplay - Formatted grade string (empty if not configured)
     * @returns {HTMLElement} The course item element
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
            window.CourseConfigUI.selectCourse(courseName);
        });

        return item;
    }

    /**
     * Update sidebar status for a specific course
     *
     * Updates the sidebar item after configuration changes:
     * - Marks as configured (✓ icon) or not configured (○ icon)
     * - Updates grade display with current grade or "Configure →" prompt
     * - Refreshes graded/total assignment counts
     *
     * @param {string} courseName - Name of the course to update
     * @returns {Promise<void>}
     */
    static async updateSidebarStatus(courseName) {
        const courseItem = document.querySelector(`.course-item[data-course-id="${courseName}"]`);
        if (!courseItem) return;

        try {
            const storage = await browser.storage.local.get();
            const courseConfigs = storage.courseConfigs || {};
            const config = courseConfigs[courseName];
            const isConfigured = config && config.weights;

            // Update configured state
            const statusIcon = courseItem.querySelector('.course-status-icon');
            if (isConfigured) {
                courseItem.classList.add('configured');
                statusIcon.textContent = '✓';
                statusIcon.setAttribute('aria-label', 'Configured');
            } else {
                courseItem.classList.remove('configured');
                statusIcon.textContent = '○';
                statusIcon.setAttribute('aria-label', 'Not configured');
            }

            // Update grade display
            const metaDiv = courseItem.querySelector('.course-meta, .course-grade');
            if (!metaDiv) return;

            if (isConfigured) {
                try {
                    // Extract assignments for this course from storage
                    const assignments = [];
                    const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));
                    assignmentKeys.forEach(key => {
                        const data = storage[key];
                        if (data.allAssignments) {
                            const courseAssignments = data.allAssignments.filter(a => a.course === courseName);
                            assignments.push(...courseAssignments);
                        }
                    });

                    // Deduplicate by assignment ID
                    const uniqueAssignments = assignments.filter((assignment, index, array) =>
                        array.findIndex(a => a.assignmentId === assignment.assignmentId) === index
                    );

                    // Calculate grades with proper async call
                    const gradeData = await window.CourseConfigManager.calculateGradesWithConfig(courseName, uniqueAssignments);

                    // Use weighted grade if available, otherwise simple grade
                    const currentGrade = gradeData.weighted?.currentGrade ?? gradeData.simple?.currentGrade;

                    if (currentGrade !== null && currentGrade !== undefined) {
                        metaDiv.className = 'course-grade';

                        // Count graded assignments
                        const gradedCount = uniqueAssignments.filter(a => a.isGraded).length;
                        const totalCount = uniqueAssignments.length;

                        const isPoints = config.system === 'points';
                        if (isPoints && config.totalPoints) {
                            // For points mode: show "earned/total pts (percentage%)"
                            const earnedPoints = Math.round((currentGrade / 100) * config.totalPoints);
                            metaDiv.textContent = `${earnedPoints}/${config.totalPoints} pts (${currentGrade.toFixed(1)}%) • ${gradedCount}/${totalCount} graded`;
                        } else {
                            // For percentage mode: show percentage only
                            metaDiv.textContent = `${currentGrade.toFixed(1)}% (${gradedCount}/${totalCount} graded)`;
                        }
                    }
                } catch (error) {
                    console.error(`Error calculating grade for ${courseName}:`, error);
                }
            } else {
                // Not configured - show "Configure →" prompt
                metaDiv.className = 'course-meta';
                metaDiv.textContent = 'Configure →';
            }

        } catch (error) {
            console.error('Error updating sidebar status:', error);
        }
    }

    // =============================================================================
    // COURSE LOADING FOR CONFIGURATION
    // =============================================================================

    /**
     * Load course data and populate UI - UPDATED with modal trigger
     *
     * This function:
     * 1. Loads all assignments for the specified course from storage
     * 2. Deduplicates assignments by ID
     * 3. Loads existing configuration (if any)
     * 4. Stores data in currentCourseData global
     * 5. Shows grade setup modal if this is the first time (and has grades)
     * 6. Shows Berkeley template suggestion (if applicable)
     * 7. Populates the configuration UI
     *
     * @param {string} courseName - Name of the course to load
     * @returns {Promise<void>}
     */
    static async loadCourseForConfiguration(courseName) {
        try {
            // Get all assignments for this course
            const storage = await browser.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

            const assignments = [];
            assignmentKeys.forEach(key => {
                const data = storage[key];
                if (data.allAssignments) {
                    const courseAssignments = data.allAssignments.filter(a => a.course === courseName);
                    assignments.push(...courseAssignments);
                }
            });

            // Deduplicate by assignment ID
            const uniqueAssignments = assignments.filter((assignment, index, array) =>
                array.findIndex(a => a.assignmentId === assignment.assignmentId) === index
            );

            // Load existing configuration
            const config = await window.CourseConfigManager.getCourseConfig(courseName);

            // Store in global currentCourseData
            window.currentCourseData = {
                courseName: courseName,
                assignments: uniqueAssignments,
                config: config  // Store config in currentCourseData
            };

            // NEW: Show setup modal if this is first time AND has grades
            const gradedCount = uniqueAssignments.filter(a => a.isGraded).length;
            if (gradedCount > 0) {
                await window.showGradeSetupModalIfNeeded(courseName, uniqueAssignments.length);
            }

            // Check for Berkeley template suggestion
            const template = window.CourseConfigManager.suggestTemplate(courseName);
            if (template && !config.weights) {
                window.OptionsTemplates.showTemplateSuggestion(template);
            } else {
                window.OptionsTemplates.hideTemplateSuggestion();
            }

            // Populate UI with config
            window.populateConfigurationUI(config, uniqueAssignments);

            console.log(`Loaded configuration for ${courseName} (${uniqueAssignments.length} assignments)`);

        } catch (error) {
            console.error('Error loading course configuration:', error);
        }
    }
}

// Export to window for HTML script loading
window.OptionsStorage = OptionsStorage;

// Expose loadCourseForConfiguration as a global function for backward compatibility
window.loadCourseForConfiguration = OptionsStorage.loadCourseForConfiguration;
