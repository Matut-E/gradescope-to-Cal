/**
 * Calendar Sync Module
 * Handles assignment extraction, calendar synchronization, and auto-sync management
 */

class CalendarManager {
    constructor() {
        // Calendar-related elements
        this.statusDiv = document.getElementById('status');
        this.authStatusDiv = document.getElementById('authStatus');
        this.authenticateBtn = document.getElementById('authenticate');
        this.calendarSyncBtn = document.getElementById('calendarSync');
        this.manualSyncBtn = document.getElementById('manualSync');
        this.viewStorageBtn = document.getElementById('viewStorage');
        this.assignmentCountDiv = document.getElementById('assignmentCount');
    }

    initialize() {
        this.setupEventListeners();
        this.createAutoSyncSection();
        this.setupStorageListener();
        this.checkFirstTimeSetup();
        this.updateExtractButton();
        this.showLoadingStateIfOnGradescope();

        // Periodic status checks
        setInterval(() => this.checkAuthStatus(), 30000);
        setInterval(() => this.updateAutoSyncStatus(), 10000);
        setInterval(() => this.countStoredAssignments(), 5000);
        setInterval(() => this.updateExtractButton(), 5000);
    }

    setupEventListeners() {
        this.authenticateBtn.addEventListener('click', () => this.authenticateWithGoogle());
        this.calendarSyncBtn.addEventListener('click', () => this.syncToCalendar());
        this.manualSyncBtn.addEventListener('click', () => this.triggerManualSync());
        this.viewStorageBtn.addEventListener('click', () => this.viewStoredData());
    }

    // =============================================================================
    // STATUS UPDATES
    // =============================================================================

    updateStatus(message, type = 'info') {
        this.statusDiv.className = `status ${type}`;
        // Safe replacement for innerHTML
        this.statusDiv.textContent = '';
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        this.statusDiv.appendChild(messageDiv);
    }

    updateAuthStatus(status) {
        if (status.authenticated && status.tokenValid) {
            this.authStatusDiv.className = 'status success';
            this.authStatusDiv.textContent = '';
            const messageDiv = document.createElement('div');
            messageDiv.textContent = '✅ Google Calendar connected';
            this.authStatusDiv.appendChild(messageDiv);
            this.authenticateBtn.style.display = 'none';
            this.calendarSyncBtn.disabled = false;
        } else if (status.authenticated && !status.tokenValid) {
            this.authStatusDiv.className = 'status warning';
            this.authStatusDiv.textContent = '';
            const messageDiv = document.createElement('div');
            messageDiv.textContent = '⚠️ Authentication expired';
            this.authStatusDiv.appendChild(messageDiv);
            this.authenticateBtn.style.display = 'block';
            this.authenticateBtn.textContent = '🔄 Refresh Authentication';
            this.calendarSyncBtn.disabled = true;
        } else {
            this.authStatusDiv.className = 'status info';
            this.authStatusDiv.textContent = '';
            const messageDiv = document.createElement('div');
            messageDiv.textContent = '🔍 Google Calendar not connected';
            this.authStatusDiv.appendChild(messageDiv);
            this.authenticateBtn.style.display = 'block';
            this.authenticateBtn.textContent = '🔗 Connect Google Calendar';
            this.calendarSyncBtn.disabled = true;
        }
    }

    async updateStatusBasedOnPage() {
        const tabs = await browser.tabs.query({active: true, currentWindow: true});
        if (tabs[0] && tabs[0].url) {
            const url = tabs[0].url;

            if (url.includes('gradescope.com') && (url.endsWith('/') || url.includes('/account'))) {
                this.updateStatus('🏠 Perfect! Dashboard detected - ready for extraction', 'success');
            } else if (url.includes('gradescope.com')) {
                this.updateStatus('📍 On Gradescope - ready for extraction', 'info');
            } else {
                this.updateStatus('🎯 Ready to go to Gradescope', 'info');
            }
        }
    }

    // =============================================================================
    // AUTHENTICATION
    // =============================================================================

