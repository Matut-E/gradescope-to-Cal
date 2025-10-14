/**
 * Pin to Toolbar Prompt Manager
 *
 * Manages the onboarding prompt encouraging users to pin the extension to their toolbar.
 * Uses chrome.action.getUserSettings() to detect pin status and shows a non-blocking banner
 * after successful assignment extraction.
 *
 * Dependencies: OptionsStorage (for storage helpers)
 * Exports: PinPromptManager (via window)
 */

class PinPromptManager {
    static PROMPT_CONTAINER_ID = 'pin-prompt-container';
    static REMIND_LATER_HOURS = 24;

    /**
     * Initialize the pin prompt system
     * Called from options-main.js after page load
     */
    static async initialize() {
        try {
            // Check if we should show the prompt
            const shouldShow = await this.shouldShowPrompt();

            if (!shouldShow) {
                console.log('[PinPrompt] Conditions not met, skipping prompt');
                return;
            }

            // Get extraction stats to display in banner
            const stats = await this.getExtractionStats();

            if (!stats || stats.assignmentCount === 0) {
                console.log('[PinPrompt] No extraction data found, skipping prompt');
                return;
            }

            // Show the prompt banner
            await this.showPrompt(stats);

        } catch (error) {
            console.error('[PinPrompt] Error initializing:', error);
        }
    }

    /**
     * Determine if the pin prompt should be shown
     * @returns {Promise<boolean>}
     */
    static async shouldShowPrompt() {
        try {
            // 1. Check if user has already pinned the extension
            const isPinned = await this.checkPinStatus();
            if (isPinned) {
                console.log('[PinPrompt] Extension already pinned');
                // Optionally mark as pinned in storage
                await this.markUserHasPinned();
                return false;
            }

            // 2. Get prompt state from storage
            const state = await this.getPinPromptState();

            // Never shown before - show it
            if (!state.pinPromptShown) {
                console.log('[PinPrompt] First time showing prompt');
                return true;
            }

            // User clicked "Got it" - never show again
            if (state.userDismissedPermanently) {
                console.log('[PinPrompt] User permanently dismissed');
                return false;
            }

            // User already pinned - don't show
            if (state.userHasPinned) {
                console.log('[PinPrompt] User has pinned (from state)');
                return false;
            }

            // User clicked "Remind me later"
            if (state.remindMeLaterTimestamp) {
                const hoursSince = (Date.now() - state.remindMeLaterTimestamp) / (1000 * 60 * 60);

                if (hoursSince >= this.REMIND_LATER_HOURS) {
                    // Show one more time after 24 hours
                    console.log('[PinPrompt] 24hrs passed since "Remind later", showing again');
                    return true;
                } else {
                    console.log('[PinPrompt] Still within 24hr reminder period');
                    return false;
                }
            }

            // Default: don't show if already shown and conditions not met
            return false;

        } catch (error) {
            console.error('[PinPrompt] Error checking conditions:', error);
            return false;
        }
    }

    /**
     * Check if extension is pinned to toolbar using Chrome API
     * @returns {Promise<boolean>}
     */
    static async checkPinStatus() {
        try {
            // chrome.action.getUserSettings() available in Chrome 90+
            if (chrome.action && chrome.action.getUserSettings) {
                const settings = await chrome.action.getUserSettings();
                console.log('[PinPrompt] getUserSettings:', settings);
                return settings.isOnToolbar === true;
            } else {
                console.warn('[PinPrompt] getUserSettings API not available (Chrome <90)');
                // Fallback: assume not pinned, but only show prompt once
                return false;
            }
        } catch (error) {
            console.error('[PinPrompt] Error checking pin status:', error);
            return false;
        }
    }

