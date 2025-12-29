/**
 * Welcome Page Logic
 * Handles onboarding flow after extension installation
 */

// Theme Management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

// Button Handlers
async function handlePinnedClick() {
    try {
        // Store that user claimed they pinned it
        await browser.storage.local.set({
            shownWelcome: true,
            userClaimedPin: true,
            welcomeCompletedAt: Date.now()
        });

        // Open Gradescope in new tab
        await browser.tabs.create({ url: 'https://www.gradescope.com' });

        // Close welcome tab
        window.close();
    } catch (error) {
        console.error('Error handling pinned click:', error);
        // Fallback: just open Gradescope
        window.location.href = 'https://www.gradescope.com';
    }
}

async function handleSkipClick() {
    try {
        // Store that user skipped pinning
        await browser.storage.local.set({
            shownWelcome: true,
            userSkippedPin: true,
            welcomeCompletedAt: Date.now()
        });

        // Open Gradescope in new tab
        await browser.tabs.create({ url: 'https://www.gradescope.com' });

        // Close welcome tab
        window.close();
    } catch (error) {
        console.error('Error handling skip click:', error);
        // Fallback: just open Gradescope
        window.location.href = 'https://www.gradescope.com';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Scroll to top on page load
    window.scrollTo(0, 0);

    // Set up theme
    initializeTheme();

    // Browser-specific pin instructions and buttons
    if (window.browserDetector && window.browserDetector.isFirefox()) {
        console.log('🦊 Firefox detected - showing auto-pinned message');

        // Hide Chrome pin instructions
        const pinInstructions = document.getElementById('pin-instructions');
        if (pinInstructions) {
            pinInstructions.style.display = 'none';
        }

        // Show Firefox auto-pinned message
        const firefoxMessage = document.getElementById('firefox-auto-pinned');
        if (firefoxMessage) {
            firefoxMessage.style.display = 'block';
        }

        // Update buttons for Firefox - single button since auto-pinned
        const pinnedBtn = document.getElementById('pinnedBtn');
        const skipBtn = document.getElementById('skipBtn');
        if (pinnedBtn) {
            pinnedBtn.innerHTML = '<span>🚀</span><span>Let\'s Go! Take Me to Gradescope</span>';
        }
        if (skipBtn) {
            skipBtn.style.display = 'none';
        }
    } else {
        console.log('🌐 Chrome/Chromium detected - showing pin instructions');
        // Chrome instructions are shown by default
    }

    // Theme toggle button
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.addEventListener('click', toggleTheme);

    // Action buttons
    const pinnedBtn = document.getElementById('pinnedBtn');
    const skipBtn = document.getElementById('skipBtn');

    pinnedBtn.addEventListener('click', handlePinnedClick);
    skipBtn.addEventListener('click', handleSkipClick);

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Enter = I've pinned it
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handlePinnedClick();
        }
        // Escape = Skip
        if (e.key === 'Escape') {
            e.preventDefault();
            handleSkipClick();
        }
    });

    // Focus primary button for keyboard accessibility (without scrolling)
    pinnedBtn.focus({ preventScroll: true });
});
