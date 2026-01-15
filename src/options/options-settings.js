/**
 * Options Settings Module
 * Handles settings, authentication, color picker, and data management
 *
 * Extracted from options.js for better maintainability
 *
 * Dependencies (must be loaded before this module):
 * - browser.runtime - Chrome messaging API
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
     * Array of minutes before due date (only saved when user clicks "Save Settings")
     */
    static customReminders = [1440, 60]; // Default to double preset (1 day + 1 hour)

    /**
     * Track previous settings to detect what changed
     */
    static previousSettings = {
        createReminders: true,
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
        console.log('🔍 [OptionsSettings] checkAuthStatus() called');

        const authStatus = document.getElementById('authStatus');
        const authenticateBtn = document.getElementById('authenticate');
        const disconnectBtn = document.getElementById('disconnect');

        console.log('🔍 [OptionsSettings] DOM elements found:', {
            authStatus: !!authStatus,
            authenticateBtn: !!authenticateBtn,
            disconnectBtn: !!disconnectBtn
        });

        try {
            console.log('🔍 [OptionsSettings] Sending getAuthStatus message to background...');
            const response = await browser.runtime.sendMessage({ action: 'getAuthStatus' });
            console.log('🔍 [OptionsSettings] Received response:', response);

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
            console.error('❌ [OptionsSettings] Auth status error:', error);
            if (authStatus) {
                authStatus.className = 'status warning';
                authStatus.innerHTML = '<div>⚠️ Error checking authentication status</div>';
            }
        }

        console.log('🔍 [OptionsSettings] checkAuthStatus() completed');
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
     * Load Settings from Storage - Updated for new structure
     */
    static async loadSettings() {
        const autoSyncCheckbox = document.getElementById('autoSync');

        try {
            const settings = await browser.storage.local.get([
                'settings_auto_sync',
                'settings_auto_discovery',
                'reminderSchedule',        // NEW
                'customReminders',         // NEW
                'eventDisplayTime'         // NEW
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

            // Load custom reminders (default: [1440, 60])
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

            console.log('🔔 Loaded reminder schedule:', reminderSchedule);
            console.log('🔔 Loaded custom reminders:', customReminders);
            console.log('📅 Loaded event display timing:', eventDisplayTime);

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
                settings_create_reminders: true, // Keep for backward compatibility only
                // Advanced settings are always enabled (hardcoded)
                settings_auto_discovery: true,
                // Store the last save timestamp
                settings_last_updated: new Date().toISOString(),
                // New settings for reminder schedule and display timing
                reminderSchedule: reminderSchedule,              // NEW
                customReminders: OptionsSettings.customReminders, // NEW
                eventDisplayTime: eventDisplayTime                // NEW
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
        console.log('🔐 [OptionsSettings] authenticateWithGoogle() called');

        const authenticateBtn = document.getElementById('authenticate');

        if (!authenticateBtn) {
            console.error('❌ [OptionsSettings] Authenticate button not found!');
            return;
        }

        authenticateBtn.disabled = true;
        authenticateBtn.textContent = 'Connecting...';

        try {
            console.log('🔐 [OptionsSettings] Sending authenticate message to background...');
            const response = await browser.runtime.sendMessage({ action: 'authenticate' });
            console.log('🔐 [OptionsSettings] Received response:', response);

            if (response.success) {
                console.log('✅ [OptionsSettings] Authentication successful, refreshing status...');
                await OptionsSettings.checkAuthStatus();
                await OptionsSettings.updateAutoSyncStatus();
            } else {
                console.error('❌ [OptionsSettings] Authentication failed:', response.error);
                alert('Authentication failed: ' + response.error);
            }
        } catch (error) {
            console.error('❌ [OptionsSettings] Authentication error:', error);
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
            const syncStats = await browser.storage.local.get(['last_auto_sync', 'last_sync_results', 'lastSyncType']);

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
                const syncTypeLabel = {
                    'manual': 'Manual',
                    'auto': 'Auto (24-hour)',
                    'first_time': 'First-time',
                    'smart': 'Smart (on extraction)',
                    'background_poll': 'Background poll'
                }[syncStats.lastSyncType] || syncStats.lastSyncType || 'Unknown';

                statsMessage += `🔄 Last Calendar Sync: ${lastSync.toLocaleString()}\n`;
                statsMessage += `• Sync Type: ${syncTypeLabel}\n`;

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
     * Show config sharing status message
     * @param {string} message - Message to display
     * @param {string} type - Message type ('success' or 'error')
     */
    static showConfigShareMessage(message, type) {
        // Try to find the header status div first (per-course menu)
        let statusDiv = document.getElementById('configShareStatusHeader');

        // Fallback to Data & Privacy tab status div
        if (!statusDiv || statusDiv.offsetParent === null) {
            statusDiv = document.getElementById('configShareStatus');
        }

        if (!statusDiv) return;

        statusDiv.textContent = message;
        statusDiv.className = `save-status ${type}`;
        statusDiv.style.display = 'block';

        // Auto-hide after 3 seconds
        setTimeout(() => {
            statusDiv.textContent = '';
            statusDiv.className = 'save-status';
            statusDiv.style.display = 'none';
        }, 3000);
    }

    /**
     * Validate configuration structure
     * @param {Object} config - Configuration object to validate
     * @returns {Object} Validation result with {valid: boolean, error: string}
     */
    static validateConfigStructure(config) {
        // Required fields
        if (!config.system) {
            return { valid: false, error: 'Missing "system" field' };
        }

        if (!['simple', 'weighted', 'percentage', 'points'].includes(config.system)) {
            return { valid: false, error: 'Invalid system type. Must be "simple", "weighted", "percentage", or "points"' };
        }

        if (config.system === 'weighted' || config.system === 'percentage' || config.system === 'points') {
            if (!config.weights || typeof config.weights !== 'object') {
                return { valid: false, error: 'Missing or invalid "weights" field' };
            }
        }

        // Optional fields should have correct types if present
        if (config.dropPolicies && typeof config.dropPolicies !== 'object') {
            return { valid: false, error: 'Invalid "dropPolicies" field' };
        }

        if (config.manualOverrides && typeof config.manualOverrides !== 'object') {
            return { valid: false, error: 'Invalid "manualOverrides" field' };
        }

        if (config.categoryGroups && typeof config.categoryGroups !== 'object') {
            return { valid: false, error: 'Invalid "categoryGroups" field' };
        }

        if (config.clobberPolicies && !Array.isArray(config.clobberPolicies)) {
            return { valid: false, error: 'Invalid "clobberPolicies" field' };
        }

        return { valid: true };
    }

    /**
     * Export current course configuration as JSON file
     * @param {string} courseName - Name of the course to export
     */
    static async exportConfig(courseName) {
        try {
            const result = await browser.storage.local.get('courseConfigs');
            const config = result.courseConfigs?.[courseName];

            if (!config) {
                OptionsSettings.showConfigShareMessage('No configuration found for this course', 'error');
                return;
            }

            // Create pretty JSON
            const jsonStr = JSON.stringify(config, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Trigger download
            const a = document.createElement('a');
            a.href = url;
            a.download = `${courseName.replace(/\s+/g, '_')}_gradescope_config.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            OptionsSettings.showConfigShareMessage('Config exported successfully!', 'success');
        } catch (error) {
            console.error('Export error:', error);
            OptionsSettings.showConfigShareMessage('Failed to export config: ' + error.message, 'error');
        }
    }

    /**
     * Import configuration from JSON file
     * @param {string} courseName - Name of the course to apply the config to
     */
    static async importConfig(courseName) {
        // Try header file input first (per-course menu), then fallback to Data & Privacy tab
        let fileInput = document.getElementById('importConfigFileHeader');
        if (!fileInput || fileInput.offsetParent === null) {
            fileInput = document.getElementById('importConfigFile');
        }

        if (!fileInput) {
            console.error('File input not found');
            return;
        }

        fileInput.onchange = async (e) => {
            try {
                const file = e.target.files[0];
                if (!file) return;

                const text = await file.text();
                const importedConfig = JSON.parse(text);

                // Validate structure
                const validation = OptionsSettings.validateConfigStructure(importedConfig);
                if (!validation.valid) {
                    OptionsSettings.showConfigShareMessage('Invalid config: ' + validation.error, 'error');
                    return;
                }

                // Apply to current course
                const result = await browser.storage.local.get('courseConfigs');
                const courseConfigs = result.courseConfigs || {};

                courseConfigs[courseName] = {
                    ...importedConfig,
                    lastModified: new Date().toISOString()
                };

                await browser.storage.local.set({ courseConfigs });

                OptionsSettings.showConfigShareMessage('Config imported successfully! Reloading...', 'success');

                // Refresh the UI to show imported settings
                setTimeout(() => {
                    window.location.reload();
                }, 1500);

            } catch (error) {
                console.error('Import error:', error);
                if (error instanceof SyntaxError) {
                    OptionsSettings.showConfigShareMessage('Invalid JSON file', 'error');
                } else {
                    OptionsSettings.showConfigShareMessage('Failed to import: ' + error.message, 'error');
                }
            } finally {
                // Reset file input
                fileInput.value = '';
            }
        };

        fileInput.click();
    }

    /**
     * Copy configuration to clipboard
     * @param {string} courseName - Name of the course to copy
     */
    static async copyConfig(courseName) {
        try {
            const result = await browser.storage.local.get('courseConfigs');
            const config = result.courseConfigs?.[courseName];

            if (!config) {
                OptionsSettings.showConfigShareMessage('No configuration found for this course', 'error');
                return;
            }

            const jsonStr = JSON.stringify(config, null, 2);
            await navigator.clipboard.writeText(jsonStr);

            OptionsSettings.showConfigShareMessage('Config copied to clipboard! Share it with friends 🎉', 'success');
        } catch (error) {
            console.error('Copy error:', error);
            OptionsSettings.showConfigShareMessage('Failed to copy config: ' + error.message, 'error');
        }
    }

    /**
     * Initialize config menu dropdown (three-dot menu in course header)
     */
    static initializeConfigMenu() {
        const menuBtn = document.getElementById('configMenuBtn');
        const menuDropdown = document.getElementById('configMenuDropdown');
        const exportConfigHeader = document.getElementById('exportConfigHeader');
        const importConfigHeader = document.getElementById('importConfigHeader');
        const copyConfigHeader = document.getElementById('copyConfigHeader');

        if (!menuBtn || !menuDropdown) {
            console.warn('⚠️ Config menu elements not found');
            return;
        }

        // Toggle dropdown on button click
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            menuDropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
                menuDropdown.classList.remove('show');
            }
        });

        // Export config button (per-course)
        if (exportConfigHeader) {
            exportConfigHeader.addEventListener('click', () => {
                const courseName = window.currentConfigCourse;
                if (courseName) {
                    OptionsSettings.exportConfig(courseName);
                    menuDropdown.classList.remove('show');
                }
            });
        }

        // Import config button (per-course)
        if (importConfigHeader) {
            importConfigHeader.addEventListener('click', () => {
                const courseName = window.currentConfigCourse;
                if (courseName) {
                    OptionsSettings.importConfig(courseName);
                    menuDropdown.classList.remove('show');
                }
            });
        }

        // Copy to clipboard button (per-course)
        if (copyConfigHeader) {
            copyConfigHeader.addEventListener('click', () => {
                const courseName = window.currentConfigCourse;
                if (courseName) {
                    OptionsSettings.copyConfig(courseName);
                    menuDropdown.classList.remove('show');
                }
            });
        }

        console.log('✅ Config menu dropdown initialized');
    }

    /**
     * Load and display background polling status
     */
    static async updateBackgroundPollingStatus() {
        const statusDiv = document.getElementById('backgroundPollingStatus');
        const sessionWarning = document.getElementById('sessionExpiredWarning');
        const checkbox = document.getElementById('backgroundPolling');

        if (!statusDiv) return;

        try {
            const response = await browser.runtime.sendMessage({ action: 'getBackgroundPollingStatus' });

            if (!response.success) {
                statusDiv.className = 'status warning';
                statusDiv.innerHTML = '<div>Unable to get background polling status</div>';
                return;
            }

            const status = response.status;

            // Update checkbox
            if (checkbox) {
                checkbox.checked = status.enabled;
            }

            // Show/hide session expired warning
            if (sessionWarning) {
                sessionWarning.style.display = status.sessionExpired ? 'block' : 'none';
            }

            // Build status display
            let statusHTML = '';

            if (status.enabled) {
                statusDiv.className = 'status success';
                statusHTML = '<div>✅ Background polling is active</div>';

                if (status.enrolledCoursesCount > 0) {
                    statusHTML += `<small>Monitoring ${status.enrolledCoursesCount} course${status.enrolledCoursesCount !== 1 ? 's' : ''}</small><br>`;
                } else {
                    statusHTML += '<small>⚠️ No courses detected yet. Visit Gradescope to detect your courses.</small><br>';
                }

                if (status.lastPoll) {
                    const lastPoll = new Date(status.lastPoll);
                    statusHTML += `<small>Last poll: ${lastPoll.toLocaleString()}</small><br>`;
                    if (status.lastPollCount !== undefined) {
                        statusHTML += `<small>Found ${status.lastPollCount} assignment${status.lastPollCount !== 1 ? 's' : ''}</small><br>`;
                    }
                }

                if (status.nextPoll) {
                    const nextPoll = new Date(status.nextPoll);
                    const minutesUntil = Math.round((nextPoll - new Date()) / (1000 * 60));
                    statusHTML += `<small>Next poll: in ${minutesUntil} minute${minutesUntil !== 1 ? 's' : ''}</small>`;
                }

                if (status.sessionExpired) {
                    statusDiv.className = 'status warning';
                    statusHTML = '<div>⚠️ Gradescope session expired</div>';
                    statusHTML += '<small>Background polling paused. Visit Gradescope to restore.</small>';
                }

            } else if (status.autoDisabled) {
                statusDiv.className = 'status warning';
                statusHTML = '<div>⚠️ Background polling was automatically disabled</div>';
                statusHTML += `<small>Reason: ${status.autoDisabledReason || 'Too many failures'}</small><br>`;
                statusHTML += '<small>Enable it again to retry.</small>';
            } else if (!status.enabled) {
                statusDiv.className = 'status info';
                statusHTML = '<div>Background polling is disabled</div>';
                statusHTML += '<small>Enable it to check for new assignments automatically</small>';
            } else {
                // Enabled but no courses yet
                statusDiv.className = 'status info';
                statusHTML = '<div>📡 Background polling is ready</div>';
                statusHTML += '<small>Visit Gradescope to detect your enrolled courses and start automatic sync.</small>';
            }

            statusDiv.innerHTML = statusHTML;

        } catch (error) {
            console.error('Error getting background polling status:', error);
            statusDiv.className = 'status warning';
            statusDiv.innerHTML = '<div>Error checking status</div>';
        }
    }

    /**
     * Handle background polling checkbox toggle
     */
    static async handleBackgroundPollingToggle() {
        const checkbox = document.getElementById('backgroundPolling');
        const statusDiv = document.getElementById('backgroundPollingStatus');

        if (!checkbox) return;

        const isEnabled = checkbox.checked;

        try {
            statusDiv.className = 'status info';
            statusDiv.innerHTML = `<div>${isEnabled ? 'Enabling' : 'Disabling'} background polling...</div>`;

            const action = isEnabled ? 'enableBackgroundPolling' : 'disableBackgroundPolling';
            const response = await browser.runtime.sendMessage({ action });

            if (response.success) {
                // Refresh status display
                await OptionsSettings.updateBackgroundPollingStatus();
            } else {
                // Revert checkbox on failure
                checkbox.checked = !isEnabled;

                statusDiv.className = 'status warning';
                if (response.reason === 'no_courses') {
                    statusDiv.innerHTML = '<div>⚠️ No courses detected</div><small>Please visit Gradescope first to detect your enrolled courses.</small>';
                } else {
                    statusDiv.innerHTML = `<div>Failed to ${isEnabled ? 'enable' : 'disable'} polling</div><small>${response.error || response.message}</small>`;
                }
            }
        } catch (error) {
            console.error('Error toggling background polling:', error);
            checkbox.checked = !isEnabled;
            statusDiv.className = 'status warning';
            statusDiv.innerHTML = '<div>Error toggling polling</div>';
        }
    }

    /**
     * Setup all event listeners for settings page
     */
    static setupEventListeners() {
        console.log('🎧 [OptionsSettings] Setting up event listeners...');

        const authenticateBtn = document.getElementById('authenticate');
        const disconnectBtn = document.getElementById('disconnect');
        const clearAssignmentsBtn = document.getElementById('clearAssignments');
        const clearAuthBtn = document.getElementById('clearAuth');
        const clearAllBtn = document.getElementById('clearAll');
        const saveSettingsBtn = document.getElementById('saveSettings');
        const showStatsBtn = document.getElementById('showStats');

        console.log('🎧 [OptionsSettings] Found buttons:', {
            authenticateBtn: !!authenticateBtn,
            disconnectBtn: !!disconnectBtn,
            clearAssignmentsBtn: !!clearAssignmentsBtn,
            clearAuthBtn: !!clearAuthBtn,
            clearAllBtn: !!clearAllBtn,
            saveSettingsBtn: !!saveSettingsBtn,
            showStatsBtn: !!showStatsBtn
        });

        // Add null checks before attaching event listeners
        if (authenticateBtn) {
            authenticateBtn.addEventListener('click', OptionsSettings.authenticateWithGoogle);
            console.log('✅ [OptionsSettings] Attached event listener to authenticate button');
        } else {
            console.warn('⚠️ [OptionsSettings] Authenticate button not found!');
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

        // Reminder schedule radio buttons
        const reminderScheduleRadios = document.querySelectorAll('input[name="reminderSchedule"]');
        reminderScheduleRadios.forEach(radio => {
            radio.addEventListener('change', OptionsSettings.handleReminderScheduleChange);
        });
        console.log('🔔 [OptionsSettings] Attached event listeners to', reminderScheduleRadios.length, 'reminder schedule radio buttons');

        // Add reminder button
        const addReminderBtn = document.getElementById('addReminderBtn');
        if (addReminderBtn) {
            addReminderBtn.addEventListener('click', OptionsSettings.addCustomReminder);
            console.log('➕ [OptionsSettings] Attached event listener to add reminder button');
        }

        // Background polling checkbox
        const backgroundPollingCheckbox = document.getElementById('backgroundPolling');
        if (backgroundPollingCheckbox) {
            backgroundPollingCheckbox.addEventListener('change', OptionsSettings.handleBackgroundPollingToggle);
            console.log('📡 [OptionsSettings] Attached event listener to background polling checkbox');
        }

        // Note: Config sharing buttons (export/import/copy) are now in the per-course
        // dropdown menu in the Grade Calculator tab, initialized via initializeConfigMenu()

        console.log('✅ [OptionsSettings] Event listeners setup complete');

        // Note: Checkboxes no longer auto-save - user must click "Save Settings" button
        // This prevents confusing UI behavior and gives users explicit control
    }
}

// Expose to window for options.html
if (typeof window !== 'undefined') {
    window.OptionsSettings = OptionsSettings;
}
