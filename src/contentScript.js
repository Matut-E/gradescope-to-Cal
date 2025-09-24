/**
 * Enhanced Gradescope Calendar Sync - Content Script with Separated Calendar/Grade Logic
 * Features: Fast comprehensive grade extraction + filtered calendar sync
 */

console.log('🎯 Enhanced Gradescope Calendar Sync: Content script loaded with separated logic');

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

function detectPageType() {
    const url = window.location.href;
    
    if (url.includes('gradescope.com') && (url.endsWith('/') || url.includes('/account')) && 
        document.querySelector('.courseList')) {
        return 'dashboard';
    }
    
    if (url.includes('/courses/') && document.querySelector('table')) {
        if (url.includes('/assignments')) {
            return 'course_assignments';
        }
        return 'course_main';
    }

    return 'other';
}

function getCurrentSemester() {
    console.log('📅 Detecting current semester from courseList structure...');
    
    const firstTermElement = document.querySelector('.courseList--term');
    
    if (firstTermElement) {
        const semesterText = firstTermElement.textContent?.trim();
        if (semesterText && /^(Fall|Spring|Summer|Winter)\s+\d{4}$/.test(semesterText)) {
            console.log(`✅ Found current semester from courseList: ${semesterText}`);
            return semesterText;
        }
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    let semester;
    if (month >= 7 && month <= 11) {
        semester = `Fall ${year}`;
    } else if (month >= 0 && month <= 4) {
        semester = `Spring ${year}`;
    } else {
        semester = `Summer ${year}`;
    }
    
    console.log(`🔄 Date-based semester fallback: ${semester}`);
    return semester;
}

function extractCoursesFromDashboard() {
    console.log('🏠 Extracting courses from dashboard...');
    
    const currentSemester = getCurrentSemester();
    const courses = [];
    
    const firstTermElement = document.querySelector('.courseList--term');
    if (!firstTermElement) {
        console.log('❌ No courseList--term elements found');
        return courses;
    }
    
    const currentSemesterContainer = firstTermElement.nextElementSibling;
    if (!currentSemesterContainer || !currentSemesterContainer.classList.contains('courseList--coursesForTerm')) {
        console.log('❌ Could not find courseList--coursesForTerm container after first term');
        return courses;
    }
    
    const courseCards = currentSemesterContainer.querySelectorAll('.courseBox');
    const actualCourseCards = Array.from(courseCards).filter(card => 
        !card.classList.contains('courseBox-new') && 
        !card.textContent.includes('Add a course')
    );
    
    console.log(`📚 Processing ${actualCourseCards.length} course cards`);
    
    actualCourseCards.forEach((card, index) => {
        const courseData = extractCourseFromCard(card, currentSemester);
        if (courseData) {
            courses.push(courseData);
            console.log(`✅ Course ${index + 1}: ${courseData.shortName}`);
        }
    });
    
    return courses;
}

function extractCourseFromCard(card, semester) {
    try {
        const courseLink = card.href;
        if (!courseLink) return null;
        
        const courseIdMatch = courseLink.match(/\/courses\/(\d+)/);
        if (!courseIdMatch) return null;
        const courseId = courseIdMatch[1];
        
        const shortNameEl = card.querySelector('.courseBox--shortname');
        const shortName = shortNameEl?.textContent?.trim() || `Course ${courseId}`;
        
        const fullNameEl = card.querySelector('.courseBox--name');
        const fullName = fullNameEl?.textContent?.trim() || shortName;
        
        return {
            id: courseId,
            shortName: shortName,
            fullName: fullName,
            url: new URL(courseLink, window.location.origin).href,
            semester: semester,
            extractedAt: new Date().toISOString()
        };
        
    } catch (error) {
        console.log('⚠️ Error parsing course card:', error);
        return null;
    }
}

/**
 * FAST COMPREHENSIVE ASSIGNMENT EXTRACTION
 * Gets ALL assignments for grade calculation (ignores due dates and submission status)
 */
async function extractAllAssignmentsForGrades(course) {
    console.log(`📡 Extracting ALL assignments from ${course.shortName} for grade calculation...`);
    
    try {
        let doc;
        
        if (window.location.href.includes(`/courses/${course.id}`)) {
            doc = document;
        } else {
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
            doc = parser.parseFromString(html, 'text/html');
        }
        
        return parseAllAssignmentsFromDocument(doc, course);
        
    } catch (error) {
        console.log(`❌ Error extracting from ${course.shortName}:`, error.message);
        return [];
    }
}

/**
 * Parse ALL assignments (no filtering) for comprehensive grade data
 */
function parseAllAssignmentsFromDocument(doc, course) {
    console.log(`📋 Parsing ALL assignments from ${course.shortName}...`);
    
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
    
    console.log(`✅ Extracted ${assignments.length} total assignments from ${course.shortName}`);
    return assignments;
}

/**
 * Enhanced assignment parsing with comprehensive grade extraction
 */
function parseAssignmentFromRow(row, course) {
    const thElements = row.querySelectorAll('th');
    const tdElements = row.querySelectorAll('td');
    
    if (thElements.length > 0 && tdElements.length === 0) {
        return null; // Header row
    }
    
    const titleButton = row.querySelector('button.js-submitAssignment, button[data-assignment-id], a[href*="/assignments/"]');
    
    if (!titleButton) {
        return null;
    }
    
    const title = titleButton.textContent?.trim();
    const assignmentId = titleButton.getAttribute('data-assignment-id') || 
                        titleButton.href?.match(/assignments\/(\d+)/)?.[1];
    
    if (!title || !assignmentId) {
        return null;
    }
    
    const cells = row.querySelectorAll('td, th');
    let dueDate = extractDueDateFromRow(cells);
    const gradeData = extractGradeDataFromRow(row, cells);
    
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
        semester: course.semester,
        ...gradeData
    };
}

