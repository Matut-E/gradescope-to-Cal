/**
 * Tab Navigation Module
 * Handles switching between Calendar and Grades tabs
 */

class TabManager {
    constructor() {
        this.tabButtons = document.querySelectorAll('.tab-button');
        this.tabContents = document.querySelectorAll('.tab-content');
    }

    initialize() {
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                this.switchToTab(targetTab);
            });
        });
    }

    switchToTab(tabName) {
        // Update button states
        this.tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update content visibility
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // Show disclaimer footer only on grades tab
        const disclaimerFooter = document.getElementById('gradeDisclaimerFooter');
        if (disclaimerFooter) {
            disclaimerFooter.style.display = tabName === 'grades' ? 'block' : 'none';
        }

        // Load tab-specific data
        if (tabName === 'grades' && window.gradeManagerInstance) {
            window.gradeManagerInstance.loadGradeData();
        }
    }
}

// Export for use in main popup.js
window.TabManager = TabManager;
