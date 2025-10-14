/**
 * Storage Utilities Module
 * Helper functions for accessing Chrome storage
 */

class StorageUtils {
    /**
     * Get all stored assignments
     */
    static async getAllStoredAssignments() {
        try {
            const storage = await chrome.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

            let allAssignments = [];
            assignmentKeys.forEach(key => {
                if (storage[key].assignments) {
                    allAssignments.push(...storage[key].assignments);
                }
            });

            const uniqueAssignments = allAssignments.filter((assignment, index, array) =>
                array.findIndex(a => a.assignmentId === assignment.assignmentId) === index
            );

            return uniqueAssignments;
        } catch (error) {
            console.error('Error getting stored assignments:', error);
            return [];
        }
    }

    /**
     * Get all courses with grade data from storage
     */
    static async getAllCoursesWithGrades() {
        try {
            const storage = await chrome.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

            const courses = {};

            assignmentKeys.forEach(key => {
                const data = storage[key];

                // Check if this entry has enhanced grade data
                if (data.allAssignments && data.gradeStats) {
                    data.allAssignments.forEach(assignment => {
                        const courseKey = assignment.course || 'Unknown Course';

                        if (!courses[courseKey]) {
                            courses[courseKey] = {
                                courseName: courseKey,
                                assignments: [],
                                gradeStats: data.gradeStats,
                                categoryBreakdown: data.categoryBreakdown,
                                needsReview: data.needsReview || [],
                                extractedAt: data.extractedAt,
                                semester: assignment.semester
                            };
                        }

                        // Add assignment if not already present
                        const existingIndex = courses[courseKey].assignments
                            .findIndex(a => a.assignmentId === assignment.assignmentId);

                        if (existingIndex === -1) {
                            courses[courseKey].assignments.push(assignment);
                        }
                    });
                }
            });

            return courses;
        } catch (error) {
            console.error('❌ Error accessing course grade data:', error);
            return {};
        }
    }

    /**
     * Get specific course grade data
     */
    static async getCourseGradeData(courseName) {
        const allCourses = await this.getAllCoursesWithGrades();
        return allCourses[courseName] || null;
    }

    /**
     * Get assignments needing manual review across all courses
     */
    static async getAssignmentsNeedingReview() {
        try {
            const storage = await chrome.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

            let allReviewItems = [];

            assignmentKeys.forEach(key => {
                const data = storage[key];
                if (data.needsReview && data.needsReview.length > 0) {
                    allReviewItems.push(...data.needsReview.map(item => ({
                        ...item,
                        source: key,
                        extractedAt: data.extractedAt
                    })));
                }
            });

            // Sort by confidence (lowest first)
            return allReviewItems.sort((a, b) => (a.confidence || 0) - (b.confidence || 0));

        } catch (error) {
            console.error('❌ Error getting review items:', error);
            return [];
        }
    }

    /**
     * Debug function to inspect stored grade data
     */
    static async debugGradeStorage() {
        console.log('🔍 GRADE STORAGE DEBUG:');

        const courses = await this.getAllCoursesWithGrades();
        console.log(`📚 Found ${Object.keys(courses).length} courses with grade data:`);

        Object.entries(courses).forEach(([courseName, courseData]) => {
            console.log(`\n📖 ${courseName}:`);
            console.log(`   📊 Assignments: ${courseData.assignments.length}`);
            console.log(`   🎯 Graded: ${courseData.assignments.filter(a => a.isGraded).length}`);

            if (courseData.gradeStats) {
                console.log(`   📈 Overall: ${courseData.gradeStats.averagePercentage?.toFixed(1)}%`);
            }

            if (courseData.categoryBreakdown) {
                console.log(`   📁 Categories: ${Object.keys(courseData.categoryBreakdown).join(', ')}`);
            }

            if (courseData.needsReview && courseData.needsReview.length > 0) {
                console.log(`   ⚠️ Needs review: ${courseData.needsReview.length} assignments`);
            }
        });

        const reviewItems = await this.getAssignmentsNeedingReview();
        if (reviewItems.length > 0) {
            console.log(`\n⚠️ ASSIGNMENTS NEEDING REVIEW (${reviewItems.length}):`);
            reviewItems.forEach(item => {
                console.log(`   • "${item.assignment?.title}" - ${((item.confidence || 0) * 100).toFixed(0)}%`);
            });
        }
    }
}

// Export for use in other modules
window.StorageUtils = StorageUtils;
// Expose debug function to window
window.debugGradeStorage = () => StorageUtils.debugGradeStorage();
