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
        banner.innerHTML = `
            <style>
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
            </style>

            <button id="${this.bannerId}-close" title="Dismiss forever">✕</button>

            <div id="${this.bannerId}-container">
                <div id="${this.bannerId}-content">
                    <div id="${this.bannerId}-title">
                        <span>✅</span>
                        <span>Found ${assignmentCount} assignment${assignmentCount !== 1 ? 's' : ''} from ${courseCount} course${courseCount !== 1 ? 's' : ''}!</span>
                    </div>
                    <div id="${this.bannerId}-subtitle">
                        📌 Pin the extension to your toolbar for instant access to sync and grade calculator
                    </div>
                    <div id="${this.bannerId}-steps">
                        <div id="${this.bannerId}-step">
                            <span id="${this.bannerId}-step-icon">🧩</span>
                            <span>Click puzzle icon</span>
                        </div>
                        <div id="${this.bannerId}-step">
                            <span id="${this.bannerId}-step-icon">📍</span>
                            <span>Find "Gradescope to Cal"</span>
                        </div>
                        <div id="${this.bannerId}-step">
                            <span id="${this.bannerId}-step-icon">✨</span>
                            <span>Click the pin</span>
                        </div>
                    </div>
                </div>

                <div id="${this.bannerId}-actions">
                    <button class="gtc-banner-btn gtc-banner-btn-primary" id="${this.bannerId}-open">
                        <span>📂</span>
                        <span>Open Extension</span>
                    </button>
                    <button class="gtc-banner-btn gtc-banner-btn-secondary" id="${this.bannerId}-later">
                        <span>Remind Me Later</span>
                    </button>
                </div>
            </div>
        `;

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
        // Send message to background to open popup (or try browser.action)
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
