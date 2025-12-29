/**
 * iCalendar Generator Module
 * Generates RFC 5545 compliant .ics files for calendar export
 *
 * Creates iCalendar files containing Gradescope assignments with:
 * - UTC format for all timed events (calendar apps auto-convert to local time)
 * - Event timing (timed vs all-day based on user preferences)
 * - Reminders (respecting user's reminder schedule)
 * - Full assignment details and Gradescope links
 * - Theoretical deduplication via UID (limited support in most calendar apps)
 *
 * RFC 5545 Compliance:
 * - Uses UTC format (Z suffix) for timed events - no VTIMEZONE components needed
 * - Uses VALUE=DATE for all-day events
 * - Properly escapes text and folds long lines
 */

class IcalGenerator {
    /**
     * Generate RFC 5545 compliant iCalendar file content
     * @param {Array} assignments - Array of assignment objects with dueDate, title, course, etc.
     * @param {Object} settings - User preferences (eventDisplayTime, reminderSchedule, customReminders, settings_create_reminders)
     * @returns {string} - Complete .ics file content
     */
    static generate(assignments, settings = {}) {
        if (!assignments || assignments.length === 0) {
            throw new Error('No assignments provided for iCal export');
        }

        // Extract settings with defaults
        const {
            eventDisplayTime = 'deadline',
            reminderSchedule = 'double',
            customReminders = [1440, 60],
            settings_create_reminders = true
        } = settings;

        console.log('🗓️ Generating iCalendar file with settings:', {
            eventDisplayTime,
            reminderSchedule,
            customReminders,
            settings_create_reminders,
            assignmentCount: assignments.length
        });

        // Filter to only upcoming assignments
        const now = new Date();
        const upcomingAssignments = assignments.filter(assignment => {
            if (!assignment.dueDate) return false;
            const dueDate = new Date(assignment.dueDate);
            return dueDate >= now;
        });

        if (upcomingAssignments.length === 0) {
            throw new Error('No upcoming assignments found for export');
        }

        // Build iCalendar file (no VTIMEZONE needed - we use UTC)
        let icalContent = this.generateHeader();

        // Add VEVENT for each assignment
        for (const assignment of upcomingAssignments) {
            try {
                icalContent += this.generateVEvent(assignment, {
                    eventDisplayTime,
                    reminderSchedule,
                    customReminders,
                    settings_create_reminders
                });
            } catch (error) {
                console.error(`⚠️ Failed to generate event for "${assignment.title}":`, error);
                // Continue with other assignments
            }
        }

        icalContent += this.generateFooter();

        console.log(`✅ Generated iCalendar file with ${upcomingAssignments.length} upcoming assignments`);
        return icalContent;
    }

    /**
     * Generate iCalendar header
     * Uses UTC format for all times, no timezone definitions needed
     */
    static generateHeader() {
        return [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Gradescope to Cal//Browser Extension//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'X-WR-CALNAME:Gradescope Assignments',
            ''
        ].join('\r\n');
    }

    /**
     * Generate iCalendar footer
     */
    static generateFooter() {
        return 'END:VCALENDAR\r\n';
    }

    /**
     * Generate VEVENT block for a single assignment
     */
    static generateVEvent(assignment, settings) {
        const {
            eventDisplayTime,
            reminderSchedule,
            customReminders,
            settings_create_reminders
        } = settings;

        const dueDate = new Date(assignment.dueDate);

        // Generate UID for theoretical deduplication
        const uid = `gradescope-${assignment.assignmentId}@gradescope-to-cal.extension`;

        // Generate timestamp for DTSTAMP (current time in UTC)
        const now = new Date();
        const dtstamp = this.formatDateTimeUTC(now);

        let lines = [
            'BEGIN:VEVENT',
            `UID:${uid}`,
            `DTSTAMP:${dtstamp}`
        ];

        // Generate event timing based on user preference
        if (eventDisplayTime === 'allday') {
            // All-day event format (no timezone needed)
            const dateOnly = this.formatDateOnly(dueDate);
            lines.push(`DTSTART;VALUE=DATE:${dateOnly}`);
            lines.push(`DTEND;VALUE=DATE:${dateOnly}`);
        } else {
            // Timed event format - always use UTC for RFC 5545 compliance
            // Calendar apps automatically convert to user's local timezone
            const dateTimeUTC = this.formatDateTimeUTC(dueDate);
            lines.push(`DTSTART:${dateTimeUTC}`);
            lines.push(`DTEND:${dateTimeUTC}`);
        }

        // Summary (event title) - matches Google Calendar API format
        const summary = `${assignment.course}: ${assignment.title}`;
        lines.push(this.foldLine(`SUMMARY:${this.escapeText(summary)}`));

        // Description with assignment details and link
        const description = this.generateDescription(assignment);
        lines.push(this.foldLine(`DESCRIPTION:${this.escapeText(description)}`));

        // URL property for better client support
        if (assignment.url) {
            lines.push(`URL:${assignment.url}`);
        }

        // Location - use assignment URL for better Outlook accessibility
        // Outlook displays LOCATION prominently and makes URLs directly clickable
        lines.push(`LOCATION:${assignment.url}`);

        // Status
        lines.push('STATUS:CONFIRMED');

        // Add reminders (VALARM blocks) if enabled
        if (settings_create_reminders && reminderSchedule !== 'none') {
            const reminderMinutes = this.getReminderMinutes(reminderSchedule, customReminders);
            const adjustedReminders = this.adjustRemindersForEventType(
                reminderMinutes,
                eventDisplayTime
            );

            for (const minutes of adjustedReminders) {
                lines.push(this.generateVAlarm(summary, minutes));
            }
        }

        lines.push('END:VEVENT');
        lines.push('');

        return lines.join('\r\n');
    }

