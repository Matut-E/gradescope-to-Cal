/**
 * Pin Banner Injector
 * Creates and manages the in-page banner on Gradescope that prompts users to pin the extension
 */

class PinBannerInjector {
    constructor() {
        this.bannerId = 'gtc-pin-banner';
        this.bannerInjected = false;
    }

    /**
     * Show the pin banner with assignment/course count
     * @param {number} assignmentCount - Number of assignments found
     * @param {number} courseCount - Number of courses found
     */
    async showBanner(assignmentCount, courseCount) {
        // Don't inject twice
        if (this.bannerInjected || document.getElementById(this.bannerId)) {
            return;
        }

        // Check storage to see if we should show the banner
        const shouldShow = await this.shouldShowBanner();
        if (!shouldShow) {
            return;
        }

        this.createBanner(assignmentCount, courseCount);
        this.bannerInjected = true;
    }

    /**
     * Check if banner should be shown based on storage flags
     */
    async shouldShowBanner() {
        // Firefox auto-pins extensions, so never show pin banner
        if (window.browserDetector && window.browserDetector.isFirefox()) {
            console.log('🦊 [PinBanner] Firefox detected - extensions auto-pinned, skipping banner');
            return false;
        }

        return new Promise((resolve) => {
            browser.storage.local.get(
                ['dismissedExtractionBanner', 'reminderDismissedAt'],
                (data) => {
                    // Permanently dismissed
                    if (data.dismissedExtractionBanner) {
                        resolve(false);
                        return;
                    }

                    // Check if "remind me later" cooldown period has passed
                    if (data.reminderDismissedAt) {
                        const dayInMs = 24 * 60 * 60 * 1000;
                        const timeSinceDismiss = Date.now() - data.reminderDismissedAt;
                        if (timeSinceDismiss < dayInMs) {
                            resolve(false);
                            return;
                        }
                    }

                    resolve(true);
                }
            );
        });
    }

