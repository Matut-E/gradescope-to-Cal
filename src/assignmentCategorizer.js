/**
 * Assignment Categorization Engine
 * Automatically categorizes assignments by type with confidence scoring
 * Optimized for UC Berkeley course patterns
 */

class AssignmentCategorizer {
    static CATEGORIES = {
        homework: {
            name: 'Homework',
            patterns: [
                /^hw\s*\d*/i,
                /^homework\s*\d*/i,
                /homework.*\d+/i,
                /^problem\s*set\s*\d*/i,
                /^pset\s*\d*/i,
                /^assignment\s*\d*/i,
                /^ps\s*\d*/i
            ],
            defaultWeight: 0.30
        },
        lab: {
            name: 'Labs',
            patterns: [
                /^lab\s*\d*/i,
                /^laboratory\s*\d*/i,
                /^lab\s*assignment\s*\d*/i,
                /^discussion\s*\d*/i,
                /^disc\s*\d*/i,
                /^lab\s*checkoff/i
            ],
            defaultWeight: 0.20
        },
        midterm: {
            name: 'Midterms',
            patterns: [
                /^midterm/i,
                /^mt\s*\d*/i,
                /^exam\s*\d+/i,
                /^test\s*\d+/i,
                /^mid\s*term/i
            ],
            defaultWeight: 0.25
        },
        final: {
            name: 'Final Exam',
            patterns: [
                /^final/i,
                /^final\s*exam/i,
                /^final\s*test/i,
                /^comprehensive\s*exam/i
            ],
            defaultWeight: 0.25
        },
        project: {
            name: 'Projects',
            patterns: [
                /^project\s*\d*/i,
                /^proj\s*\d*/i,
                /^final\s*project/i,
                /^group\s*project/i,
                /^team\s*project/i
            ],
            defaultWeight: 0.15
        },
        quiz: {
            name: 'Quizzes',
            patterns: [
                /^quiz\s*\d*/i,
                /^pop\s*quiz/i,
                /^reading\s*quiz/i,
                /^concept\s*check/i,
                /^warmup/i
            ],
            defaultWeight: 0.10
        },
        participation: {
            name: 'Participation',
            patterns: [
                /^attendance/i,
                /^participation/i,
                /^check\s*in/i,
                /^clicker/i,
                /^iclicker/i
            ],
            defaultWeight: 0.05
        }
    };

    static BERKELEY_PATTERNS = {
        'EECS 16A': {
            homework: /^(hw|homework|problem set)\s*\d*/i,
            lab: /^(lab|vitamin)\s*\d*/i,
            midterm: /^(midterm|mt)\s*[12]/i,
            final: /^final/i
        },
        'EECS 16B': {
            homework: /^(hw|homework|problem set)\s*\d*/i,
            lab: /^(lab|vitamin)\s*\d*/i,
            midterm: /^(midterm|mt)\s*[12]/i,
            final: /^final/i
        },
        'CS 61A': {
            homework: /^hw\s*\d*/i,
            lab: /^lab\s*\d*/i,
            project: /^(proj|project)\s*\d*/i,
            midterm: /^(midterm|mt)\s*[12]/i,
            final: /^final/i
        },
        'CS 61B': {
            homework: /^hw\s*\d*/i,
            lab: /^lab\s*\d*/i,
            project: /^(proj|project)\s*\d*/i,
            midterm: /^(midterm|mt)\s*[12]/i,
            final: /^final/i
        },
        'MATH 53': {
            homework: /^(hw|homework|webwork)\s*\d*/i,
            quiz: /^quiz\s*\d*/i,
            midterm: /^(midterm|mt)\s*[12]/i,
            final: /^final/i
        },
        'PHYSICS 7A': {
            homework: /^(hw|homework|masteringphysics)\s*\d*/i,
            lab: /^lab\s*\d*/i,
            midterm: /^(midterm|mt)\s*[12]/i,
            final: /^final/i
        }
    };

    /**
     * Categorize single assignment with confidence scoring
     */
    static categorizeAssignment(title, course = '', url = '') {
        if (!title || typeof title !== 'string') {
            return {
                category: 'other',
                confidence: 0.0,
                alternates: [],
                reason: 'Invalid title'
            };
        }

        const cleanTitle = title.trim();
        const cleanCourse = course.trim().toUpperCase();

        // Try Berkeley-specific patterns first (highest confidence)
        const berkeleyResult = this.tryBerkeleyPatterns(cleanTitle, cleanCourse);
        if (berkeleyResult.confidence >= 0.9) {
            return berkeleyResult;
        }

        // Try general patterns
        const generalResult = this.tryGeneralPatterns(cleanTitle);

        return berkeleyResult.confidence > generalResult.confidence ? berkeleyResult : generalResult;
    }