/**
 * Extract comprehensive grade information from assignment row
 */
function extractGradeDataFromRow(row, cells) {
    const gradeData = {
        isSubmitted: false,
        isGraded: false,
        earnedPoints: null,
        maxPoints: null,
        gradePercentage: null,
        submissionStatus: 'not_submitted',
        gradedAt: null,
        isLate: false
    };
    
    let statusCell = null;
    
    for (let i = 1; i < cells.length && !statusCell; i++) {
        const cell = cells[i];
        const cellText = cell.textContent?.trim().toLowerCase();
        
        if (!cellText || cellText.includes('at ') || cellText.includes('pdt') || cellText.includes('pst')) {
            continue;
        }
        
        if (cellText.includes('submission') || 
            cellText.includes('submitted') || 
            cellText.includes('ungraded') ||
            cellText.includes('/') ||
            cell.querySelector('.score, .status, .submission-status')) {
            statusCell = cell;
            break;
        }
    }
    
    if (!statusCell) {
        return gradeData;
    }
    
    const statusText = statusCell.textContent?.trim() || '';
    const statusLower = statusText.toLowerCase();
    
    if (statusLower.includes('no submission')) {
        gradeData.submissionStatus = 'not_submitted';
        gradeData.isSubmitted = false;
        
    } else if (statusLower === 'submitted') {
        gradeData.submissionStatus = 'submitted';
        gradeData.isSubmitted = true;
        gradeData.isGraded = false;
        
    } else if (statusLower === 'ungraded') {
        gradeData.submissionStatus = 'submitted';
        gradeData.isSubmitted = true;
        gradeData.isGraded = false;
        
    } else {
        const scoreMatch = statusText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
        
        if (scoreMatch) {
            const earnedPoints = parseFloat(scoreMatch[1]);
            const maxPoints = parseFloat(scoreMatch[2]);
            
            gradeData.submissionStatus = 'graded';
            gradeData.isSubmitted = true;
            gradeData.isGraded = true;
            gradeData.earnedPoints = earnedPoints;
            gradeData.maxPoints = maxPoints;
            gradeData.gradePercentage = maxPoints > 0 ? (earnedPoints / maxPoints) * 100 : 0;
            gradeData.gradedAt = new Date().toISOString();
            
            console.log(`✅ Extracted grade: ${earnedPoints}/${maxPoints} (${gradeData.gradePercentage.toFixed(1)}%)`);
        }
    }
    
    const rowHTML = row.innerHTML.toLowerCase();
    if (rowHTML.includes('late') || rowHTML.includes('overdue')) {
        gradeData.isLate = true;
    }
    
    return gradeData;
}

