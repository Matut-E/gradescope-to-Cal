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

    // Safe replacement for innerHTML
    statsContainer.textContent = '';

    // Create Total Assignments card
    const totalCard = document.createElement('div');
    totalCard.className = 'stat-card';
    const totalValue = document.createElement('div');
    totalValue.className = 'stat-value';
    totalValue.textContent = totalCount;
    const totalLabel = document.createElement('div');
    totalLabel.className = 'stat-label';
    totalLabel.textContent = 'Total Assignments';
    totalCard.appendChild(totalValue);
    totalCard.appendChild(totalLabel);
    statsContainer.appendChild(totalCard);

    // Create Courses card
    const courseCard = document.createElement('div');
    courseCard.className = 'stat-card';
    const courseValue = document.createElement('div');
    courseValue.className = 'stat-value';
    courseValue.textContent = courseCount;
    const courseLabel = document.createElement('div');
    courseLabel.className = 'stat-label';
    courseLabel.textContent = 'Courses';
    courseCard.appendChild(courseValue);
    courseCard.appendChild(courseLabel);
    statsContainer.appendChild(courseCard);

    // Create Upcoming card
    const upcomingCard = document.createElement('div');
    upcomingCard.className = 'stat-card';
    const upcomingValue = document.createElement('div');
    upcomingValue.className = 'stat-value';
    upcomingValue.textContent = upcomingCount;
    const upcomingLabel = document.createElement('div');
    upcomingLabel.className = 'stat-label';
    upcomingLabel.textContent = 'Upcoming';
    upcomingCard.appendChild(upcomingValue);
    upcomingCard.appendChild(upcomingLabel);
    statsContainer.appendChild(upcomingCard);
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

    // Safe replacement for innerHTML - use createElement
    listContainer.textContent = '';

    sorted.forEach((assignment, index) => {
        // Create card
        const card = document.createElement('div');
        card.className = 'assignment-card';

        // Create header
        const header = document.createElement('div');
        header.className = 'assignment-header';

        const title = document.createElement('div');
        title.className = 'assignment-title';
        title.textContent = assignment.title || 'Untitled Assignment';

        const number = document.createElement('div');
        number.className = 'assignment-number';
        number.textContent = `#${index + 1}`;

        header.appendChild(title);
        header.appendChild(number);
        card.appendChild(header);

        // Create details section
        const details = document.createElement('div');
        details.className = 'assignment-details';

        // Course row
        const courseRow = document.createElement('div');
        courseRow.className = 'detail-row';
        const courseLabel = document.createElement('span');
        courseLabel.className = 'detail-label';
        courseLabel.textContent = 'Course:';
        const courseValue = document.createElement('span');
        courseValue.className = 'detail-value';
        courseValue.textContent = assignment.course || 'Unknown Course';
        courseRow.appendChild(courseLabel);
        courseRow.appendChild(courseValue);
        details.appendChild(courseRow);

        // Due date row
        const dateRow = document.createElement('div');
        dateRow.className = 'detail-row';
        const dateLabel = document.createElement('span');
        dateLabel.className = 'detail-label';
        dateLabel.textContent = 'Due Date:';
        const dateValue = document.createElement('span');
        dateValue.className = 'detail-value';
        dateValue.textContent = formatDate(assignment.dueDate);
        dateRow.appendChild(dateLabel);
        dateRow.appendChild(dateValue);
        details.appendChild(dateRow);

        // URL row
        const urlRow = document.createElement('div');
        urlRow.className = 'detail-row';
        const urlLabel = document.createElement('span');
        urlLabel.className = 'detail-label';
        urlLabel.textContent = 'URL:';
        const urlLink = document.createElement('a');
        urlLink.href = assignment.url || '#';
        urlLink.target = '_blank';
        urlLink.className = 'assignment-url';
        urlLink.textContent = 'View on Gradescope →';
        urlRow.appendChild(urlLabel);
        urlRow.appendChild(urlLink);
        details.appendChild(urlRow);

        // ID row
        const idRow = document.createElement('div');
        idRow.className = 'detail-row';
        const idLabel = document.createElement('span');
        idLabel.className = 'detail-label';
        idLabel.textContent = 'ID:';
        const idValue = document.createElement('span');
        idValue.className = 'detail-value';
        idValue.style.fontFamily = 'monospace';
        idValue.style.fontSize = '12px';
        idValue.textContent = assignment.assignmentId || 'N/A';
        idRow.appendChild(idLabel);
        idRow.appendChild(idValue);
        details.appendChild(idRow);

        // Auto-discovered badge (if applicable)
        if (assignment.autoDiscovered) {
            const badgeRow = document.createElement('div');
            badgeRow.className = 'detail-row';
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = '📡 Auto-discovered';
            badgeRow.appendChild(badge);
            details.appendChild(badgeRow);
        }

        card.appendChild(details);
        listContainer.appendChild(card);
    });

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

        // Safe replacement for innerHTML
        const emptyState = document.getElementById('emptyState');
        emptyState.textContent = '';

        const icon = document.createElement('div');
        icon.className = 'empty-state-icon';
        icon.textContent = '⚠️';
        emptyState.appendChild(icon);

        const title = document.createElement('div');
        title.className = 'empty-state-title';
        title.textContent = 'Error Loading Data';
        emptyState.appendChild(title);

        const message = document.createElement('div');
        message.textContent = error.message;
        emptyState.appendChild(message);

        emptyState.style.display = 'block';
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