    /**
     * Generate VALARM block for a reminder
     */
    static generateVAlarm(summary, minutes) {
        const trigger = this.formatTriggerDuration(minutes);

        return [
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            `DESCRIPTION:${this.escapeText(summary)}`,
            `TRIGGER:${trigger}`,
            'END:VALARM'
        ].join('\r\n');
    }

    /**
     * Generate description text with assignment details
     * Uses browser timezone for human-readable date display
     * Uses actual newlines which escapeText() will convert to \n format
     */
    static generateDescription(assignment) {
        const dueDate = new Date(assignment.dueDate);
        const dueDateStr = dueDate.toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short'
        });

        let desc = `Gradescope Assignment: ${assignment.title}\n\n`;
        desc += `Course: ${assignment.course}\n`;
        desc += `Due: ${dueDateStr}\n\n`;
        desc += `View on Gradescope: ${assignment.url}`;

        return desc;
    }


    // ============================================================================
    // HELPER METHODS - Date Formatting
    // ============================================================================

    /**
     * Format date-time in UTC with Z suffix (e.g., 20250120T235900Z)
     */
    static formatDateTimeUTC(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const minute = String(date.getUTCMinutes()).padStart(2, '0');
        const second = String(date.getUTCSeconds()).padStart(2, '0');
        return `${year}${month}${day}T${hour}${minute}${second}Z`;
    }

    /**
     * Format date only (e.g., 20250120) for all-day events
     * Uses UTC to ensure consistent dates across timezones
     */
    static formatDateOnly(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    /**
     * Format trigger duration for VALARM (e.g., -PT1H for 1 hour before)
     */
    static formatTriggerDuration(minutes) {
        if (minutes === 0) {
            return '-PT0M'; // Trigger at event time
        }

        const isNegative = minutes >= 0; // Reminders are typically before the event
        const absMinutes = Math.abs(minutes);

        // Convert to ISO 8601 duration format
        if (absMinutes >= 1440 && absMinutes % 1440 === 0) {
            // Full days
            const days = absMinutes / 1440;
            return isNegative ? `-P${days}D` : `P${days}D`;
        } else if (absMinutes >= 60 && absMinutes % 60 === 0) {
            // Full hours
            const hours = absMinutes / 60;
            return isNegative ? `-PT${hours}H` : `PT${hours}H`;
        } else {
            // Minutes
            return isNegative ? `-PT${absMinutes}M` : `PT${absMinutes}M`;
        }
    }

    // ============================================================================
    // HELPER METHODS - Text Processing
    // ============================================================================

    /**
     * Escape special characters per RFC 5545
     * Escape: backslash, comma, semicolon, newline
     */
    static escapeText(text) {
        if (!text) return '';

        return text
            .replace(/\\/g, '\\\\')      // Backslash → \\
            .replace(/,/g, '\\,')         // Comma → \,
            .replace(/;/g, '\\;')         // Semicolon → \;
            .replace(/\n/g, '\\n')        // Newline → \n
            .replace(/\r/g, '');          // Remove carriage returns
    }

    /**
     * Fold line if longer than 75 characters (RFC 5545 requirement)
     * Lines must be folded with CRLF + space continuation
     */
    static foldLine(line) {
        if (line.length <= 75) {
            return line;
        }

        const result = [];
        let currentLine = line;

        // First line can be 75 characters
        result.push(currentLine.substring(0, 75));
        currentLine = currentLine.substring(75);

        // Continuation lines can be 74 characters (accounting for leading space)
        while (currentLine.length > 74) {
            result.push(' ' + currentLine.substring(0, 74));
            currentLine = currentLine.substring(74);
        }

        // Add remaining text
        if (currentLine.length > 0) {
            result.push(' ' + currentLine);
        }

        return result.join('\r\n');
    }

    // ============================================================================
    // HELPER METHODS - Reminders & Timezone
    // ============================================================================

    /**
     * Get reminder minutes based on schedule type
     */
    static getReminderMinutes(reminderSchedule, customReminders) {
        switch (reminderSchedule) {
            case 'none':
                return [];
            case 'single':
                return [1440]; // 1 day before
            case 'double':
                return [1440, 60]; // 1 day + 1 hour before
            case 'custom':
                return Array.isArray(customReminders) ? customReminders : [1440, 60];
            default:
                return [1440, 60]; // Default to double
        }
    }

    /**
     * Adjust reminders for all-day events
     * Google Calendar API limitation: all-day events only support day-of reminders
     */
    static adjustRemindersForEventType(reminderMinutes, eventDisplayTime) {
        if (eventDisplayTime !== 'allday') {
            return reminderMinutes;
        }

        // Convert reminders to sensible day-based values for all-day events
        const adjusted = reminderMinutes.map(minutes => {
            if (minutes >= 1440 && minutes % 1440 === 0) {
                // Full days - keep as is
                return minutes;
            } else if (minutes < 1440) {
                // Less than a day - convert to day-of reminder (0 minutes)
                return 0;
            } else {
                // Not a full day - round to nearest day
                return Math.round(minutes / 1440) * 1440;
            }
        });

        // Remove duplicates and sort descending
        return [...new Set(adjusted)].sort((a, b) => b - a);
    }

}

// Expose for browser extension context
if (typeof window !== 'undefined') {
    window.IcalGenerator = IcalGenerator;
}

// Expose for service worker context
if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.IcalGenerator = IcalGenerator;
}
