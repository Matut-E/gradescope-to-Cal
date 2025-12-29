/**
 * Page Detector Utilities
 * Handles page type detection and DOM observation for Gradescope pages
 *
 * Extracted from contentScript.js for better maintainability
 */

class PageDetector {
    /**
     * Detect what type of Gradescope page we're on
     */
    static detectPageType() {
        const url = window.location.href;

        if (url.includes('gradescope.com') && (url.endsWith('/') || url.includes('/account')) &&
            document.querySelector('.courseList')) {
            return 'dashboard';
        }

        if (url.includes('/courses/') && document.querySelector('table')) {
            if (url.includes('/assignments')) {
                return 'course_assignments';
            }
            return 'course_main';
        }

        return 'other';
    }

    /**
     * Debounce utility to prevent excessive function calls
     */
    static debounce(func, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Setup optimized DOM observers for dynamic content
     * @param {Function} callback - Function to call when significant DOM changes occur
     */
    static setupOptimizedDOMObserver(callback) {
        const debouncedCallback = this.debounce(callback, 1000);

        const targetSelectors = [
            '.courseList',
            '.courseList--coursesForTerm',
            'table tbody'
        ];

        let observersCreated = 0;

        targetSelectors.forEach(selector => {
            const containers = document.querySelectorAll(selector);

            containers.forEach(container => {
                if (container && !container.dataset.gradescopeObserved) {
                    container.dataset.gradescopeObserved = 'true';

                    const observer = new MutationObserver((mutations) => {
                        const significantMutations = mutations.filter(mutation => {
                            return mutation.type === 'childList' &&
                                   (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0);
                        });

                        if (significantMutations.length > 0) {
                            debouncedCallback();
                        }
                    });

                    observer.observe(container, {
                        childList: true,
                        subtree: true
                    });

                    observersCreated++;
                }
            });
        });

        // Fallback: observe entire body if no specific containers found
        if (observersCreated === 0) {
            const observer = new MutationObserver(() => debouncedCallback());
            observer.observe(document.body, { childList: true, subtree: true });
        }

        console.log(`👀 Created ${observersCreated || 1} DOM observer(s)`);
    }
}

// Expose to window for contentScript usage
if (typeof window !== 'undefined') {
    window.PageDetector = PageDetector;
}
