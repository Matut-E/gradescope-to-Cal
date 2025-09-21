/**
 * Enhanced Popup Script with Real-time Assignment Updates and Progress Animation
 */

document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const authStatusDiv = document.getElementById('authStatus');
    const authenticateBtn = document.getElementById('authenticate');
    const calendarSyncBtn = document.getElementById('calendarSync');
    const manualSyncBtn = document.getElementById('manualSync');
    const viewStorageBtn = document.getElementById('viewStorage');
    const assignmentCountDiv = document.getElementById('assignmentCount');

    function formatDuration(minutes) {
        if (minutes >= 60) {
            const hours = Math.round(minutes / 60 * 10) / 10;
            return hours === 1 ? '1 hour' : `${hours} hours`;
        } else {
            return minutes === 1 ? '1 minute' : `${minutes} minutes`;
        }
    }

    function formatInterval(minutes) {
        if (minutes >= 60) {
            const hours = minutes / 60;
            return hours === 1 ? '1 hour' : `${hours} hours`;
        } else {
            return `${minutes} min`;
        }
    }

    // Create auto-sync section
    createAutoSyncSection();

    // Set up real-time storage listener for assignment updates
    setupStorageListener();

    // Check if this is first-time setup
    await checkFirstTimeSetup();

    /**
     * Real-time storage listener for assignment updates
     */
    function setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                const hasAssignmentChanges = Object.keys(changes).some(key => 
                    key.startsWith('assignments_')
                );
                
                if (hasAssignmentChanges) {
                    console.log('📡 Assignment data changed, updating popup...');
                    
                    // Stop progress animation when real data arrives
                    stopProgressAnimation();
                    
                    // Update assignment count immediately
                    countStoredAssignments();
                    
                    // Show a brief "updated" indicator
                    showUpdateIndicator();
                }
            }
        });
    }

    /**
     * Show brief visual indicator when data updates
     */
    function showUpdateIndicator() {
        assignmentCountDiv.style.transition = 'background-color 0.6s ease';
        assignmentCountDiv.style.backgroundColor = '#e8f5e8';
        
        setTimeout(() => {
            assignmentCountDiv.style.backgroundColor = '';
        }, 600);
    }

    /**
     * Show loading state immediately when on Gradescope
     */
    async function showLoadingStateIfOnGradescope() {
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            const isOnGradescope = tab?.url?.includes('gradescope.com');
            
            if (isOnGradescope && !await hasRecentAssignmentData()) {
                updateStatus('🔍 Scanning Gradescope page...', 'info');
                startProgressAnimation();
            }
        } catch (error) {
            console.error('Error checking Gradescope status:', error);
        }
    }

    /**
     * Check if we have recent assignment data (within last 30 seconds)
     */
    async function hasRecentAssignmentData() {
        const storage = await chrome.storage.local.get();
        const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));
        
        if (assignmentKeys.length === 0) return false;
        
        const thirtySecondsAgo = Date.now() - 30000;
        return assignmentKeys.some(key => {
            const data = storage[key];
            return data.extractedAt && new Date(data.extractedAt).getTime() > thirtySecondsAgo;
        });
    }

    /**
     * Animated progress indicator
     */
    function startProgressAnimation() {
        const progressSteps = [
            '🔍 Scanning Gradescope page...',
            '📚 Detecting current semester...',
            '🔎 Finding course cards...',
            '📋 Extracting assignments...',
            '🔄 Processing course data...',
            '✨ Almost done...'
        ];
        
        let currentStep = 0;
        
        const progressInterval = setInterval(() => {
            if (currentStep < progressSteps.length) {
                updateStatus(progressSteps[currentStep], 'info');
                currentStep++;
            } else {
                currentStep = 0;
            }
        }, 1500);
        
        window.extractionProgressInterval = progressInterval;
    }

    /**
     * Stop progress animation when real data arrives
     */
    function stopProgressAnimation() {
        if (window.extractionProgressInterval) {
            clearInterval(window.extractionProgressInterval);
            window.extractionProgressInterval = null;
        }
    }

    /**
     * Check if this is first-time setup and provide guidance
     */
    async function checkFirstTimeSetup() {
        try {
            const assignments = await getAllStoredAssignments();
            const hasData = assignments.length > 0;
            
            const authStatus = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
            const hasAuth = authStatus.success && authStatus.authenticated;
            
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            const isOnGradescope = tab?.url?.includes('gradescope.com');
            
            if (!hasData && !hasAuth && !isOnGradescope) {
                updateStatus('👋 Welcome! Visit Gradescope dashboard to get started', 'info');
                showFirstTimeHelp();
            } else if (!hasData && isOnGradescope) {
                updateStatus('🔄 Extension starting up... assignments will appear shortly', 'info');
                
                setTimeout(async () => {
                    const newAssignments = await getAllStoredAssignments();
                    if (newAssignments.length === 0) {
                        updateStatus('🔄 Still extracting... this may take a moment on first use', 'info');
                        
                        setTimeout(() => {
                            updateStatus('💡 Try clicking "Extract Assignments Now" if data doesn\'t appear', 'info');
                        }, 600);
                    }
                }, 600);
            }
            
        } catch (error) {
            console.error('Error checking first-time setup:', error);
        }
    }

    /**
     * Show first-time setup help
     */
    function showFirstTimeHelp() {
        const helpDiv = document.createElement('div');
        helpDiv.style.cssText = `
            background: #f0f8ff;
            border: 1px solid #bee5eb;
            border-radius: 4px;
            padding: 10px;
            margin: 10px 0;
            font-size: 12px;
            line-height: 1.4;
        `;
        
        helpDiv.innerHTML = `
            <strong>🚀 Quick Setup:</strong><br>
            Just click "Go to Gradescope" below, then connect Google Calendar!
            
            <div style="margin-top: 8px; font-size: 11px; color: #666;">
                💡 <em>Works best from the main dashboard page</em>
            </div>
        `;
        
        statusDiv.parentNode.insertBefore(helpDiv, statusDiv.nextSibling);
        
        const checkForData = setInterval(async () => {
            const assignments = await getAllStoredAssignments();
            if (assignments.length > 0) {
                helpDiv.remove();
                clearInterval(checkForData);
            }
        }, 2000);
        
        setTimeout(() => {
            if (helpDiv.parentNode) {
                helpDiv.remove();
            }
            clearInterval(checkForData);
        }, 60000);
    }

    /**
     * Create Auto-Sync Controls Section
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

        const calendarSection = authStatusDiv.closest('.section');
        const nextSection = calendarSection.nextElementSibling;
        
        if (nextSection) {
            calendarSection.parentNode.insertBefore(autoSyncSection, nextSection);
        } else {
            calendarSection.parentNode.appendChild(autoSyncSection);
        }

        document.getElementById('toggleAutoSync').addEventListener('click', toggleAutoSync);
    }

    /**
     * Update status display with smarter messaging
     */
    function updateStatus(message, type = 'info') {
        statusDiv.className = `status ${type}`;
        statusDiv.innerHTML = `<div>${message}</div>`;
    }

    /**
     * Smart status messaging based on current page
     */
    function updateStatusBasedOnPage() {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0] && tabs[0].url) {
                const url = tabs[0].url;
                
                if (url.includes('gradescope.com')) {
                    if (url.includes('/courses/') && !url.endsWith('/')) {
                        updateStatus('🔄 On course page - assignments will be extracted automatically', 'info');
                    } else if (url.includes('gradescope.com') && (url.endsWith('/') || url.includes('/account'))) {
                        updateStatus('🏠 Perfect! Dashboard detected - all courses will be auto-discovered', 'success');
                    } else {
                        updateStatus('🔍 On Gradescope - navigate to dashboard for full auto-discovery', 'info');
                    }
                } else {
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
     * Update Auto-Sync Status Display
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
                    autoSyncStatusDiv.innerHTML = `<div>🔄 Auto-sync enabled (every ${formatInterval(status.interval)})</div>`;
                    toggleBtn.textContent = '🛑 Disable Auto-Sync';
                    toggleBtn.className = 'button secondary';
                    
                    detailsDiv.style.display = 'block';
                    
                    if (status.nextSync) {
                        const nextSync = new Date(status.nextSync);
                        const now = new Date();
                        const diffMinutes = Math.round((nextSync - now) / (1000 * 60));
                        
                        nextSyncDiv.textContent = `Next sync: in ${formatDuration(diffMinutes)} (${nextSync.toLocaleTimeString()})`;
                    } else {
                        nextSyncDiv.textContent = 'Next sync: calculating...';
                    }
                    
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
     * Toggle Auto-Sync
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
                    const newStatusResponse = await chrome.runtime.sendMessage({ action: 'getAutoSyncStatus' });
                    if (newStatusResponse.success) {
                        const interval = formatInterval(newStatusResponse.status.interval);
                        updateStatus(`▶️ Auto-sync enabled - assignments will sync automatically every ${interval}`, 'success');
                    } else {
                        updateStatus('▶️ Auto-sync enabled', 'success');
                    }
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
     */
    async function checkAuthStatus() {
        try {
            console.log('🔍 Checking authentication status...');
            
            const response = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
            
            console.log('📨 Auth status response received:', response);
            
            if (response && typeof response === 'object') {
                if (response.hasOwnProperty('success')) {
                    if (response.success) {
                        updateAuthStatus(response);
                        return response.authenticated && response.tokenValid;
                    } else {
                        console.error('Auth status check failed:', response.error || 'Unknown error');
                        updateAuthStatus({ authenticated: false, tokenValid: false });
                        return false;
                    }
                } else if (response.hasOwnProperty('authenticated')) {
                    console.log('🔄 Using legacy response format');
                    updateAuthStatus(response);
                    return response.authenticated && response.tokenValid;
                } else {
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
                await updateAutoSyncStatus();
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
     * Sync assignments to calendar
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
                
                setTimeout(updateAutoSyncStatus, 600);
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
     * Count and display stored assignments with better messaging
     */
    async function countStoredAssignments() {
        try {
            const assignments = await getAllStoredAssignments();
            const totalAssignments = assignments.length;

            if (totalAssignments > 0) {
                assignmentCountDiv.textContent = `${totalAssignments} unique assignments found`;
                
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
                updateStatusBasedOnPage();
            }

            return totalAssignments;
        } catch (error) {
            console.error('Error counting assignments:', error);
            updateStatus('❌ Error accessing storage', 'warning');
            return 0;
        }
    }

    /**
     * Trigger manual sync with smart messaging
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
                updateStatus('🔄 Course page detected - extracting assignments...', 'info');
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

            let progressCount = 0;
            const progressMessages = [
                '🔄 Scanning Gradescope page structure...',
                '📚 Detecting courses and semesters...',
                '📋 Extracting assignment details...',
                '💾 Saving assignment data...'
            ];

            const progressInterval = setInterval(() => {
                if (progressCount < progressMessages.length) {
                    updateStatus(progressMessages[progressCount], 'info');
                    progressCount++;
                }
            }, 1500);

            setTimeout(async () => {
                clearInterval(progressInterval);
                
                const newCount = await countStoredAssignments();
                
                const autoSyncStatus = await chrome.runtime.sendMessage({ action: 'getAutoSyncStatus' });
                const authStatus = await checkAuthStatus();
                
                if (autoSyncStatus.success && autoSyncStatus.status.enabled && authStatus && newCount > 0) {
                    updateStatus('ℹ️ Assignments extracted! Auto-sync will handle calendar updates automatically.', 'info');
                } else if (newCount > 0) {
                    updateStatus('✅ Extraction complete! Ready for calendar sync.', 'success');
                }
            }, 3600);

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
    
    // Show loading state if on Gradescope
    await showLoadingStateIfOnGradescope();
    
    // Periodic status checks
    setInterval(checkAuthStatus, 30000);
    setInterval(updateAutoSyncStatus, 10000);
    setInterval(countStoredAssignments, 5000);
});