    /**
     * Create and inject the banner into the page
     */
    createBanner(assignmentCount, courseCount) {
        const banner = document.createElement('div');
        banner.id = this.bannerId;

        // Safe replacement for innerHTML - create style and content separately

        // 1. Create and add styles using a <style> element
        const style = document.createElement('style');
        style.textContent = `
                #${this.bannerId} {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    z-index: 999999;
                    background: linear-gradient(135deg, #FDB515 0%, #ffc639 100%);
                    color: #000;
                    padding: 16px 20px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    animation: slideDown 0.5s ease-out;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                }

                @keyframes slideDown {
                    from {
                        transform: translateY(-100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                #${this.bannerId}-container {
                    max-width: 1200px;
                    margin: 0 auto;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    flex-wrap: wrap;
                }

                #${this.bannerId}-content {
                    flex: 1;
                    min-width: 300px;
                }

                #${this.bannerId}-title {
                    font-size: 18px;
                    font-weight: 700;
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                #${this.bannerId}-subtitle {
                    font-size: 14px;
                    opacity: 0.9;
                    margin-bottom: 12px;
                }

                #${this.bannerId}-steps {
                    display: flex;
                    gap: 12px;
                    font-size: 13px;
                    align-items: center;
                }

                #${this.bannerId}-step {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(0, 0, 0, 0.1);
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-weight: 600;
                }

                #${this.bannerId}-step-icon {
                    font-size: 16px;
                }

                #${this.bannerId}-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                }

                .gtc-banner-btn {
                    padding: 10px 20px;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    white-space: nowrap;
                }

                .gtc-banner-btn-primary {
                    background: #003262;
                    color: white;
                }

                .gtc-banner-btn-primary:hover {
                    background: #004a8f;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                }

                .gtc-banner-btn-secondary {
                    background: rgba(0, 0, 0, 0.1);
                    color: #000;
                }

                .gtc-banner-btn-secondary:hover {
                    background: rgba(0, 0, 0, 0.15);
                }

                #${this.bannerId}-close {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: rgba(0, 0, 0, 0.1);
                    border: none;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                }

                #${this.bannerId}-close:hover {
                    background: rgba(0, 0, 0, 0.2);
                    transform: scale(1.1);
                }

                @media (max-width: 768px) {
                    #${this.bannerId} {
                        padding: 12px 16px;
                    }

                    #${this.bannerId}-container {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 12px;
                    }

                    #${this.bannerId}-steps {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    #${this.bannerId}-actions {
                        flex-direction: column;
                    }

                    .gtc-banner-btn {
                        width: 100%;
                        justify-content: center;
                    }
                }
        `;
        banner.appendChild(style);

        // 2. Build HTML structure with createElement (safe, no XSS risk)

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.id = `${this.bannerId}-close`;
        closeBtn.title = 'Dismiss forever';
        closeBtn.textContent = '✕';
        banner.appendChild(closeBtn);

        // Container
        const container = document.createElement('div');
        container.id = `${this.bannerId}-container`;

        // Content section
        const content = document.createElement('div');
        content.id = `${this.bannerId}-content`;

        // Title
        const title = document.createElement('div');
        title.id = `${this.bannerId}-title`;
        const titleIcon = document.createElement('span');
        titleIcon.textContent = '✅';
        const titleText = document.createElement('span');
        const assignmentText = assignmentCount !== 1 ? 's' : '';
        const courseText = courseCount !== 1 ? 's' : '';
        titleText.textContent = `Found ${assignmentCount} assignment${assignmentText} from ${courseCount} course${courseText}!`;
        title.appendChild(titleIcon);
        title.appendChild(titleText);
        content.appendChild(title);

        // Subtitle
        const subtitle = document.createElement('div');
        subtitle.id = `${this.bannerId}-subtitle`;
        subtitle.textContent = '📌 Pin the extension to your toolbar for instant access to calendar sync';
        content.appendChild(subtitle);

        // Steps
        const steps = document.createElement('div');
        steps.id = `${this.bannerId}-steps`;

        // Step 1
        const step1 = document.createElement('div');
        step1.id = `${this.bannerId}-step`;
        const step1Icon = document.createElement('span');
        step1Icon.id = `${this.bannerId}-step-icon`;
        step1Icon.textContent = '🧩';
        const step1Text = document.createElement('span');
        step1Text.textContent = 'Click puzzle icon';
        step1.appendChild(step1Icon);
        step1.appendChild(step1Text);
        steps.appendChild(step1);

        // Step 2
        const step2 = document.createElement('div');
        step2.id = `${this.bannerId}-step`;
        const step2Icon = document.createElement('span');
        step2Icon.id = `${this.bannerId}-step-icon`;
        step2Icon.textContent = '📍';
        const step2Text = document.createElement('span');
        step2Text.textContent = 'Find "Gradescope to Cal"';
        step2.appendChild(step2Icon);
        step2.appendChild(step2Text);
        steps.appendChild(step2);

        // Step 3
        const step3 = document.createElement('div');
        step3.id = `${this.bannerId}-step`;
        const step3Icon = document.createElement('span');
        step3Icon.id = `${this.bannerId}-step-icon`;
        step3Icon.textContent = '✨';
        const step3Text = document.createElement('span');
        step3Text.textContent = 'Click the pin';
        step3.appendChild(step3Icon);
        step3.appendChild(step3Text);
        steps.appendChild(step3);

        content.appendChild(steps);
        container.appendChild(content);

        // Actions section
        const actions = document.createElement('div');
        actions.id = `${this.bannerId}-actions`;

        // Open Extension button
        const openBtn = document.createElement('button');
        openBtn.className = 'gtc-banner-btn gtc-banner-btn-primary';
        openBtn.id = `${this.bannerId}-open`;
        const openIcon = document.createElement('span');
        openIcon.textContent = '📂';
        const openText = document.createElement('span');
        openText.textContent = 'Open Extension';
        openBtn.appendChild(openIcon);
        openBtn.appendChild(openText);
        actions.appendChild(openBtn);

        // Remind Me Later button
        const laterBtn = document.createElement('button');
        laterBtn.className = 'gtc-banner-btn gtc-banner-btn-secondary';
        laterBtn.id = `${this.bannerId}-later`;
        const laterText = document.createElement('span');
        laterText.textContent = 'Remind Me Later';
        laterBtn.appendChild(laterText);
        actions.appendChild(laterBtn);

        container.appendChild(actions);
        banner.appendChild(container);

        // Insert at the top of the page
        document.body.insertBefore(banner, document.body.firstChild);

        // Add event listeners
        this.attachEventListeners(banner);

        // Update storage to track that banner was shown
        browser.storage.local.set({ sawExtractionBanner: true });
    }

    /**
     * Attach event listeners to banner buttons
     */
    attachEventListeners(banner) {
        // Close button (dismiss forever)
        const closeBtn = banner.querySelector(`#${this.bannerId}-close`);
        closeBtn.addEventListener('click', () => {
            this.dismissForever();
        });

        // Open extension button
        const openBtn = banner.querySelector(`#${this.bannerId}-open`);
        openBtn.addEventListener('click', () => {
            this.openExtension();
        });

        // Remind me later button
        const laterBtn = banner.querySelector(`#${this.bannerId}-later`);
        laterBtn.addEventListener('click', () => {
            this.remindLater();
        });
    }

    /**
     * Open the extension popup
     */
    openExtension() {
        // Send message to background to open popup (or try chrome.action)
        browser.runtime.sendMessage({ action: 'openPopup' });

        // Hide banner
        this.hideBanner();

        // Store that user clicked to open
        browser.storage.local.set({ clickedOpenFromBanner: true });
    }

    /**
     * Dismiss banner forever
     */
    dismissForever() {
        this.hideBanner();
        browser.storage.local.set({ dismissedExtractionBanner: true });
    }

    /**
     * Dismiss banner and show again in 24 hours
     */
    remindLater() {
        this.hideBanner();
        browser.storage.local.set({ reminderDismissedAt: Date.now() });
    }

    /**
     * Hide the banner with animation
     */
    hideBanner() {
        const banner = document.getElementById(this.bannerId);
        if (banner) {
            banner.style.animation = 'slideDown 0.3s ease-in reverse';
            setTimeout(() => {
                banner.remove();
                this.bannerInjected = false;
            }, 300);
        }
    }
}

// Export to window for use in contentScript
window.PinBannerInjector = PinBannerInjector;
