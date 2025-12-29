/**
 * Grade Management Module
 * Handles grade data loading, calculation, and display
 */

class GradeManager {
    constructor() {
        // Grade tab elements
        this.courseSelector = document.getElementById('courseSelector');
        this.gradeOverview = document.getElementById('gradeOverview');
        this.overallGradeDiv = document.getElementById('overallGrade');
        this.gradeSubtitleDiv = document.getElementById('gradeSubtitle');
        this.categoryListDiv = document.getElementById('categoryList');
        this.noGradesMessage = document.getElementById('noGradesMessage');
        this.predictGradeBtn = document.getElementById('predictGradeBtn');
        this.configureWeightsBtn = document.getElementById('configureWeightsBtn');
        this.predictionPanel = document.getElementById('predictionPanel');
        this.targetGradeInput = document.getElementById('targetGrade');
        this.predictionResultDiv = document.getElementById('predictionResult');

        // State
        this.currentCourseData = null;
        this.allCoursesData = {};
    }

    initialize() {
        this.setupEventListeners();
        this.setupStorageListener();
    }

    setupEventListeners() {
        // Course selector change
        this.courseSelector.addEventListener('change', async (e) => {
            const selectedCourse = e.target.value;
            if (selectedCourse) {
                await this.displayCourseGrades(selectedCourse);
            } else {
                this.showNoGradesMessage();
            }
        });

        // Prediction button
        this.predictGradeBtn.addEventListener('click', () => this.togglePredictionPanel());

        // Target grade input change
        this.targetGradeInput.addEventListener('input', this.debounce(() => this.updateGradePrediction(), 500));

        // Configure weights button
        this.configureWeightsBtn.addEventListener('click', () => {
            browser.runtime.openOptionsPage();
        });
    }