    async checkAuthStatus() {
        try {
            console.log('🔍 Checking authentication status...');

            const response = await browser.runtime.sendMessage({ action: 'getAuthStatus' });

            console.log('📨 Auth status response received:', response);

            if (response && typeof response === 'object') {
                if (response.hasOwnProperty('success')) {
                    if (response.success) {
                        this.updateAuthStatus(response);
                        return response.authenticated && response.tokenValid;
                    } else {
                        console.error('Auth status check failed:', response.error || 'Unknown error');
                        this.updateAuthStatus({ authenticated: false, tokenValid: false });
                        return false;
                    }
                } else if (response.hasOwnProperty('authenticated')) {
                    console.log('🔄 Using legacy response format');
                    this.updateAuthStatus(response);
                    return response.authenticated && response.tokenValid;
                } else {
                    console.error('❌ Malformed auth status response:', response);
                    this.updateAuthStatus({ authenticated: false, tokenValid: false });
                    return false;
                }
            } else {
                console.error('❌ Invalid response type:', typeof response, response);
                this.updateAuthStatus({ authenticated: false, tokenValid: false });
                return false;
            }

        } catch (error) {
            console.error('❌ Error checking auth status:', error);

            if (error.message && error.message.includes('Could not establish connection')) {
                console.error('🚫 Background script not responding - extension may need reload');
                this.updateStatus('❌ Extension connection error - try reloading the extension', 'warning');
            } else if (error.message && error.message.includes('browser.runtime.sendMessage')) {
                console.error('🚫 Chrome runtime API error');
                this.updateStatus('❌ Browser API error - check extension permissions', 'warning');
            }

            this.updateAuthStatus({ authenticated: false, tokenValid: false });
            return false;
        }
    }

    async authenticateWithGoogle() {
        try {
            this.authenticateBtn.disabled = true;
            this.authenticateBtn.textContent = '🔄 Connecting...';
            this.updateStatus('🔗 Connecting to Google Calendar...', 'info');

            const response = await browser.runtime.sendMessage({ action: 'authenticate' });

            if (response.success) {
                // Check if first-time sync happened
                if (response.firstTimeSync && response.syncResults) {
                    const results = response.syncResults;
                    this.updateStatus(
                        `✅ Google Calendar connected! ${results.created} assignments synced immediately. Auto-sync enabled.`,
                        'success'
                    );

                    // Firefox fix: Poll for storage updates instead of single delayed refresh
                    // In Firefox, storage writes are async and timing varies
                    console.log('🔄 First-time sync detected, polling for storage updates...');

                    let pollCount = 0;
                    const maxPolls = 20; // 20 polls × 100ms = 2 seconds max
                    const pollInterval = setInterval(async () => {
                        pollCount++;
                        const count = await this.countStoredAssignments();

                        // Stop polling if assignments found or max polls reached
                        if (count > 0 || pollCount >= maxPolls) {
                            clearInterval(pollInterval);
                            const elapsed = pollCount * 100;
                            console.log(`✅ Popup refreshed after ${elapsed}ms (${pollCount} polls)`);

                            if (count === 0 && pollCount >= maxPolls) {
                                console.warn('⚠️ Max polls reached without finding assignments');
                            }
                        }
                    }, 100); // Poll every 100ms
                } else {
                    this.updateStatus('✅ Google Calendar connected! Auto-sync enabled.', 'success');
                }

                // Refresh all status displays
                await this.checkAuthStatus();
                await this.updateAutoSyncStatus();
                await this.countStoredAssignments(); // Immediate refresh

            } else {
                console.error('Authentication failed:', response.error);
                this.updateStatus(`❌ Authentication failed: ${response.error}`, 'warning');
            }

        } catch (error) {
            console.error('Authentication error:', error);
            this.updateStatus('❌ Authentication error - check console', 'warning');
        } finally {
            this.authenticateBtn.disabled = false;
            const currentStatus = await this.checkAuthStatus();
            if (!currentStatus) {
                this.authenticateBtn.textContent = '🔗 Connect Google Calendar';
            }
        }
    }

    // =============================================================================
    // CALENDAR SYNC
    // =============================================================================