    /**
     * Try UC Berkeley course-specific patterns with fuzzy matching
     */
    static tryBerkeleyPatterns(title, course) {
        // Normalize course name for better matching
        const normalizedCourse = course.toUpperCase().trim()
            .replace(/^EE\s+/, 'EECS ')  // EE 16A → EECS 16A
            .replace(/^ELENG\s+/, 'EECS '); // ELENG → EECS

        const coursePatterns = this.BERKELEY_PATTERNS[normalizedCourse];
        if (!coursePatterns) {
            // Try partial match
            for (const [key, patterns] of Object.entries(this.BERKELEY_PATTERNS)) {
                if (normalizedCourse.includes(key.split(' ')[1])) { // Match on course number
                    return this.matchPatterns(title, patterns, key);
                }
            }
            return { category: 'other', confidence: 0.0, alternates: [] };
        }

        return this.matchPatterns(title, coursePatterns, normalizedCourse);
    }

    /**
     * Helper to match title against patterns
     */
    static matchPatterns(title, patterns, source) {
        for (const [category, pattern] of Object.entries(patterns)) {
            if (pattern.test(title)) {
                return {
                    category,
                    confidence: 0.95,
                    alternates: [],
                    reason: `Berkeley ${source} pattern match`,
                    source: 'berkeley_specific'
                };
            }
        }
        return { category: 'other', confidence: 0.0, alternates: [] };
    }

    /**
     * Try general categorization patterns with confidence calculation
     */
    static tryGeneralPatterns(title) {
        const matches = [];

        for (const [category, config] of Object.entries(this.CATEGORIES)) {
            for (const pattern of config.patterns) {
                if (pattern.test(title)) {
                    const confidence = this.calculatePatternConfidence(title, pattern, category);
                    matches.push({
                        category,
                        confidence,
                        pattern: pattern.source,
                        name: config.name
                    });
                }
            }
        }

        if (matches.length === 0) {
            return {
                category: 'other',
                confidence: 0.0,
                alternates: [],
                reason: 'No pattern matches',
                source: 'fallback'
            };
        }

        // Sort by confidence and return best match with alternates
        matches.sort((a, b) => b.confidence - a.confidence);
        const best = matches[0];
        const alternates = matches.slice(1, 3);

        return {
            category: best.category,
            confidence: best.confidence,
            alternates: alternates.map(m => ({
                category: m.category,
                confidence: m.confidence,
                name: m.name
            })),
            reason: `Pattern match: ${best.pattern}`,
            source: 'general_pattern'
        };
    }

    /**
     * Calculate confidence score based on pattern match quality
     */
    static calculatePatternConfidence(title, pattern, category) {
        let confidence = 0.7;

        // Boost for word boundary matches
        const wordBoundaryPattern = new RegExp(`\\b${pattern.source.replace(/\^|\$|\\b/g, '')}\\b`, 'i');
        if (wordBoundaryPattern.test(title)) {
            confidence += 0.15;
        }

        // Boost for titles starting with pattern
        if (new RegExp(`^${pattern.source.replace(/\^|\$/g, '')}`, 'i').test(title)) {
            confidence += 0.1;
        }

        // Reduce confidence for very long titles
        if (title.length > 50) {
            confidence -= 0.05;
        }

        // Category-specific adjustments
        if (category === 'homework' && /\d+/.test(title)) {
            confidence += 0.05;
        }

        if (category === 'final' && title.toLowerCase().includes('exam')) {
            confidence += 0.1;
        }

        return Math.min(0.95, Math.max(0.1, confidence));
    }

