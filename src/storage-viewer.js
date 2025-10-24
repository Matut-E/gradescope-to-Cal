/**
 * Storage Viewer Page Script
 * Displays all extracted assignments from Gradescope
 */

console.log('📊 Storage Viewer loaded');

// Apply dark mode if user has it enabled
async function applyTheme() {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

// Storage utility functions (matches popup/popup-storage.js)
const StorageUtils = {
    /**
     * Get all stored assignments across all storage keys
     */
    async getAllStoredAssignments() {
        try {
            const storage = await browser.storage.local.get(null);
            const assignmentMap = new Map();

            for (const [key, value] of Object.entries(storage)) {
                if (key.startsWith('assignments_') && value.assignments) {
                    value.assignments.forEach(assignment => {
                        if (assignment.assignmentId) {
                            assignmentMap.set(assignment.assignmentId, assignment);
                        }
                    });
                }
            }

            return Array.from(assignmentMap.values());
        } catch (error) {
            console.error('Error fetching assignments:', error);
            return [];
        }
    }
};

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'No due date';

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return 'Invalid date';
        }

        const options = {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        };

        return date.toLocaleDateString('en-US', options);
    } catch (error) {
        console.error('Date formatting error:', error);
        return 'Date error';
    }
}

/**
 * Render statistics cards
 */
function renderStats(assignments) {
    const statsContainer = document.getElementById('stats');

    const totalCount = assignments.length;
    const coursesSet = new Set(assignments.map(a => a.course).filter(c => c));
    const courseCount = coursesSet.size;

    const upcomingCount = assignments.filter(a => {
        if (!a.dueDate) return false;
        const dueDate = new Date(a.dueDate);
        return dueDate > new Date();
    }).length;

    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${totalCount}</div>
            <div class="stat-label">Total Assignments</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${courseCount}</div>
            <div class="stat-label">Courses</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${upcomingCount}</div>
            <div class="stat-label">Upcoming</div>
        </div>
    `;
}

/**
 * Render assignment cards
 */
function renderAssignments(assignments) {
    const listContainer = document.getElementById('assignmentList');
    const emptyState = document.getElementById('emptyState');

    if (assignments.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    // Sort by due date (upcoming first, then past)
    const sorted = assignments.sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate) : new Date(0);
        const dateB = b.dueDate ? new Date(b.dueDate) : new Date(0);
        return dateB - dateA;
    });

    listContainer.innerHTML = sorted.map((assignment, index) => {
        const autoDiscoveredBadge = assignment.autoDiscovered
            ? '<span class="badge">📡 Auto-discovered</span>'
            : '';

        return `
            <div class="assignment-card">
                <div class="assignment-header">
                    <div class="assignment-title">${escapeHtml(assignment.title || 'Untitled Assignment')}</div>
                    <div class="assignment-number">#${index + 1}</div>
                </div>
                <div class="assignment-details">
                    <div class="detail-row">
                        <span class="detail-label">Course:</span>
                        <span class="detail-value">${escapeHtml(assignment.course || 'Unknown Course')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Due Date:</span>
                        <span class="detail-value">${formatDate(assignment.dueDate)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">URL:</span>
                        <a href="${escapeHtml(assignment.url || '#')}" target="_blank" class="assignment-url">
                            View on Gradescope →
                        </a>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">ID:</span>
                        <span class="detail-value" style="font-family: monospace; font-size: 12px;">${escapeHtml(assignment.assignmentId || 'N/A')}</span>
                    </div>
                    ${autoDiscoveredBadge ? `
                    <div class="detail-row">
                        ${autoDiscoveredBadge}
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    listContainer.style.display = 'flex';
    emptyState.style.display = 'none';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>\"']/g, m => map[m]);
}

/**
 * Initialize the page
 */
async function init() {
    try {
        console.log('🔄 Loading assignments from storage...');

        // Apply theme
        await applyTheme();

        // Fetch assignments
        const assignments = await StorageUtils.getAllStoredAssignments();
        console.log(`✅ Loaded ${assignments.length} assignments`);

        // Render UI
        renderStats(assignments);
        renderAssignments(assignments);

    } catch (error) {
        console.error('❌ Error initializing storage viewer:', error);
        document.getElementById('emptyState').innerHTML = `
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-title">Error Loading Data</div>
            <div>${escapeHtml(error.message)}</div>
        `;
        document.getElementById('emptyState').style.display = 'block';
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
