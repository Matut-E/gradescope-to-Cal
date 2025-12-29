/**
 * Theme Toggle Module
 * Handles light/dark theme switching and persistence
 */

class ThemeManager {
    constructor() {
        this.themeToggle = document.getElementById('themeToggle');
        this.currentTheme = 'light';
    }

    async initialize() {
        // Load saved theme preference
        const { theme } = await browser.storage.local.get('theme');
        this.currentTheme = theme || 'light';

        // Apply theme
        this.applyTheme(this.currentTheme);
        this.updateThemeIcon(this.currentTheme);

        // Add click listener
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    async toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';

        // Update UI
        this.applyTheme(newTheme);
        this.updateThemeIcon(newTheme);
        this.currentTheme = newTheme;

        // Save preference
        await browser.storage.local.set({ theme: newTheme });
    }

    applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
    }

    updateThemeIcon(theme) {
        const moonIcon = this.themeToggle.querySelector('.theme-icon-moon');
        const sunIcon = this.themeToggle.querySelector('.theme-icon-sun');

        if (theme === 'light') {
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
        } else {
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
        }
    }
}

// Export for use in main popup.js
window.ThemeManager = ThemeManager;
