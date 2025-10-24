/**
 * Options Settings Module
 * Handles settings, authentication, color picker, and data management
 *
 * Extracted from options.js for better maintainability
 *
 * Dependencies (must be loaded before this module):
 * - chrome.runtime - Chrome messaging API
 * - browser.storage.local - Chrome local storage
 * - browser.storage.sync - Chrome sync storage
 *
 * DOM Dependencies:
 * - #authStatus - Auth status display
 * - #authenticateBtn - Connect Google Calendar button
 * - #disconnectBtn - Disconnect button
 * - #autoSync - Auto-sync checkbox
 * - #createReminders - Create reminders checkbox
 * - #saveSettingsBtn - Save settings button
 * - #clearAssignmentsBtn - Clear assignments button
 * - #clearAuthBtn - Clear auth button
 * - #clearAllBtn - Clear all data button
 * - #showStatsBtn - Show statistics button
 * - .color-box - Color picker boxes
 * - #selectedColorName - Selected color name display
 */

class OptionsSettings {
    /**
     * Local state for color picker
     * Tracks currently selected color (only saved when user clicks "Save Settings")
     */
    static selectedEventColorId = '9'; // Default to Blueberry

    /**
     * Local state for custom reminders
     * Stores custom reminder times in minutes
     */
    static customReminders = [1440, 60]; // Default to double preset

    /**
     * Track previous settings to detect what changed
     */
    static previousSettings = {
        eventColorId: '9'
    };

    /**
     * Smart interval formatting for options page
     * @param {number} minutes - Interval in minutes
     * @returns {string} Formatted interval string
     */
    static formatInterval(minutes) {
        if (minutes >= 60) {
            const hours = minutes / 60;
            return hours === 1 ? '1 hour' : `${hours} hours`;
        } else {
            return `${minutes} minutes`;
        }
    }

