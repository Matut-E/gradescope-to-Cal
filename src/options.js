/**
 * Enhanced Options page functionality - Updated for 24-hour Auto-sync
 * Complete integration with all extension features
 */

document.addEventListener('DOMContentLoaded', async () => {
    // =============================================================================
    // THEME TOGGLE (INDEPENDENT FROM POPUP)
    // =============================================================================

    const optionsThemeToggle = document.getElementById('optionsThemeToggle');

    /**
     * Initialize options page theme toggle
     */
    async function initializeOptionsThemeToggle() {
        // Load saved theme preference for options page (separate from popup)
        const { optionsTheme } = await chrome.storage.local.get('optionsTheme');
        const savedTheme = optionsTheme || 'light';

        // Apply theme
        document.body.setAttribute('data-theme', savedTheme);
        updateOptionsThemeIcon(savedTheme);

        // Add click listener
        optionsThemeToggle.addEventListener('click', toggleOptionsTheme);
    }

    async function toggleOptionsTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';

        // Update UI
        document.body.setAttribute('data-theme', newTheme);
        updateOptionsThemeIcon(newTheme);

        // Save preference (independent storage key from popup)
        await chrome.storage.local.set({ optionsTheme: newTheme });
    }

    function updateOptionsThemeIcon(theme) {
        const moonIcon = optionsThemeToggle.querySelector('.theme-icon-moon');
        const sunIcon = optionsThemeToggle.querySelector('.theme-icon-sun');

        if (theme === 'light') {
            moonIcon.style.display = 'block';
            sunIcon.style.display = 'none';
        } else {
            moonIcon.style.display = 'none';
            sunIcon.style.display = 'block';
        }
    }

    // Initialize theme on load
    await initializeOptionsThemeToggle();

    // =============================================================================
    // EXISTING OPTIONS PAGE FUNCTIONALITY
    // =============================================================================

    const authStatus = document.getElementById('authStatus');
    const authenticateBtn = document.getElementById('authenticate');
    const disconnectBtn = document.getElementById('disconnect');
    const clearAssignmentsBtn = document.getElementById('clearAssignments');
    const clearAuthBtn = document.getElementById('clearAuth');
    const clearAllBtn = document.getElementById('clearAll');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const showStatsBtn = document.getElementById('showStats');

    // Get references to all settings controls
    const autoSyncCheckbox = document.getElementById('autoSync');
    const createRemindersCheckbox = document.getElementById('createReminders');

    // Color picker variables
    let selectedEventColorId = '9'; // Default Blueberry
    const selectedColorName = document.getElementById('selectedColorName');

    /**
     * 🕒 Smart interval formatting for options page (same as popup.js)
     */
    function formatInterval(minutes) {
        if (minutes >= 60) {
            const hours = minutes / 60;
            return hours === 1 ? '1 hour' : `${hours} hours`;
        } else {
            return `${minutes} minutes`;
        }
    }

    /**
     * Update color picker UI to show selected color
     */
    function updateColorPickerUI(colorId) {
        const colorBoxes = document.querySelectorAll('.color-box');

        colorBoxes.forEach(box => {
            box.classList.remove('selected');
        });

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
     * Select a color locally (updates state and UI)
     */
    function selectColorLocally(colorId, colorName) {
        console.log('🎨 Selecting color (local state):', colorName, `(ID: ${colorId})`);

        // Update local state (no saving yet)
        selectedEventColorId = colorId;

        // Update UI immediately
        updateColorPickerUI(colorId);
    }

    /**
     * Initialize color picker event listeners
     */
    function initializeColorPicker() {
        const colorBoxes = document.querySelectorAll('.color-box');

        colorBoxes.forEach(box => {
            box.addEventListener('click', () => {
                const colorId = box.getAttribute('data-color-id');
                const colorName = box.getAttribute('data-color-name');
                selectColorLocally(colorId, colorName);
            });
        });

        console.log('🎨 Color picker initialized with', colorBoxes.length, 'colors');
    }

    /**
     * 🌟 Enhanced Authentication Status Display
     */
    async function checkAuthStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
            
            if (response.success && response.authenticated && response.tokenValid) {
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
                authenticateBtn.style.display = 'none';
                disconnectBtn.style.display = 'inline-block';
            } else {
                authStatus.className = 'status info';
                authStatus.innerHTML = '<div>🔒 Not connected to Google Calendar</div>';
                authenticateBtn.style.display = 'inline-block';
                disconnectBtn.style.display = 'none';
            }
        } catch (error) {
            authStatus.className = 'status warning';
            authStatus.innerHTML = '<div>⚠️ Error checking authentication status</div>';
            console.error('Auth status error:', error);
        }
    }

    /**
     * 🌟 Auto-Sync Status Display - Updated for 24-hour sync
     */
    async function updateAutoSyncStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAutoSyncStatus' });

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
                    const intervalText = formatInterval(status.interval);
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
     * 🌟 Load Settings from Storage - Updated for new structure
     */
    async function loadSettings() {
        try {
            const settings = await chrome.storage.local.get([
                'settings_auto_sync',
                'settings_create_reminders',
                'settings_all_day_events',
                'settings_auto_discovery'
            ]);

            // Load color preference from sync storage
            const syncSettings = await chrome.storage.sync.get(['eventColorId']);
            const eventColorId = syncSettings.eventColorId || '9'; // Default to Blueberry
            console.log('🎨 Loaded event color ID:', eventColorId);

            // Set local state
            selectedEventColorId = eventColorId;

            // Set default values and load saved settings
            autoSyncCheckbox.checked = settings.settings_auto_sync !== false; // Default true
            createRemindersCheckbox.checked = settings.settings_create_reminders !== false; // Default true

            // Initialize previous settings for change detection
            previousSettings.createReminders = createRemindersCheckbox.checked;
            previousSettings.eventColorId = eventColorId;

            // Update color picker UI
            updateColorPickerUI(eventColorId);

        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    /**
     * Track previous settings to detect what changed
     */
    let previousSettings = {
        createReminders: true,
        eventColorId: '9'
    };

    /**
     * 🌟 Save Settings to Storage - Updated for new structure
     */
    async function saveSettings(triggerSource = 'manual') {
        try {
            // Check authentication status
            const authResponse = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
            const isAuthenticated = authResponse.success && authResponse.authenticated && authResponse.tokenValid;

            const settings = {
                settings_auto_sync: autoSyncCheckbox.checked,
                settings_create_reminders: createRemindersCheckbox.checked,
                // Advanced settings are always enabled (hardcoded)
                settings_all_day_events: true,
                settings_auto_discovery: true,
                // Store the last save timestamp
                settings_last_updated: new Date().toISOString()
            };

            await chrome.storage.local.set(settings);

            // Save event color to sync storage
            await chrome.storage.sync.set({ eventColorId: selectedEventColorId });
            console.log('🎨 Saved event color ID:', selectedEventColorId);

            // If auto-sync setting changed, update the background service
            if (autoSyncCheckbox.checked) {
                await chrome.runtime.sendMessage({ action: 'enableAutoSync' });
            } else {
                await chrome.runtime.sendMessage({ action: 'disableAutoSync' });
            }

            // Determine if calendar-specific settings (reminders/color) changed
            const reminderChanged = previousSettings.createReminders !== createRemindersCheckbox.checked;
            const colorChanged = previousSettings.eventColorId !== selectedEventColorId;
            const calendarSettingChanged = reminderChanged || colorChanged;

            // Update previous settings
            previousSettings.createReminders = createRemindersCheckbox.checked;
            previousSettings.eventColorId = selectedEventColorId;

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
            setTimeout(updateAutoSyncStatus, 500);

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
    async function authenticateWithGoogle() {
        authenticateBtn.disabled = true;
        authenticateBtn.textContent = 'Connecting...';
        
        try {
            const response = await chrome.runtime.sendMessage({ action: 'authenticate' });
            if (response.success) {
                await checkAuthStatus();
                await updateAutoSyncStatus();
            } else {
                alert('Authentication failed: ' + response.error);
            }
        } catch (error) {
            alert('Authentication error: ' + error.message);
        } finally {
            authenticateBtn.disabled = false;
            authenticateBtn.textContent = 'Connect Google Calendar';
        }
    }

    /**
     * Disconnect from Google
     */
    async function disconnectFromGoogle() {
        if (confirm('Are you sure you want to disconnect from Google Calendar? This will also disable auto-sync.')) {
            try {
                // Send clear auth message to background script
                const response = await chrome.runtime.sendMessage({ action: 'clearAuth' });
                
                if (response.success) {
                    await checkAuthStatus();
                    await updateAutoSyncStatus();
                } else {
                    console.error('Clear auth failed:', response.error);
                }
            } catch (error) {
                console.error('Disconnect error:', error);
            }
        }
    }

    /**
     * 🌟 Enhanced Data Management
     */
    async function clearAssignmentData() {
        if (confirm('Are you sure you want to clear all extracted assignment data?')) {
            try {
                const storage = await chrome.storage.local.get();
                const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));
                await chrome.storage.local.remove(assignmentKeys);
                
                alert(`✅ Cleared ${assignmentKeys.length} assignment data entries!`);
            } catch (error) {
                alert('Error clearing assignment data: ' + error.message);
            }
        }
    }

    async function clearAuthData() {
        if (confirm('Are you sure you want to clear authentication data? This will require re-authentication.')) {
            await disconnectFromGoogle(); // Use the enhanced disconnect function
        }
    }

    async function clearAllData() {
        if (confirm('⚠️ Are you sure you want to clear ALL extension data? This cannot be undone and will:\n\n• Remove all authentication\n• Delete all assignment data\n• Reset all settings\n• Disable auto-sync')) {
            try {
                // Disable auto-sync first
                await chrome.runtime.sendMessage({ action: 'disableAutoSync' });
                
                // Clear all storage
                await chrome.storage.local.clear();
                
                // Reset UI
                await checkAuthStatus();
                await updateAutoSyncStatus();
                await loadSettings();
                
                alert('✅ All data cleared! Extension has been reset to defaults.');
            } catch (error) {
                alert('Error clearing data: ' + error.message);
            }
        }
    }

    /**
     * 🌟 Enhanced Assignment Data Statistics
     */
    async function showDataStatistics() {
        try {
            const storage = await chrome.storage.local.get();
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
            const syncStats = await chrome.storage.local.get(['last_auto_sync', 'last_sync_results']);

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

    // Event Listeners
    authenticateBtn.addEventListener('click', authenticateWithGoogle);
    disconnectBtn.addEventListener('click', disconnectFromGoogle);
    clearAssignmentsBtn.addEventListener('click', clearAssignmentData);
    clearAuthBtn.addEventListener('click', clearAuthData);
    clearAllBtn.addEventListener('click', clearAllData);
    saveSettingsBtn.addEventListener('click', saveSettings);

    // Note: Checkboxes no longer auto-save - user must click "Save Settings" button
    // This prevents confusing UI behavior and gives users explicit control

    // Statistics button functionality
    if (showStatsBtn) {
        showStatsBtn.addEventListener('click', showDataStatistics);
    }

    // Initial load
    await loadSettings();
    await checkAuthStatus();
    await updateAutoSyncStatus();

    // Initialize color picker
    initializeColorPicker();

    // Periodic updates (less frequent for options page)
    setInterval(checkAuthStatus, 60000); // Every minute
    setInterval(updateAutoSyncStatus, 30000); // Every 30 seconds

    console.log('✅ Enhanced Options page initialized with 24-hour auto-sync support and color picker');
});