    async syncToCalendar() {
        try {
            this.calendarSyncBtn.disabled = true;
            this.calendarSyncBtn.textContent = '📅 Syncing...';
            this.updateStatus('🔄 Loading assignments...', 'info');

            const assignments = await window.StorageUtils.getAllStoredAssignments();

            if (assignments.length === 0) {
                this.updateStatus('❌ No assignments found. Visit Gradescope dashboard or course pages first.', 'warning');
                return;
            }

            // Force cache refresh before sync to ensure we have latest event data
            // This is crucial for detecting duplicates, especially in Firefox
            console.log('🔄 Forcing cache refresh before sync...');
            this.updateStatus('🔄 Refreshing calendar cache...', 'info');

            try {
                const cacheRefresh = await browser.runtime.sendMessage({ action: 'forceCacheRefresh' });
                if (cacheRefresh.success) {
                    console.log('✅ Cache refreshed successfully');
                } else {
                    console.warn('⚠️ Cache refresh failed, continuing with sync anyway');
                }
            } catch (cacheError) {
                console.warn('⚠️ Cache refresh error:', cacheError);
                // Continue with sync even if cache refresh fails
            }

            this.updateStatus(`🔄 Creating ${assignments.length} calendar events...`, 'info');

            const response = await browser.runtime.sendMessage({
                action: 'syncToCalendar',
                assignments: assignments
            });

            if (response.success) {
                const { results } = response;
                const message = `✅ Sync complete! ${results.created} events created, ${results.skipped} skipped, ${results.errors} errors`;
                this.updateStatus(message, 'success');

                setTimeout(() => this.updateAutoSyncStatus(), 600);
            } else {
                this.updateStatus(`❌ Sync failed: ${response.error}`, 'warning');
            }

        } catch (error) {
            console.error('Calendar sync error:', error);
            this.updateStatus('❌ Calendar sync error', 'warning');
        } finally {
            this.calendarSyncBtn.disabled = false;
            this.calendarSyncBtn.textContent = '📅 Sync to Calendar';
        }
    }

    // =============================================================================
    // ASSIGNMENT EXTRACTION
    // =============================================================================

    async countStoredAssignments() {
        try {
            const assignments = await window.StorageUtils.getAllStoredAssignments();

            // Filter to only upcoming assignments (matches calendar sync behavior)
            const now = new Date();
            const upcomingAssignments = assignments.filter(assignment => {
                if (!assignment.dueDate) return false;
                const dueDate = new Date(assignment.dueDate);
                return dueDate >= now;
            });

            const upcomingCount = upcomingAssignments.length;

            if (upcomingCount > 0) {
                this.assignmentCountDiv.textContent = `${upcomingCount} upcoming assignment${upcomingCount !== 1 ? 's' : ''} found`;

                const storage = await browser.storage.local.get();
                const hasAutodiscovered = Object.keys(storage).some(key =>
                    key.includes('autodiscovered') && storage[key].assignments?.length > 0
                );

                if (hasAutodiscovered) {
                    this.updateStatus('🎉 Dashboard auto-discovery completed! Assignments ready for sync.', 'success');
                } else {
                    this.updateStatus('📅 Assignment data found!', 'success');
                }
            } else {
                this.assignmentCountDiv.textContent = 'No assignment data found yet';
                await this.updateStatusBasedOnPage();
            }

            return upcomingCount;
        } catch (error) {
            console.error('Error counting assignments:', error);
            this.updateStatus('❌ Error accessing storage', 'warning');
            return 0;
        }
    }

