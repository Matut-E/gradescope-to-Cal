/**
 * Test and Debug Functions
 * Testing utilities for assignment extraction and categorization
 *
 * Extracted from contentScript.js for better maintainability
 */

class TestFunctions {
    /**
     * Test basic grade extraction on current page
     */
    static testGradeExtraction() {
        console.log('🧪 Testing grade extraction on current page...');

        const table = document.querySelector('table');
        if (!table) {
            console.log('❌ No assignment table found');
            return;
        }

        const rows = table.querySelectorAll('tbody tr');
        console.log(`📋 Found ${rows.length} rows to analyze`);

        const mockCourse = { id: '123', shortName: 'Test Course' };

        rows.forEach((row, index) => {
            const assignment = AssignmentParser.parseAssignmentFromRow(row, mockCourse);

            if (assignment) {
                console.log(`✅ Row ${index + 1}: ${assignment.title}`);
                console.log(`   📊 Status: ${assignment.submissionStatus}`);
                console.log(`   📝 Submitted: ${assignment.isSubmitted}, Graded: ${assignment.isGraded}`);

                if (assignment.isGraded) {
                    console.log(`   🎯 Score: ${assignment.earnedPoints}/${assignment.maxPoints} (${assignment.gradePercentage?.toFixed(1)}%)`);
                }

                if (assignment.isLate) {
                    console.log(`   ⏰ Late submission detected`);
                }
            } else {
                console.log(`⚪ Row ${index + 1}: Not an assignment row`);
            }
        });
    }

    /**
     * Enhanced test function with categorization analysis
     */
    static testGradeExtractionWithCategories() {
        console.log('🧪 Testing enhanced grade extraction with categorization...');

        const table = document.querySelector('table');
        if (!table) {
            console.log('❌ No assignment table found');
            return;
        }

        const rows = table.querySelectorAll('tbody tr');
        console.log(`📋 Found ${rows.length} rows to analyze`);

        const mockCourse = { id: '123', shortName: 'Test Course' };
        const testAssignments = [];

        rows.forEach((row, index) => {
            const assignment = AssignmentParser.parseAssignmentFromRowWithCategories(row, mockCourse);

            if (assignment) {
                testAssignments.push(assignment);

                console.log(`✅ Row ${index + 1}: ${assignment.title}`);
                console.log(`   📊 Status: ${assignment.submissionStatus}`);
                console.log(`   📁 Category: ${assignment.category} (${(assignment.categoryConfidence * 100).toFixed(1)}% confidence)`);

                if (assignment.isGraded) {
                    console.log(`   🎯 Score: ${assignment.earnedPoints}/${assignment.maxPoints} (${assignment.gradePercentage?.toFixed(1)}%)`);
                }

                if (assignment.categoryConfidence < 0.6) {
                    console.log(`   ⚠️ Low confidence categorization - may need manual review`);
                    if (assignment.categorization.alternates.length > 0) {
                        console.log(`   🔄 Alternatives: ${assignment.categorization.alternates.map(a => a.category).join(', ')}`);
                    }
                }
            } else {
                console.log(`⚪ Row ${index + 1}: Not an assignment row`);
            }
        });

        if (testAssignments.length > 0) {
            console.log('\n📊 CATEGORIZATION SUMMARY:');
            const enhancedStats = GradeExtractor.calculateEnhancedGradeStatistics(testAssignments);

            console.log(`Total assignments: ${testAssignments.length}`);
            console.log(`Successfully categorized: ${enhancedStats.categorization.categorized}`);
            console.log(`High confidence: ${enhancedStats.categorization.highConfidence}`);
            console.log(`Need review: ${enhancedStats.categorization.needsReview.length}`);
            console.log(`Average confidence: ${(enhancedStats.categorization.averageConfidence * 100).toFixed(1)}%`);

            console.log('\n📁 CATEGORIES FOUND:');
            Object.entries(enhancedStats.categoryStats).forEach(([category, stats]) => {
                console.log(`${stats.icon} ${stats.name}: ${stats.gradedCount}/${stats.totalCount} graded (${stats.averagePercentage.toFixed(1)}% avg)`);
            });

            if (enhancedStats.categorization.needsReview.length > 0) {
                console.log('\n⚠️ ASSIGNMENTS NEEDING REVIEW:');
                enhancedStats.categorization.needsReview.forEach(item => {
                    console.log(`• "${item.assignment.title}" - ${item.currentCategory} (${(item.confidence * 100).toFixed(1)}%)`);
                });
            }

            console.log('\n⚖️ SUGGESTED WEIGHTS:');
            Object.entries(enhancedStats.categorization.suggestedWeights).forEach(([category, weight]) => {
                const info = AssignmentCategorizer.getCategoryInfo(category);
                console.log(`${info.icon} ${info.name}: ${(weight * 100).toFixed(1)}%`);
            });
        }
    }

    /**
     * Test enhanced storage with category data
     */
    static testEnhancedStorage() {
        chrome.storage.local.get().then(storage => {
            const latest = Object.keys(storage)
                .filter(k => k.startsWith('assignments_'))
                .sort()
                .pop();

            if (!latest) {
                console.log('❌ No assignment data found in storage');
                return;
            }

            const data = storage[latest];
            console.log('📊 ENHANCED STORAGE TEST RESULTS:');
            console.log('Calendar assignments:', data.assignments?.length || 0);
            console.log('ALL assignments for grades:', data.allAssignments?.length || 0);

            if (data.gradeStats) {
                console.log('\n📈 GRADE STATISTICS:');
                console.log(`Overall average: ${data.gradeStats.averagePercentage?.toFixed(1) || 'N/A'}%`);
                console.log(`Graded: ${data.gradeStats.gradedCount}/${data.gradeStats.totalCount}`);
            }

            if (data.categoryBreakdown) {
                console.log('\n📁 CATEGORY BREAKDOWN:');
                Object.entries(data.categoryBreakdown).forEach(([category, stats]) => {
                    console.log(`${stats.icon} ${stats.name}: ${stats.gradedCount}/${stats.totalCount} (${stats.averagePercentage.toFixed(1)}%)`);
                });
            }

            if (data.needsReview && data.needsReview.length > 0) {
                console.log(`\n⚠️ ${data.needsReview.length} assignments need manual review`);
            }

            if (data.gradeStats?.categorization?.suggestedWeights) {
                console.log('\n⚖️ SUGGESTED GRADE WEIGHTS:');
                Object.entries(data.gradeStats.categorization.suggestedWeights).forEach(([category, weight]) => {
                    console.log(`${category}: ${(weight * 100).toFixed(1)}%`);
                });
            }

            console.log(`\n🔍 Storage key: ${latest}`);
            console.log('📅 Extracted at:', new Date(data.extractedAt).toLocaleString());
        }).catch(error => {
            console.error('❌ Error accessing storage:', error);
        });
    }
}

// Expose test functions to window for console access
if (typeof window !== 'undefined') {
    window.testGradeExtraction = () => TestFunctions.testGradeExtraction();
    window.testGradeExtractionWithCategories = () => TestFunctions.testGradeExtractionWithCategories();
    window.testEnhancedStorage = () => TestFunctions.testEnhancedStorage();
}
