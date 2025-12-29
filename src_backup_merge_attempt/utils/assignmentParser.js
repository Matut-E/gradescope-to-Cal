/**
 * Assignment Parser Utilities
 * Handles course extraction and assignment parsing from Gradescope pages
 *
 * Extracted from contentScript.js for better maintainability
 */

class AssignmentParser {
    /**
     * Extract course cards from dashboard page
     */
    static extractCoursesFromDashboard() {
        console.log('🏠 Extracting courses from dashboard...');

        const currentSemester = DateParser.getCurrentSemester();
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
            const courseData = this.extractCourseFromCard(card, currentSemester);
            if (courseData) {
                courses.push(courseData);
                console.log(`✅ Course ${index + 1}: ${courseData.shortName}`);
            }
        });

        return courses;
    }

    /**
     * Parse individual course card for metadata
     */
    static extractCourseFromCard(card, semester) {
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
     * Extract ALL assignments from a course for calendar sync
     */
    static async extractAllAssignmentsForCalendarSync(course) {
        console.log(`📡 Extracting assignments from ${course.shortName} for calendar sync...`);

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

            return this.parseAllAssignmentsFromDocument(doc, course);

        } catch (error) {
            console.log(`❌ Error extracting from ${course.shortName}:`, error.message);
            return [];
        }
    }

    /**
     * Parse assignment table from course page document
     */
    static parseAllAssignmentsFromDocument(doc, course) {
        console.log(`📋 Parsing assignments from ${course.shortName}...`);

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
                // Use basic assignment parsing (no categorization in public version)
                const assignment = this.parseAssignmentFromRow(row, course);
                if (assignment) {
                    assignments.push(assignment);
                }
            } catch (error) {
                console.log(`⚠️ Error parsing row ${index + 1} in ${course.shortName}:`, error);
            }
        });

        console.log(`✅ Extracted ${assignments.length} assignments from ${course.shortName}`);
        return assignments;
    }

    /**
     * Parse individual assignment row with comprehensive grade data extraction
     */
    static parseAssignmentFromRow(row, course) {
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
        let dueDate = DateParser.extractDueDateFromRow(cells);
        const gradeData = GradeExtractor.extractGradeDataFromRow(row, cells);

        // Detect timezone (Tier 1: Gradescope, Tier 2: Browser)
        const timezone = DateParser.detectTimezone(cells);

        const assignmentUrl = `https://www.gradescope.com/courses/${course.id}/assignments/${assignmentId}`;

        return {
            title: title,
            dueDate: dueDate ? dueDate.toISOString() : null,
            timezone: timezone,  // Store detected timezone
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
     * Extract from individual course page
     */
    static extractFromCoursePage() {
        console.log('📄 Extracting from individual course page...');

        const courseId = window.location.pathname.match(/\/courses\/(\d+)/)?.[1];
        const courseNameEl = document.querySelector('h1, .course-title, .course-name');
        const courseName = courseNameEl?.textContent?.trim() || `Course ${courseId}`;

        const course = {
            id: courseId,
            shortName: courseName,
            fullName: courseName,
            url: window.location.href,
            semester: DateParser.getCurrentSemester()
        };

        const allAssignments = this.parseAllAssignmentsFromDocument(document, course);
        const calendarAssignments = GradeExtractor.filterForCalendarSync(allAssignments);

        console.log(`📊 Extraction stats: ${allAssignments.length} total, ${calendarAssignments.length} for calendar`);

        return { allAssignments, calendarAssignments };
    }

    /**
     * Fast comprehensive extraction from dashboard page
     */
    static async fastComprehensiveExtraction() {
        console.log('🚀 Starting fast comprehensive extraction...');

        const courses = this.extractCoursesFromDashboard();

        if (courses.length === 0) {
            console.log('❌ No courses found in current semester');
            return { allAssignments: [], calendarAssignments: [] };
        }

        console.log(`📚 Found ${courses.length} courses, extracting assignments...`);

        // Extract assignments from ALL courses in parallel
        const allAssignmentsPromises = courses.map(course => this.extractAllAssignmentsForCalendarSync(course));
        const courseAssignments = await Promise.all(allAssignmentsPromises);

        // Flatten all assignments
        const allAssignments = courseAssignments.flat();
        console.log(`📊 Total assignments extracted: ${allAssignments.length}`);

        // Separate filtering for calendar vs grades
        const calendarAssignments = GradeExtractor.filterForCalendarSync(allAssignments);

        console.log(`🎯 Results: ${allAssignments.length} total assignments, ${calendarAssignments.length} for calendar`);

        return { allAssignments, calendarAssignments };
    }
}

// Expose to window for contentScript usage
if (typeof window !== 'undefined') {
    window.AssignmentParser = AssignmentParser;
}
