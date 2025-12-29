/**
 * Template Manager Module
 * Manages Berkeley course templates and category metadata
 *
 * Part of courseConfigManager.js refactoring
 */

class TemplateManager {
    /**
     * Get Berkeley course template suggestions
     *
     * @param {string} courseName - Course name to match templates against
     * @returns {Object|null} Matching template with metadata or null
     */
    static suggestTemplate(courseName) {
        const templates = this.getBerkeleyTemplates();
        const normalizedName = courseName.toUpperCase().trim();

        // Try exact match first
        for (const [key, template] of Object.entries(templates)) {
            if (normalizedName.includes(key)) {
                return { ...template, matched: key };
            }

            // Try aliases
            if (template.aliases) {
                for (const alias of template.aliases) {
                    if (normalizedName.includes(alias.toUpperCase())) {
                        return { ...template, matched: alias };
                    }
                }
            }
        }

        // Try partial match for course codes
        const courseCode = normalizedName.match(/^([A-Z]+\s*\d+[A-Z]?)/);
        if (courseCode) {
            for (const [key, template] of Object.entries(templates)) {
                if (key.includes(courseCode[1])) {
                    return { ...template, matched: key };
                }
            }
        }

        return null;
    }

    /**
     * Get Berkeley course template library
     *
     * @returns {Object} Berkeley course templates
     */
    static getBerkeleyTemplates() {
        return {
            'EECS 16A': {
                name: 'EECS 16A (Typical)',
                weights: { homework: 0.20, lab: 0.15, midterm: 0.30, final: 0.35 },
                dropPolicies: { homework: { enabled: true, count: 2 } },
                notes: 'Based on standard EECS 16A syllabus',
                aliases: ['EE 16A', 'ELENG 16A']
            },
            'EECS 16B': {
                name: 'EECS 16B (Typical)',
                weights: { homework: 0.20, lab: 0.15, midterm: 0.30, final: 0.35 },
                dropPolicies: { homework: { enabled: true, count: 2 } },
                notes: 'Based on standard EECS 16B syllabus'
            },
            'CS 61A': {
                name: 'CS 61A (Standard)',
                weights: { homework: 0.20, lab: 0.10, project: 0.25, midterm: 0.20, final: 0.25 },
                dropPolicies: {
                    homework: { enabled: true, count: 2 },
                    lab: { enabled: true, count: 1 }
                },
                notes: 'Standard CS 61A grading scheme'
            },
            'CS 61B': {
                name: 'CS 61B (Standard)',
                weights: { homework: 0.10, lab: 0.15, project: 0.30, midterm: 0.20, final: 0.25 },
                dropPolicies: { homework: { enabled: true, count: 1 } },
                notes: 'Standard CS 61B grading scheme'
            },
            'CS 61C': {
                name: 'CS 61C (Standard)',
                weights: { homework: 0.15, lab: 0.15, project: 0.25, midterm: 0.20, final: 0.25 },
                dropPolicies: { homework: { enabled: true, count: 1 } },
                notes: 'Standard CS 61C grading scheme'
            },
            'MATH 53': {
                name: 'Math 53 (Typical)',
                weights: { homework: 0.20, quiz: 0.10, midterm: 0.35, final: 0.35 },
                dropPolicies: {
                    homework: { enabled: true, count: 2 },
                    quiz: { enabled: true, count: 2 }
                },
                notes: 'Typical Math 53 grading'
            },
            'PHYSICS 7A': {
                name: 'Physics 7A (Typical)',
                weights: { homework: 0.15, lab: 0.20, midterm: 0.30, final: 0.35 },
                dropPolicies: { homework: { enabled: true, count: 1 } },
                notes: 'Typical Physics 7A grading'
            },
            'EE 105': {
                name: 'EE 105 (Typical)',
                weights: { homework: 0.25, lab: 0.20, midterm: 0.25, final: 0.30 },
                dropPolicies: { homework: { enabled: true, count: 1 } },
                notes: 'Typical EE 105 grading'
            }
        };
    }

    /**
     * Get category metadata (display info, defaults, icons)
     *
     * @param {string} category - Category identifier
     * @returns {Object} Category metadata with name, defaultWeight, and icon
     */
    static getCategoryInfo(category) {
        const categoryData = {
            homework: { name: 'Homework', defaultWeight: 0.30, icon: '📝' },
            lab: { name: 'Labs', defaultWeight: 0.20, icon: '🔬' },
            midterm: { name: 'Midterms', defaultWeight: 0.25, icon: '📊' },
            final: { name: 'Final Exam', defaultWeight: 0.25, icon: '🎓' },
            project: { name: 'Projects', defaultWeight: 0.15, icon: '🚀' },
            quiz: { name: 'Quizzes', defaultWeight: 0.10, icon: '❓' },
            participation: { name: 'Participation', defaultWeight: 0.05, icon: '👥' },
            other: { name: 'Other', defaultWeight: 0.0, icon: '❓' }
        };

        return categoryData[category] || { name: 'Other', defaultWeight: 0.0, icon: '❓' };
    }
}

// Expose to window for browser extension context
if (typeof window !== 'undefined') {
    window.TemplateManager = TemplateManager;
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TemplateManager;
}