    /**
     * Enhanced Authentication Status Display
     */
    static async checkAuthStatus() {
        const authStatus = document.getElementById('authStatus');
        const authenticateBtn = document.getElementById('authenticate');
        const disconnectBtn = document.getElementById('disconnect');

        try {
            const response = await browser.runtime.sendMessage({ action: 'getAuthStatus' });

            if (response.success && response.authenticated && response.tokenValid) {
                if (authStatus) {
                    authStatus.className = 'status success';

                    let statusHTML = '<div>✅ Connected to Google Calendar</div>';

                    // Add detailed authentication info
                    if (response.expiresAt) {
                        const expiryDate = new Date(response.expiresAt);
                        statusHTML += `<small>Token expires: ${expiryDate.toLocaleString()}</small><br>`;
                    }

                    if (response.authMethod) {
                        const methodDisplay = response.authMethod === 'getAuthToken' ? 'Chrome Native (Fast)' : 'Universal';
                        statusHTML += `<small>Method: ${methodDisplay}</small><br>`;
                    }

                    if (response.browserInfo) {
                        statusHTML += `<small>Browser: ${response.browserInfo.type}</small>`;
                    }

                    authStatus.innerHTML = statusHTML;
                }
                if (authenticateBtn) {
                    authenticateBtn.style.display = 'none';
                }
                if (disconnectBtn) {
                    disconnectBtn.style.display = 'inline-block';
                }
            } else {
                if (authStatus) {
                    authStatus.className = 'status info';
                    authStatus.innerHTML = '<div>🔒 Not connected to Google Calendar</div>';
                }
                if (authenticateBtn) {
                    authenticateBtn.style.display = 'inline-block';
                }
                if (disconnectBtn) {
                    disconnectBtn.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('❌ Auth status error:', error);
            if (authStatus) {
                authStatus.className = 'status warning';
                authStatus.innerHTML = '<div>⚠️ Error checking authentication status</div>';
            }
        }
    }

    /**
     * Auto-Sync Status Display - Updated for 24-hour sync
     */
    static async updateAutoSyncStatus() {
        const authStatus = document.getElementById('authStatus');
        const autoSyncCheckbox = document.getElementById('autoSync');

        try {
            const response = await browser.runtime.sendMessage({ action: 'getAutoSyncStatus' });

            if (response.success) {
                const status = response.status;

                // Update checkbox state
                autoSyncCheckbox.checked = status.enabled;

                // Remove any existing auto-sync status to prevent duplicates
                if (authStatus.innerHTML) {
                    // Remove lines containing auto-sync emojis (🔄 or ⏸️)
                    const lines = authStatus.innerHTML.split('<br>');
                    const filteredLines = lines.filter(line =>
                        !line.includes('🔄') && !line.includes('⏸️')
                    );
                    authStatus.innerHTML = filteredLines.join('<br>');
                }

                // Show detailed status in the authentication section
                let autoSyncInfo = '';
                if (status.enabled) {
                    // Format the interval (should be 24 hours)
                    const intervalText = OptionsSettings.formatInterval(status.interval);
                    autoSyncInfo += `<br><small>🔄 Auto-sync: Every ${intervalText} (Optimized)</small>`;

                    if (status.lastSync) {
                        const lastSync = new Date(status.lastSync);
                        autoSyncInfo += `<br><small>Last sync: ${lastSync.toLocaleString()}</small>`;

                        if (status.lastResults) {
                            const r = status.lastResults;
                            autoSyncInfo += `<br><small>(${r.created} created, ${r.skipped} skipped, ${r.errors} errors)</small>`;
                        }
                    }

                    if (status.nextSync) {
                        const nextSync = new Date(status.nextSync);
                        const hoursUntilNext = Math.round((nextSync - new Date()) / (1000 * 60 * 60));
                        const minutesUntilNext = Math.round((nextSync - new Date()) / (1000 * 60));

                        if (hoursUntilNext >= 1) {
                            autoSyncInfo += `<br><small>Next sync: in ${hoursUntilNext} hour${hoursUntilNext !== 1 ? 's' : ''} (${nextSync.toLocaleTimeString()})</small>`;
                        } else {
                            autoSyncInfo += `<br><small>Next sync: in ${minutesUntilNext} minutes (${nextSync.toLocaleTimeString()})</small>`;
                        }
                    }
                } else {
                    autoSyncInfo += '<br><small>⏸️ Auto-sync disabled</small>';
                }

                // Add to auth status display
                if (authStatus.innerHTML) {
                    authStatus.innerHTML += autoSyncInfo;
                }
            }
        } catch (error) {
            console.error('Error getting auto-sync status:', error);
        }
    }

    /**
     * Update color picker UI to show selected color
     * @param {string} colorId - Google Calendar color ID
     */
    static updateColorPickerUI(colorId) {
        const colorBoxes = document.querySelectorAll('.color-box');
        const selectedColorName = document.getElementById('selectedColorName');

        // Remove 'selected' class from all boxes
        colorBoxes.forEach(box => box.classList.remove('selected'));

        // Add 'selected' class to the chosen color
        const selectedBox = document.querySelector(`.color-box[data-color-id="${colorId}"]`);
        if (selectedBox) {
            selectedBox.classList.add('selected');
            const colorName = selectedBox.getAttribute('data-color-name');
            if (selectedColorName) {
                selectedColorName.textContent = colorName;
                // Apply the actual color to the text for better visual feedback
                const boxColor = selectedBox.style.backgroundColor;
                selectedColorName.style.color = boxColor;
            }
            console.log('🎨 Color picker UI updated to:', colorName, `(ID: ${colorId})`);
        }
    }

    /**
     * Select color locally (no saving yet)
     * @param {string} colorId - Google Calendar color ID
     * @param {string} colorName - Color display name
     */
    static selectColorLocally(colorId, colorName) {
        console.log('🎨 Selecting color (local state):', colorName, `(ID: ${colorId})`);

        // Update local state (no saving yet)
        OptionsSettings.selectedEventColorId = colorId;

        // Update UI immediately
        OptionsSettings.updateColorPickerUI(colorId);
    }

    /**
     * Initialize color picker event listeners
     */
    static initializeColorPicker() {
        const colorBoxes = document.querySelectorAll('.color-box');

        colorBoxes.forEach(box => {
            box.addEventListener('click', () => {
                const colorId = box.getAttribute('data-color-id');
                const colorName = box.getAttribute('data-color-name');
                OptionsSettings.selectColorLocally(colorId, colorName);
            });
        });

        console.log('🎨 Color picker initialized with', colorBoxes.length, 'colors');
    }

    /**
     * Load Settings from Storage - Updated for new structure
     */
    static async loadSettings() {
        const autoSyncCheckbox = document.getElementById('autoSync');

        try {
            const settings = await browser.storage.local.get([
                'settings_auto_sync',
                'settings_auto_discovery',
                'reminderSchedule',
                'customReminders',
                'eventDisplayTime'
            ]);

            // Load color preference from sync storage
            const syncSettings = await browser.storage.sync.get(['eventColorId']);
            const eventColorId = syncSettings.eventColorId || '9'; // Default to Blueberry
            console.log('🎨 Loaded event color ID:', eventColorId);

            // Set local state
            OptionsSettings.selectedEventColorId = eventColorId;

            // Set default values and load saved settings
            autoSyncCheckbox.checked = settings.settings_auto_sync !== false; // Default true

            // Load reminder schedule (default: 'double')
            const reminderSchedule = settings.reminderSchedule || 'double';
            const reminderRadio = document.querySelector(`input[name="reminderSchedule"][value="${reminderSchedule}"]`);
            if (reminderRadio) {
                reminderRadio.checked = true;
            }

            // Load custom reminders (default: [1440, 60] for double preset)
            const customReminders = settings.customReminders || [1440, 60];
            OptionsSettings.customReminders = customReminders;

            // Show/hide custom reminder builder based on selection
            OptionsSettings.toggleCustomReminderBuilder(reminderSchedule === 'custom');

            // Load event display timing (default: 'deadline')
            const eventDisplayTime = settings.eventDisplayTime || 'deadline';
            const displayRadio = document.querySelector(`input[name="eventDisplayTime"][value="${eventDisplayTime}"]`);
            if (displayRadio) {
                displayRadio.checked = true;
            }

            // Initialize previous settings for change detection
            OptionsSettings.previousSettings.eventColorId = eventColorId;

            // Update color picker UI
            OptionsSettings.updateColorPickerUI(eventColorId);

        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    /**
     * Save Settings to Storage - Updated for new structure
     * @param {string} triggerSource - Source of save trigger ('manual' or 'auto')
     */
    static async saveSettings(triggerSource = 'manual') {
        const autoSyncCheckbox = document.getElementById('autoSync');
        const saveSettingsBtn = document.getElementById('saveSettings');
        const authStatus = document.getElementById('authStatus');

        try {
            // Check authentication status
            const authResponse = await browser.runtime.sendMessage({ action: 'getAuthStatus' });
            const isAuthenticated = authResponse.success && authResponse.authenticated && authResponse.tokenValid;

            // Get selected reminder schedule
            const reminderScheduleRadio = document.querySelector('input[name="reminderSchedule"]:checked');
            const reminderSchedule = reminderScheduleRadio ? reminderScheduleRadio.value : 'double';

            // Get selected event display timing
            const eventDisplayTimeRadio = document.querySelector('input[name="eventDisplayTime"]:checked');
            const eventDisplayTime = eventDisplayTimeRadio ? eventDisplayTimeRadio.value : 'deadline';

            const settings = {
                settings_auto_sync: autoSyncCheckbox.checked,
                settings_create_reminders: true, // Always enabled (controlled via reminderSchedule now)
                // Advanced settings are always enabled (hardcoded)
                settings_auto_discovery: true,
                // Store the last save timestamp
                settings_last_updated: new Date().toISOString(),
                // New settings for reminder schedule and display timing
                reminderSchedule: reminderSchedule,
                customReminders: OptionsSettings.customReminders,
                eventDisplayTime: eventDisplayTime
            };

            await browser.storage.local.set(settings);

            // Save event color to sync storage
            await browser.storage.sync.set({ eventColorId: OptionsSettings.selectedEventColorId });
            console.log('🎨 Saved event color ID:', OptionsSettings.selectedEventColorId);
            console.log('🔔 Saved reminder schedule:', reminderSchedule);
            console.log('🔔 Saved custom reminders:', OptionsSettings.customReminders);
            console.log('📅 Saved event display timing:', eventDisplayTime);

            // If auto-sync setting changed, update the background service
            if (autoSyncCheckbox.checked) {
                await browser.runtime.sendMessage({ action: 'enableAutoSync' });
            } else {
                await browser.runtime.sendMessage({ action: 'disableAutoSync' });
            }

            // Determine if calendar-specific settings (color) changed
            const colorChanged = OptionsSettings.previousSettings.eventColorId !== OptionsSettings.selectedEventColorId;
            const calendarSettingChanged = colorChanged;

            // Update previous settings
            OptionsSettings.previousSettings.eventColorId = OptionsSettings.selectedEventColorId;

            // Remove any existing warning first
            if (authStatus && authStatus.innerHTML.includes('calendar-settings-warning')) {
                const lines = authStatus.innerHTML.split('<br>');
                const filteredLines = lines.filter(line => !line.includes('calendar-settings-warning'));
                authStatus.innerHTML = filteredLines.join('<br>');
            }

            // Show appropriate success message based on auth status and what changed
            const originalText = saveSettingsBtn.textContent;
            if (!isAuthenticated && calendarSettingChanged && triggerSource === 'manual') {
                saveSettingsBtn.textContent = '✅ Saved (Connect calendar to activate)';
                saveSettingsBtn.className = 'button';

                // Show info message in auth status only for calendar-specific settings
                if (authStatus && !authStatus.innerHTML.includes('calendar-settings-warning')) {
                    authStatus.innerHTML += `<br><small class="calendar-settings-warning" style="color: var(--warning);">ℹ️ Connect your Google Calendar to activate reminders and color preferences.</small>`;
                }
            } else {
                saveSettingsBtn.textContent = '✅ Saved!';
                saveSettingsBtn.className = 'button success';
            }

            setTimeout(() => {
                saveSettingsBtn.textContent = originalText;
                saveSettingsBtn.className = 'button';
            }, 3000);

            // Update auto-sync status to reflect changes (with delay to prevent race condition)
            setTimeout(OptionsSettings.updateAutoSyncStatus, 500);

        } catch (error) {
            console.error('Error saving settings:', error);

            // Show error message
            const originalText = saveSettingsBtn.textContent;
            saveSettingsBtn.textContent = '❌ Error';
            saveSettingsBtn.className = 'button danger';

            setTimeout(() => {
                saveSettingsBtn.textContent = originalText;
                saveSettingsBtn.className = 'button';
            }, 2000);
        }
    }

    /**
     * Authenticate with Google
     */
    static async authenticateWithGoogle() {
        const authenticateBtn = document.getElementById('authenticate');

        if (!authenticateBtn) {
            console.error('❌ Authenticate button not found!');
            return;
        }

        authenticateBtn.disabled = true;
        authenticateBtn.textContent = 'Connecting...';

        try {
            const response = await browser.runtime.sendMessage({ action: 'authenticate' });

            if (response.success) {
                await OptionsSettings.checkAuthStatus();
                await OptionsSettings.updateAutoSyncStatus();
            } else {
                console.error('Authentication failed:', response.error);
                alert('Authentication failed: ' + response.error);
            }
        } catch (error) {
            console.error('Authentication error:', error);
            alert('Authentication error: ' + error.message);
        } finally {
            authenticateBtn.disabled = false;
            authenticateBtn.textContent = 'Connect Google Calendar';
        }
    }

    /**
     * Disconnect from Google
     */
    static async disconnectFromGoogle() {
        if (confirm('Are you sure you want to disconnect from Google Calendar? This will also disable auto-sync.')) {
            try {
                // Send clear auth message to background script
                const response = await browser.runtime.sendMessage({ action: 'clearAuth' });

                if (response.success) {
                    await OptionsSettings.checkAuthStatus();
                    await OptionsSettings.updateAutoSyncStatus();
                } else {
                    console.error('Clear auth failed:', response.error);
                }
            } catch (error) {
                console.error('Disconnect error:', error);
            }
        }
    }

    /**
     * Clear all extracted assignment data
     */
    static async clearAssignmentData() {
        if (confirm('Are you sure you want to clear all extracted assignment data?')) {
            try {
                const storage = await browser.storage.local.get();
                const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));
                await browser.storage.local.remove(assignmentKeys);

                alert(`✅ Cleared ${assignmentKeys.length} assignment data entries!`);
            } catch (error) {
                alert('Error clearing assignment data: ' + error.message);
            }
        }
    }

    /**
     * Clear authentication data
     */
    static async clearAuthData() {
        if (confirm('Are you sure you want to clear authentication data? This will require re-authentication.')) {
            await OptionsSettings.disconnectFromGoogle(); // Use the enhanced disconnect function
        }
    }

    /**
     * Clear all extension data
     */
    static async clearAllData() {
        if (confirm('⚠️ Are you sure you want to clear ALL extension data? This cannot be undone and will:\n\n• Remove all authentication\n• Delete all assignment data\n• Reset all settings\n• Disable auto-sync')) {
            try {
                // Disable auto-sync first
                await browser.runtime.sendMessage({ action: 'disableAutoSync' });

                // Clear all storage
                await browser.storage.local.clear();

                // Reset UI
                await OptionsSettings.checkAuthStatus();
                await OptionsSettings.updateAutoSyncStatus();
                await OptionsSettings.loadSettings();

                alert('✅ All data cleared! Extension has been reset to defaults.');
            } catch (error) {
                alert('Error clearing data: ' + error.message);
            }
        }
    }

    /**
     * Toggle custom reminder builder visibility
     * @param {boolean} show - Whether to show the builder
     */
    static toggleCustomReminderBuilder(show) {
        const customReminderBuilder = document.getElementById('customReminderBuilder');
        if (customReminderBuilder) {
            customReminderBuilder.style.display = show ? 'block' : 'none';
            if (show) {
                OptionsSettings.renderCustomReminders();
            }
        }
    }

    /**
     * Render custom reminder rows in the builder
     */
    static renderCustomReminders() {
        const customReminderList = document.getElementById('customReminderList');
        const addReminderBtn = document.getElementById('addReminderBtn');

        if (!customReminderList) return;

        // Clear existing rows
        customReminderList.innerHTML = '';

        // Render each reminder
        OptionsSettings.customReminders.forEach((minutes, index) => {
            const row = OptionsSettings.createCustomReminderRow(minutes, index);
            customReminderList.appendChild(row);
        });

        // Update "Add reminder" button state
        if (addReminderBtn) {
            addReminderBtn.disabled = OptionsSettings.customReminders.length >= 3;
        }
    }

    /**
     * Create a custom reminder row element
     * @param {number} minutes - Reminder time in minutes
     * @param {number} index - Index in the customReminders array
     * @returns {HTMLElement} The reminder row element
     */
    static createCustomReminderRow(minutes, index) {
        const row = document.createElement('div');
        row.className = 'custom-reminder-row';

        // Convert minutes to appropriate unit for display
        let value, unit;
        if (minutes >= 1440 && minutes % 1440 === 0) {
            value = minutes / 1440;
            unit = 'days';
        } else if (minutes >= 60 && minutes % 60 === 0) {
            value = minutes / 60;
            unit = 'hours';
        } else {
            value = minutes;
            unit = 'minutes';
        }

        row.innerHTML = `
            <input type="number" min="1" value="${value}" data-index="${index}" class="reminder-value-input">
            <select data-index="${index}" class="reminder-unit-select">
                <option value="minutes" ${unit === 'minutes' ? 'selected' : ''}>minutes</option>
                <option value="hours" ${unit === 'hours' ? 'selected' : ''}>hours</option>
                <option value="days" ${unit === 'days' ? 'selected' : ''}>days</option>
            </select>
            <span class="reminder-text">before</span>
            <button type="button" class="reminder-delete-btn" data-index="${index}">× delete</button>
        `;

        // Add event listeners
        const valueInput = row.querySelector('.reminder-value-input');
        const unitSelect = row.querySelector('.reminder-unit-select');
        const deleteBtn = row.querySelector('.reminder-delete-btn');

        valueInput.addEventListener('change', () => {
            OptionsSettings.updateCustomReminder(index, parseInt(valueInput.value), unitSelect.value);
        });

        unitSelect.addEventListener('change', () => {
            OptionsSettings.updateCustomReminder(index, parseInt(valueInput.value), unitSelect.value);
        });

        deleteBtn.addEventListener('click', () => {
            OptionsSettings.deleteCustomReminder(index);
        });

        return row;
    }

    /**
     * Add a new custom reminder
     */
    static addCustomReminder() {
        if (OptionsSettings.customReminders.length >= 3) {
            return;
        }

        // Add default reminder (1 day before)
        OptionsSettings.customReminders.push(1440);
        OptionsSettings.renderCustomReminders();
    }

    /**
     * Delete a custom reminder
     * @param {number} index - Index of the reminder to delete
     */
    static deleteCustomReminder(index) {
        OptionsSettings.customReminders.splice(index, 1);
        OptionsSettings.renderCustomReminders();
    }

    /**
     * Update a custom reminder value
     * @param {number} index - Index of the reminder
     * @param {number} value - New value
     * @param {string} unit - Unit (minutes, hours, days)
     */
    static updateCustomReminder(index, value, unit) {
        let minutes = value;

        // Convert to minutes based on unit
        if (unit === 'hours') {
            minutes = value * 60;
        } else if (unit === 'days') {
            minutes = value * 1440;
        }

        OptionsSettings.customReminders[index] = minutes;
    }

    /**
     * Handle reminder schedule radio button changes
     */
    static handleReminderScheduleChange() {
        const selectedRadio = document.querySelector('input[name="reminderSchedule"]:checked');
        if (!selectedRadio) return;

        const value = selectedRadio.value;

        // Show/hide custom reminder builder
        OptionsSettings.toggleCustomReminderBuilder(value === 'custom');

        // Pre-populate custom reminders based on selection
        if (value === 'custom' && OptionsSettings.customReminders.length === 0) {
            // Start with double preset if empty
            OptionsSettings.customReminders = [1440, 60];
            OptionsSettings.renderCustomReminders();
        }
    }

    /**
     * Show detailed assignment data statistics
     */
    static async showDataStatistics() {
        try {
            const storage = await browser.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

            let totalAssignments = 0;
            let courseCount = new Set();
            let semesterCount = new Set();
            let oldestExtraction = null;
            let newestExtraction = null;
            let methodCount = {};

            assignmentKeys.forEach(key => {
                const data = storage[key];
                if (data.assignments) {
                    totalAssignments += data.assignments.length;

                    data.assignments.forEach(assignment => {
                        if (assignment.course) courseCount.add(assignment.course);
                        if (assignment.semester) semesterCount.add(assignment.semester);
                    });
                }

                // Track extraction methods
                if (data.method) {
                    methodCount[data.method] = (methodCount[data.method] || 0) + 1;
                }

                if (data.extractedAt) {
                    const extractedDate = new Date(data.extractedAt);
                    if (!oldestExtraction || extractedDate < oldestExtraction) {
                        oldestExtraction = extractedDate;
                    }
                    if (!newestExtraction || extractedDate > newestExtraction) {
                        newestExtraction = extractedDate;
                    }
                }
            });

            // Get sync statistics
            const syncStats = await browser.storage.local.get(['last_auto_sync', 'last_sync_results']);

            let statsMessage = `📊 GRADESCOPE TO CAL STATISTICS\n\n`;
            statsMessage += `📚 Assignment Data:\n`;
            statsMessage += `• Total assignments: ${totalAssignments}\n`;
            statsMessage += `• Unique courses: ${courseCount.size}\n`;
            statsMessage += `• Semesters covered: ${semesterCount.size}\n`;
            statsMessage += `• Storage entries: ${assignmentKeys.length}\n\n`;

            if (Object.keys(methodCount).length > 0) {
                statsMessage += `🔍 Extraction Methods:\n`;
                Object.entries(methodCount).forEach(([method, count]) => {
                    const methodName = method.includes('dashboard') ? 'Dashboard Auto-Discovery' : 'Individual Course Pages';
                    statsMessage += `• ${methodName}: ${count} extractions\n`;
                });
                statsMessage += `\n`;
            }

            if (oldestExtraction && newestExtraction) {
                statsMessage += `📅 Data Timeline:\n`;
                statsMessage += `• First extraction: ${oldestExtraction.toLocaleString()}\n`;
                statsMessage += `• Latest extraction: ${newestExtraction.toLocaleString()}\n\n`;
            }

            if (syncStats.last_auto_sync) {
                const lastSync = new Date(syncStats.last_auto_sync);
                statsMessage += `🔄 Last Calendar Sync: ${lastSync.toLocaleString()}\n`;

                if (syncStats.last_sync_results) {
                    const r = syncStats.last_sync_results;
                    statsMessage += `• Results: ${r.created} created, ${r.skipped} skipped, ${r.errors} errors\n\n`;
                }
            }

            if (courseCount.size > 0) {
                statsMessage += `📖 Courses:\n${Array.from(courseCount).map(course => `• ${course}`).join('\n')}`;
            }

            // Create a scrollable dialog for better readability
            const newWindow = window.open('', '_blank', 'width=600,height=500,scrollbars=yes,resizable=yes');
            if (newWindow) {
                newWindow.document.write(`
                    <html>
                    <head>
                        <title>Gradescope to Cal - Statistics</title>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                padding: 20px;
                                white-space: pre-wrap;
                                line-height: 1.4;
                                background: #f8f9fa;
                            }
                            .stats-container {
                                background: white;
                                padding: 20px;
                                border-radius: 8px;
                                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                            }
                        </style>
                    </head>
                    <body>
                        <div class="stats-container">
                            ${statsMessage.replace(/\n/g, '<br>')}
                        </div>
                    </body>
                    </html>
                `);
                newWindow.document.close();
            } else {
                // Fallback to alert if popup is blocked
                alert(statsMessage);
            }

        } catch (error) {
            alert('Error getting statistics: ' + error.message);
        }
    }

    /**
     * Setup all event listeners for settings page
     */
    static setupEventListeners() {
        const authenticateBtn = document.getElementById('authenticate');
        const disconnectBtn = document.getElementById('disconnect');
        const clearAssignmentsBtn = document.getElementById('clearAssignments');
        const clearAuthBtn = document.getElementById('clearAuth');
        const clearAllBtn = document.getElementById('clearAll');
        const saveSettingsBtn = document.getElementById('saveSettings');
        const showStatsBtn = document.getElementById('showStats');

        // Add null checks before attaching event listeners
        if (authenticateBtn) {
            authenticateBtn.addEventListener('click', OptionsSettings.authenticateWithGoogle);
        }
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', OptionsSettings.disconnectFromGoogle);
        }
        if (clearAssignmentsBtn) {
            clearAssignmentsBtn.addEventListener('click', OptionsSettings.clearAssignmentData);
        }
        if (clearAuthBtn) {
            clearAuthBtn.addEventListener('click', OptionsSettings.clearAuthData);
        }
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', OptionsSettings.clearAllData);
        }
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', OptionsSettings.saveSettings);
        }
        if (showStatsBtn) {
            showStatsBtn.addEventListener('click', OptionsSettings.showDataStatistics);
        }

        // Event listeners for reminder schedule radio buttons
        const reminderScheduleRadios = document.querySelectorAll('input[name="reminderSchedule"]');
        reminderScheduleRadios.forEach(radio => {
            radio.addEventListener('change', OptionsSettings.handleReminderScheduleChange);
        });

        // Event listener for "Add reminder" button
        const addReminderBtn = document.getElementById('addReminderBtn');
        if (addReminderBtn) {
            addReminderBtn.addEventListener('click', OptionsSettings.addCustomReminder);
        }
    }
}

// Expose to window for options.html
if (typeof window !== 'undefined') {
    window.OptionsSettings = OptionsSettings;
}
