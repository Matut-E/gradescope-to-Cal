/**
 * Enhanced Options page functionality
 * Complete integration with all extension features
 */

document.addEventListener('DOMContentLoaded', async () => {
    const authStatus = document.getElementById('authStatus');
    const authenticateBtn = document.getElementById('authenticate');
    const disconnectBtn = document.getElementById('disconnect');
    const clearAssignmentsBtn = document.getElementById('clearAssignments');
    const clearAuthBtn = document.getElementById('clearAuth');
    const clearAllBtn = document.getElementById('clearAll');
    const saveSettingsBtn = document.getElementById('saveSettings');

    // Get references to all settings controls
    const autoSyncCheckbox = document.getElementById('autoSync');
    const syncFrequencySelect = document.getElementById('syncFrequency');
    const createRemindersCheckbox = document.getElementById('createReminders');

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
                    statusHTML += `<small>Method: ${response.authMethod}</small><br>`;
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
     * 🌟 Auto-Sync Status Display
     */
    async function updateAutoSyncStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAutoSyncStatus' });
            
            if (response.success) {
                const status = response.status;
                
                // Update checkbox state
                autoSyncCheckbox.checked = status.enabled;
                
                // Show detailed status in the authentication section
                let autoSyncInfo = '';
                if (status.enabled) {
                    autoSyncInfo += `<br><small>🔄 Auto-sync: Every ${status.interval} minutes</small>`;
                    
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
                        const minutesUntilNext = Math.round((nextSync - new Date()) / (1000 * 60));
                        autoSyncInfo += `<br><small>Next sync: in ${minutesUntilNext} minutes</small>`;
                    }
                } else {
                    autoSyncInfo += '<br><small>⏸️ Auto-sync disabled</small>';
                }
                
                // Add to auth status display
                if (authStatus.innerHTML && !authStatus.innerHTML.includes('🔄')) {
                    authStatus.innerHTML += autoSyncInfo;
                }
            }
        } catch (error) {
            console.error('Error getting auto-sync status:', error);
        }
    }

    /**
     * 🌟 Load Settings from Storage
     */
    async function loadSettings() {
        try {
            const settings = await chrome.storage.local.get([
                'settings_auto_sync',
                'settings_sync_frequency', 
                'settings_create_reminders'
            ]);

            // Set default values and load saved settings
            autoSyncCheckbox.checked = settings.settings_auto_sync !== false; // Default true
            syncFrequencySelect.value = settings.settings_sync_frequency || '30'; // Default 30 minutes
            createRemindersCheckbox.checked = settings.settings_create_reminders !== false; // Default true

        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    /**
     * 🌟 Save Settings to Storage
     */
    async function saveSettings() {
        try {
            const settings = {
                settings_auto_sync: autoSyncCheckbox.checked,
                settings_sync_frequency: parseInt(syncFrequencySelect.value),
                settings_create_reminders: createRemindersCheckbox.checked
            };

            await chrome.storage.local.set(settings);

            // If auto-sync setting changed, update the background service
            if (autoSyncCheckbox.checked) {
                await chrome.runtime.sendMessage({ action: 'enableAutoSync' });
            } else {
                await chrome.runtime.sendMessage({ action: 'disableAutoSync' });
            }

            // Show success message
            const originalText = saveSettingsBtn.textContent;
            saveSettingsBtn.textContent = '✅ Saved!';
            saveSettingsBtn.className = 'button success';
            
            setTimeout(() => {
                saveSettingsBtn.textContent = originalText;
                saveSettingsBtn.className = 'button';
            }, 2000);

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
     * 🌟 Assignment Data Statistics
     */
    async function showDataStatistics() {
        try {
            const storage = await chrome.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));
            
            let totalAssignments = 0;
            let courseCount = new Set();
            let oldestExtraction = null;
            let newestExtraction = null;

            assignmentKeys.forEach(key => {
                const data = storage[key];
                if (data.assignments) {
                    totalAssignments += data.assignments.length;
                    
                    data.assignments.forEach(assignment => {
                        if (assignment.course) courseCount.add(assignment.course);
                    });
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

            let statsMessage = `📊 DATA STATISTICS\n\n`;
            statsMessage += `Total assignments: ${totalAssignments}\n`;
            statsMessage += `Unique courses: ${courseCount.size}\n`;
            statsMessage += `Storage entries: ${assignmentKeys.length}\n\n`;
            
            if (oldestExtraction) {
                statsMessage += `Oldest data: ${oldestExtraction.toLocaleString()}\n`;
            }
            if (newestExtraction) {
                statsMessage += `Newest data: ${newestExtraction.toLocaleString()}\n`;
            }
            
            statsMessage += `\nCourses: ${Array.from(courseCount).join(', ') || 'None'}`;

            alert(statsMessage);
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

    // 🌟 Enhanced event listeners
    autoSyncCheckbox.addEventListener('change', saveSettings);
    syncFrequencySelect.addEventListener('change', saveSettings);
    createRemindersCheckbox.addEventListener('change', saveSettings);

    // Add statistics button functionality (if it exists in HTML)
    const statsBtn = document.getElementById('showStats');
    if (statsBtn) {
        statsBtn.addEventListener('click', showDataStatistics);
    }

    // Initial load
    await loadSettings();
    await checkAuthStatus();
    await updateAutoSyncStatus();
    
    // Periodic updates
    setInterval(checkAuthStatus, 30000);
    setInterval(updateAutoSyncStatus, 15000);
});