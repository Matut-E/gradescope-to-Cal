/**
 * Date Parser Utilities
 * Handles due date extraction and parsing from Gradescope pages
 *
 * Extracted from contentScript.js for better maintainability
 */

class DateParser {
    /**
     * Extract due date from assignment table row cells
     */
    static extractDueDateFromRow(cells) {
        let dueDate = null;

        if (cells.length >= 3) {
            // Look for time elements with datetime attributes first
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

            // Fallback to text parsing
            if (!dueDate) {
                const dueDateText = cells[2].textContent?.trim();
                dueDate = this.parseDueDateFromText(dueDateText);
            }
        }

        return dueDate;
    }

    /**
     * Extract timezone from Gradescope page (Tier 1: Auto-detect)
     * Returns IANA timezone name (e.g., "America/Los_Angeles", "America/New_York")
     */
    static extractTimezoneFromRow(cells) {
        if (cells.length >= 3) {
            const timeElements = cells[2].querySelectorAll('time[datetime]');

            for (const timeEl of timeElements) {
                const label = timeEl.getAttribute('aria-label') || '';
                const datetime = timeEl.getAttribute('datetime');

                if (label.includes('Released') || label.includes('Late Due Date')) {
                    continue;
                }

                if (label.includes('Due at') && datetime) {
                    // Extract timezone offset from datetime string
                    // Format: 2025-01-15T11:59:00-08:00 or 2025-01-15T11:59:00Z
                    const timezone = this.extractTimezoneFromDatetimeString(datetime);
                    if (timezone) {
                        console.log(`🌍 Detected timezone from Gradescope: ${timezone}`);
                        return timezone;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Extract IANA timezone name from ISO 8601 datetime string
     */
    static extractTimezoneFromDatetimeString(datetimeStr) {
        if (!datetimeStr) return null;

        // Check for UTC (Z suffix)
        if (datetimeStr.endsWith('Z')) {
            return 'UTC';
        }

        // Extract timezone offset (e.g., -08:00, +05:30, -05:00)
        const offsetMatch = datetimeStr.match(/([+-]\d{2}):(\d{2})$/);
        if (!offsetMatch) return null;

        const offsetHours = parseInt(offsetMatch[1]);
        const offsetMinutes = parseInt(offsetMatch[2]);

        // Map common US timezone offsets to IANA names
        // Note: This handles standard time; DST detection would require date checking
        return this.mapOffsetToTimezone(offsetHours, offsetMinutes);
    }

    /**
     * Map timezone offset to IANA timezone name (Tier 1 helper)
     * Focuses on US timezones commonly used by universities
     */
    static mapOffsetToTimezone(hours, minutes = 0) {
        const totalMinutes = hours * 60 + (hours < 0 ? -minutes : minutes);

        // Common US timezone mappings
        const timezoneMap = {
            '-480': 'America/Los_Angeles',  // PST (UTC-8)
            '-420': 'America/Denver',        // MST (UTC-7) or PDT
            '-360': 'America/Chicago',       // CST (UTC-6) or MDT
            '-300': 'America/New_York',      // EST (UTC-5) or CDT
            '-240': 'America/New_York',      // EDT (UTC-4)
            '-600': 'Pacific/Honolulu',      // HST (UTC-10)
            '-540': 'America/Anchorage',     // AKST (UTC-9)
            '0': 'UTC',
            '60': 'Europe/London',           // BST
            '330': 'Asia/Kolkata',           // IST (UTC+5:30)
            '480': 'Asia/Shanghai',          // CST (UTC+8)
            '540': 'Asia/Tokyo'              // JST (UTC+9)
        };

        return timezoneMap[totalMinutes.toString()] || null;
    }

    /**
     * Get browser's timezone (Tier 2: Fallback)
     */
    static getBrowserTimezone() {
        try {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            console.log(`🌐 Using browser timezone: ${timezone}`);
            return timezone;
        } catch (e) {
            console.warn('⚠️ Could not detect browser timezone, defaulting to UTC');
            return 'UTC';
        }
    }

    /**
     * Detect timezone with two-tier fallback system
     * Tier 1: Extract from Gradescope HTML
     * Tier 2: Use browser timezone
     */
    static detectTimezone(cells) {
        // Tier 1: Try to extract from Gradescope
        const gradescopeTimezone = this.extractTimezoneFromRow(cells);
        if (gradescopeTimezone) {
            return gradescopeTimezone;
        }

        // Tier 2: Fallback to browser timezone
        console.log('⚠️ Could not detect timezone from Gradescope, using browser timezone');
        return this.getBrowserTimezone();
    }

    /**
     * Parse due date from text format (e.g., "Oct 15 at 11:59PM")
     */
    static parseDueDateFromText(dueDateText) {
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
     * Intelligently detect current semester from DOM or date
     */
    static getCurrentSemester() {
        console.log('📅 Detecting current semester from courseList structure...');

        const firstTermElement = document.querySelector('.courseList--term');

        if (firstTermElement) {
            const semesterText = firstTermElement.textContent?.trim();
            if (semesterText && /^(Fall|Spring|Summer|Winter)\s+\d{4}$/.test(semesterText)) {
                console.log(`✅ Found current semester from courseList: ${semesterText}`);
                return semesterText;
            }
        }

        // Date-based fallback
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
}

// Expose to window for contentScript usage
if (typeof window !== 'undefined') {
    window.DateParser = DateParser;
}