    /**
     * Batch categorization with comprehensive statistics
     */
    static categorizeAssignments(assignments) {
        if (!Array.isArray(assignments) || assignments.length === 0) {
            return {
                categories: {},
                stats: { total: 0, categorized: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0 },
                confidence: { average: 0, distribution: {} }
            };
        }

        const categories = {};
        const stats = { total: assignments.length, categorized: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0 };
        let totalConfidence = 0;
        const confidenceDistribution = {};

        assignments.forEach((assignment, index) => {
            const result = this.categorizeAssignment(assignment.title, assignment.course, assignment.url);

            // Add to categories
            if (!categories[result.category]) {
                categories[result.category] = [];
            }

            categories[result.category].push({
                ...assignment,
                categorization: result,
                originalIndex: index
            });

            // Update stats
            if (result.category !== 'other') {
                stats.categorized++;
            }

            if (result.confidence >= 0.8) {
                stats.highConfidence++;
            } else if (result.confidence >= 0.5) {
                stats.mediumConfidence++;
            } else {
                stats.lowConfidence++;
            }

            totalConfidence += result.confidence;

            const confBucket = Math.floor(result.confidence * 10) / 10;
            confidenceDistribution[confBucket] = (confidenceDistribution[confBucket] || 0) + 1;
        });

        return {
            categories,
            stats,
            confidence: {
                average: totalConfidence / assignments.length,
                distribution: confidenceDistribution
            },
            suggestedWeights: this.suggestWeights(categories),
            needsReview: this.findAssignmentsNeedingReview(categories)
        };
    }

    /**
     * Generate intelligent grade weights based on detected categories
     */
    static suggestWeights(categories) {
        const weights = {};
        const presentCategories = Object.keys(categories).filter(cat =>
            cat !== 'other' && categories[cat].length > 0
        );

        if (presentCategories.length === 0) {
            return weights;
        }

        // Start with default weights
        presentCategories.forEach(category => {
            if (this.CATEGORIES[category]) {
                weights[category] = this.CATEGORIES[category].defaultWeight;
            }
        });

        // Normalize weights to sum to 1.0
        const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
        if (totalWeight > 0) {
            Object.keys(weights).forEach(category => {
                weights[category] = weights[category] / totalWeight;
            });
        }

        return weights;
    }

    /**
     * Identify assignments requiring manual review
     */
    static findAssignmentsNeedingReview(categories) {
        const needsReview = [];

        Object.entries(categories).forEach(([category, assignments]) => {
            assignments.forEach(assignment => {
                const conf = assignment.categorization.confidence;

                if (conf < 0.6 || category === 'other' || assignment.categorization.alternates.length > 0) {
                    needsReview.push({
                        assignment: {
                            title: assignment.title,
                            course: assignment.course,
                            id: assignment.assignmentId
                        },
                        currentCategory: category,
                        confidence: conf,
                        alternates: assignment.categorization.alternates,
                        reason: assignment.categorization.reason
                    });
                }
            });
        });

        return needsReview.sort((a, b) => a.confidence - b.confidence);
    }

    /**
     * Get category display metadata
     */
    static getCategoryInfo(category) {
        if (this.CATEGORIES[category]) {
            return {
                name: this.CATEGORIES[category].name,
                defaultWeight: this.CATEGORIES[category].defaultWeight,
                icon: this.getCategoryIcon(category)
            };
        }
        return { name: 'Other', defaultWeight: 0.0, icon: '❓' };
    }

    /**
     * Get emoji icon for category display
     */
    static getCategoryIcon(category) {
        const icons = {
            homework: '📝', lab: '🔬', midterm: '📊', final: '🎓',
            project: '🚀', quiz: '❓', participation: '👥', other: '❓'
        };
        return icons[category] || '❓';
    }

    /**
     * Test categorization with sample Berkeley assignments
     */
    static testCategorization() {
        const testAssignments = [
            { title: 'HW 1', course: 'EECS 16A' },
            { title: 'Lab 3: Op Amps', course: 'EECS 16A' },
            { title: 'Midterm 1', course: 'EECS 16A' },
            { title: 'Final Exam', course: 'EECS 16A' },
            { title: 'Project 2: Scheme Interpreter', course: 'CS 61A' },
            { title: 'Quiz 4', course: 'MATH 53' },
            { title: 'Weird Assignment Name', course: 'CS 61B' }
        ];

        console.log('🧪 Testing Assignment Categorization...');

        testAssignments.forEach(assignment => {
            const result = this.categorizeAssignment(assignment.title, assignment.course);
            console.log(`"${assignment.title}" → ${result.category} (${(result.confidence * 100).toFixed(1)}%)`);

            if (result.alternates.length > 0) {
                console.log(`  Alternates: ${result.alternates.map(a => `${a.category} (${(a.confidence * 100).toFixed(1)}%)`).join(', ')}`);
            }
        });

        const batchResult = this.categorizeAssignments(testAssignments);
        console.log('📊 Batch Results:', batchResult.stats);
        console.log('⚖️ Suggested Weights:', batchResult.suggestedWeights);
    }
}

// Expose to window for testing
if (typeof window !== 'undefined') {
    window.AssignmentCategorizer = AssignmentCategorizer;
}
