/**
 * Enhanced Popup Script with Updated Dashboard Auto-Discovery Messaging
 * UPDATED: Reflects new dashboard capabilities and fallback options
 */

document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const authStatusDiv = document.getElementById('authStatus');
    const authenticateBtn = document.getElementById('authenticate');
    const calendarSyncBtn = document.getElementById('calendarSync');
    const manualSyncBtn = document.getElementById('manualSync');
    const viewStorageBtn = document.getElementById('viewStorage');
    const assignmentCountDiv = document.getElementById('assignmentCount');

    // Create auto-sync section
    createAutoSyncSection();

    /**
     * 🌟 Create Auto-Sync Controls Section
     * UPDATED: Insert AFTER Google Calendar section for better UX flow
     */
    function createAutoSyncSection() {
        const autoSyncSection = document.createElement('div');
        autoSyncSection.className = 'section';
        autoSyncSection.innerHTML = `
            <div class="section-title">Automatic Sync</div>
            
            <div id="autoSyncStatus" class="status info">
                <div>⏳ Checking auto-sync status...</div>
            </div>
            
            <button id="toggleAutoSync" class="button secondary">
                ⚙️ Configure Auto-Sync
            </button>
            
            <div id="autoSyncDetails" class="auto-sync-details" style="display: none;">
                <div class="auto-sync-info">
                    <small id="nextSyncTime">Next sync: calculating...</small><br>
                    <small id="lastSyncTime">Last sync: never</small>
                </div>
            </div>
        `;

        // 🌟 FIXED: Insert AFTER the Google Calendar section (better UX flow)
        const calendarSection = authStatusDiv.closest('.section');
        const nextSection = calendarSection.nextElementSibling;
        
        if (nextSection) {
            // Insert before the next section (probably footer)
            calendarSection.parentNode.insertBefore(autoSyncSection, nextSection);
        } else {
            // If no next section, append after calendar section
            calendarSection.parentNode.appendChild(autoSyncSection);
        }

        // Add event listeners
        document.getElementById('toggleAutoSync').addEventListener('click', toggleAutoSync);
    }

    /**
     * 🌟 ENHANCED: Update status display with smarter messaging
     */
    function updateStatus(message, type = 'info') {
        statusDiv.className = `status ${type}`;
        statusDiv.innerHTML = `<div>${message}</div>`;
    }

    /**
     * 🌟 ENHANCED: Smart status messaging based on current page
     */
    function updateStatusBasedOnPage() {
        // Check what type of page the user is currently on
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0] && tabs[0].url) {
                const url = tabs[0].url;
                
                if (url.includes('gradescope.com')) {
                    if (url.includes('/courses/') && !url.endsWith('/')) {
                        // On a specific course page
                        updateStatus('📄 On course page - assignments will be extracted automatically', 'info');
                    } else if (url.includes('gradescope.com') && (url.endsWith('/') || url.includes('/account'))) {
                        // On dashboard
                        updateStatus('🏠 Perfect! Dashboard detected - all courses will be auto-discovered', 'success');
                    } else {
                        // Other Gradescope page
                        updateStatus('📍 On Gradescope - navigate to dashboard for full auto-discovery', 'info');
                    }
                } else {
                    // Not on Gradescope
                    updateStatus('🎯 Visit your Gradescope dashboard for automatic course discovery', 'info');
                }
            }
        });
    }

    /**
     * Update authentication status display
     */
    function updateAuthStatus(status) {
        if (status.authenticated && status.tokenValid) {
            authStatusDiv.className = 'status success';
            authStatusDiv.innerHTML = '<div>✅ Google Calendar connected</div>';
            authenticateBtn.style.display = 'none';
            calendarSyncBtn.disabled = false;
        } else if (status.authenticated && !status.tokenValid) {
            authStatusDiv.className = 'status warning';
            authStatusDiv.innerHTML = '<div>⚠️ Authentication expired</div>';
            authenticateBtn.style.display = 'block';
            authenticateBtn.textContent = '🔄 Refresh Authentication';
            calendarSyncBtn.disabled = true;
        } else {
            authStatusDiv.className = 'status info';
            authStatusDiv.innerHTML = '<div>🔍 Google Calendar not connected</div>';
            authenticateBtn.style.display = 'block';
            authenticateBtn.textContent = '🔗 Connect Google Calendar';
            calendarSyncBtn.disabled = true;
        }
    }

    /**
     * 🌟 Update Auto-Sync Status Display
     */
    async function updateAutoSyncStatus() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAutoSyncStatus' });
            
            if (response.success) {
                const status = response.status;
                const autoSyncStatusDiv = document.getElementById('autoSyncStatus');
                const toggleBtn = document.getElementById('toggleAutoSync');
                const detailsDiv = document.getElementById('autoSyncDetails');
                const nextSyncDiv = document.getElementById('nextSyncTime');
                const lastSyncDiv = document.getElementById('lastSyncTime');

                if (status.enabled) {
                    autoSyncStatusDiv.className = 'status success';
                    autoSyncStatusDiv.innerHTML = `<div>🔄 Auto-sync enabled (every ${status.interval} min)</div>`;
                    toggleBtn.textContent = '🛑 Disable Auto-Sync';
                    toggleBtn.className = 'button secondary';
                    
                    // Show details
                    detailsDiv.style.display = 'block';
                    
                    // Format next sync time
                    if (status.nextSync) {
                        const nextSync = new Date(status.nextSync);
                        const now = new Date();
                        const diffMinutes = Math.round((nextSync - now) / (1000 * 60));
                        nextSyncDiv.textContent = `Next sync: in ${diffMinutes} minutes (${nextSync.toLocaleTimeString()})`;
                    } else {
                        nextSyncDiv.textContent = 'Next sync: calculating...';
                    }
                    
                    // Format last sync time
                    if (status.lastSync) {
                        const lastSync = new Date(status.lastSync);
                        const results = status.lastResults;
                        let resultText = lastSync.toLocaleString();
                        if (results) {
                            resultText += ` (${results.created} created, ${results.skipped} skipped)`;
                        }
                        lastSyncDiv.textContent = `Last sync: ${resultText}`;
                    } else {
                        lastSyncDiv.textContent = 'Last sync: never';
                    }
                    
                    // Show error if there was one
                    if (status.lastError) {
                        const errorTime = new Date(status.lastError.timestamp);
                        if (errorTime > new Date(status.lastSync || 0)) {
                            lastSyncDiv.innerHTML += `<br><span style="color: #dc3545;">Last error: ${status.lastError.error}</span>`;
                        }
                    }
                    
                } else {
                    autoSyncStatusDiv.className = 'status info';
                    autoSyncStatusDiv.innerHTML = '<div>⏸️ Auto-sync disabled</div>';
                    toggleBtn.textContent = '▶️ Enable Auto-Sync';
                    toggleBtn.className = 'button';
                    detailsDiv.style.display = 'none';
                }
            } else {
                console.error('Failed to get auto-sync status:', response.error);
            }
        } catch (error) {
            console.error('Error checking auto-sync status:', error);
        }
    }

    /**
     * 🌟 Toggle Auto-Sync
     */
    async function toggleAutoSync() {
        try {
            const statusResponse = await chrome.runtime.sendMessage({ action: 'getAutoSyncStatus' });
            const isEnabled = statusResponse.success && statusResponse.status.enabled;
            
            const toggleBtn = document.getElementById('toggleAutoSync');
            toggleBtn.disabled = true;
            
            if (isEnabled) {
                toggleBtn.textContent = '⏳ Disabling...';
                const response = await chrome.runtime.sendMessage({ action: 'disableAutoSync' });
                if (response.success) {
                    updateStatus('🛑 Auto-sync disabled', 'info');
                }
            } else {
                toggleBtn.textContent = '⏳ Enabling...';
                const response = await chrome.runtime.sendMessage({ action: 'enableAutoSync' });
                if (response.success) {
                    updateStatus('▶️ Auto-sync enabled - assignments will sync automatically every 30 minutes', 'success');
                }
            }
            
            await updateAutoSyncStatus();
            
        } catch (error) {
            console.error('Error toggling auto-sync:', error);
            updateStatus('❌ Error configuring auto-sync', 'warning');
        } finally {
            const toggleBtn = document.getElementById('toggleAutoSync');
            toggleBtn.disabled = false;
        }
    }

    /**
     * Improved checkAuthStatus with defensive error handling
     * Handles malformed responses gracefully
     */
    async function checkAuthStatus() {
        try {
            console.log('🔍 Checking authentication status...');
            
            const response = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
            
            console.log('📨 Auth status response received:', response);
            
            // 🔧 DEFENSIVE: Handle both old and new response formats
            if (response && typeof response === 'object') {
                // New format: { success: true, authenticated: true, tokenValid: true, ... }
                if (response.hasOwnProperty('success')) {
                    if (response.success) {
                        updateAuthStatus(response);
                        return response.authenticated && response.tokenValid;
                    } else {
                        console.error('Auth status check failed:', response.error || 'Unknown error');
                        updateAuthStatus({ authenticated: false, tokenValid: false });
                        return false;
                    }
                }
                // Old format: Direct response { authenticated: true, tokenValid: true, ... }
                else if (response.hasOwnProperty('authenticated')) {
                    console.log('🔄 Using legacy response format');
                    updateAuthStatus(response);
                    return response.authenticated && response.tokenValid;
                }
                // Malformed response
                else {
                    console.error('❌ Malformed auth status response:', response);
                    updateAuthStatus({ authenticated: false, tokenValid: false });
                    return false;
                }
            } else {
                console.error('❌ Invalid response type:', typeof response, response);
                updateAuthStatus({ authenticated: false, tokenValid: false });
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error checking auth status:', error);
            
            // 🔧 SPECIFIC ERROR HANDLING
            if (error.message && error.message.includes('Could not establish connection')) {
                console.error('🚫 Background script not responding - extension may need reload');
                updateStatus('❌ Extension connection error - try reloading the extension', 'warning');
            } else if (error.message && error.message.includes('chrome.runtime.sendMessage')) {
                console.error('🚫 Chrome runtime API error');
                updateStatus('❌ Browser API error - check extension permissions', 'warning');
            }
            
            updateAuthStatus({ authenticated: false, tokenValid: false });
            return false;
        }
    }

    /**
     * Authenticate with Google Calendar
     */
    async function authenticateWithGoogle() {
        try {
            authenticateBtn.disabled = true;
            authenticateBtn.textContent = '🔄 Connecting...';
            updateStatus('🔗 Connecting to Google Calendar...', 'info');

            const response = await chrome.runtime.sendMessage({ action: 'authenticate' });

            if (response.success) {
                updateStatus('✅ Google Calendar connected! Auto-sync enabled.', 'success');
                await checkAuthStatus();
                await updateAutoSyncStatus(); // Update auto-sync status after authentication
            } else {
                console.error('Authentication failed:', response.error);
                updateStatus(`❌ Authentication failed: ${response.error}`, 'warning');
            }

        } catch (error) {
            console.error('Authentication error:', error);
            updateStatus('❌ Authentication error - check console', 'warning');
        } finally {
            authenticateBtn.disabled = false;
            const currentStatus = await checkAuthStatus();
            if (!currentStatus) {
                authenticateBtn.textContent = '🔗 Connect Google Calendar';
            }
        }
    }

    /**
     * Sync assignments to calendar (now creates ALL-DAY events)
     */
    async function syncToCalendar() {
        try {
            calendarSyncBtn.disabled = true;
            calendarSyncBtn.textContent = '📅 Syncing...';
            updateStatus('🔄 Loading assignments...', 'info');

            const assignments = await getAllStoredAssignments();

            if (assignments.length === 0) {
                updateStatus('❌ No assignments found. Visit Gradescope dashboard or course pages first.', 'warning');
                return;
            }

            updateStatus(`🔄 Creating ${assignments.length} ALL-DAY calendar events...`, 'info');

            const response = await chrome.runtime.sendMessage({ 
                action: 'syncToCalendar',
                assignments: assignments
            });

            if (response.success) {
                const { results } = response;
                const message = `✅ Sync complete! ${results.created} all-day events created, ${results.skipped} skipped, ${results.errors} errors`;
                updateStatus(message, 'success');
                
                // Trigger auto-sync status update to show latest sync
                setTimeout(updateAutoSyncStatus, 1000);
            } else {
                updateStatus(`❌ Sync failed: ${response.error}`, 'warning');
            }

        } catch (error) {
            console.error('Calendar sync error:', error);
            updateStatus('❌ Calendar sync error', 'warning');
        } finally {
            calendarSyncBtn.disabled = false;
            calendarSyncBtn.textContent = '📅 Sync to Calendar';
        }
    }

    /**
     * Get all stored assignments
     */
    async function getAllStoredAssignments() {
        try {
            const storage = await chrome.storage.local.get();
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

            let allAssignments = [];
            assignmentKeys.forEach(key => {
                if (storage[key].assignments) {
                    allAssignments.push(...storage[key].assignments);
                }
            });

            const uniqueAssignments = allAssignments.filter((assignment, index, array) => 
                array.findIndex(a => a.assignmentId === assignment.assignmentId) === index
            );

            return uniqueAssignments;
        } catch (error) {
            console.error('Error getting stored assignments:', error);
            return [];
        }
    }

    /**
     * 🌟 ENHANCED: Count and display stored assignments with better messaging
     */
    async function countStoredAssignments() {
        try {
            const assignments = await getAllStoredAssignments();
            const totalAssignments = assignments.length;

            if (totalAssignments > 0) {
                assignmentCountDiv.textContent = `${totalAssignments} unique assignments found`;
                
                // Check if we have auto-discovered assignments
                const storage = await chrome.storage.local.get();
                const hasAutodiscovered = Object.keys(storage).some(key => 
                    key.includes('autodiscovered') && storage[key].assignments?.length > 0
                );
                
                if (hasAutodiscovered) {
                    updateStatus('🎉 Dashboard auto-discovery completed! Assignments ready for sync.', 'success');
                } else {
                    updateStatus('📅 Assignment data found!', 'success');
                }
            } else {
                assignmentCountDiv.textContent = 'No assignment data found yet';
                updateStatusBasedOnPage(); // Show smart status based on current page
            }

            return totalAssignments;
        } catch (error) {
            console.error('Error counting assignments:', error);
            updateStatus('❌ Error accessing storage', 'warning');
            return 0;
        }
    }

    /**
     * 🌟 ENHANCED: Trigger manual sync with smart messaging
     */
    async function triggerManualSync() {
        try {
            manualSyncBtn.disabled = true;
            manualSyncBtn.textContent = '🔄 Extracting...';
            updateStatus('🔄 Extracting assignments from current page...', 'info');

            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

            if (!tab.url.includes('gradescope.com')) {
                updateStatus('❌ Please navigate to Gradescope first', 'warning');
                return;
            }

            if (tab.url.includes('gradescope.com') && (tab.url.endsWith('/') || tab.url.includes('/account'))) {
                updateStatus('🏠 Dashboard detected - starting full auto-discovery...', 'info');
            } else if (tab.url.includes('/courses/')) {
                updateStatus('📄 Course page detected - extracting assignments...', 'info');
            }

            try {
                await chrome.tabs.sendMessage(tab.id, {action: 'manualSync'});
                console.log('Sent manual sync message to content script');
            } catch (error) {
                console.log('Content script not ready, injecting fresh script...');
                await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ['contentScript.js']
                });
            }

            setTimeout(async () => {
                await countStoredAssignments();
                // If auto-sync is enabled and user is authenticated, suggest they don't need manual sync
                const autoSyncStatus = await chrome.runtime.sendMessage({ action: 'getAutoSyncStatus' });
                const authStatus = await checkAuthStatus();
                
                if (autoSyncStatus.success && autoSyncStatus.status.enabled && authStatus) {
                    updateStatus('ℹ️ Assignments extracted! Auto-sync will handle calendar updates automatically.', 'info');
                }
            }, 3000);

        } catch (error) {
            console.error('Manual sync error:', error);
            updateStatus('❌ Error during extraction', 'warning');
        } finally {
            manualSyncBtn.disabled = false;
            manualSyncBtn.textContent = '🔄 Extract Assignments Now';
        }
    }

    /**
     * View stored assignment data
     */
    async function viewStoredData() {
        try {
            const assignments = await getAllStoredAssignments();

            if (assignments.length === 0) {
                alert('No assignment data found. Visit Gradescope dashboard or course pages first.');
                return;
            }

            let output = '📅 EXTRACTED ASSIGNMENT DATA (All-Day Events):\n\n';

            assignments.forEach((assignment, index) => {
                output += `${index + 1}. ${assignment.title}\n`;
                output += `   Course: ${assignment.course}\n`;
                
                let dueDateDisplay = 'No due date';
                if (assignment.dueDate) {
                    try {
                        const dateObj = new Date(assignment.dueDate);
                        if (!isNaN(dateObj.getTime())) {
                            dueDateDisplay = dateObj.toLocaleDateString() + ' (All-day event)';
                        }
                    } catch (e) {
                        dueDateDisplay = 'Date parsing error';
                    }
                }
                
                output += `   Due: ${dueDateDisplay}\n`;
                output += `   URL: ${assignment.url}\n`;
                output += `   ID: ${assignment.assignmentId}\n`;
                
                // Show if auto-discovered
                if (assignment.autoDiscovered) {
                    output += `   📡 Auto-discovered from dashboard\n`;
                }
                
                output += `\n`;
            });

            output += '\n🔍 Note: Assignments appear as prominent all-day events in your calendar for better visibility.';

            const newWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');
            newWindow.document.write(`
                <html>
                <head><title>Extracted Assignment Data</title></head>
                <body style="font-family: monospace; padding: 20px; white-space: pre-wrap;">
                    ${output.replace(/\n/g, '<br>')}
                </body>
                </html>
            `);

        } catch (error) {
            console.error('Error viewing storage:', error);
            alert('Error accessing stored data: ' + error.message);
        }
    }

    // Event Listeners
    authenticateBtn.addEventListener('click', authenticateWithGoogle);
    calendarSyncBtn.addEventListener('click', syncToCalendar);
    manualSyncBtn.addEventListener('click', triggerManualSync);
    viewStorageBtn.addEventListener('click', viewStoredData);

    // Initial load
    await countStoredAssignments();
    await checkAuthStatus();
    await updateAutoSyncStatus();
    
    // Refresh status periodically
    setInterval(checkAuthStatus, 30000);
    setInterval(updateAutoSyncStatus, 10000); // Check auto-sync status more frequently
});