    /**
     * Get extraction statistics from storage
     * @returns {Promise<{assignmentCount: number, courseCount: number}>}
     */
    static async getExtractionStats() {
        try {
            const result = await chrome.storage.local.get(null);

            // Find all assignment keys
            const assignmentKeys = Object.keys(result).filter(key => key.startsWith('assignments_'));

            if (assignmentKeys.length === 0) {
                return null;
            }

            // Use the most recent extraction
            const sortedKeys = assignmentKeys.sort().reverse();
            const latestKey = sortedKeys[0];
            const data = result[latestKey];

            if (!data || !data.assignments) {
                return null;
            }

            // Count assignments and unique courses (use assignments field to match popup behavior)
            // For calendar sync version, we only care about upcoming assignments, not all assignments
            const assignmentCount = data.assignments.length;
            const courses = new Set(data.assignments.map(a => a.course));

            return {
                assignmentCount,
                courseCount: courses.size
            };

        } catch (error) {
            console.error('[PinPrompt] Error getting extraction stats:', error);
            return null;
        }
    }

    /**
     * Show the pin prompt banner
     * @param {Object} stats - Extraction statistics
     */
    static async showPrompt(stats) {
        // Create banner container if doesn't exist
        let container = document.getElementById(this.PROMPT_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = this.PROMPT_CONTAINER_ID;

            // Insert at top of page (before main content)
            const mainContent = document.querySelector('.container') || document.body;
            mainContent.insertAdjacentElement('afterbegin', container);
        }

        // Generate banner HTML
        const bannerHTML = this.createBannerHTML(stats);
        container.innerHTML = bannerHTML;

        // Add event listeners
        this.attachEventListeners();

        // Mark as shown in storage
        await this.markPromptShown();

        console.log('[PinPrompt] Prompt displayed');
    }