    async triggerManualSync() {
        try {
            this.manualSyncBtn.disabled = true;
            this.manualSyncBtn.textContent = '🔄 Extracting...';
            this.updateStatus('🔄 Extracting assignments from current page...', 'info');

            const [tab] = await browser.tabs.query({active: true, currentWindow: true});

            if (!tab.url.includes('gradescope.com')) {
                this.updateStatus('❌ Please navigate to Gradescope first', 'warning');
                return;
            }

            if (tab.url.includes('gradescope.com') && (tab.url.endsWith('/') || tab.url.includes('/account'))) {
                this.updateStatus('🏠 Dashboard detected - starting full auto-discovery...', 'info');
            } else if (tab.url.includes('/courses/')) {
                this.updateStatus('🔄 Course page detected - extracting assignments...', 'info');
            }

            try {
                await browser.tabs.sendMessage(tab.id, {action: 'manualSync'});
                console.log('Sent manual sync message to content script');
            } catch (error) {
                console.log('Content script not ready, injecting fresh script...');
                await browser.scripting.executeScript({
                    target: {tabId: tab.id},
                    files: ['assignmentCategorizer.js', 'contentScript.js']
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
                    this.updateStatus(progressMessages[progressCount], 'info');
                    progressCount++;
                }
            }, 1500);

            setTimeout(async () => {
                clearInterval(progressInterval);

                const newCount = await this.countStoredAssignments();

                const autoSyncStatus = await browser.runtime.sendMessage({ action: 'getAutoSyncStatus' });
                const authStatus = await this.checkAuthStatus();

                if (autoSyncStatus.success && autoSyncStatus.status.enabled && authStatus && newCount > 0) {
                    this.updateStatus('ℹ️ Assignments extracted! Auto-sync will handle calendar updates automatically.', 'info');
                } else if (newCount > 0) {
                    this.updateStatus('✅ Extraction complete! Ready for calendar sync.', 'success');
                }
            }, 3600);

        } catch (error) {
            console.error('Manual sync error:', error);
            this.updateStatus('❌ Error during extraction', 'warning');
        } finally {
            this.manualSyncBtn.disabled = false;
            this.manualSyncBtn.textContent = '🔄 Extract Assignments Now';
        }
    }

    async updateExtractButton() {
        try {
            const [tab] = await browser.tabs.query({active: true, currentWindow: true});
            const isOnGradescope = tab?.url?.includes('gradescope.com');

            if (!isOnGradescope) {
                this.manualSyncBtn.textContent = '🎯 Go to Gradescope';
                this.manualSyncBtn.onclick = () => {
                    browser.tabs.create({ url: 'https://gradescope.com' });
                    window.close();
                };
            } else {
                this.manualSyncBtn.textContent = '🔄 Extract Assignments Now';
                this.manualSyncBtn.onclick = () => this.triggerManualSync();
            }
        } catch (error) {
            console.error('Error updating extract button:', error);
            this.manualSyncBtn.textContent = '🔄 Extract Assignments Now';
            this.manualSyncBtn.onclick = () => this.triggerManualSync();
        }
    }

    async viewStoredData() {
        try {
            console.log('📊 Opening storage viewer page...');

            const assignments = await window.StorageUtils.getAllStoredAssignments();

            if (assignments.length === 0) {
                alert('No assignment data found. Visit Gradescope dashboard or course pages first.');
                return;
            }

            // Use browser.tabs.create() for proper cross-browser support
            // This opens the storage-viewer.html page which loads data dynamically
            const url = browser.runtime.getURL('storage-viewer.html');
            console.log('   - Opening URL:', url);

            await browser.tabs.create({ url: url });
            console.log('   ✅ Storage viewer page opened');

        } catch (error) {
            console.error('❌ Error opening storage viewer:', error);
            alert('Error opening data viewer: ' + error.message);
        }
    }

    // =============================================================================
    // AUTO-SYNC MANAGEMENT
    // =============================================================================

