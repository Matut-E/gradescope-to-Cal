/**
 * Storage Viewer Page Script
 * Displays all extracted assignments and grade configurations from Gradescope
 */

console.log('📊 Storage Viewer loaded');

// =============================================================================
// TAB MANAGEMENT
// =============================================================================

function initTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            tabContents.forEach(content => {
                content.classList.toggle('active', content.id === targetTab + 'Tab');
            });
        });
    });
}

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
    },

    /**
     * Get all grade configurations
     */
    async getAllGradeConfigs() {
        try {
            const storage = await browser.storage.local.get('courseConfigs');
            return storage.courseConfigs || {};
        } catch (error) {
            console.error('Error fetching grade configs:', error);
            return {};
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

// =============================================================================
// GRADE CONFIG DISPLAY
// =============================================================================

function renderConfigStats(configs) {
    const statsContainer = document.getElementById('configStats');
    const courseNames = Object.keys(configs);
    const totalCourses = courseNames.length;
    const withWeights = courseNames.filter(n => configs[n].weights).length;
    const withDrop = courseNames.filter(n => {
        const policies = configs[n].dropPolicies || {};
        return Object.values(policies).some(p => p.enabled);
    }).length;

    statsContainer.textContent = '';
    [{ value: totalCourses, label: 'Configured Courses' },
     { value: withWeights, label: 'With Weights' },
     { value: withDrop, label: 'With Drop Policies' }].forEach(stat => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        const v = document.createElement('div');
        v.className = 'stat-value';
        v.textContent = stat.value;
        const l = document.createElement('div');
        l.className = 'stat-label';
        l.textContent = stat.label;
        card.appendChild(v);
        card.appendChild(l);
        statsContainer.appendChild(card);
    });
}

function renderConfigs(configs) {
    const listContainer = document.getElementById('configList');
    const emptyState = document.getElementById('configEmptyState');
    const courseNames = Object.keys(configs);

    if (courseNames.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    listContainer.textContent = '';
    courseNames.sort().forEach(courseName => {
        listContainer.appendChild(createConfigCard(courseName, configs[courseName]));
    });
    listContainer.style.display = 'flex';
    emptyState.style.display = 'none';
}

function createConfigCard(courseName, config) {
    const card = document.createElement('div');
    card.className = 'config-card';

    // Header
    const header = document.createElement('div');
    header.className = 'config-header';
    const title = document.createElement('div');
    title.className = 'config-title';
    title.textContent = courseName;
    const system = document.createElement('span');
    system.className = 'config-system';
    system.textContent = config.system === 'points' ? 'Points' : 'Percentage';
    header.appendChild(title);
    header.appendChild(system);
    card.appendChild(header);

    // Details
    const details = document.createElement('div');
    details.className = 'config-details';
    if (config.lastModified) {
        const row = document.createElement('div');
        row.className = 'detail-row';
        const label = document.createElement('span');
        label.className = 'detail-label';
        label.textContent = 'Modified:';
        const value = document.createElement('span');
        value.className = 'detail-value';
        value.textContent = formatDate(config.lastModified);
        row.appendChild(label);
        row.appendChild(value);
        details.appendChild(row);
    }
    card.appendChild(details);

    // Weights section
    if (config.weights && Object.keys(config.weights).length > 0) {
        const section = document.createElement('div');
        section.className = 'config-section';
        const sTitle = document.createElement('div');
        sTitle.className = 'config-section-title';
        sTitle.textContent = 'Category Weights';
        section.appendChild(sTitle);
        const grid = document.createElement('div');
        grid.className = 'weight-grid';
        Object.entries(config.weights).sort((a, b) => b[1] - a[1]).forEach(([cat, wt]) => {
            const item = document.createElement('div');
            item.className = 'weight-item';
            const catName = document.createElement('span');
            catName.className = 'weight-category';
            catName.textContent = cat;
            const wtVal = document.createElement('span');
            wtVal.className = 'weight-value';
            wtVal.textContent = (wt * 100).toFixed(1) + '%';
            item.appendChild(catName);
            item.appendChild(wtVal);
            grid.appendChild(item);
        });
        section.appendChild(grid);
        card.appendChild(section);
    }

    // Drop policies section
    const dropPolicies = Object.entries(config.dropPolicies || {}).filter(([_, p]) => p.enabled);
    if (dropPolicies.length > 0) {
        const section = document.createElement('div');
        section.className = 'config-section';
        const sTitle = document.createElement('div');
        sTitle.className = 'config-section-title';
        sTitle.textContent = 'Drop Policies';
        section.appendChild(sTitle);
        const list = document.createElement('div');
        list.className = 'policy-list';
        dropPolicies.forEach(([cat, policy]) => {
            const item = document.createElement('div');
            item.className = 'policy-item';
            const type = document.createElement('span');
            type.className = 'policy-type';
            type.textContent = 'DROP';
            const text = document.createElement('span');
            text.textContent = cat + ': Drop lowest ' + policy.count;
            item.appendChild(type);
            item.appendChild(text);
            list.appendChild(item);
        });
        section.appendChild(list);
        card.appendChild(section);
    }

    // Excluded assignments section
    if (config.excludedAssignments && config.excludedAssignments.length > 0) {
        const section = document.createElement('div');
        section.className = 'config-section';
        const sTitle = document.createElement('div');
        sTitle.className = 'config-section-title';
        sTitle.textContent = 'Excluded Assignments (' + config.excludedAssignments.length + ')';
        section.appendChild(sTitle);
        const list = document.createElement('div');
        list.className = 'exclusion-list';
        config.excludedAssignments.forEach(id => {
            const item = document.createElement('span');
            item.className = 'exclusion-item';
            item.textContent = id;
            list.appendChild(item);
        });
        section.appendChild(list);
        card.appendChild(section);
    }

    return card;
}

/**
 * Initialize the page
 */
async function init() {
    try {
        console.log('🔄 Loading data from storage...');

        // Apply theme
        await applyTheme();

        // Initialize tab navigation
        initTabNavigation();

        // Fetch and render assignments
        const assignments = await StorageUtils.getAllStoredAssignments();
        console.log(`✅ Loaded ${assignments.length} assignments`);
        renderStats(assignments);
        renderAssignments(assignments);

        // Fetch and render grade configs
        const configs = await StorageUtils.getAllGradeConfigs();
        console.log(`✅ Loaded ${Object.keys(configs).length} grade configurations`);
        renderConfigStats(configs);
        renderConfigs(configs);

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
