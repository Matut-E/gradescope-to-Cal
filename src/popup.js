/**
 * 🔧 COMPLETE FIXED Popup Script with Enhanced Authentication & Real-time Updates
 * Handles token refresh, first-time setup, and comprehensive status reporting
 */

document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const authStatusDiv = document.getElementById('authStatus');
    const authenticateBtn = document.getElementById('authenticate');
    const calendarSyncBtn = document.getElementById('calendarSync');
    const manualSyncBtn = document.getElementById('manualSync');
    const viewStorageBtn = document.getElementById('viewStorage');
    const assignmentCountDiv = document.getElementById('assignmentCount');

    // Create enhanced auto-sync section
    createAutoSyncSection();
    
    // Set up real-time storage listener
    setupStorageListener();

    // Check if this is first-time setup
    await checkFirstTimeSetup();

    /**
     * 🌟 Check if this is first-time setup and provide guidance
     */
    async function checkFirstTimeSetup() {
        try {
            // Check if we have any stored assignment data
            const assignments = await getAllStoredAssignments();
            const hasData = assignments.length > 0;
            
            // Check if user has ever authenticated
            const authStatus = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
            const hasAuth = authStatus.success && authStatus.authenticated;
            
            // Check if we're on a Gradescope page
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            const isOnGradescope = tab?.url?.includes('gradescope.com');
            
            if (!hasData && !hasAuth && !isOnGradescope) {
                // Complete first-time user
                updateStatus('👋 Welcome! Visit Gradescope dashboard to get started', 'info');
                showFirstTimeHelp();
            } else if (!hasData && isOnGradescope) {
                // On Gradescope but no data yet - probably just installed
                updateStatus('🔄 Extension starting up... assignments will appear shortly', 'info');
                
                // Add a longer timeout for first extraction
                setTimeout(async () => {
                    const newAssignments = await getAllStoredAssignments();
                    if (newAssignments.length === 0) {
                        updateStatus('🔄 Still extracting... this may take a moment on first use', 'info');
                        
                        // Suggest manual extraction if needed
                        setTimeout(() => {
                            updateStatus('💡 Try clicking "Extract Assignments Now" if data doesn\'t appear', 'info');
                        }, 10000);
                    }
                }, 5000);
            } else if (!hasAuth && hasData) {
                // Has data but not authenticated
                updateStatus('📅 Assignments found! Connect Google Calendar to enable auto-sync', 'info');
            }
            
        } catch (error) {
            console.error('Error checking first-time setup:', error);
        }
    }

    /**
     * 🌟 Show first-time setup help with debugging tools
     */
    function showFirstTimeHelp() {
        // Create a small help section
        const helpDiv = document.createElement('div');
        helpDiv.id = 'firstTimeHelp';
        helpDiv.style.cssText = `
            background: #f0f8ff;
            border: 1px solid #bee5eb;
            border-radius: 6px;
            padding: 12px;
            margin: 12px 0;
            font-size: 12px;
            line-height: 1.4;
        `;
        
        helpDiv.innerHTML = `
            <strong>🚀 Quick Setup:</strong><br>
            1. Visit your <a href="https://gradescope.com" target="_blank" style="color: #007bff; text-decoration: none;">Gradescope dashboard</a><br>
            2. Connect Google Calendar below<br>
            3. Enjoy automatic sync every 30 minutes! ✨
            
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #dee2e6;">
                <strong style="color: #495057;">🔧 Troubleshooting:</strong><br>
                <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
                    <button id="clearStorageBtn" style="font-size: 10px; padding: 3px 8px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        🧹 Clear All Data
                    </button>
                    <button id="debugStorageBtn" style="font-size: 10px; padding: 3px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        🔍 Debug Storage
                    </button>
                    <button id="forceExtractBtn" style="font-size: 10px; padding: 3px 8px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        🔄 Force Extract
                    </button>
                </div>
            </div>
            
            <div style="margin-top: 8px; font-size: 11px; color: #666;">
                💡 <em>Tip: Works best from the main Gradescope dashboard page</em>
            </div>
        `;
        
        // Insert after the status div
        statusDiv.parentNode.insertBefore(helpDiv, statusDiv.nextSibling);
        
        // Add event listeners for debugging tools
        document.getElementById('clearStorageBtn').addEventListener('click', async () => {
            if (confirm('⚠️ This will clear all stored assignments and settings. Continue?')) {
                await chrome.storage.local.clear();
                updateStatus('🧹 All data cleared! Extension reset to defaults.', 'info');
                setTimeout(() => location.reload(), 1000);
            }
        });
        
        document.getElementById('debugStorageBtn').addEventListener('click', async () => {
            const storage = await chrome.storage.local.get();
            console.log('🔍 Complete storage contents:', storage);
            
            const keys = Object.keys(storage);
            const assignmentKeys = keys.filter(k => k.startsWith('assignments_'));
            const authKeys = keys.filter(k => k.includes('google_') || k.includes('token'));
            const syncKeys = keys.filter(k => k.includes('sync') || k.includes('last_'));
            
            let debugInfo = `📊 STORAGE DEBUG INFO\n\n`;
            debugInfo += `Total keys: ${keys.length}\n`;
            debugInfo += `Assignment keys: ${assignmentKeys.length}\n`;
            debugInfo += `Auth keys: ${authKeys.length}\n`;
            debugInfo += `Sync keys: ${syncKeys.length}\n\n`;
            debugInfo += `Assignment keys:\n${assignmentKeys.map(k => `  - ${k}`).join('\n')}\n\n`;
            debugInfo += `Auth keys:\n${authKeys.map(k => `  - ${k}`).join('\n')}\n\n`;
            debugInfo += `Sync keys:\n${syncKeys.map(k => `  - ${k}`).join('\n')}`;
            
            alert(debugInfo);
        });
        
        document.getElementById('forceExtractBtn').addEventListener('click', () => {
            manualSyncBtn.click(); // Trigger manual extraction
        });
        
        // Auto-remove after user gets data or authenticates
        const checkForProgress = setInterval(async () => {
            const assignments = await getAllStoredAssignments();
            const authStatus = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
            
            if (assignments.length > 0 || (authStatus.success && authStatus.authenticated)) {
                helpDiv.remove();
                clearInterval(checkForProgress);
            }
        }, 3000);
        
        // Auto-remove after 2 minutes anyway
        setTimeout(() => {
            if (helpDiv.parentNode) {
                helpDiv.remove();
            }
            clearInterval(checkForProgress);
        }, 120000);
    }

    /**
     * 🔧 Enhanced storage listener for real-time updates
     */
    function setupStorageListener() {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                // Check for assignment changes
                const hasAssignmentChanges = Object.keys(changes).some(key => 
                    key.startsWith('assignments_')
                );
                
                if (hasAssignmentChanges) {
                    console.log('📡 Assignment data changed, updating popup...');
                    countStoredAssignments();
                    showUpdateIndicator();
                }
                
                // Check for authentication changes
                const hasAuthChanges = Object.keys(changes).some(key =>
                    key.includes('google_') || key.includes('token')
                );
                
                if (hasAuthChanges) {
                    console.log('📡 Authentication data changed, updating status...');
                    setTimeout(checkAuthStatus, 500); // Small delay for consistency
                }
                
                // Check for sync result changes
                const hasSyncChanges = Object.keys(changes).some(key =>
                    key.includes('last_auto_sync') || key.includes('last_sync_results')
                );
                
                if (hasSyncChanges) {
                    console.log('📡 Sync status changed, updating display...');
                    updateAutoSyncStatus();
                }
            }
        });
    }

    function showUpdateIndicator() {
        assignmentCountDiv.style.transition = 'background-color 0.3s ease';
        assignmentCountDiv.style.backgroundColor = '#e8f5e8';
        setTimeout(() => {
            assignmentCountDiv.style.backgroundColor = '';
        }, 1500);
    }

    /**
     * 🔧 Enhanced authentication status checking
     */
    async function checkAuthStatus() {
        try {
            console.log('🔍 Checking enhanced authentication status...');
            
            const response = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
            
            if (response && response.success) {
                console.log('📨 Auth status received:', response);
                
                // Determine authentication state and update UI accordingly
                if (response.authenticated && response.tokenValid && response.hasRefreshToken) {
                    // Perfect: authenticated with valid refresh token
                    updateAuthStatus({
                        state: 'connected',
                        authenticated: true,
                        tokenValid: true,
                        expiresAt: response.expiresAt,
                        hasRefreshToken: response.hasRefreshToken,
                        authMethod: response.authMethod
                    });
                    return true;
                    
                } else if (response.authenticated && !response.tokenValid && response.hasRefreshToken) {
                    // Good: token expired but can be refreshed automatically
                    updateAuthStatus({
                        state: 'expired_but_refreshable',
                        authenticated: true,
                        tokenValid: false,
                        hasRefreshToken: true,
                        expiresAt: response.expiresAt
                    });
                    return false; // Will be refreshed on next API call
                    
                } else if (response.authenticated && !response.hasRefreshToken) {
                    // Warning: authenticated but no refresh token (old auth method)
                    updateAuthStatus({
                        state: 'authenticated_no_refresh',
                        authenticated: true,
                        tokenValid: response.tokenValid,
                        hasRefreshToken: false,
                        expiresAt: response.expiresAt
                    });
                    return response.tokenValid;
                    
                } else {
                    // Not authenticated at all
                    updateAuthStatus({
                        state: 'not_connected',
                        authenticated: false,
                        tokenValid: false
                    });
                    return false;
                }
            } else {
                console.error('❌ Failed to get auth status:', response?.error || 'Unknown error');
                updateAuthStatus({ state: 'error', error: response?.error });
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error checking auth status:', error);
            updateAuthStatus({ state: 'error', error: error.message });
            return false;
        }
    }

    /**
     * 🔧 Enhanced authentication status display
     */
    function updateAuthStatus(status) {
        switch (status.state) {
            case 'connected':
                authStatusDiv.className = 'status success';
                const expiryTime = status.expiresAt ? new Date(status.expiresAt).toLocaleTimeString() : 'unknown';
                authStatusDiv.innerHTML = `
                    <div>✅ Google Calendar connected</div>
                    <small>Token expires: ${expiryTime} | 🔄 Auto-refresh enabled</small>
                `;
                authenticateBtn.style.display = 'none';
                calendarSyncBtn.disabled = false;
                break;

            case 'expired_but_refreshable':
                authStatusDiv.className = 'status info';
                authStatusDiv.innerHTML = `
                    <div>🔄 Token expired - will refresh automatically</div>
                    <small>Background sync will handle token renewal</small>
                `;
                authenticateBtn.style.display = 'none';
                calendarSyncBtn.disabled = false; // Allow sync - it will refresh token
                break;

            case 'authenticated_no_refresh':
                authStatusDiv.className = 'status warning';
                const isValid = status.tokenValid;
                authStatusDiv.innerHTML = `
                    <div>⚠️ ${isValid ? 'Connected' : 'Token expired'} - No auto-refresh</div>
                    <small>Recommend re-authenticating for better reliability</small>
                `;
                authenticateBtn.style.display = 'block';
                authenticateBtn.textContent = '🔄 Upgrade Authentication';
                calendarSyncBtn.disabled = !isValid;
                break;

            case 'not_connected':
                authStatusDiv.className = 'status info';
                authStatusDiv.innerHTML = '<div>🔒 Google Calendar not connected</div>';
                authenticateBtn.style.display = 'block';
                authenticateBtn.textContent = '🔗 Connect Google Calendar';
                calendarSyncBtn.disabled = true;
                break;

            case 'error':
                authStatusDiv.className = 'status warning';
                authStatusDiv.innerHTML = `<div>⚠️ Authentication error: ${status.error}</div>`;
                authenticateBtn.style.display = 'block';
                authenticateBtn.textContent = '🔄 Retry Authentication';
                calendarSyncBtn.disabled = true;
                break;
        }
    }

    /**
     * 🔧 Enhanced authentication with better user feedback
     */
    async function authenticateWithGoogle() {
        try {
            authenticateBtn.disabled = true;
            authenticateBtn.textContent = '🔄 Connecting...';
            updateStatus('🔗 Connecting to Google Calendar with refresh token support...', 'info');

            const response = await chrome.runtime.sendMessage({ action: 'authenticate' });

            if (response.success) {
                updateStatus('✅ Google Calendar connected! Auto-sync enabled with token refresh.', 'success');
                await checkAuthStatus();
                await updateAutoSyncStatus();
                
                // Remove first-time help if present
                const helpDiv = document.getElementById('firstTimeHelp');
                if (helpDiv) {
                    helpDiv.remove();
                }
                
                // Show success message about improved authentication
                setTimeout(() => {
                    updateStatus('🎉 Setup complete! Your assignments will sync automatically every 30 minutes across Chrome, Brave, and Edge.', 'success');
                }, 3000);
                
            } else {
                console.error('Authentication failed:', response.error);
                let errorMessage = `❌ Authentication failed: ${response.error}`;
                
                // Provide specific guidance based on error type
                if (response.error.includes('cancelled')) {
                    errorMessage = '❌ Authentication cancelled. Please complete the Google authorization to enable auto-sync.';
                } else if (response.error.includes('redirect_uri_mismatch')) {
                    errorMessage = '❌ Configuration issue detected. Please contact support.';
                } else if (response.error.includes('Invalid OAuth2 Client ID')) {
                    errorMessage = '❌ OAuth configuration error. Please reload the extension and try again.';
                }
                
                updateStatus(errorMessage, 'warning');
            }

        } catch (error) {
            console.error('Authentication error:', error);
            updateStatus('❌ Authentication error - please try again or reload extension', 'warning');
        } finally {
            authenticateBtn.disabled = false;
            const currentStatus = await checkAuthStatus();
            if (!currentStatus) {
                authenticateBtn.textContent = '🔗 Connect Google Calendar';
            }
        }
    }

    /**
     * 🌟 Create enhanced auto-sync controls section
     */
    function createAutoSyncSection() {
        const autoSyncSection = document.createElement('div');
        autoSyncSection.className = 'section';
        autoSyncSection.innerHTML = `
            <div class="section-title">Automatic Background Sync</div>
            
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

        // Insert after the Google Calendar section
        const calendarSection = authStatusDiv.closest('.section');
        const nextSection = calendarSection.nextElementSibling;
        
        if (nextSection) {
            calendarSection.parentNode.insertBefore(autoSyncSection, nextSection);
        } else {
            calendarSection.parentNode.appendChild(autoSyncSection);
        }

        // Add event listeners
        document.getElementById('toggleAutoSync').addEventListener('click', toggleAutoSync);
    }

    /**
     * 🔧 Enhanced auto-sync status display
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
                    autoSyncStatusDiv.innerHTML = `<div>🔄 Auto-sync active (every ${status.interval} min)</div>`;
                    toggleBtn.textContent = '🛑 Disable Auto-Sync';
                    toggleBtn.className = 'button secondary';
                    
                    // Show details
                    detailsDiv.style.display = 'block';
                    
                    // Enhanced next sync time display
                    if (status.nextSync) {
                        const nextSync = new Date(status.nextSync);
                        const now = new Date();
                        const diffMinutes = Math.round((nextSync - now) / (1000 * 60));
                        
                        if (diffMinutes > 0) {
                            nextSyncDiv.textContent = `Next sync: in ${diffMinutes} minutes (${nextSync.toLocaleTimeString()})`;
                        } else {
                            nextSyncDiv.textContent = 'Next sync: starting soon...';
                            nextSyncDiv.style.color = '#28a745'; // Green for imminent sync
                        }
                    } else {
                        nextSyncDiv.textContent = 'Next sync: calculating...';
                    }
                    
                    // Enhanced last sync display with comprehensive error detection
                    if (status.lastSync) {
                        const lastSync = new Date(status.lastSync);
                        const results = status.lastResults;
                        let resultText = lastSync.toLocaleString();
                        
                        if (results) {
                            const total = results.created + results.skipped + results.errors;
                            resultText += ` (${results.created} created, ${results.skipped} skipped`;
                            if (results.errors > 0) {
                                resultText += `, ${results.errors} errors`;
                            }
                            resultText += ` • ${total} total)`;
                        }
                        lastSyncDiv.innerHTML = `Last sync: ${resultText}`;
                    } else {
                        lastSyncDiv.innerHTML = 'Last sync: <span style="color: #6c757d;">never</span>';
                    }
                    
                    // Show error if there was one more recent than last success
                    if (status.lastError) {
                        const errorTime = new Date(status.lastError.timestamp);
                        const lastSyncTime = status.lastSync ? new Date(status.lastSync) : new Date(0);
                        
                        if (errorTime > lastSyncTime) {
                            const errorAge = Math.round((new Date() - errorTime) / (1000 * 60));
                            lastSyncDiv.innerHTML += `<br><span style="color: #dc3545;">⚠️ Error ${errorAge}min ago: ${status.lastError.error}</span>`;
                            
                            // Provide specific guidance based on error type
                            if (status.lastError.error.includes('authentication') || 
                                status.lastError.error.includes('token') ||
                                status.lastError.error.includes('unauthorized')) {
                                lastSyncDiv.innerHTML += `<br><span style="color: #007bff; cursor: pointer; text-decoration: underline;" onclick="document.getElementById('authenticate').click();">→ Click to re-authenticate</span>`;
                            } else if (status.lastError.error.includes('No assignments')) {
                                lastSyncDiv.innerHTML += `<br><small style="color: #6c757d;">Visit Gradescope to discover new assignments</small>`;
                            }
                        }
                    }
                    
                } else {
                    autoSyncStatusDiv.className = 'status info';
                    autoSyncStatusDiv.innerHTML = '<div>⏸️ Auto-sync disabled</div>';
                    toggleBtn.textContent = '▶️ Enable Auto-Sync';
                    toggleBtn.className = 'button';
                    detailsDiv.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error getting auto-sync status:', error);
            const autoSyncStatusDiv = document.getElementById('autoSyncStatus');
            if (autoSyncStatusDiv) {
                autoSyncStatusDiv.className = 'status warning';
                autoSyncStatusDiv.innerHTML = '<div>⚠️ Error checking auto-sync status</div>';
            }
        }
    }

    /**
     * 🔧 Enhanced auto-sync toggle
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
                // Check authentication before enabling
                const isAuthenticated = await checkAuthStatus();
                if (!isAuthenticated) {
                    updateStatus('⚠️ Please connect Google Calendar first before enabling auto-sync', 'warning');
                    toggleBtn.disabled = false;
                    return;
                }
                
                toggleBtn.textContent = '⏳ Enabling...';
                const response = await chrome.runtime.sendMessage({ action: 'enableAutoSync' });
                if (response.success) {
                    updateStatus('▶️ Auto-sync enabled! Assignments will sync automatically every 30 minutes.', 'success');
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
     * 🔧 Enhanced status display with multi-line support
     */
    function updateStatus(message, type = 'info') {
        statusDiv.className = `status ${type}`;
        
        // Handle multi-line messages
        const lines = message.split('\n');
        if (lines.length > 1) {
            statusDiv.innerHTML = lines.map(line => `<div>${line}</div>`).join('');
        } else {
            statusDiv.innerHTML = `<div>${message}</div>`;
        }
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
     * 🔧 Enhanced assignment counting with comprehensive debugging
     */
    async function countStoredAssignments() {
        try {
            // Debug: Let's see what's actually in storage
            const storage = await chrome.storage.local.get();
            console.log('🔍 Full storage contents:', storage);
            
            const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));
            console.log('🔍 Assignment keys found:', assignmentKeys);
            
            const assignments = await getAllStoredAssignments();
            const totalAssignments = assignments.length;

            if (totalAssignments > 0) {
                assignmentCountDiv.textContent = `${totalAssignments} unique assignments found`;
                
                // Debug: Log some assignment details
                console.log('🔍 Sample assignments:', assignments.slice(0, 3).map(a => ({
                    title: a.title,
                    id: a.assignmentId,
                    course: a.course,
                    extracted: a.extractedAt
                })));
                
                // Check if we have recently auto-discovered assignments
                const hasRecentAutodiscovery = Object.keys(storage).some(key => 
                    key.includes('dashboard_auto_discovery') && storage[key].assignments?.length > 0
                );
                
                if (hasRecentAutodiscovery) {
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
     * Enhanced manual sync trigger
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
                updateStatus('🏠 Dashboard detected - starting comprehensive auto-discovery...', 'info');
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
                
                // Wait a moment for injection then try message again
                setTimeout(async () => {
                    try {
                        await chrome.tabs.sendMessage(tab.id, {action: 'manualSync'});
                    } catch (e) {
                        console.log('Content script still not responding, continuing with progress display...');
                    }
                }, 1000);
            }

            // Enhanced progress feedback
            let progressCount = 0;
            const progressMessages = [
                '🔄 Scanning Gradescope page structure...',
                '📚 Detecting courses and current semester...',
                '📡 Fetching assignment data from discovered courses...',
                '🔍 Parsing due dates and assignment details...',
                '💾 Saving assignment data and checking for duplicates...'
            ];

            const progressInterval = setInterval(() => {
                if (progressCount < progressMessages.length) {
                    updateStatus(progressMessages[progressCount], 'info');
                    progressCount++;
                }
            }, 1800);

            setTimeout(async () => {
                clearInterval(progressInterval);
                
                const newCount = await countStoredAssignments();
                
                // Provide context-aware feedback
                const autoSyncStatus = await chrome.runtime.sendMessage({ action: 'getAutoSyncStatus' });
                const authStatus = await checkAuthStatus();
                
                if (newCount > 0) {
                    if (autoSyncStatus.success && autoSyncStatus.status.enabled && authStatus) {
                        updateStatus('ℹ️ Assignments extracted! Auto-sync will handle calendar updates automatically.', 'info');
                    } else if (authStatus) {
                        updateStatus('✅ Extraction complete! Click "Sync to Calendar" for manual sync.', 'success');
                    } else {
                        updateStatus('✅ Extraction complete! Connect Google Calendar to enable sync.', 'success');
                    }
                } else {
                    updateStatus('🔍 No new assignments found. Try visiting your Gradescope dashboard.', 'info');
                }
            }, 9000); // Longer timeout for more thorough extraction

        } catch (error) {
            console.error('Manual sync error:', error);
            updateStatus('❌ Error during extraction', 'warning');
        } finally {
            manualSyncBtn.disabled = false;
            manualSyncBtn.textContent = '🔄 Extract Assignments Now';
        }
    }

    /**
     * Enhanced calendar sync
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

            updateStatus(`🔄 Creating ${assignments.length} all-day calendar events...`, 'info');

            const response = await chrome.runtime.sendMessage({ 
                action: 'syncToCalendar',
                assignments: assignments
            });

            if (response.success) {
                const { results } = response;
                const message = `✅ Sync complete! ${results.created} all-day events created, ${results.skipped} skipped`;
                if (results.errors > 0) {
                    updateStatus(`${message}, ${results.errors} errors - check console for details`, 'warning');
                } else {
                    updateStatus(message, 'success');
                }
                
                // Trigger auto-sync status update to show latest sync
                setTimeout(updateAutoSyncStatus, 1000);
            } else {
                updateStatus(`❌ Sync failed: ${response.error}`, 'warning');
            }

        } catch (error) {
            console.error('Calendar sync error:', error);
            updateStatus('❌ Calendar sync error - check console for details', 'warning');
        } finally {
            calendarSyncBtn.disabled = false;
            calendarSyncBtn.textContent = '📅 Sync to Calendar (All-Day Events)';
        }
    }

    /**
     * Enhanced stored data viewer
     */
    async function viewStoredData() {
        try {
            const assignments = await getAllStoredAssignments();

            if (assignments.length === 0) {
                alert('No assignment data found.\n\nTo get started:\n1. Visit your Gradescope dashboard\n2. Click "Extract Assignments Now"');
                return;
            }

            let output = '📅 STORED ASSIGNMENT DATA\n\n';
            output += `Total assignments: ${assignments.length}\n`;
            output += `Courses: ${[...new Set(assignments.map(a => a.course))].join(', ')}\n\n`;

            assignments.forEach((assignment, index) => {
                output += `${index + 1}. ${assignment.title}\n`;
                output += `   Course: ${assignment.course}\n`;
                
                let dueDateDisplay = 'No due date';
                if (assignment.dueDate) {
                    try {
                        const dateObj = new Date(assignment.dueDate);
                        if (!isNaN(dateObj.getTime())) {
                            dueDateDisplay = dateObj.toLocaleDateString() + ' at ' + dateObj.toLocaleTimeString();
                        }
                    } catch (e) {
                        dueDateDisplay = 'Date parsing error';
                    }
                }
                
                output += `   Due: ${dueDateDisplay}\n`;
                output += `   Assignment ID: ${assignment.assignmentId}\n`;
                output += `   URL: ${assignment.url}\n`;
                
                if (assignment.autoDiscovered) {
                    output += `   📡 Auto-discovered from dashboard\n`;
                }
                if (assignment.extractedAt) {
                    output += `   Extracted: ${new Date(assignment.extractedAt).toLocaleString()}\n`;
                }
                
                output += `\n`;
            });

            output += '\n💡 Tips:\n';
            output += '• Assignments appear as all-day events in Google Calendar\n';
            output += '• Auto-sync runs every 30 minutes when connected\n';
            output += '• Visit Gradescope dashboard for comprehensive course discovery';

            // Create a proper popup window with the data
            const newWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
            newWindow.document.write(`
                <html>
                <head>
                    <title>Gradescope Assignment Data</title>
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                            padding: 20px; 
                            white-space: pre-wrap; 
                            line-height: 1.4;
                            max-width: 800px;
                        }
                        .header {
                            background: #f8f9fa;
                            padding: 15px;
                            border-radius: 6px;
                            margin-bottom: 20px;
                            border-left: 4px solid #007bff;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <strong>Gradescope to Cal - Assignment Data</strong><br>
                        <small>Generated: ${new Date().toLocaleString()}</small>
                    </div>
                    ${output.replace(/\n/g, '<br>')}
                </body>
                </html>
            `);

        } catch (error) {
            console.error('Error viewing storage:', error);
            alert('Error accessing stored data: ' + error.message);
        }
    }

    /**
     * Get all unique assignments from storage
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

    // Event Listeners
    authenticateBtn.addEventListener('click', authenticateWithGoogle);
    calendarSyncBtn.addEventListener('click', syncToCalendar);
    manualSyncBtn.addEventListener('click', triggerManualSync);
    viewStorageBtn.addEventListener('click', viewStoredData);

    // Initial load
    await countStoredAssignments();
    await checkAuthStatus();
    await updateAutoSyncStatus();
    
    // Periodic updates with staggered timing to avoid conflicts
    setInterval(checkAuthStatus, 45000); // Every 45 seconds
    setInterval(updateAutoSyncStatus, 20000); // Every 20 seconds
    setInterval(countStoredAssignments, 8000); // Every 8 seconds
    
    console.log('✅ Enhanced popup script initialized with comprehensive debugging');
});