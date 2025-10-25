/**
 * FeedbackBanner - 2-Week Feedback Prompt System
 *
 * Shows a feedback banner to users after 2 weeks of usage.
 * - First show: 14 days after install
 * - Second show: 14 days after first dismissal
 * - Maximum: 2 total shows
 *
 * Storage keys used:
 * - installDate: timestamp of first install
 * - feedbackPromptShown: boolean (has it been shown at all?)
 * - feedbackPromptDismissed: timestamp of last dismissal
 * - feedbackPromptCompleted: boolean (user submitted feedback)
 * - feedbackPromptShowCount: number of times shown (max 2)
 */

class FeedbackBanner {
    constructor() {
        this.FORM_URL = 'https://forms.gle/fXqRtDQ3UcxS48Sk6';
        this.TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds
        this.MAX_SHOWS = 2;
        this.container = null;
        this.bannerElement = null;
    }

    /**
     * Determines if the feedback banner should be shown
     * @returns {Promise<boolean>} True if banner should be shown
     */
    async shouldShow() {
        try {
            const data = await browser.storage.local.get([
                'installDate',
                'feedbackPromptShown',
                'feedbackPromptDismissed',
                'feedbackPromptCompleted',
                'feedbackPromptShowCount'
            ]);

            // Never show if feedback was already completed
            if (data.feedbackPromptCompleted) {
                console.log('📬 Feedback banner: Already completed');
                return false;
            }

            // Never show if install date doesn't exist (shouldn't happen, but safety check)
            if (!data.installDate) {
                console.log('📬 Feedback banner: No install date found');
                return false;
            }

            // Check if we've hit max shows (default to 0 if not set)
            const showCount = data.feedbackPromptShowCount || 0;
            if (showCount >= this.MAX_SHOWS) {
                console.log(`📬 Feedback banner: Max shows reached (${showCount}/${this.MAX_SHOWS})`);
                return false;
            }

            const now = Date.now();
            const daysSinceInstall = (now - data.installDate) / (24 * 60 * 60 * 1000);

            // First show: 14 days after install
            if (!data.feedbackPromptShown) {
                if (now - data.installDate >= this.TWO_WEEKS_MS) {
                    console.log(`📬 Feedback banner: Should show (${daysSinceInstall.toFixed(1)} days since install)`);
                    return true;
                } else {
                    console.log(`📬 Feedback banner: Too early (${daysSinceInstall.toFixed(1)} days since install)`);
                    return false;
                }
            }

            // Second show: 14 days after dismissal
            if (data.feedbackPromptDismissed) {
                const daysSinceDismissal = (now - data.feedbackPromptDismissed) / (24 * 60 * 60 * 1000);
                if (now - data.feedbackPromptDismissed >= this.TWO_WEEKS_MS) {
                    console.log(`📬 Feedback banner: Should show again (${daysSinceDismissal.toFixed(1)} days since dismissal)`);
                    return true;
                } else {
                    console.log(`📬 Feedback banner: Too early since dismissal (${daysSinceDismissal.toFixed(1)} days)`);
                    return false;
                }
            }

            console.log('📬 Feedback banner: Conditions not met');
            return false;
        } catch (error) {
            console.error('Error checking if feedback banner should show:', error);
            return false;
        }
    }

