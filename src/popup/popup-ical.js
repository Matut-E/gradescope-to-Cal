/**
 * iCal Export Module
 * Handles iCalendar (.ics) file export for non-Google calendar applications
 *
 * Provides one-time export functionality for Outlook, Apple Calendar, and other
 * standard calendar apps. Users are warned about duplicate creation on re-import.
 */

class IcalExportManager {
    constructor() {
        // iCal export elements (will be created dynamically)
        this.icalSection = null;
        this.exportBtn = null;
        this.icalStatusDiv = null;
    }

    initialize() {
        this.createIcalExportSection();
        this.setupEventListeners();
        this.updateExportButton();

        // Update button periodically based on assignment count
        setInterval(() => this.updateExportButton(), 5000);
    }

    // ============================================================================
    // UI CREATION
    // ============================================================================

    createIcalExportSection() {
        // Find the Google Calendar Sync section to insert after
        const calendarSection = document.querySelector('#calendar-tab .section:last-of-type');

        if (!calendarSection) {
            console.warn('⚠️ Could not find calendar section to insert iCal export');
            return;
        }

        // Create iCal export section
        this.icalSection = document.createElement('div');
        this.icalSection.className = 'section';
        this.icalSection.innerHTML = `
            <div class="section-title">📥 Export as .ical File</div>

            <div class="ical-description">
                One-time export for Outlook, Apple Calendar, and other calendar apps.
            </div>

            <div class="ical-warning">
                <span class="warning-icon">⚠️</span>
                <div class="warning-text">
                    <strong>Note:</strong> Manual imports don't auto-update. Re-importing may create duplicates.
                    For automatic sync, use Google Calendar integration above.
                </div>
            </div>

            <button id="exportIcal" class="button secondary">
                📥 Export Assignments
            </button>

            <div id="icalStatus" class="ical-status" style="display: none;"></div>
        `;

        // Insert after calendar section
        calendarSection.parentNode.insertBefore(this.icalSection, calendarSection.nextSibling);

        // Cache references to elements
        this.exportBtn = document.getElementById('exportIcal');
        this.icalStatusDiv = document.getElementById('icalStatus');

        console.log('✅ iCal export section created');
    }

    setupEventListeners() {
        if (!this.exportBtn) {
            console.error('❌ Export button not found');
            return;
        }

        this.exportBtn.addEventListener('click', () => this.exportIcal());
    }

    // ============================================================================
    // EXPORT LOGIC
    // ============================================================================

    async exportIcal() {
        try {
            this.exportBtn.disabled = true;
            this.exportBtn.textContent = '⏳ Generating...';
            this.showStatus('🔄 Generating iCalendar file...', 'info');

            // Get all stored assignments
            const assignments = await window.StorageUtils.getAllStoredAssignments();

            if (assignments.length === 0) {
                this.showStatus('❌ No assignments found. Extract assignments first.', 'warning');
                return;
            }

            // Filter to upcoming assignments only
            const now = new Date();
            const upcomingAssignments = assignments.filter(assignment => {
                if (!assignment.dueDate) return false;
                const dueDate = new Date(assignment.dueDate);
                return dueDate >= now;
            });

            if (upcomingAssignments.length === 0) {
                this.showStatus('❌ No upcoming assignments found.', 'warning');
                return;
            }

            // Send message to background script to generate iCal content
            const response = await chrome.runtime.sendMessage({
                action: 'generateIcal',
                assignments: upcomingAssignments
            });

            if (response.success && response.icalContent) {
                // Background generated the content, now handle download in popup context
                // (URL.createObjectURL not available in service workers)

                // Create Blob and download
                const blob = new Blob([response.icalContent], { type: 'text/calendar;charset=utf-8' });
                const blobUrl = URL.createObjectURL(blob);

                // Generate filename with current date
                const now = new Date();
                const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
                const filename = `gradescope-assignments-${dateStr}.ics`;

                // Create temporary download link and trigger click
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = filename;
                downloadLink.style.display = 'none';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);

                // Clean up Blob URL after a short delay
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

                this.showStatus(
                    `✅ Exported ${upcomingAssignments.length} upcoming assignment${upcomingAssignments.length === 1 ? '' : 's'}!`,
                    'success'
                );

                // Auto-dismiss success message after 3 seconds
                setTimeout(() => this.hideStatus(), 3000);
            } else {
                this.showStatus(`❌ Export failed: ${response.error}`, 'error');
            }

        } catch (error) {
            console.error('iCal export error:', error);
            this.showStatus('❌ Export error - check console', 'error');
        } finally {
            // Restore button state
            await this.updateExportButton();
        }
    }

    // ============================================================================
    // UI UPDATES
    // ============================================================================

    async updateExportButton() {
        if (!this.exportBtn) return;

        try {
            const assignments = await window.StorageUtils.getAllStoredAssignments();

            // Filter to upcoming assignments
            const now = new Date();
            const upcomingCount = assignments.filter(assignment => {
                if (!assignment.dueDate) return false;
                const dueDate = new Date(assignment.dueDate);
                return dueDate >= now;
            }).length;

            if (upcomingCount > 0) {
                this.exportBtn.disabled = false;
                this.exportBtn.textContent = `📥 Export ${upcomingCount} Upcoming Assignment${upcomingCount === 1 ? '' : 's'}`;
            } else {
                this.exportBtn.disabled = true;
                this.exportBtn.textContent = '📥 No Assignments to Export';
            }

        } catch (error) {
            console.error('Error updating export button:', error);
            this.exportBtn.disabled = true;
            this.exportBtn.textContent = '📥 Export Assignments';
        }
    }

    showStatus(message, type = 'info') {
        if (!this.icalStatusDiv) return;

        this.icalStatusDiv.className = `ical-status ${type}`;
        this.icalStatusDiv.textContent = message;
        this.icalStatusDiv.style.display = 'block';
    }

    hideStatus() {
        if (!this.icalStatusDiv) return;
        this.icalStatusDiv.style.display = 'none';
    }
}

// Export for use in popup-main.js
window.IcalExportManager = IcalExportManager;
