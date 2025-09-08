/**
 * Enhanced Gradescope Calendar Sync - Content Script (FIXED VERSION)
 * Features: Smart dashboard auto-discovery + individual course fallback + deduplication
 * FIXED: Proper semester boundary detection using courseList structure
 */

console.log('🎯 Enhanced Gradescope Calendar Sync: Content script loaded');

// Global state to prevent double processing
let extractionInProgress = false;
let lastExtractionUrl = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'manualSync') {
        console.log('📬 Received manual sync request from popup');
        main();
        sendResponse({status: 'sync_started'});
    }
});

/**
 * UTILITY FUNCTIONS
 */

/**
 * Detect what type of Gradescope page we're on
 */
function detectPageType() {
    const url = window.location.href;
    
    // Main dashboard - has courseList structure
    if (url.includes('gradescope.com') && (url.endsWith('/') || url.includes('/account')) && 
        document.querySelector('.courseList')) {
        return 'dashboard';
    }
    
    // Individual course page - has assignment table
    if (url.includes('/courses/') && document.querySelector('table')) {
        if (url.includes('/assignments')) {
            return 'course_assignments';
        }
        return 'course_main';
    }

    return 'other';
}

/**
 * Get current semester name from dashboard
 * Uses the first courseList--term element (always current semester)
 */
function getCurrentSemester() {
    console.log('📅 Detecting current semester from courseList structure...');
    
    // Find the first semester term element
    const firstTermElement = document.querySelector('.courseList--term');
    
    if (firstTermElement) {
        const semesterText = firstTermElement.textContent?.trim();
        if (semesterText && /^(Fall|Spring|Summer|Winter)\s+\d{4}$/.test(semesterText)) {
            console.log(`✅ Found current semester from courseList: ${semesterText}`);
            return semesterText;
        }
    }
    
    // Fallback: date-based detection
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-11
    
    let semester;
    if (month >= 7 && month <= 11) { // Aug-Dec
        semester = `Fall ${year}`;
    } else if (month >= 0 && month <= 4) { // Jan-May
        semester = `Spring ${year}`;
    } else { // Jun-Jul
        semester = `Summer ${year}`;
    }
    
    console.log(`🔄 Date-based semester fallback: ${semester}`);
    return semester;
}

/**
 * Extract course information from dashboard - FIXED VERSION
 * Only processes current semester courses using proper DOM structure
 */
function extractCoursesFromDashboard() {
    console.log('🏠 Extracting courses from dashboard (FIXED VERSION)...');
    
    const currentSemester = getCurrentSemester();
    const courses = [];
    
    // Find the first courseList--term element (current semester)
    const firstTermElement = document.querySelector('.courseList--term');
    
    if (!firstTermElement) {
        console.log('❌ No courseList--term elements found');
        return courses;
    }
    
    // Get the coursesForTerm container that immediately follows the first term
    const currentSemesterContainer = firstTermElement.nextElementSibling;
    
    if (!currentSemesterContainer || !currentSemesterContainer.classList.contains('courseList--coursesForTerm')) {
        console.log('❌ Could not find courseList--coursesForTerm container after first term');
        return courses;
    }
    
    // Extract course cards ONLY from the current semester container
    const courseCards = currentSemesterContainer.querySelectorAll('.courseBox');
    console.log(`📚 Found ${courseCards.length} course cards in current semester (${currentSemester})`);
    
    // Filter out the "Add a course" button
    const actualCourseCards = Array.from(courseCards).filter(card => 
        !card.classList.contains('courseBox-new') && 
        !card.textContent.includes('Add a course')
    );
    
    console.log(`📖 Processing ${actualCourseCards.length} actual course cards (filtered out Add Course button)`);
    
    actualCourseCards.forEach((card, index) => {
        const courseData = extractCourseFromCard(card, currentSemester);
        if (courseData) {
            courses.push(courseData);
            console.log(`✅ Extracted course ${index + 1}: ${courseData.shortName}`);
        } else {
            console.log(`⚠️ Failed to extract data from course card ${index + 1}`);
        }
    });
    
    console.log(`📊 Dashboard extraction complete: ${courses.length} current semester courses for ${currentSemester}`);
    return courses;
}