    setupStorageListener() {
        // Real-time updates when storage changes
        browser.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                const hasAssignmentChanges = Object.keys(changes).some(key =>
                    key.startsWith('assignments_')
                );

                if (hasAssignmentChanges && document.querySelector('.tab-button[data-tab="grades"].active')) {
                    console.log('📡 Grade data changed, refreshing...');
                    this.loadGradeData();
                }
            }
        });
    }

    /**
     * Load and process all grade data from storage
     */
    async loadGradeData() {
        try {
            console.log('📊 Loading grade data from storage...');

            const storage = await browser.storage.local.get();
            console.log('📦 Storage keys found:', Object.keys(storage).length);

            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));
            console.log('📋 Assignment keys found:', assignmentKeys.length, assignmentKeys);

            if (assignmentKeys.length === 0) {
                console.log('❌ No assignment keys found, showing no grades message');
                this.showNoGradesMessage();
                return;
            }

            // Process all stored assignment data
            this.allCoursesData = {};
            let hasAnyGrades = false;

            assignmentKeys.forEach(key => {
                const data = storage[key];

                if (data.allAssignments && data.allAssignments.length > 0) {
                    // Group assignments by course
                    data.allAssignments.forEach(assignment => {
                        const courseKey = assignment.course || 'Unknown Course';

                        if (!this.allCoursesData[courseKey]) {
                            this.allCoursesData[courseKey] = {
                                courseName: courseKey,
                                assignments: [],
                                extractedAt: data.extractedAt
                            };
                        }

                        // Avoid duplicates by checking assignment ID
                        const existingIndex = this.allCoursesData[courseKey].assignments
                            .findIndex(a => a.assignmentId === assignment.assignmentId);

                        if (existingIndex === -1) {
                            this.allCoursesData[courseKey].assignments.push(assignment);
                            if (assignment.isGraded) {
                                hasAnyGrades = true;
                            }
                        }
                    });
                }
            });

            console.log('📊 Grade check result:', { hasAnyGrades, coursesFound: Object.keys(this.allCoursesData).length });

            if (!hasAnyGrades) {
                console.log('❌ No graded assignments found, showing no grades message');
                this.showNoGradesMessage();
                return;
            }

            console.log('✅ Graded assignments found, populating UI');
            // Populate course selector and display data
            this.populateCourseSelector();

            // Auto-select first course with grades
            const firstCourseWithGrades = Object.keys(this.allCoursesData).find(courseKey => {
                return this.allCoursesData[courseKey].assignments.some(a => a.isGraded);
            });

            if (firstCourseWithGrades) {
                this.courseSelector.value = firstCourseWithGrades;
                await this.displayCourseGrades(firstCourseWithGrades);
            }

        } catch (error) {
            console.error('❌ Error loading grade data:', error);
            this.showNoGradesMessage();
        }
    }

    /**
     * Populate course selector dropdown
     */
    populateCourseSelector() {
        // Clear existing options (except the first placeholder)
        while (this.courseSelector.children.length > 1) {
            this.courseSelector.removeChild(this.courseSelector.lastChild);
        }

        Object.keys(this.allCoursesData).forEach(courseKey => {
            const courseData = this.allCoursesData[courseKey];
            const gradedCount = courseData.assignments.filter(a => a.isGraded).length;

            if (gradedCount > 0) {
                const option = document.createElement('option');
                option.value = courseKey;
                option.textContent = `${courseKey} (${gradedCount} graded assignments)`;
                this.courseSelector.appendChild(option);
            }
        });
    }

    /**
     * Display detailed grade breakdown for selected course
     */
    async displayCourseGrades(courseKey) {
        if (!this.allCoursesData[courseKey]) {
            this.showNoGradesMessage();
            return;
        }

        const courseData = this.allCoursesData[courseKey];
        this.currentCourseData = courseData;

        try {
            // Calculate enhanced statistics using CourseConfigManager
            const enhancedStats = await this.calculateEnhancedGradeStatistics(courseData.assignments, courseKey);

            if (!enhancedStats.hasGrades) {
                this.showNoGradesMessage();
                return;
            }

            // Show grade overview (with weights if configured)
            this.displayGradeOverview(enhancedStats, courseKey);

            // Check and display low confidence warning
            this.checkLowConfidenceWarning(enhancedStats);

            // Show category breakdown
            this.displayCategoryBreakdown(enhancedStats);

            // Hide no-grades message
            this.noGradesMessage.style.display = 'none';

            console.log(`✅ Displayed grades for ${courseKey}:`, enhancedStats);

        } catch (error) {
            console.error('❌ Error calculating grades for', courseKey, error);
            this.showNoGradesMessage();
        }
    }

    /**
     * Display overall grade summary
     */
    displayGradeOverview(stats, courseName) {
        this.gradeOverview.style.display = 'block';

        // Check if weighted grades are configured
        if (stats.weighted && stats.weighted.weightedAverage > 0) {
            const weighted = stats.weighted.weightedAverage;
            const simple = stats.averagePercentage;

            // Check if there are future categories
            const hasFutureCategories = stats.weighted.hasFutureCategories;
            const percentageOfTotal = stats.weighted.totalWeightGraded;

            let gradeDisplay = `
            <div style="font-size: 2rem; font-weight: bold;">${weighted.toFixed(1)}%</div>
        `;

            if (hasFutureCategories) {
                gradeDisplay += `
                <div style="font-size: 0.9rem; opacity: 0.9; margin-top: 5px;">
                    Based on ${(percentageOfTotal * 100).toFixed(0)}% of course
                </div>
            `;
            }

            // Show applied clobber policies if any
            const appliedPolicies = stats.weighted.appliedClobberPolicies || [];
            if (appliedPolicies.length > 0) {
                gradeDisplay += `
                <div style="font-size: 0.85rem; opacity: 0.9; margin-top: 5px; color: #ffe0b2;">
                    🔄 ${appliedPolicies.length} policy(ies) applied
                </div>
            `;
            }

            gradeDisplay += `
            <div style="font-size: 0.9rem; opacity: 0.85; margin-top: 3px;">
                Simple: ${simple.toFixed(1)}% ·
                <a href="#" id="configureLink" style="color: white; text-decoration: underline;">Configure</a>
            </div>
        `;

            this.overallGradeDiv.innerHTML = gradeDisplay;

            const subtitleParts = [`Weighted (${stats.gradedCount} of ${stats.totalCount} assignments)`];

            if (hasFutureCategories) {
                const futureCount = Object.values(stats.weighted.categoryDetails).filter(d => d.isFuture).length;
                subtitleParts.push(`${futureCount} future category(ies)`);
            }

            this.gradeSubtitleDiv.textContent = subtitleParts.join(' · ');

            // Add click handler for configure link
            setTimeout(() => {
                document.getElementById('configureLink')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    browser.runtime.openOptionsPage();
                });
            }, 100);

        } else {
            // No weighted config - show simple average
            this.overallGradeDiv.textContent = `${stats.averagePercentage.toFixed(1)}%`;
            this.gradeSubtitleDiv.innerHTML = `
            Based on ${stats.gradedCount} of ${stats.totalCount} assignments ·
            <a href="#" id="configureLink" style="color: inherit; text-decoration: underline; font-size: 0.9em;">Configure weights</a>
        `;

            // Add click handler
            setTimeout(() => {
                document.getElementById('configureLink')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    browser.runtime.openOptionsPage();
                });
            }, 100);
        }

        // Color-code the grade
        const displayGrade = stats.weighted?.weightedAverage || stats.averagePercentage;
        this.gradeOverview.style.background = this.getGradeColor(displayGrade);

        // Show excluded assignments indicator if present
        this.displayExcludedAssignmentsIndicator(stats);

        // Show linked courses indicator if present
        this.displayLinkedCoursesIndicator(courseName, stats);
    }

    /**
     * Display indicator when assignments are excluded
     */
    displayExcludedAssignmentsIndicator(stats) {
        // Remove existing indicator
        const existingIndicator = this.gradeOverview.querySelector('.excluded-assignments-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        // Check if any assignments are excluded
        if (stats.excluded && stats.excluded.count > 0) {
            const indicator = document.createElement('div');
            indicator.className = 'excluded-assignments-indicator';
            indicator.innerHTML = `
                <div style="font-size: 0.85rem; margin-top: 10px; padding: 8px; background: rgba(255, 152, 0, 0.2); border-radius: 4px; color: #f57c00;">
                    🚫 ${stats.excluded.count} assignment(s) excluded from grade calculation
                </div>
            `;
            this.gradeOverview.appendChild(indicator);
        }
    }

    /**
     * Display indicator when course has linked courses
     */
    async displayLinkedCoursesIndicator(courseName, stats) {
        // Remove existing indicator
        const existingIndicator = this.gradeOverview.querySelector('.linked-courses-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        // Check if course has links
        const linkStatus = await CourseConfigManager.isCourseLinked(courseName);

        if (linkStatus.linked && linkStatus.role === 'primary') {
            const indicator = document.createElement('div');
            indicator.className = 'linked-courses-indicator';
            indicator.innerHTML = `
                <div style="font-size: 0.85rem; margin-top: 10px; padding: 8px; background: rgba(33, 150, 243, 0.2); border-radius: 4px; color: #1976d2;">
                    🔗 Includes ${linkStatus.linkData.linkedCourses.length} linked course(s): ${linkStatus.linkData.linkedCourses.join(', ')}
                </div>
            `;
            this.gradeOverview.appendChild(indicator);
        }
    }

    /**
     * Check and display low confidence warning
     */
    checkLowConfidenceWarning(stats) {
        // Remove existing warning if present
        const existingWarning = this.gradeOverview.querySelector('.low-confidence-warning');
        if (existingWarning) {
            existingWarning.remove();
        }

        // Calculate percentage of course completed
        const percentageCompleted = stats.totalCount > 0
            ? (stats.gradedCount / stats.totalCount) * 100
            : 0;

        // Show warning if less than 30% of course is graded
        if (percentageCompleted < 30 && percentageCompleted > 0) {
            const warning = document.createElement('div');
            warning.className = 'low-confidence-warning';
            warning.innerHTML = `
                <div style="font-size: 0.85rem; margin-top: 10px; padding: 8px; background: rgba(255, 152, 0, 0.2); border-radius: 4px; color: white;">
                    ⚠️ Early estimate (only ${percentageCompleted.toFixed(0)}% of course graded)
                </div>
            `;

            this.gradeOverview.appendChild(warning);
        }
    }

    /**
     * Display category breakdown with confidence indicators
     */
    displayCategoryBreakdown(stats) {
        this.categoryListDiv.innerHTML = '';

        if (!stats.categoryStats || Object.keys(stats.categoryStats).length === 0) {
            const noCategories = document.createElement('div');
            noCategories.className = 'category-item';
            noCategories.innerHTML = `
                <div style="text-align: center; width: 100%; color: #6c757d;">
                    No categorized assignments found
                </div>
            `;
            this.categoryListDiv.appendChild(noCategories);
            return;
        }

        Object.entries(stats.categoryStats).forEach(([category, categoryStats]) => {
            const categoryItem = this.createCategoryItem(category, categoryStats, stats);
            this.categoryListDiv.appendChild(categoryItem);
        });
    }

    /**
     * Create individual category display item
     */
    createCategoryItem(category, categoryStats, overallStats) {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category-item';

        // Calculate confidence level for this category
        const assignments = categoryStats.assignments || [];
        const avgConfidence = assignments.reduce((sum, a) => sum + (a.confidence || 0), 0) / assignments.length;
        const confidenceLevel = avgConfidence >= 0.8 ? 'high' : avgConfidence >= 0.6 ? 'medium' : 'low';

        // Check if this category needs review
        const needsReview = overallStats.categorization?.needsReview?.some(item =>
            item.assignment && assignments.some(a => a.title === item.assignment.title)
        ) || false;

        // Build stats text showing included/total and graded counts
        const includedCount = categoryStats.totalCount;
        const totalCount = categoryStats.totalCountAll || categoryStats.totalCount;
        const gradedCount = categoryStats.gradedCount;

        let statsText;
        if (totalCount > includedCount) {
            // Show "(X/Y assignments)" when some are excluded
            statsText = `${gradedCount} graded · (${includedCount}/${totalCount} assignments)`;
        } else {
            // Original format when no exclusions
            statsText = `${gradedCount}/${totalCount} graded`;
        }

        categoryDiv.innerHTML = `
            <div class="category-icon">${categoryStats.icon}</div>
            <div class="category-info">
                <div class="category-name">${categoryStats.name}</div>
                <div class="category-stats">${statsText}</div>
            </div>
            <div style="text-align: right;">
                <div class="category-grade">${categoryStats.averagePercentage.toFixed(1)}%</div>
                <div class="confidence-indicator">
                    <span class="confidence-badge confidence-${confidenceLevel}">
                        ${confidenceLevel.toUpperCase()}
                    </span>
                    ${needsReview ? '<button class="review-button">Review</button>' : ''}
                </div>
            </div>
        `;

        // Add review button functionality
        const reviewBtn = categoryDiv.querySelector('.review-button');
        if (reviewBtn) {
            reviewBtn.addEventListener('click', () => this.showCategoryReview(category, assignments));
        }

        return categoryDiv;
    }

    /**
     * Show category review dialog for uncertain assignments
     */
    showCategoryReview(category, assignments) {
        const reviewItems = assignments
            .filter(a => (a.confidence || 0) < 0.6)
            .map(a => `• ${a.title} (${((a.confidence || 0) * 100).toFixed(0)}% confidence)`)
            .join('\n');

        alert(`🔍 ${category.toUpperCase()} - Assignments needing review:\n\n${reviewItems}\n\nThese assignments were automatically categorized with low confidence. You can manually adjust categories in the full options page.`);
    }

    /**
     * Get color gradient based on grade percentage
     */
    getGradeColor(percentage) {
        if (percentage >= 90) return 'linear-gradient(135deg, #48bb78 0%, #38a169 100%)'; // Green
        if (percentage >= 80) return 'linear-gradient(135deg, #4299e1 0%, #3182ce 100%)'; // Blue
        if (percentage >= 70) return 'linear-gradient(135deg, #ed8936 0%, #dd6b20 100%)'; // Orange
        return 'linear-gradient(135deg, #f56565 0%, #e53e3e 100%)'; // Red
    }

    /**
     * Show no grades message
     */
    showNoGradesMessage() {
        this.gradeOverview.style.display = 'none';
        this.categoryListDiv.innerHTML = '';
        this.noGradesMessage.style.display = 'block';
    }

    // =============================================================================
    // GRADE CALCULATION
    // =============================================================================

    /**
     * Enhanced grade statistics calculation with configuration support
     */
    async calculateEnhancedGradeStatistics(assignments, courseName) {
        if (assignments.length === 0) {
            return {
                hasGrades: false,
                averagePercentage: 0,
                totalPoints: 0,
                earnedPoints: 0,
                gradedCount: 0,
                totalCount: 0,
                categories: {},
                categoryStats: {},
                categorization: { total: 0, highConfidence: 0, needsReview: [] },
                excluded: { count: 0, list: [] }
            };
        }

        // Get course configuration
        const config = await CourseConfigManager.getCourseConfig(courseName);
        const excludedIds = config.excludedAssignments || [];

        // Separate excluded and included assignments
        const excludedAssignments = assignments.filter(a => excludedIds.includes(a.assignmentId));
        const includedAssignments = assignments.filter(a => !excludedIds.includes(a.assignmentId));

        console.log(`📊 Popup stats: ${includedAssignments.length} included, ${excludedAssignments.length} excluded`);

        // Apply configuration and calculate grades
        // IMPORTANT: This returns MODIFIED assignments (past-due converted to 0/maxPoints)
        const gradeResults = await CourseConfigManager.calculateGradesWithConfig(courseName, assignments);

        // Calculate basic stats from MODIFIED assignments (after past-due conversion)
        const modifiedAssignments = gradeResults.assignments || assignments;
        const basicStats = this.calculateBasicGradeStatistics(modifiedAssignments);

        // Run client-side categorization for display (use MODIFIED included assignments)
        const modifiedIncluded = modifiedAssignments.filter(a => !excludedIds.includes(a.assignmentId));
        const categorizedAssignments = this.categorizeAssignmentsClient(modifiedIncluded);

        // Calculate category-specific stats (using MODIFIED assignments)
        const categoryStats = {};
        Object.entries(categorizedAssignments).forEach(([category, categoryAssignments]) => {
            const gradedInCategory = categoryAssignments.filter(a => a.isGraded && a.earnedPoints !== null);

            // Count total assignments in this category (across all assignments, not just included)
            const totalInCategory = assignments.filter(a => {
                const aCategory = a.category || this.categorizeAssignmentTitle(a.title);
                return aCategory === category;
            }).length;

            if (gradedInCategory.length > 0 || categoryAssignments.length > 0) {
                const totalEarned = gradedInCategory.reduce((sum, a) => sum + a.earnedPoints, 0);
                const totalPossible = gradedInCategory.reduce((sum, a) => sum + a.maxPoints, 0);

                categoryStats[category] = {
                    name: this.getCategoryDisplayName(category),
                    icon: this.getCategoryIcon(category),
                    averagePercentage: totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0,
                    totalPoints: totalPossible,
                    earnedPoints: totalEarned,
                    gradedCount: gradedInCategory.length,
                    totalCount: categoryAssignments.length, // Included count
                    totalCountAll: totalInCategory, // Total count (including excluded)
                    assignments: categoryAssignments.map(a => ({
                        ...a,
                        confidence: a.categoryConfidence || 0
                    }))
                };
            }
        });

        return {
            ...basicStats,
            weighted: gradeResults.weighted,
            config: gradeResults.config,
            categories: categorizedAssignments,
            categoryStats,
            categorization: {
                total: assignments.length,
                totalIncluded: modifiedIncluded.length,
                highConfidence: modifiedIncluded.filter(a => (a.categoryConfidence || 0) >= 0.8).length,
                needsReview: modifiedIncluded.filter(a => (a.categoryConfidence || 0) < 0.6).map(a => ({
                    assignment: { title: a.title, course: a.course, id: a.assignmentId }
                }))
            },
            excluded: {
                count: excludedAssignments.length,
                list: excludedAssignments.map(a => ({ title: a.title, id: a.assignmentId }))
            }
        };
    }

    /**
     * Basic grade statistics calculation
     */
    calculateBasicGradeStatistics(assignments) {
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
     * Client-side assignment categorization (simplified)
     */
    categorizeAssignmentsClient(assignments) {
        const categories = {};

        assignments.forEach(assignment => {
            // Use existing category if available, otherwise categorize
            let category = assignment.category || this.categorizeAssignmentTitle(assignment.title);

            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(assignment);
        });

        return categories;
    }

    /**
     * Simple title-based categorization
     */
    categorizeAssignmentTitle(title) {
        const titleLower = title.toLowerCase();

        if (/^(hw|homework|problem\s*set|pset|assignment)\s*\d*/i.test(title)) return 'homework';
        if (/^(lab|laboratory)\s*\d*/i.test(title)) return 'lab';
        if (/^(midterm|mt|exam|test)\s*\d*/i.test(title)) return 'midterm';
        if (/^final/i.test(title)) return 'final';
        if (/^(project|proj)\s*\d*/i.test(title)) return 'project';
        if (/^quiz\s*\d*/i.test(title)) return 'quiz';

        return 'other';
    }

    /**
     * Get display name for category
     */
    getCategoryDisplayName(category) {
        const names = {
            homework: 'Homework', lab: 'Labs', midterm: 'Midterms',
            final: 'Final Exam', project: 'Projects', quiz: 'Quizzes',
            participation: 'Participation', other: 'Other'
        };
        return names[category] || 'Other';
    }

    /**
     * Get emoji icon for category
     */
    getCategoryIcon(category) {
        const icons = {
            homework: '📝', lab: '🔬', midterm: '📊', final: '🎓',
            project: '🚀', quiz: '❓', participation: '👥', other: '❓'
        };
        return icons[category] || '❓';
    }

    // =============================================================================
    // GRADE PREDICTION
    // =============================================================================

    /**
     * Calculate what grade is needed on remaining assignments
     */
    calculateGradePrediction(targetGrade, courseStats) {
        if (!courseStats.hasGrades || !this.currentCourseData || !this.currentCourseData.assignments) {
            return {
                possible: false,
                message: 'No grade data available for prediction'
            };
        }

        const assignments = this.currentCourseData.assignments;

        if (!assignments || assignments.length === 0) {
            return {
                possible: false,
                message: 'No assignments found for this course'
            };
        }

        const gradedAssignments = assignments.filter(a => a.isGraded && a.earnedPoints !== null);
        const remainingAssignments = assignments.filter(a => !a.isGraded || a.earnedPoints === null);

        if (remainingAssignments.length === 0) {
            return {
                possible: courseStats.averagePercentage >= targetGrade,
                currentGrade: courseStats.averagePercentage,
                message: `You already have a ${courseStats.averagePercentage.toFixed(1)}%. ${courseStats.averagePercentage >= targetGrade ? '🎉 Target achieved!' : '❌ Target not reachable with current grades.'}`
            };
        }

        // Simple calculation assuming equal weight for remaining assignments
        const currentPoints = gradedAssignments.reduce((sum, a) => sum + a.earnedPoints, 0);
        const currentMaxPoints = gradedAssignments.reduce((sum, a) => sum + a.maxPoints, 0);

        // Estimate remaining points (use average of graded assignments)
        const avgPointsPerAssignment = currentMaxPoints / gradedAssignments.length;
        const estimatedRemainingMaxPoints = remainingAssignments.length * avgPointsPerAssignment;
        const totalEstimatedMaxPoints = currentMaxPoints + estimatedRemainingMaxPoints;

        // Calculate needed points
        const targetPoints = (targetGrade / 100) * totalEstimatedMaxPoints;
        const neededPoints = targetPoints - currentPoints;
        const neededPercentage = (neededPoints / estimatedRemainingMaxPoints) * 100;

        return {
            possible: neededPercentage <= 100,
            neededPercentage: Math.max(0, neededPercentage),
            remainingAssignments: remainingAssignments.length,
            currentGrade: courseStats.averagePercentage,
            message: neededPercentage <= 100
                ? `You need to average ${neededPercentage.toFixed(1)}% on the remaining ${remainingAssignments.length} assignments.`
                : `Target ${targetGrade}% is not achievable with current grades. Maximum possible: ${((currentPoints + estimatedRemainingMaxPoints) / totalEstimatedMaxPoints * 100).toFixed(1)}%`
        };
    }

    /**
     * Show/hide grade prediction panel
     */
    togglePredictionPanel() {
        const isVisible = this.predictionPanel.classList.contains('show');

        if (isVisible) {
            this.predictionPanel.classList.remove('show');
            this.predictGradeBtn.textContent = '🎯 What grade do I need?';
        } else {
            this.predictionPanel.classList.add('show');
            this.predictGradeBtn.textContent = '❌ Hide prediction';
            this.updateGradePrediction();
        }
    }

    /**
     * Update grade prediction display
     */
    updateGradePrediction() {
        const targetGrade = parseFloat(this.targetGradeInput.value) || 90;

        if (!this.currentCourseData) {
            this.predictionResultDiv.textContent = 'Please select a course first';
            return;
        }

        const courseStats = this.calculateBasicGradeStatistics(this.currentCourseData.assignments);
        const prediction = this.calculateGradePrediction(targetGrade, courseStats);

        if (!prediction) {
            this.predictionResultDiv.textContent = 'No grade data available for prediction';
            return;
        }

        this.predictionResultDiv.innerHTML = `
            <div style="margin-bottom: 5px;">Current: ${prediction.currentGrade.toFixed(1)}%</div>
            <div>${prediction.message}</div>
        `;

        // Color-code the result
        this.predictionResultDiv.style.color = prediction.possible ? '#28a745' : '#dc3545';
    }

    /**
     * Debounce utility function
     */
    debounce(func, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }
}

// Export for use in main popup.js
window.GradeManager = GradeManager;