    createAutoSyncSection() {
        const autoSyncSection = document.createElement('div');
        autoSyncSection.className = 'section';

        // Create section title
        const titleDiv = document.createElement('div');
        titleDiv.className = 'section-title';
        titleDiv.textContent = 'Automatic Sync';
        autoSyncSection.appendChild(titleDiv);

        // Create status div
        const statusDiv = document.createElement('div');
        statusDiv.id = 'autoSyncStatus';
        statusDiv.className = 'status info';
        const statusMessage = document.createElement('div');
        statusMessage.textContent = '⏳ Checking auto-sync status...';
        statusDiv.appendChild(statusMessage);
        autoSyncSection.appendChild(statusDiv);

        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'toggleAutoSync';
        toggleBtn.className = 'button secondary';
        toggleBtn.textContent = '⚙️ Configure Auto-Sync';
        autoSyncSection.appendChild(toggleBtn);

        // Create details section
        const detailsDiv = document.createElement('div');
        detailsDiv.id = 'autoSyncDetails';
        detailsDiv.className = 'auto-sync-details';
        detailsDiv.style.display = 'none';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'auto-sync-info';

        const nextSyncSmall = document.createElement('small');
        nextSyncSmall.id = 'nextSyncTime';
        nextSyncSmall.textContent = 'Next sync: calculating...';
        infoDiv.appendChild(nextSyncSmall);

        infoDiv.appendChild(document.createElement('br'));

        const lastSyncSmall = document.createElement('small');
        lastSyncSmall.id = 'lastSyncTime';
        lastSyncSmall.textContent = 'Last sync: never';
        infoDiv.appendChild(lastSyncSmall);

        detailsDiv.appendChild(infoDiv);
        autoSyncSection.appendChild(detailsDiv);

        const calendarSection = this.authStatusDiv.closest('.section');
        const nextSection = calendarSection.nextElementSibling;

        if (nextSection) {
            calendarSection.parentNode.insertBefore(autoSyncSection, nextSection);
        } else {
            calendarSection.parentNode.appendChild(autoSyncSection);
        }

        document.getElementById('toggleAutoSync').addEventListener('click', () => this.toggleAutoSync());
    }

