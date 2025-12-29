/**
 * Pin to Toolbar Prompt Manager
 *
 * Manages the onboarding prompt encouraging users to pin the extension to their toolbar.
 * Uses browser.action.getUserSettings() to detect pin status and shows a non-blocking banner
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
            // Firefox auto-pins extensions, so never show prompt
            if (window.browserDetector && window.browserDetector.isFirefox()) {
                console.log('[PinPrompt] Firefox detected - extensions auto-pinned, skipping prompt');
                return false;
            }

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
            // browser.action.getUserSettings() available in Chrome 90+
            if (browser.action && browser.action.getUserSettings) {
                const settings = await browser.action.getUserSettings();
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
            const result = await browser.storage.local.get(null);

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

        // Build banner with createElement (safe, no XSS risk)
        container.textContent = '';
        const banner = this.createBannerElement(stats);
        container.appendChild(banner);

        // Add event listeners
        this.attachEventListeners();

        // Mark as shown in storage
        await this.markPromptShown();

        console.log('[PinPrompt] Prompt displayed');
    }

    /**
     * Create the banner DOM element
     * @param {Object} stats - Extraction statistics
     * @returns {HTMLElement} Banner element
     */
    static createBannerElement(stats) {
        // Main banner container
        const banner = document.createElement('div');
        banner.className = 'pin-prompt-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Pin extension to toolbar prompt');

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'pin-prompt-close';
        closeBtn.setAttribute('aria-label', 'Close prompt');
        closeBtn.setAttribute('data-action', 'close');
        closeBtn.textContent = '×';
        banner.appendChild(closeBtn);

        // Content container
        const content = document.createElement('div');
        content.className = 'pin-prompt-content';

        // Success message
        const successDiv = document.createElement('div');
        successDiv.className = 'pin-prompt-success';
        const successText = document.createTextNode('✅ ');
        const successStrong = document.createElement('strong');
        const assignmentText = stats.assignmentCount !== 1 ? 's' : '';
        const courseText = stats.courseCount !== 1 ? 's' : '';
        successStrong.textContent = `Successfully extracted ${stats.assignmentCount} assignment${assignmentText} from ${stats.courseCount} course${courseText}!`;
        successDiv.appendChild(successText);
        successDiv.appendChild(successStrong);
        content.appendChild(successDiv);

        // Value proposition
        const valueDiv = document.createElement('div');
        valueDiv.className = 'pin-prompt-value';
        valueDiv.textContent = 'Pin this extension to your toolbar for instant access to calendar sync.';
        content.appendChild(valueDiv);

        // Steps container
        const stepsDiv = document.createElement('div');
        stepsDiv.className = 'pin-prompt-steps';

        // Step 1
        const step1 = document.createElement('div');
        step1.className = 'pin-step';
        const step1Icon = document.createElement('div');
        step1Icon.className = 'pin-step-icon';
        step1Icon.textContent = '🧩';
        const step1Text = document.createElement('div');
        step1Text.className = 'pin-step-text';
        const step1Strong = document.createElement('strong');
        step1Strong.textContent = 'Step 1:';
        step1Text.appendChild(step1Strong);
        step1Text.appendChild(document.createTextNode(' Click the puzzle piece icon in your toolbar'));
        step1.appendChild(step1Icon);
        step1.appendChild(step1Text);
        stepsDiv.appendChild(step1);

        // Arrow 1
        const arrow1 = document.createElement('div');
        arrow1.className = 'pin-step-arrow';
        arrow1.textContent = '→';
        stepsDiv.appendChild(arrow1);

        // Step 2
        const step2 = document.createElement('div');
        step2.className = 'pin-step';
        const step2Icon = document.createElement('div');
        step2Icon.className = 'pin-step-icon';
        step2Icon.textContent = '🔍';
        const step2Text = document.createElement('div');
        step2Text.className = 'pin-step-text';
        const step2Strong = document.createElement('strong');
        step2Strong.textContent = 'Step 2:';
        step2Text.appendChild(step2Strong);
        step2Text.appendChild(document.createTextNode(' Find "Gradescope to Cal" in the list'));
        step2.appendChild(step2Icon);
        step2.appendChild(step2Text);
        stepsDiv.appendChild(step2);

        // Arrow 2
        const arrow2 = document.createElement('div');
        arrow2.className = 'pin-step-arrow';
        arrow2.textContent = '→';
        stepsDiv.appendChild(arrow2);

        // Step 3
        const step3 = document.createElement('div');
        step3.className = 'pin-step';
        const step3Icon = document.createElement('div');
        step3Icon.className = 'pin-step-icon';
        step3Icon.textContent = '📌';
        const step3Text = document.createElement('div');
        step3Text.className = 'pin-step-text';
        const step3Strong = document.createElement('strong');
        step3Strong.textContent = 'Step 3:';
        step3Text.appendChild(step3Strong);
        step3Text.appendChild(document.createTextNode(' Click the pin icon next to it'));
        step3.appendChild(step3Icon);
        step3.appendChild(step3Text);
        stepsDiv.appendChild(step3);

        content.appendChild(stepsDiv);

        // Action buttons container
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'pin-prompt-actions';

        // "Got it!" button
        const gotItBtn = document.createElement('button');
        gotItBtn.className = 'pin-prompt-btn pin-prompt-btn-primary';
        gotItBtn.setAttribute('data-action', 'got-it');
        gotItBtn.textContent = 'Got it!';
        actionsDiv.appendChild(gotItBtn);

        // "Remind me later" button
        const remindLaterBtn = document.createElement('button');
        remindLaterBtn.className = 'pin-prompt-btn pin-prompt-btn-secondary';
        remindLaterBtn.setAttribute('data-action', 'remind-later');
        remindLaterBtn.textContent = 'Remind me later';
        actionsDiv.appendChild(remindLaterBtn);

        content.appendChild(actionsDiv);
        banner.appendChild(content);

        return banner;
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

            await browser.storage.local.set(state);

        } catch (error) {
            console.error('[PinPrompt] Error dismissing prompt:', error);
        }
    }

    /**
     * Mark prompt as shown in storage
     */
    static async markPromptShown() {
        try {
            await browser.storage.local.set({
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
            await browser.storage.local.set({
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
            const result = await browser.storage.local.get([
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

            // Create success toast with createElement (safe, no XSS risk)
            const toast = document.createElement('div');
            toast.className = 'pin-success-toast';

            const content = document.createElement('div');
            content.className = 'pin-success-content';
            content.appendChild(document.createTextNode('🎉 '));

            const strong = document.createElement('strong');
            strong.textContent = 'Extension pinned!';
            content.appendChild(strong);

            content.appendChild(document.createTextNode(' Access it anytime from your toolbar.'));
            toast.appendChild(content);

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