/**
 * Extract course information from a single course card
 */
function extractCourseFromCard(card, semester) {
    try {
        // Get course link (the card itself is a link)
        const courseLink = card.href;
        if (!courseLink) {
            console.log('⚠️ Course card missing href attribute');
            return null;
        }
        
        // Extract course ID from URL
        const courseIdMatch = courseLink.match(/\/courses\/(\d+)/);
        if (!courseIdMatch) {
            console.log('⚠️ Could not extract course ID from:', courseLink);
            return null;
        }
        const courseId = courseIdMatch[1];
        
        // Get course name (short name) - from h3 with class courseBox--shortname
        const shortNameEl = card.querySelector('.courseBox--shortname');
        const shortName = shortNameEl?.textContent?.trim() || `Course ${courseId}`;
        
        // Get full course name - from div with class courseBox--name
        const fullNameEl = card.querySelector('.courseBox--name');
        const fullName = fullNameEl?.textContent?.trim() || shortName;
        
        // Get assignment count - from div with class courseBox--assignments
        const assignmentEl = card.querySelector('.courseBox--assignments');
        const assignmentText = assignmentEl?.textContent?.trim() || '0 assignments';
        const assignmentCount = parseInt(assignmentText.match(/\d+/)?.[0] || '0');
        
        console.log(`📖 Parsed course: ${shortName} -> ${fullName} (${assignmentCount} assignments)`);
        
        return {
            id: courseId,
            shortName: shortName,
            fullName: fullName,
            url: new URL(courseLink, window.location.origin).href,
            assignmentCount: assignmentCount,
            semester: semester,
            extractedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log('⚠️ Error parsing course card:', error);
        return null;
    }
}

/**
 * Fetch and parse assignments from a course URL
 */
async function fetchCourseAssignments(course) {
    console.log(`📡 Fetching assignments from ${course.shortName}...`);
    
    try {
        // If we're already on this course page, parse directly
        if (window.location.href.includes(`/courses/${course.id}`)) {
            console.log('📍 Already on course page, parsing directly');
            return parseCurrentPageAssignments(course);
        }
        
        // Otherwise, fetch the course page
        const response = await fetch(course.url, {
            credentials: 'same-origin',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        return parseAssignmentsFromDocument(doc, course);
        
    } catch (error) {
        console.log(`❌ Error fetching ${course.shortName}:`, error.message);
        return [];
    }
}

/**
 * Parse assignments from current page (when already on course page)
 */
function parseCurrentPageAssignments(course) {
    console.log(`📋 Parsing assignments from current page for ${course.shortName || 'current course'}`);
    
    const assignments = [];
    const table = document.querySelector('table');
    
    if (!table) {
        console.log('❌ No assignment table found on current page');
        return assignments;
    }
    
    const rows = table.querySelectorAll('tbody tr');
    console.log(`🔍 Found ${rows.length} rows to examine`);
    
    rows.forEach((row, index) => {
        try {
            const assignment = parseAssignmentFromRow(row, course);
            if (assignment) {
                assignments.push(assignment);
            }
        } catch (error) {
            console.log(`⚠️ Error parsing row ${index + 1}:`, error);
        }
    });
    
    return assignments;
}

/**
 * Parse assignments from fetched HTML document
 */
function parseAssignmentsFromDocument(doc, course) {
    console.log(`📋 Parsing assignments from fetched document for ${course.shortName}`);
    
    const assignments = [];
    const table = doc.querySelector('table');
    
    if (!table) {
        console.log(`❌ No assignment table found for ${course.shortName}`);
        return assignments;
    }
    
    const rows = table.querySelectorAll('tbody tr');
    console.log(`🔍 Found ${rows.length} rows in ${course.shortName}`);
    
    rows.forEach((row, index) => {
        try {
            const assignment = parseAssignmentFromRow(row, course);
            if (assignment) {
                assignments.push(assignment);
            }
        } catch (error) {
            console.log(`⚠️ Error parsing row ${index + 1} in ${course.shortName}:`, error);
        }
    });
    
    return assignments;
}

/**
 * Parse individual assignment from table row
 * Enhanced version of the original parseAssignmentElement
 */
function parseAssignmentFromRow(row, course) {
    // Skip header rows
    const thElements = row.querySelectorAll('th');
    const tdElements = row.querySelectorAll('td');
    
    if (thElements.length > 0 && tdElements.length === 0) {
        return null; // Header row
    }
    
    // Look for assignment button
    const titleButton = row.querySelector('button.js-submitAssignment, button[data-assignment-id]');
    
    if (!titleButton) {
        return null; // Not an assignment row
    }
    
    const title = titleButton.textContent?.trim();
    const assignmentId = titleButton.getAttribute('data-assignment-id');
    
    if (!title || !assignmentId) {
        return null;
    }
    
    // Parse due date from row - look in the third column
    const cells = row.querySelectorAll('td, th');
    let dueDate = null;
    
    if (cells.length >= 3) {
        // Try to find time elements with datetime attributes first (most reliable)
        const timeElements = cells[2].querySelectorAll('time[datetime]');
        
        if (timeElements.length > 0) {
            // Look for the main due date (not late due date)
            let mainDueTime = null;
            
            for (const timeEl of timeElements) {
                const label = timeEl.getAttribute('aria-label') || '';
                const datetime = timeEl.getAttribute('datetime');
                
                // Skip release dates and late due dates
                if (label.includes('Released') || label.includes('Late Due Date')) {
                    continue;
                }
                
                if (label.includes('Due at') && datetime) {
                    mainDueTime = datetime;
                    break;
                }
            }
            
            if (mainDueTime) {
                try {
                    dueDate = new Date(mainDueTime);
                    if (!isNaN(dueDate.getTime())) {
                        console.log(`📅 Parsed due date from datetime: ${dueDate.toISOString()}`);
                    } else {
                        dueDate = null;
                    }
                } catch (e) {
                    dueDate = null;
                }
            }
        }
        
        // Fallback to text parsing if datetime approach failed
        if (!dueDate) {
            const dueDateText = cells[2].textContent?.trim();
            dueDate = parseDueDateFromText(dueDateText);
        }
    }
    
    // Construct assignment URL
    const assignmentUrl = `https://www.gradescope.com/courses/${course.id}/assignments/${assignmentId}`;
    
    return {
        title: title,
        dueDate: dueDate ? dueDate.toISOString() : null,
        course: course.shortName || course.fullName || 'Unknown Course',
        courseId: course.id,
        url: assignmentUrl,
        assignmentId: assignmentId,
        extractedAt: new Date().toISOString(),
        pageUrl: course.url || window.location.href,
        autoDiscovered: true,
        semester: course.semester
    };
}

/**
 * Parse due date from text (fallback method, reused from original script)
 */
function parseDueDateFromText(dueDateText) {
    if (!dueDateText) return null;
    
    const dateRegex = /(\w{3}\s+\d{1,2}\s+at\s+\d{1,2}:\d{2}[AP]M)/g;
    const dateMatches = dueDateText.match(dateRegex);
    
    if (!dateMatches || dateMatches.length === 0) return null;
    
    let targetDateStr = null;
    
    // Smart date selection logic from original script
    if (dueDateText.includes('Late Due Date:')) {
        const beforeLateDue = dueDateText.split('Late Due Date:')[0];
        const beforeLateDueMatches = beforeLateDue.match(dateRegex);
        if (beforeLateDueMatches && beforeLateDueMatches.length > 0) {
            targetDateStr = beforeLateDueMatches[beforeLateDueMatches.length - 1];
        }
    } else if (dateMatches.length >= 2) {
        targetDateStr = dateMatches[1];
    } else {
        targetDateStr = dateMatches[0];
    }
    
    if (targetDateStr) {
        try {
            const currentYear = new Date().getFullYear();
            const normalizedDate = targetDateStr
                .replace(/\s+/g, ' ')
                .replace(' at ', `, ${currentYear} `)
                .replace(/(\d)([AP]M)/, '$1 $2');
            
            const dueDate = new Date(normalizedDate);
            return !isNaN(dueDate.getTime()) ? dueDate : null;
        } catch (e) {
            return null;
        }
    }
    
    return null;
}

/**
 * Filter assignments to only include upcoming ones
 */
function filterUpcomingAssignments(assignments) {
    const now = new Date();
    const upcomingAssignments = [];
    
    assignments.forEach(assignment => {
        if (!assignment.dueDate) {
            console.log(`⚠️ Skipping ${assignment.title} (no due date)`);
            return;
        }
        
        const dueDate = new Date(assignment.dueDate);
        const daysDifference = (dueDate - now) / (1000 * 60 * 60 * 24);
        
        // Include assignments due in the future or within last 3 days (for late submissions)
        if (daysDifference >= -3) {
            upcomingAssignments.push(assignment);
            
            if (daysDifference > 0) {
                console.log(`📅 Including upcoming: ${assignment.title} (due in ${Math.ceil(daysDifference)} days)`);
            } else {
                console.log(`⏰ Including recent: ${assignment.title} (${Math.abs(Math.floor(daysDifference))} days overdue)`);
            }
        } else {
            console.log(`🗂️ Filtering out old: ${assignment.title} (${Math.abs(Math.floor(daysDifference))} days overdue)`);
        }
    });
    
    return upcomingAssignments;
}

/**
 * Check if assignment was already extracted (deduplication)
 */
async function checkExistingAssignments(newAssignments) {
    try {
        const storage = await chrome.storage.local.get();
        const existingIds = new Set();
        
        // Collect all existing assignment IDs
        Object.keys(storage).forEach(key => {
            if (key.startsWith('assignments_') && storage[key].assignments) {
                storage[key].assignments.forEach(assignment => {
                    if (assignment.assignmentId) {
                        existingIds.add(assignment.assignmentId);
                    }
                });
            }
        });
        
        // Filter out assignments that already exist
        const uniqueAssignments = newAssignments.filter(assignment => {
            const isUnique = !existingIds.has(assignment.assignmentId);
            if (!isUnique) {
                console.log(`🔄 Skipping duplicate: ${assignment.title} (ID: ${assignment.assignmentId})`);
            }
            return isUnique;
        });
        
        console.log(`🔍 Deduplication: ${newAssignments.length} total → ${uniqueAssignments.length} unique`);
        return uniqueAssignments;
        
    } catch (error) {
        console.log('⚠️ Error checking existing assignments, proceeding with all:', error);
        return newAssignments;
    }
}

/**
 * MAIN EXECUTION FUNCTIONS
 */

/**
 * Auto-discover assignments from dashboard - FIXED VERSION
 */
async function discoverFromDashboard() {
    console.log('🏠 Starting dashboard auto-discovery (FIXED VERSION)...');
    
    const courses = extractCoursesFromDashboard();
    
    if (courses.length === 0) {
        console.log('❌ No courses found in current semester');
        return [];
    }
    
    console.log(`📚 Found ${courses.length} courses in current semester:`, courses.map(c => c.shortName));
    
    const allAssignments = [];
    const results = {
        totalCourses: courses.length,
        processed: 0,
        totalAssignments: 0
    };
    
    // Process courses with respectful delays
    for (const course of courses) {
        try {
            console.log(`🔍 Processing ${course.shortName}...`);
            
            const assignments = await fetchCourseAssignments(course);
            const upcomingAssignments = filterUpcomingAssignments(assignments);
            
            if (upcomingAssignments.length > 0) {
                allAssignments.push(...upcomingAssignments);
                results.totalAssignments += upcomingAssignments.length;
                console.log(`✅ Found ${upcomingAssignments.length} upcoming assignments in ${course.shortName}`);
            } else {
                console.log(`📭 No upcoming assignments in ${course.shortName}`);
            }
            
            results.processed++;
            
            // Respectful delay between requests (1 second)
            if (results.processed < courses.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
        } catch (error) {
            console.log(`❌ Failed to process ${course.shortName}:`, error.message);
        }
    }
    
    console.log('🎉 Dashboard auto-discovery complete:', results);
    return allAssignments;
}

/**
 * Extract from individual course page (fallback)
 */
function extractFromCoursePage() {
    console.log('📄 Extracting from individual course page...');
    
    // Create course object from current page
    const courseId = window.location.pathname.match(/\/courses\/(\d+)/)?.[1];
    const courseNameEl = document.querySelector('h1, .course-title, .course-name');
    const courseName = courseNameEl?.textContent?.trim() || `Course ${courseId}`;
    
    const course = {
        id: courseId,
        shortName: courseName,
        fullName: courseName,
        url: window.location.href,
        semester: getCurrentSemester()
    };
    
    const assignments = parseCurrentPageAssignments(course);
    return filterUpcomingAssignments(assignments);
}

/**
 * Main execution function
 */
async function main() {
    // Prevent concurrent extractions
    if (extractionInProgress) {
        console.log('⏸️ Extraction already in progress, skipping...');
        return;
    }
    
    const currentUrl = window.location.href;
    if (lastExtractionUrl === currentUrl && extractionInProgress === false) {
        console.log('⏸️ Same URL recently processed, skipping...');
        return;
    }
    
    extractionInProgress = true;
    lastExtractionUrl = currentUrl;
    
    try {
        const pageType = detectPageType();
        console.log(`📄 Page type: ${pageType}`);
        
        let assignments = [];
        let method = '';
        
        if (pageType === 'dashboard') {
            assignments = await discoverFromDashboard();
            method = 'dashboard_auto_discovery_fixed';
        } else if (pageType === 'course_main' || pageType === 'course_assignments') {
            assignments = extractFromCoursePage();
            method = 'individual_course_page';
        } else {
            console.log('ℹ️ Not a relevant Gradescope page, skipping extraction');
            return;
        }
        
        if (assignments.length > 0) {
            // Check for duplicates before storing
            const uniqueAssignments = await checkExistingAssignments(assignments);
            
            if (uniqueAssignments.length > 0) {
                // Store assignments
                const storageKey = `assignments_${method}_${Date.now()}`;
                await chrome.storage.local.set({
                    [storageKey]: {
                        assignments: uniqueAssignments,
                        extractedAt: new Date().toISOString(),
                        pageUrl: window.location.href,
                        method: method,
                        semester: getCurrentSemester(),
                        stats: {
                            total: assignments.length,
                            unique: uniqueAssignments.length,
                            duplicates: assignments.length - uniqueAssignments.length
                        }
                    }
                });
                
                console.log(`💾 Stored ${uniqueAssignments.length} unique assignments from current semester only (${assignments.length - uniqueAssignments.length} duplicates filtered)`);
            } else {
                console.log('ℹ️ All assignments were duplicates, nothing new to store');
            }
        } else {
            console.log('📭 No assignments found or all assignments filtered out');
        }
        
    } catch (error) {
        console.error('❌ Error during extraction:', error);
    } finally {
        extractionInProgress = false;
    }
}

/**
 * INITIALIZATION
 */

// Prevent multiple script injections
if (window.gradescopeCalendarSyncLoaded) {
    console.log('🔄 Manual sync triggered - re-running extraction...');
    main();
} else {
    window.gradescopeCalendarSyncLoaded = true;

    // Handle dynamic page navigation (Gradescope uses AJAX)
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            console.log('🔄 Page navigation detected, re-running extraction...');
            setTimeout(main, 1000); // Small delay for content to load
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Run on initial page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(main, 2000); // Wait for dynamic content
        });
    } else {
        setTimeout(main, 2000); // Wait for dynamic content
    }
}

console.log('✅ Enhanced Gradescope Calendar Sync content script initialized (V1.1 - Background Fetching)');