    async updateAutoSyncStatus() {
        try {
            // Check authentication status first - auto-sync requires authentication
            const authStatus = await browser.runtime.sendMessage({ action: 'getAuthStatus' });
            const isAuthenticated = authStatus.success && authStatus.authenticated && authStatus.tokenValid;

            const autoSyncStatusDiv = document.getElementById('autoSyncStatus');
            const toggleBtn = document.getElementById('toggleAutoSync');
            const detailsDiv = document.getElementById('autoSyncDetails');
            const nextSyncDiv = document.getElementById('nextSyncTime');
            const lastSyncDiv = document.getElementById('lastSyncTime');

            // If not authenticated, disable auto-sync controls
            if (!isAuthenticated) {
                autoSyncStatusDiv.className = 'status info';
                autoSyncStatusDiv.textContent = '';
                const messageDiv = document.createElement('div');
                messageDiv.textContent = '🔒 Connect Google Calendar to enable auto-sync';
                autoSyncStatusDiv.appendChild(messageDiv);
                toggleBtn.disabled = true;
                toggleBtn.textContent = '🔒 Auto-Sync (Connect Calendar First)';
                toggleBtn.className = 'button secondary';
                detailsDiv.style.display = 'none';
                return;
            }

            // User is authenticated - proceed with normal auto-sync status check
            const response = await browser.runtime.sendMessage({ action: 'getAutoSyncStatus' });

            if (response.success) {
                const status = response.status;

                // Re-enable button now that we're authenticated
                toggleBtn.disabled = false;

                if (status.enabled) {
                    autoSyncStatusDiv.className = 'status success';
                    autoSyncStatusDiv.textContent = '';
                    const messageDiv = document.createElement('div');
                    messageDiv.textContent = `🔄 Auto-sync enabled (every ${this.formatInterval(status.interval)})`;
                    autoSyncStatusDiv.appendChild(messageDiv);
                    toggleBtn.textContent = '🛑 Disable Auto-Sync';
                    toggleBtn.className = 'button secondary';

                    detailsDiv.style.display = 'block';

                    if (status.nextSync) {
                        const nextSync = new Date(status.nextSync);
                        const now = new Date();
                        const diffMinutes = Math.round((nextSync - now) / (1000 * 60));

                        nextSyncDiv.textContent = `Next sync: in ${this.formatDuration(diffMinutes)} (${nextSync.toLocaleTimeString()})`;
                    } else {
                        nextSyncDiv.textContent = 'Next sync: calculating...';
                    }

                    if (status.lastSync) {
                        const lastSync = new Date(status.lastSync);
                        const results = status.lastResults;

                        // Get sync type from storage
                        const storage = await browser.storage.local.get(['lastSyncType']);
                        const syncType = storage.lastSyncType;
                        const syncTypeLabel = syncType ? ` - ${this.formatSyncType(syncType)}` : '';

                        let resultText = lastSync.toLocaleString();
                        if (results) {
                            resultText += ` (${results.created} created, ${results.skipped} skipped)`;
                        }
                        lastSyncDiv.textContent = `Last sync: ${resultText}${syncTypeLabel}`;
                    } else {
                        lastSyncDiv.textContent = 'Last sync: never';
                    }

                    if (status.lastError) {
                        const errorTime = new Date(status.lastError.timestamp);
                        if (errorTime > new Date(status.lastSync || 0)) {
                            // Safe replacement for innerHTML +=
                            lastSyncDiv.appendChild(document.createElement('br'));
                            const errorSpan = document.createElement('span');
                            errorSpan.style.color = '#dc3545';
                            errorSpan.textContent = `Last error: ${status.lastError.error}`;
                            lastSyncDiv.appendChild(errorSpan);
                        }
                    }

                } else {
                    autoSyncStatusDiv.className = 'status info';
                    autoSyncStatusDiv.textContent = '';
                    const messageDiv = document.createElement('div');
                    messageDiv.textContent = '⏸️ Auto-sync disabled';
                    autoSyncStatusDiv.appendChild(messageDiv);
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

    async toggleAutoSync() {
        try {
            const statusResponse = await browser.runtime.sendMessage({ action: 'getAutoSyncStatus' });
            const isEnabled = statusResponse.success && statusResponse.status.enabled;

            const toggleBtn = document.getElementById('toggleAutoSync');
            toggleBtn.disabled = true;

            if (isEnabled) {
                toggleBtn.textContent = '⏳ Disabling...';
                const response = await browser.runtime.sendMessage({ action: 'disableAutoSync' });
                if (response.success) {
                    this.updateStatus('🛑 Auto-sync disabled', 'info');
                }
            } else {
                toggleBtn.textContent = '⏳ Enabling...';
                const response = await browser.runtime.sendMessage({ action: 'enableAutoSync' });
                if (response.success) {
                    const newStatusResponse = await browser.runtime.sendMessage({ action: 'getAutoSyncStatus' });
                    if (newStatusResponse.success) {
                        const interval = this.formatInterval(newStatusResponse.status.interval);
                        this.updateStatus(`▶️ Auto-sync enabled - assignments will sync automatically every ${interval}`, 'success');
                    } else {
                        this.updateStatus('▶️ Auto-sync enabled', 'success');
                    }
                }
            }

            await this.updateAutoSyncStatus();

        } catch (error) {
            console.error('Error toggling auto-sync:', error);
            this.updateStatus('❌ Error configuring auto-sync', 'warning');
        } finally {
            const toggleBtn = document.getElementById('toggleAutoSync');
            toggleBtn.disabled = false;
        }
    }

    // =============================================================================
    // STORAGE LISTENER & FIRST-TIME SETUP
    // =============================================================================

    setupStorageListener() {
        browser.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                const hasAssignmentChanges = Object.keys(changes).some(key =>
                    key.startsWith('assignments_')
                );

                if (hasAssignmentChanges) {
                    console.log('📡 Assignment data changed, updating popup...');
                    this.stopProgressAnimation();
                    this.countStoredAssignments();
                    this.showUpdateIndicator();
                }
            }
        });
    }

    showUpdateIndicator() {
        this.assignmentCountDiv.style.transition = 'background-color 0.6s ease';
        this.assignmentCountDiv.style.backgroundColor = '#e8f5e8';

        setTimeout(() => {
            this.assignmentCountDiv.style.backgroundColor = '';
        }, 600);
    }

    async showLoadingStateIfOnGradescope() {
        try {
            const [tab] = await browser.tabs.query({active: true, currentWindow: true});
            const isOnGradescope = tab?.url?.includes('gradescope.com');

            if (isOnGradescope && !await this.hasRecentAssignmentData()) {
                this.updateStatus('🔍 Scanning Gradescope page...', 'info');
                this.startProgressAnimation();
            }
        } catch (error) {
            console.error('Error checking Gradescope status:', error);
        }
    }

    async hasRecentAssignmentData() {
        const storage = await browser.storage.local.get();
        const assignmentKeys = Object.keys(storage).filter(key => key.startsWith('assignments_'));

        if (assignmentKeys.length === 0) return false;

        const thirtySecondsAgo = Date.now() - 30000;
        return assignmentKeys.some(key => {
            const data = storage[key];
            return data.extractedAt && new Date(data.extractedAt).getTime() > thirtySecondsAgo;
        });
    }

    startProgressAnimation() {
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
                this.updateStatus(progressSteps[currentStep], 'info');
                currentStep++;
            } else {
                currentStep = 0;
            }
        }, 1500);

        window.extractionProgressInterval = progressInterval;
    }

    stopProgressAnimation() {
        if (window.extractionProgressInterval) {
            clearInterval(window.extractionProgressInterval);
            window.extractionProgressInterval = null;
        }
    }

    async checkFirstTimeSetup() {
        try {
            const assignments = await window.StorageUtils.getAllStoredAssignments();
            const hasData = assignments.length > 0;

            const authStatus = await browser.runtime.sendMessage({ action: 'getAuthStatus' });
            const hasAuth = authStatus.success && authStatus.authenticated;

            const [tab] = await browser.tabs.query({active: true, currentWindow: true});
            const isOnGradescope = tab?.url?.includes('gradescope.com');

            if (!hasData && !hasAuth && !isOnGradescope) {
                this.updateStatus('👋 Welcome! Use the button below to get started', 'info');
                this.showFirstTimeHelp();
            } else if (!hasData && isOnGradescope) {
                this.updateStatus('🔄 Perfect! Click "Extract Assignments Now" below', 'info');
            } else if (!hasData && !isOnGradescope) {
                this.updateStatus('📍 Click the button below to visit Gradescope first', 'info');
            }

        } catch (error) {
            console.error('Error checking first-time setup:', error);
        }
    }

    showFirstTimeHelp() {
        const helpDiv = document.createElement('div');
        helpDiv.className = 'quick-setup-banner';

        // Build help content safely
        const strong = document.createElement('strong');
        strong.textContent = '🚀 Quick Setup:';
        helpDiv.appendChild(strong);

        helpDiv.appendChild(document.createElement('br'));

        const text = document.createTextNode('Click the blue button below to visit Gradescope, then reopen this popup!');
        helpDiv.appendChild(text);

        const tipDiv = document.createElement('div');
        tipDiv.className = 'quick-setup-tip';
        tipDiv.textContent = '💡 ';
        const tipEm = document.createElement('em');
        tipEm.textContent = 'Works best from the main dashboard page';
        tipDiv.appendChild(tipEm);
        helpDiv.appendChild(tipDiv);

        this.statusDiv.parentNode.insertBefore(helpDiv, this.statusDiv.nextSibling);

        const checkForData = setInterval(async () => {
            const assignments = await window.StorageUtils.getAllStoredAssignments();
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

    // =============================================================================
    // UTILITY FUNCTIONS
    // =============================================================================

    formatDuration(minutes) {
        if (minutes >= 60) {
            const hours = Math.round(minutes / 60 * 10) / 10;
            return hours === 1 ? '1 hour' : `${hours} hours`;
        } else {
            return minutes === 1 ? '1 minute' : `${minutes} minutes`;
        }
    }

    formatInterval(minutes) {
        if (minutes >= 60) {
            const hours = minutes / 60;
            return hours === 1 ? '1 hour' : `${hours} hours`;
        } else {
            return `${minutes} min`;
        }
    }

    /**
     * Format sync type for display
     * @param {string} syncType - Raw sync type ('manual', 'auto', 'smart', 'first_time')
     * @returns {string} Formatted sync type with emoji
     */
    formatSyncType(syncType) {
        const syncTypeMap = {
            'manual': '👆 Manual',
            'auto': '⏰ Auto',
            'smart': '🧠 Smart',
            'first_time': '🎉 First-time'
        };
        return syncTypeMap[syncType] || '❓ Unknown';
    }
}

// Export for use in main popup.js
window.CalendarManager = CalendarManager;