function extractDueDateFromRow(cells) {
    let dueDate = null;
    
    if (cells.length >= 3) {
        const timeElements = cells[2].querySelectorAll('time[datetime]');
        
        if (timeElements.length > 0) {
            let mainDueTime = null;
            
            for (const timeEl of timeElements) {
                const label = timeEl.getAttribute('aria-label') || '';
                const datetime = timeEl.getAttribute('datetime');
                
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
                    if (isNaN(dueDate.getTime())) {
                        dueDate = null;
                    }
                } catch (e) {
                    dueDate = null;
                }
            }
        }
        
        if (!dueDate) {
            const dueDateText = cells[2].textContent?.trim();
            dueDate = parseDueDateFromText(dueDateText);
        }
    }
    
    return dueDate;
}

function parseDueDateFromText(dueDateText) {
    if (!dueDateText) return null;
    
    const dateRegex = /(\w{3}\s+\d{1,2}\s+at\s+\d{1,2}:\d{2}[AP]M)/g;
    const dateMatches = dueDateText.match(dateRegex);
    
    if (!dateMatches || dateMatches.length === 0) return null;
    
    let targetDateStr = null;
    
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
 * SEPARATED FILTERING LOGIC
 * Calendar sync: Only upcoming, non-submitted assignments
 * Grade calculation: ALL assignments
 */

function filterForCalendarSync(assignments) {
    console.log(`🗓️ Filtering ${assignments.length} assignments for calendar sync...`);
    
    const now = new Date();
    const calendarAssignments = [];
    
    assignments.forEach(assignment => {
        // Skip if no due date
        if (!assignment.dueDate) {
            console.log(`⚠️ Skipping ${assignment.title} (no due date)`);
            return;
        }
        
        // Skip if already submitted
        if (assignment.isSubmitted) {
            console.log(`📝 Skipping ${assignment.title} (already submitted)`);
            return;
        }
        
        const dueDate = new Date(assignment.dueDate);
        const daysDifference = (dueDate - now) / (1000 * 60 * 60 * 24);
        
        // Only include upcoming assignments (future due dates)
        if (daysDifference > 0) {
            calendarAssignments.push(assignment);
            console.log(`📅 Including for calendar: ${assignment.title} (due in ${Math.ceil(daysDifference)} days)`);
        } else {
            console.log(`🗂️ Skipping ${assignment.title} (${Math.abs(Math.floor(daysDifference))} days overdue)`);
        }
    });
    
    console.log(`🗓️ Calendar sync: ${calendarAssignments.length}/${assignments.length} assignments`);
    return calendarAssignments;
}

async function checkExistingAssignments(newAssignments) {
    try {
        const storage = await chrome.storage.local.get();
        const existingIds = new Set();
        
        Object.keys(storage).forEach(key => {
            if (key.startsWith('assignments_') && storage[key].assignments) {
                storage[key].assignments.forEach(assignment => {
                    if (assignment.assignmentId) {
                        existingIds.add(assignment.assignmentId);
                    }
                });
            }
        });
        
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

function calculateGradeStatistics(assignments) {
    const gradedAssignments = assignments.filter(a => a.isGraded && a.earnedPoints !== null);
    
    if (gradedAssignments.length === 0) {
        return { 
            hasGrades: false, 
            averagePercentage: null, 
            totalPoints: null, 
            earnedPoints: null,
            gradedCount: 0,
            totalCount: assignments.length
        };
    }
    
    const totalEarned = gradedAssignments.reduce((sum, a) => sum + a.earnedPoints, 0);
    const totalPossible = gradedAssignments.reduce((sum, a) => sum + a.maxPoints, 0);
    
    return {
        hasGrades: true,
        averagePercentage: totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0,
        totalPoints: totalPossible,
        earnedPoints: totalEarned,
        gradedCount: gradedAssignments.length,
        totalCount: assignments.length
    };
}

/**
 * FAST MAIN EXECUTION
 */
async function fastComprehensiveExtraction() {
    console.log('🚀 Starting fast comprehensive extraction...');
    
    const courses = extractCoursesFromDashboard();
    
    if (courses.length === 0) {
        console.log('❌ No courses found in current semester');
        return { allAssignments: [], calendarAssignments: [] };
    }
    
    console.log(`📚 Found ${courses.length} courses, extracting ALL assignments...`);
    
    // Extract ALL assignments from ALL courses in parallel for speed
    const allAssignmentsPromises = courses.map(course => extractAllAssignmentsForGrades(course));
    const courseAssignments = await Promise.all(allAssignmentsPromises);
    
    // Flatten all assignments
    const allAssignments = courseAssignments.flat();
    console.log(`📊 Total assignments extracted: ${allAssignments.length}`);
    
    // Separate filtering for calendar vs grades
    const calendarAssignments = filterForCalendarSync(allAssignments);
    
    console.log(`🎯 Results: ${allAssignments.length} total assignments, ${calendarAssignments.length} for calendar`);
    
    return { allAssignments, calendarAssignments };
}

function extractFromCoursePage() {
    console.log('📄 Extracting from individual course page...');
    
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
    
    const allAssignments = parseAllAssignmentsFromDocument(document, course);
    const calendarAssignments = filterForCalendarSync(allAssignments);
    
    return { allAssignments, calendarAssignments };
}

/**
 * Main execution function
 */
async function main() {
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
        
        let result;
        let method = '';
        
        if (pageType === 'dashboard') {
            result = await fastComprehensiveExtraction();
            method = 'fast_comprehensive_extraction';
        } else if (pageType === 'course_main' || pageType === 'course_assignments') {
            result = extractFromCoursePage();
            method = 'individual_course_page';
        } else {
            console.log('ℹ️ Not a relevant Gradescope page, skipping extraction');
            return;
        }
        
        const { allAssignments, calendarAssignments } = result;
        
        if (allAssignments.length > 0) {
            // Check for duplicates only on calendar assignments
            const uniqueCalendarAssignments = await checkExistingAssignments(calendarAssignments);
            
            if (uniqueCalendarAssignments.length > 0 || allAssignments.length > 0) {
                const storageKey = `assignments_${method}_${Date.now()}`;
                const gradeStats = calculateGradeStatistics(allAssignments); // Use ALL assignments for grades
                
                await chrome.storage.local.set({
                    [storageKey]: {
                        // Store calendar assignments (for existing calendar sync functionality)
                        assignments: uniqueCalendarAssignments,
                        
                        // Store ALL assignments for grade calculation
                        allAssignments: allAssignments,
                        
                        extractedAt: new Date().toISOString(),
                        pageUrl: window.location.href,
                        method: method,
                        semester: getCurrentSemester(),
                        gradeStats: gradeStats,
                        stats: {
                            totalExtracted: allAssignments.length,
                            calendarTotal: calendarAssignments.length,
                            calendarUnique: uniqueCalendarAssignments.length,
                            calendarDuplicates: calendarAssignments.length - uniqueCalendarAssignments.length,
                            graded: allAssignments.filter(a => a.isGraded).length,
                            submitted: allAssignments.filter(a => a.isSubmitted).length,
                            pending: allAssignments.filter(a => !a.isSubmitted).length
                        }
                    }
                });
                
                const graded = allAssignments.filter(a => a.isGraded).length;
                const submitted = allAssignments.filter(a => a.isSubmitted).length;
                const pending = allAssignments.filter(a => !a.isSubmitted).length;
                
                console.log(`💾 Stored comprehensive data:`);
                console.log(`   📊 ${allAssignments.length} total assignments extracted`);
                console.log(`   🗓️ ${uniqueCalendarAssignments.length} calendar assignments (${calendarAssignments.length - uniqueCalendarAssignments.length} duplicates)`);
                console.log(`   📈 Grades: ${graded} graded, ${submitted} submitted, ${pending} pending`);
                
                if (gradeStats.hasGrades) {
                    console.log(`   🎯 Overall average: ${gradeStats.averagePercentage.toFixed(1)}% (${gradeStats.gradedCount}/${gradeStats.totalCount} assignments)`);
                }
                
            } else {
                console.log('ℹ️ All calendar assignments were duplicates, but stored comprehensive grade data');
            }
        } else {
            console.log('📭 No assignments found');
        }
        
    } catch (error) {
        console.error('❌ Error during extraction:', error);
    } finally {
        extractionInProgress = false;
    }
}

/**
 * Debug function to test grade extraction on current page
 */
function testGradeExtraction() {
    console.log('🧪 Testing grade extraction on current page...');
    
    const table = document.querySelector('table');
    if (!table) {
        console.log('❌ No assignment table found');
        return;
    }
    
    const rows = table.querySelectorAll('tbody tr');
    console.log(`📋 Found ${rows.length} rows to analyze`);
    
    const mockCourse = { id: '123', shortName: 'Test Course' };
    
    rows.forEach((row, index) => {
        const assignment = parseAssignmentFromRow(row, mockCourse);
        
        if (assignment) {
            console.log(`✅ Row ${index + 1}: ${assignment.title}`);
            console.log(`   📊 Status: ${assignment.submissionStatus}`);
            console.log(`   📝 Submitted: ${assignment.isSubmitted}, Graded: ${assignment.isGraded}`);
            
            if (assignment.isGraded) {
                console.log(`   🎯 Score: ${assignment.earnedPoints}/${assignment.maxPoints} (${assignment.gradePercentage?.toFixed(1)}%)`);
            }
            
            if (assignment.isLate) {
                console.log(`   ⏰ Late submission detected`);
            }
        } else {
            console.log(`⚪ Row ${index + 1}: Not an assignment row`);
        }
    });
}

/**
 * OPTIMIZED DOM OBSERVATION
 */
function debounce(func, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

function setupOptimizedDOMObserver() {
    const debouncedMain = debounce(main, 1000);
    
    const targetSelectors = [
        '.courseList',
        '.courseList--coursesForTerm',
        'table tbody'
    ];
    
    let observersCreated = 0;
    
    targetSelectors.forEach(selector => {
        const containers = document.querySelectorAll(selector);
        
        containers.forEach(container => {
            if (container && !container.dataset.gradescopeObserved) {
                container.dataset.gradescopeObserved = 'true';
                
                const observer = new MutationObserver((mutations) => {
                    const significantMutations = mutations.filter(mutation => {
                        return mutation.type === 'childList' && 
                               (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0);
                    });
                    
                    if (significantMutations.length > 0) {
                        debouncedMain();
                    }
                });
                
                observer.observe(container, {
                    childList: true,
                    subtree: true
                });
                
                observersCreated++;
            }
        });
    });
    
    if (observersCreated === 0) {
        const observer = new MutationObserver(() => debouncedMain());
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

/**
 * INITIALIZATION
 */
if (window.gradescopeCalendarSyncLoadedV4) {
    console.log('🔄 Manual sync triggered');
    main();
} else {
    window.gradescopeCalendarSyncLoadedV4 = true;
    window.testGradeExtraction = testGradeExtraction;
    
    console.log('🧪 testGradeExtraction() function available in console');
    console.log('🎯 Starting fast comprehensive content script...');
    
    const initializeExtension = () => {
        setupOptimizedDOMObserver();
        main();
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeExtension, 1000);
        });
    } else {
        setTimeout(initializeExtension, 1000);
    }
}

console.log('✅ Fast Comprehensive Gradescope Sync initialized (V1.4 - Separated Logic)');