    /**
     * Create the banner HTML
     * @param {Object} stats - Extraction statistics
     * @returns {string} HTML string
     */
    static createBannerHTML(stats) {
        return `
            <div class="pin-prompt-banner" role="region" aria-label="Pin extension to toolbar prompt">
                <button class="pin-prompt-close" aria-label="Close prompt" data-action="close">×</button>

                <div class="pin-prompt-content">
                    <!-- Success Message -->
                    <div class="pin-prompt-success">
                        ✅ <strong>Successfully extracted ${stats.assignmentCount} assignment${stats.assignmentCount !== 1 ? 's' : ''} from ${stats.courseCount} course${stats.courseCount !== 1 ? 's' : ''}!</strong>
                    </div>

                    <!-- Value Proposition -->
                    <div class="pin-prompt-value">
                        Pin this extension to your toolbar for instant access to calendar sync.
                    </div>

                    <!-- 3-Step Visual Guide -->
                    <div class="pin-prompt-steps">
                        <div class="pin-step">
                            <div class="pin-step-icon">🧩</div>
                            <div class="pin-step-text">
                                <strong>Step 1:</strong> Click the puzzle piece icon in your toolbar
                            </div>
                        </div>
                        <div class="pin-step-arrow">→</div>
                        <div class="pin-step">
                            <div class="pin-step-icon">🔍</div>
                            <div class="pin-step-text">
                                <strong>Step 2:</strong> Find "Gradescope to Cal" in the list
                            </div>
                        </div>
                        <div class="pin-step-arrow">→</div>
                        <div class="pin-step">
                            <div class="pin-step-icon">📌</div>
                            <div class="pin-step-text">
                                <strong>Step 3:</strong> Click the pin icon next to it
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="pin-prompt-actions">
                        <button class="pin-prompt-btn pin-prompt-btn-primary" data-action="got-it">
                            Got it!
                        </button>
                        <button class="pin-prompt-btn pin-prompt-btn-secondary" data-action="remind-later">
                            Remind me later
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attach event listeners to banner buttons
     */
    static attachEventListeners() {
        const banner = document.querySelector('.pin-prompt-banner');
        if (!banner) return;

        // "Got it!" button - dismiss permanently
        const gotItBtn = banner.querySelector('[data-action="got-it"]');
        if (gotItBtn) {
            gotItBtn.addEventListener('click', async () => {
                await this.dismissPrompt(false);
                this.hideBanner();
            });
        }

        // "Remind me later" button - dismiss for 24hrs
        const remindLaterBtn = banner.querySelector('[data-action="remind-later"]');
        if (remindLaterBtn) {
            remindLaterBtn.addEventListener('click', async () => {
                await this.dismissPrompt(true);
                this.hideBanner();
            });
        }

        // Close button (×) - same as "Got it"
        const closeBtn = banner.querySelector('[data-action="close"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', async () => {
                await this.dismissPrompt(false);
                this.hideBanner();
            });
        }
    }

    /**
     * Hide the banner with animation
     */
    static hideBanner() {
        const banner = document.querySelector('.pin-prompt-banner');
        if (banner) {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                const container = document.getElementById(this.PROMPT_CONTAINER_ID);
                if (container) {
                    container.remove();
                }
            }, 300);
        }
    }

    /**
     * Handle prompt dismissal
     * @param {boolean} remindLater - True if "Remind me later", false if permanent dismissal
     */
    static async dismissPrompt(remindLater) {
        try {
            const state = {
                pinPromptShown: Date.now(),
                userDismissedPermanently: !remindLater
            };

            if (remindLater) {
                state.remindMeLaterTimestamp = Date.now();
                console.log('[PinPrompt] User chose "Remind me later"');
            } else {
                state.remindMeLaterTimestamp = null;
                console.log('[PinPrompt] User permanently dismissed prompt');
            }

            await chrome.storage.local.set(state);

        } catch (error) {
            console.error('[PinPrompt] Error dismissing prompt:', error);
        }
    }

    /**
     * Mark prompt as shown in storage
     */
    static async markPromptShown() {
        try {
            await chrome.storage.local.set({
                pinPromptShown: Date.now()
            });
        } catch (error) {
            console.error('[PinPrompt] Error marking prompt shown:', error);
        }
    }

    /**
     * Mark user as having pinned the extension
     */
    static async markUserHasPinned() {
        try {
            await chrome.storage.local.set({
                userHasPinned: true,
                userDismissedPermanently: true // No need to show prompt anymore
            });
        } catch (error) {
            console.error('[PinPrompt] Error marking user pinned:', error);
        }
    }

    /**
     * Get pin prompt state from storage
     * @returns {Promise<Object>}
     */
    static async getPinPromptState() {
        try {
            const result = await chrome.storage.local.get([
                'pinPromptShown',
                'userHasPinned',
                'userDismissedPermanently',
                'remindMeLaterTimestamp'
            ]);

            return {
                pinPromptShown: result.pinPromptShown || null,
                userHasPinned: result.userHasPinned || false,
                userDismissedPermanently: result.userDismissedPermanently || false,
                remindMeLaterTimestamp: result.remindMeLaterTimestamp || null
            };
        } catch (error) {
            console.error('[PinPrompt] Error getting state:', error);
            return {
                pinPromptShown: null,
                userHasPinned: false,
                userDismissedPermanently: false,
                remindMeLaterTimestamp: null
            };
        }
    }

    /**
     * Show a brief success message if user has already pinned
     * (Optional - can be called from options-main.js)
     */
    static async showSuccessMessage() {
        const isPinned = await this.checkPinStatus();
        const state = await this.getPinPromptState();

        // Only show if just pinned (not shown before)
        if (isPinned && !state.userHasPinned) {
            await this.markUserHasPinned();

            // Create success toast
            const toast = document.createElement('div');
            toast.className = 'pin-success-toast';
            toast.innerHTML = `
                <div class="pin-success-content">
                    🎉 <strong>Extension pinned!</strong> Access it anytime from your toolbar.
                </div>
            `;

            document.body.appendChild(toast);

            // Auto-remove after 5 seconds
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 5000);
        }
    }
}

// Export to window for HTML script loading
window.PinPromptManager = PinPromptManager;