    /**
     * Injects the feedback banner HTML into the specified container
     * @param {HTMLElement} containerElement - Element to insert banner after
     */
    show(containerElement) {
        if (!containerElement) {
            console.error('FeedbackBanner: No container element provided');
            return;
        }

        this.container = containerElement;

        // Build banner with createElement (safe, no XSS risk)
        this.bannerElement = document.createElement('div');
        this.bannerElement.className = 'feedback-banner';

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'feedback-close';
        closeBtn.setAttribute('aria-label', 'Dismiss');
        closeBtn.textContent = '×';
        this.bannerElement.appendChild(closeBtn);

        // Content container
        const content = document.createElement('div');
        content.className = 'feedback-content';

        // Heading
        const heading = document.createElement('h4');
        heading.textContent = '📬 You\'ve been using this for 2 weeks!';
        content.appendChild(heading);

        // Paragraph
        const paragraph = document.createElement('p');
        paragraph.textContent = 'Quick feedback? (30 seconds)';
        content.appendChild(paragraph);

        // Actions container
        const actions = document.createElement('div');
        actions.className = 'feedback-actions';

        // Share Feedback button
        const shareBtn = document.createElement('button');
        shareBtn.className = 'btn-primary feedback-share-btn';
        shareBtn.textContent = 'Share Feedback';
        actions.appendChild(shareBtn);

        // Maybe Later button
        const dismissBtn = document.createElement('button');
        dismissBtn.className = 'btn-secondary feedback-dismiss-btn';
        dismissBtn.textContent = 'Maybe Later';
        actions.appendChild(dismissBtn);

        content.appendChild(actions);
        this.bannerElement.appendChild(content);

        // Insert banner after container
        this.container.parentNode.insertBefore(this.bannerElement, this.container.nextSibling);

        // Set up event listeners
        this.setupEventListeners();

        console.log('📬 Feedback banner displayed');
    }

    /**
     * Sets up click event listeners for banner buttons
     */
    setupEventListeners() {
        if (!this.bannerElement) return;

        const shareBtn = this.bannerElement.querySelector('.feedback-share-btn');
        const dismissBtn = this.bannerElement.querySelector('.feedback-dismiss-btn');
        const closeBtn = this.bannerElement.querySelector('.feedback-close');

        shareBtn.addEventListener('click', () => this.handleShare());
        dismissBtn.addEventListener('click', () => this.handleDismiss());
        closeBtn.addEventListener('click', () => this.handleDismiss());
    }

    /**
     * Handles the "Share Feedback" button click
     * Opens the Google Form and marks feedback as completed
     */
    async handleShare() {
        try {
            // Open feedback form in new tab
            await browser.tabs.create({ url: this.FORM_URL });

            // Mark as completed (never show again)
            await browser.storage.local.set({
                feedbackPromptCompleted: true,
                feedbackPromptShown: true
            });

            // Increment show count
            const data = await browser.storage.local.get('feedbackPromptShowCount');
            const showCount = (data.feedbackPromptShowCount || 0) + 1;
            await browser.storage.local.set({ feedbackPromptShowCount: showCount });

            console.log('📬 Feedback form opened - marked as completed');

            // Remove banner from DOM
            this.removeBanner();
        } catch (error) {
            console.error('Error handling feedback share:', error);
        }
    }

    /**
     * Handles the "Maybe Later" button click
     * Sets dismissal timestamp to show again after 14 days
     */
    async handleDismiss() {
        try {
            // Set dismissal timestamp
            await browser.storage.local.set({
                feedbackPromptDismissed: Date.now(),
                feedbackPromptShown: true
            });

            // Increment show count
            const data = await browser.storage.local.get('feedbackPromptShowCount');
            const showCount = (data.feedbackPromptShowCount || 0) + 1;
            await browser.storage.local.set({ feedbackPromptShowCount: showCount });

            console.log('📬 Feedback banner dismissed - will show again in 14 days');

            // Remove banner from DOM
            this.removeBanner();
        } catch (error) {
            console.error('Error handling feedback dismissal:', error);
        }
    }

    /**
     * Removes the banner from the DOM with fade-out animation
     */
    removeBanner() {
        if (!this.bannerElement) return;

        // Add fade-out class
        this.bannerElement.style.opacity = '0';
        this.bannerElement.style.transform = 'translateY(-10px)';

        // Remove from DOM after animation
        setTimeout(() => {
            if (this.bannerElement && this.bannerElement.parentNode) {
                this.bannerElement.parentNode.removeChild(this.bannerElement);
            }
        }, 300);
    }
}
