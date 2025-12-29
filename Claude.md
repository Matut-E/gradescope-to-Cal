# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gradescope to Cal** is an open-source, MIT-licensed browser extension that automatically syncs UC Berkeley Gradescope assignments to Google Calendar. Published on the Chrome Web Store, it helps students stay organized by creating calendar events for all upcoming assignments.

**Key characteristics**:
- **Open source**: MIT licensed, publicly available
- **Automatic sync**: First-time sync + manual sync + 24-hour auto-sync + smart sync on extraction
- **Production version**: v1.9.1 on Chrome Web Store
- **Privacy-first**: Zero-server architecture, all processing in browser

## Core Features

This extension provides:

1. **Assignment Extraction**: Extracts upcoming assignments from Gradescope dashboard and course pages
2. **Google Calendar Integration**: OAuth 2.0 authentication and Calendar API v3 integration
3. **Four Sync Mechanisms**:
   - **First-Time Sync**: Immediate sync on first authentication (if assignments already extracted)
   - **Manual Sync**: User-triggered sync via "Sync to Calendar" button
   - **24-Hour Auto-Sync**: Scheduled background sync every 24 hours
   - **Smart Sync on Extraction**: Instant sync when new assignments detected (60-min cooldown)
4. **Calendar Events**: Creates visible events with assignment details and Gradescope links
5. **Customizable Event Appearance**:
   - **Event Colors**: Choose from 11 Google Calendar colors
   - **Reminder Schedule**: None, single (1 day), double (1 day + 1 hour), or custom (up to 3 reminders)
   - **Display Timing**: Show at actual deadline time or as all-day events
6. **Smart Deduplication**: Uses extended properties to prevent duplicate events
7. **Upcoming Assignments Only**: Filters out past assignments to keep your calendar clean
8. **iCal Export**: One-time export for non-Google calendar applications
   - Generates RFC 5545 compliant .ics files (passes iCal validators)
   - **RFC 5545 compliance**: Uses UTC format for timed events (no VTIMEZONE components needed)
   - **Title format**: Matches Google Calendar API format (`Course: Assignment`)
   - **Enhanced link accessibility**: Assignment URL in LOCATION field for direct Outlook clicking
   - **Multiple URL placements**: URL property (RFC 5545), LOCATION field (Outlook), and description text (all apps)
   - Respects all user preferences (reminders, display timing, event colors)
   - Includes full assignment details with proper newline formatting
   - Date-stamped filenames for organization (e.g., `gradescope-assignments-2025-11-01.ics`)
   - Compatible with Outlook, Apple Calendar, Google Calendar, and all standard calendar apps
   - Stateless operation—no deduplication tracking (users warned about re-import duplicates)

## Architecture

### Component Structure

1. **Content Script** (`src/contentScript.js`):
   - Runs on `*.gradescope.com` pages
   - Extracts assignments from dashboard and course pages
   - Detects page types: `dashboard`, `course_main`, `course_assignments`
   - Uses DOM observers for dynamic content
   - Stores extracted data for calendar sync

2. **Background Service Worker** (`src/background.js`):
   - Handles OAuth authentication (dual strategy: Chrome native + PKCE)
   - Manages Calendar API requests with event caching
   - Implements four sync mechanisms:
     - First-time sync (immediate sync on first auth)
     - Manual sync (user-triggered)
     - Auto-sync alarms (24-hour intervals)
     - Smart sync on extraction (instant sync for new assignments)
   - Handles message passing between components
   - Manages refresh tokens and token validation

3. **Popup** (`src/popup.js`, `src/popup.html`):
   - Manual extraction controls
   - Calendar sync buttons
   - Auth status display
   - Context-aware UI based on current page

### Data Flow

```
Gradescope Page → contentScript.js (extraction)
    ↓
Chrome Storage (`assignments_*` keys)
    ↓
background.js (calendar sync)
    ↓
Google Calendar API
```

### Storage Schema

**Assignment Data**:
- `assignments_<method>_<timestamp>`: Assignment data ready for calendar sync
  - `assignments`: Array of upcoming assignments with due dates
  - `allAssignments`: All extracted assignments (for reference)

**Authentication & Sync**:
- `authToken`, `refreshToken`, `tokenExpiry`: OAuth tokens
- `autoSyncEnabled`, `autoSyncInterval`, `lastAutoSync`: Auto-sync state
- `eventCache`: In-memory cache of calendar events for deduplication

**User Preferences** (chrome.storage.local):
- `settings_auto_sync`: Enable/disable automatic 24-hour sync (default: `true`)
- `settings_create_reminders`: Master toggle for reminders (default: `true`)
- `reminderSchedule`: `'none' | 'single' | 'double' | 'custom'` (default: `'double'`)
- `customReminders`: Array of minutes before due date, e.g. `[1440, 60]` (default: `[1440, 60]`)
- `eventDisplayTime`: `'deadline' | 'allday'` (default: `'deadline'`)
- `eventColorId`: Google Calendar color ID 1-11 (stored in chrome.storage.sync, default: `'9'` Blueberry)

**Onboarding**:
- `userHasPinned`, `dismissedExtractionBanner`: Onboarding state

## Key Implementation Details

### Authentication Strategy

- **Chrome/Chromium**: `chrome.identity.getAuthToken()` (native, fast)
- **Other browsers**: PKCE OAuth flow with refresh tokens
- Extension ID → Client ID mapping in `CONFIG.CHROME_EXTENSION_CLIENTS`
- Automatic token refresh on expiration

### Calendar Event Format

The extension creates two possible event formats based on user preferences:

**Timed Event** (default, `eventDisplayTime: 'deadline'`):
```js
{
  summary: "[Course] Assignment Title",
  start: {
    dateTime: "2025-01-20T23:59:00.000Z",
    timeZone: "America/Los_Angeles"
  },
  end: {
    dateTime: "2025-01-20T23:59:00.000Z",
    timeZone: "America/Los_Angeles"
  },
  description: "Assignment details + Gradescope link",
  colorId: "9",  // User-selected color (default: Blueberry)
  reminders: {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 1440 },  // 1 day before
      { method: 'popup', minutes: 60 }      // 1 hour before
    ]
  },
  extendedProperties: {
    private: { gradescope_assignment_id: "123456" }
  }
}
```

**All-Day Event** (`eventDisplayTime: 'allday'`):
```js
{
  summary: "[Course] Assignment Title",
  start: { date: "2025-01-20" },
  end: { date: "2025-01-20" },
  description: "Assignment details + Gradescope link",
  colorId: "9",
  reminders: {
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 1440 },  // 1 day before (day-of reminder)
      { method: 'popup', minutes: 0 }      // Day-of reminder at 9 AM
    ]
  },
  extendedProperties: {
    private: { gradescope_assignment_id: "123456" }
  }
}
```

**Notes**:
- Deduplication via `gradescope_assignment_id` in extended properties
- All-day events have reminder limitations: hour-based reminders are converted to day-of notifications
- Reminders respect user's `reminderSchedule` preference (none/single/double/custom)
- Colors are customizable via `eventColorId` (1-11, synced across devices)

### Assignment Extraction Logic

**Dashboard Extraction**:
- Detects current semester from `.courseList--term`
- Extracts courses from `.courseBox` elements
- Parallel fetches all course pages
- Filters for upcoming assignments (due date >= today)

**Course Page Extraction**:
- Parses `<table>` rows for assignments
- Extracts: title, due date, course name, assignment URL
- Converts dates to ISO format for calendar events
- Filters out past assignments automatically

### Event Cache Performance

`EventCache` class reduces API calls:
- Full refresh every 10 minutes
- In-memory Map of `assignmentId → eventId`
- Fallback to direct API search on cache miss
- Handles up to 1000 events

### Auto-Sync Flow

The extension has **four sync mechanisms** to ensure assignments reach the calendar quickly:

**1. First-Time Sync** (immediate sync on first authentication):
- Triggered when user connects Google Calendar for the first time
- Checks if assignments have already been extracted (via "Extract Assignments" button)
- If assignments exist, syncs them immediately to calendar
- Starts 24-hour auto-sync countdown
- Provides instant gratification for new users: extract → connect → done!
- Implementation: `handleFirstTimeSync()` in `background.js` (lines 293-371)

**2. Manual Sync** (user-triggered):
- User clicks "Sync to Calendar" button in popup
- Syncs all calendar-eligible assignments immediately
- No rate limiting or cooldown

**3. 24-Hour Auto-Sync** (scheduled background sync):
- Alarm triggers every 24 hours
- Background script fetches stored assignments
- Checks for new assignments via event cache
- Creates calendar events for new assignments
- Updates `lastAutoSync` timestamp

**4. Smart Sync on Extraction** (immediate sync after extraction):
- Content script extracts assignments from Gradescope page
- Sends `checkForNewAssignments` message to background
- SmartSyncManager checks event cache for new assignments
- If new assignments found AND rate limit allows (60-minute cooldown):
   - Immediately syncs new assignments to calendar
   - Updates `lastSmartSyncTimestamp` and `lastSyncType: 'smart'`
- If rate limited, waits until cooldown expires

**Benefits**:
- **First-time sync**: New users get calendar events immediately after setup
- **Smart sync**: No need to wait 24 hours for new assignments
- **Rate limiting**: Prevents excessive API calls (60-minute cooldown for smart sync)
- **Redundancy**: Multiple sync paths ensure assignments always reach calendar

### Calendar Event Customization

The extension provides comprehensive customization options in the **Event Appearance** section of the options page:

**Event Colors**:
- 11 Google Calendar colors to choose from
- Visual color picker with live preview
- Default: Blueberry (#5484ed)
- Synced across devices via `chrome.storage.sync`

**Reminder Schedule** (4 options):
1. **None**: No reminders created
2. **Single**: 1 day before due date (1440 minutes)
3. **Double** (default): 1 day + 1 hour before (1440 + 60 minutes)
4. **Custom**: Up to 3 custom reminders with inline builder
   - Units: minutes, hours, or days
   - Pre-populated with double preset when first selected
   - Dynamic add/delete interface

**Display Timing** (2 options):
1. **Deadline** (default): Shows event at actual due time
   - Most Gradescope assignments due at 11:59 PM
   - Supports accurate time-specific reminders (e.g., "1 hour before")
   - Best for precise scheduling
2. **All-Day**: Shows event as all-day at top of calendar
   - Maximum visibility in calendar view
   - **Limitation**: Only supports day-of reminders (Google Calendar API constraint)
   - Hour-based reminders automatically converted to day-of notifications

**Implementation Notes**:
- All settings stored in `chrome.storage.local` for instant retrieval
- `settings_create_reminders` acts as master toggle (preserved for backward compatibility)
- Custom reminders stored as array of minutes for simplicity
- Settings applied in `calendarAPIClient.js` during event creation (lines 54-194)
- Full dark mode support with CSS variables

**UI Location**:
- Options page → Smart Auto-Sync Settings → Event Appearance (collapsible section)
- Contains: Color picker, Reminder Schedule, Display Timing
- All settings saved via "Save Settings" button

## Development

### Loading the Extension

1. **Chrome**:
   - Extensions → Developer Mode → "Load unpacked" → select `src/` folder

2. **Testing**:
   - Navigate to Gradescope dashboard or course page
   - Open extension popup → click "Extract Assignments Now"
   - Check Calendar for new events

3. **Reload after changes**:
   - Chrome: Extensions → click refresh icon

### Debug Functions

Available in console on Gradescope pages:
```js
testGradeExtraction() // Test basic extraction
testEnhancedStorage() // Inspect stored data
```

### Claude Code Tips

- **Use relative paths**: When you get `Error: File has been unexpectedly modified`, use relative paths instead of absolute paths when reading/writing files.

## Firefox & Chromium Compatibility

**⚠️ CRITICAL**: This extension supports both Firefox and Chromium-based browsers (Chrome, Brave, Edge). ALL code changes MUST be tested on both platforms to prevent platform-specific bugs.

### Critical Rule: Always Use `browser.*` Namespace

**⚠️ MOST IMPORTANT**: Even with `browser-polyfill.js` loaded, you MUST explicitly use the `browser.*` namespace in ALL extension code, not `chrome.*`.

**✅ CORRECT**:
```js
// In popups, content scripts, and background scripts
const response = await browser.runtime.sendMessage({ action: 'doSomething' });
const data = await browser.storage.local.get('key');
```

**❌ INCORRECT**:
```js
// This will fail in Firefox even with polyfill loaded
const response = await chrome.runtime.sendMessage({ action: 'doSomething' });
// Returns undefined in Firefox - the polyfill doesn't automatically wrap chrome.* calls
```

**Why**: The browser-polyfill only provides the `browser` global. It does NOT automatically wrap `chrome.*` API calls. If you use `chrome.runtime.sendMessage` in Firefox, it will use Firefox's native implementation which behaves differently than the polyfill's Promise-based version.

**Real-world example that caused the bug**:
```js
// popup-ical.js (BEFORE - broken in Firefox)
const response = await chrome.runtime.sendMessage({ action: 'generateIcal' });
if (response.success) { ... }  // TypeError: response is undefined

// popup-ical.js (AFTER - works in Firefox)
const response = await browser.runtime.sendMessage({ action: 'generateIcal' });
if (response && response.success) { ... }  // ✅ Works!
```

### Cross-Browser Message Passing

**Complete Pattern** (both sender and receiver must be correct):

**Sender (Popup/Content Script)**:
```js
// Use browser.runtime, NOT chrome.runtime
const response = await browser.runtime.sendMessage({
    action: 'generateIcal',
    assignments: upcomingAssignments
});

// Add null safety check
if (response && response.success && response.icalContent) {
    // Handle success
} else {
    const errorMsg = response ? response.error : 'No response from background';
    console.error('Request failed:', errorMsg);
}
```

**Receiver (Background Script)**: Use the hybrid callback pattern for `browser.runtime.onMessage` listeners in Firefox Manifest V2:

**✅ CORRECT (Hybrid callback pattern - works in both Firefox & Chrome)**:
```js
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle message asynchronously via Promise, send response via callback
    handleMessage(request)
        .then(response => {
            sendResponse(response);
        })
        .catch(error => {
            sendResponse({ success: false, error: error.message });
        });

    // CRITICAL: Return true to keep message port open
    // Firefox Manifest V2 requires this to prevent port closure
    return true;
});
```

**❌ INCORRECT (Promise return pattern)**:
```js
// This pattern works in Chrome but FAILS in Firefox Manifest V2 temporary extensions
browser.runtime.onMessage.addListener((request, sender) => {
    return (async () => {
        const result = await handleMessage(request);
        return { success: true, data: result };
    })();
    // Firefox closes the message port before Promise resolves
});
```

**❌ INCORRECT (Missing return true)**:
```js
// Firefox will close the message port immediately, returning undefined
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    handleMessage(request).then(sendResponse);
    // Missing: return true;
});
```

### Why This Matters

1. **Firefox Manifest V2 requires explicit async handling**: Returning `true` explicitly tells Firefox to keep the message port open for async responses
2. **Message port closure issue**: Without `return true`, Firefox closes the message port before the Promise resolves, causing `response` to be `undefined` in the sender
3. **Temporary extension quirk**: This issue is especially prevalent in Firefox temporary extensions loaded via about:debugging
4. **Hybrid pattern is most reliable**: Using both `sendResponse` callback AND `return true` works across all browsers and manifest versions
5. **browser-polyfill limitation**: On Firefox, the polyfill acts as a NO-OP since Firefox natively supports `browser.*` APIs, so the polyfill's Promise wrapper doesn't apply to background scripts

### Platform-Specific Differences

**Manifest versions**:
- Chrome: Manifest V3 (service workers)
- Firefox: Manifest V2 (background scripts with `persistent: false`)

**Browser action API**:
- Chrome: `chrome.action` (Manifest V3)
- Firefox: `chrome.browserAction` (Manifest V2)

**Polyfill usage**:
- **CRITICAL**: Always use `browser.*` namespace, NEVER `chrome.*`
- The polyfill does NOT automatically wrap `chrome.*` calls
- Even with polyfill loaded, `chrome.runtime.sendMessage` will fail in Firefox
- Use `browser.*` in ALL files: popups, content scripts, background scripts
- This provides consistent Promise-based APIs across browsers

### Testing Requirements

**BEFORE pushing any changes**:
1. Test on Chrome/Chromium (Windows/Mac/Linux)
2. Test on Firefox (Windows/Mac/Linux)
3. Verify message passing works correctly (check for `undefined` responses)
4. Check browser console for platform-specific errors
5. Test OAuth flows on both platforms (Chrome native vs PKCE)

**Common Firefox-specific issues**:
- **Message passing returns `undefined`** → Two-part fix required:
  1. **In popup/sender**: Use `browser.runtime.sendMessage` (NOT `chrome.runtime.sendMessage`)
  2. **In background script**: Use hybrid callback pattern with `return true`
- **Polyfill not working**: Check if using `chrome.*` instead of `browser.*` - polyfill doesn't wrap `chrome.*`
- **Temporary extension message port closes early** → Always return `true` from async message listeners
- **`chrome.identity.launchWebAuthFlow`** → Ensure PKCE fallback works (Firefox doesn't support chrome.identity)
- **Storage sync delays** → Use `await browser.storage.local.get()` with proper initialization checks
- **Service worker differences** → Firefox Manifest V2 uses persistent background scripts, not service workers

### Quick Test Checklist

Run through these actions on **both Firefox and Chrome**:
- [ ] Extract assignments from Gradescope
- [ ] Authenticate with Google Calendar
- [ ] Sync assignments to calendar
- [ ] Export .ics file
- [ ] Toggle auto-sync settings
- [ ] Check popup UI updates correctly
- [ ] Verify no console errors

**If ANY feature returns `undefined` or fails silently in Firefox:**
1. **First**: Check if code uses `chrome.*` instead of `browser.*` - this is the #1 cause
2. **Second**: Verify background message listener uses `sendResponse` callback AND returns `true`
3. **Third**: Check browser console for "message port closed" errors

## UI Design System: Light & Dark Mode

**⚠️ CRITICAL**: All UI changes MUST support both light and dark modes. The extension includes a comprehensive dark mode theme that users can toggle.

### How Dark Mode Works

The extension uses a **CSS variable-based theming system**:

1. **Theme Toggle**: Users can switch themes via the 🌙 button (top-right of popup/options pages)
2. **Theme State**: Stored in `localStorage` as `theme: 'light' | 'dark'`
3. **Theme Application**: JavaScript sets `data-theme="dark"` attribute on `<html>` element
4. **CSS Variables**: All colors reference CSS variables that change based on theme

### CSS Variable System

**Location**: Defined in `<style>` section of `popup.html` and `options.html`

**Light Mode (Default)**:
```css
:root {
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;
    --bg-tertiary: #e9ecef;
    --text-primary: #212529;
    --text-secondary: #6c757d;
    --border-color: #dee2e6;
    --button-bg: #007bff;
    --success: #28a745;
    --warning: #ffc107;
    --danger: #dc3545;
    /* ... */
}
```

**Dark Mode**:
```css
[data-theme="dark"] {
    --bg-primary: #0A0A0B;
    --bg-secondary: #18181B;
    --bg-tertiary: #27272A;
    --text-primary: #F4F4F5;
    --text-secondary: #A1A1AA;
    --border-color: rgba(244, 244, 245, 0.1);
    --berkeley-blue: #003262;
    --california-gold: #FDB515;
    /* ... */
}
```

### Rules for Adding/Modifying UI Elements

**✅ DO:**
1. **Use CSS variables for all colors**:
   ```css
   .my-element {
       background: var(--bg-secondary);
       color: var(--text-primary);
       border: 1px solid var(--border-color);
   }
   ```

2. **Add dark mode overrides for hardcoded colors**:
   ```css
   .special-box {
       background: #f8f9fa;  /* Light mode */
   }

   [data-theme="dark"] .special-box {
       background: var(--bg-tertiary);
       border: 1px solid var(--border-color);
   }
   ```

3. **Use semantic CSS classes instead of inline styles**:
   ```js
   // ✅ Good
   div.className = 'empty-state-message';

   // ❌ Bad
   div.style.cssText = 'background: #f8f9fa; color: #666;';
   ```

4. **Test both themes** after any UI change:
   - Toggle dark mode (🌙 button)
   - Verify all elements have proper backgrounds/text colors
   - Check for "white boxes" in dark mode

**❌ DON'T:**
1. **Hardcode light colors without dark mode overrides**:
   ```css
   /* ❌ Bad - will be white in dark mode */
   .box { background: #ffffff; }

   /* ✅ Good */
   .box { background: var(--bg-primary); }
   ```

2. **Use inline styles for colors in JavaScript**:
   ```js
   // ❌ Bad
   element.style.background = '#f8f9fa';

   // ✅ Good - use CSS class
   element.classList.add('light-background');
   ```

3. **Assume a single color scheme** - always consider both themes

### Common Dark Mode Patterns

**Empty State Messages**:
```css
.empty-state-message {
    background: #f8f9fa;
    color: #666;
}

[data-theme="dark"] .empty-state-message {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
}
```

**Input Fields**:
```css
[data-theme="dark"] input[type="text"],
[data-theme="dark"] select {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--border-color);
}
```

**Colored Accent Boxes** (warnings, info, success):
```css
.warning-box {
    background: #fff3cd;
    border-left: 4px solid #ffc107;
}

[data-theme="dark"] .warning-box {
    background: rgba(255, 193, 7, 0.15);
    border-left-color: var(--warning);
    border: 1px solid rgba(255, 193, 7, 0.3);
}
```

### Testing Dark Mode

**Console Helpers**:
- `localStorage.setItem('theme', 'dark')` + refresh
- Toggle button in UI (🌙 icon, top-right)

**What to Check**:
1. No white boxes on dark backgrounds
2. Text is readable (sufficient contrast)
3. Borders are visible but subtle
4. Buttons maintain visual hierarchy
5. Form inputs don't look broken
6. Icons/emojis remain visible

**Files to Update** when adding new UI:
- `src/popup.html` - Popup dark mode styles
- `src/options.html` - Options page dark mode styles
- CSS variables section (`[data-theme="dark"]`)

## Privacy & Security

- **No external servers**: All processing in browser
- **No analytics/tracking**: Zero telemetry
- **Minimal permissions**: Only `storage`, `identity`, `alarms`, `scripting`
- **OAuth scopes**: Only `calendar` scope requested
- **Open source**: Publicly auditable code

## Key Files Reference

- `src/contentScript.js`: Assignment extraction coordinator
- `src/background.js`: Service worker - auth + calendar API + auto-sync + smart sync
- `src/utils/assignmentParser.js`: Assignment parsing from Gradescope DOM
- `src/utils/gradeExtractor.js`: Basic extraction utilities and calendar filtering
- `src/utils/dateParser.js`: Due date parsing and timezone detection
- `src/utils/feedbackBanner.js`: User feedback/review banner logic (post-usage prompt)
- `src/utils/pageDetector.js`: Gradescope page type detection
- `src/utils/testFunctions.js`: Debug and testing utilities
- `src/utils/pinBannerInjector.js`: Pin to toolbar reminder banner injection
- `src/utils/icalGenerator.js`: RFC 5545 iCalendar format generation
- `src/auth/`: Authentication modules (Chrome native + PKCE OAuth + smart sync)
  - `authenticationManager.js`: OAuth authentication
  - `tokenManager.js`: Token lifecycle management
  - `calendarAPIClient.js`: Calendar API wrapper + reminder/display settings application
  - `eventCache.js`: Performance caching layer
  - `autoSyncManager.js`: 24-hour automatic sync scheduling
  - `smartSyncManager.js`: Smart sync on extraction (instant sync for new assignments)
- `src/popup/`: Popup UI modules (calendar, settings, theme)
  - `popup-main.js`: Popup initialization and module coordination
  - `popup-calendar.js`: Calendar sync UI and controls
  - `popup-ical.js`: iCal export UI module
  - `popup-storage.js`: Storage utilities for popup
  - `popup-tabs.js`: Tab navigation for popup interface
  - `popup-theme.js`: Dark mode toggle for popup
- `src/popup.html`: Popup interface with extraction and sync controls
- `src/popup.css`: Dark mode compatible popup styling
- `src/options/`: Options page modules (settings, pin prompts, theme)
  - `options-main.js`: Options page initialization
  - `options-settings.js`: Settings management including reminder schedule, custom reminders, and display timing
  - `options-tabs.js`: Tab navigation for options page
  - `options-theme.js`: Dark mode toggle implementation
  - `options-pin-prompt.js`: Pin to toolbar onboarding
- `src/options.html`: Options page UI with Event Appearance section (colors, reminders, display timing)
- `src/options.css`: Dark mode compatible styling including reminder/display timing UI
- `src/welcome.html`: First-time user onboarding page
- `src/welcome.js`: Onboarding flow logic and tutorial
- `src/manifest.json`: Extension metadata + permissions
- `prepare-release.ps1`: PowerShell script to package releases

## Release Process

1. Update version in `manifest.json`
2. Run `prepare-release.ps1` to create production ZIP
3. Test the packaged extension
4. Upload to Chrome Web Store
5. Create GitHub release with ZIP file

## Testing Checklist

When making changes, test:
1. Dashboard extraction (multiple courses)
2. Individual course page extraction
3. Calendar event creation
4. Event deduplication (re-sync same assignments)
5. **First-time sync** (extract assignments → connect calendar → immediate sync)
6. 24-hour auto-sync trigger
7. Smart sync on extraction (instant sync for new assignments)
8. Smart sync rate limiting (60-minute cooldown)
9. OAuth authentication flow
10. Token refresh on expiration
11. Cross-browser compatibility (Chrome-based browsers)
12. **Event Appearance Settings**:
    - Color picker selection and persistence
    - Reminder schedule options (none, single, double, custom)
    - Custom reminder builder (add, edit, delete reminders)
    - Display timing (deadline vs all-day events)
    - Settings save and load correctly
    - Dark mode styling for all new UI elements
13. **Calendar Event Customization**:
    - Events created with correct color
    - Reminders match selected schedule
    - Timed events show correct deadline time
    - All-day events appear at top of calendar
    - All-day event reminders converted to day-of notifications
14. **iCal Export**:
    - Export generates valid .ics file
    - **RFC 5545 validation**: File passes iCal validators with zero errors
    - **UTC format**: Timed events use UTC (Z suffix), no VTIMEZONE components
    - Imports successfully into Outlook, Apple Calendar, Google Calendar
    - **Title format consistency**: Events use `Course: Assignment` format (matches Google Calendar API)
    - **Description formatting**: Newlines render properly (not as literal `\n` characters)
    - **Outlook link accessibility**: LOCATION field shows URL, directly clickable without opening event
    - **Multiple URL placements**: Verify URL in LOCATION, URL property, and description
    - Reminders match user's selected schedule
    - Display timing (timed vs all-day) matches user preferences
    - Warning message is clear and visible
    - Export button shows correct assignment count
    - Dark mode styling works correctly

## Version History

- **v1.9.1**: Firefox compatibility fix for iCal export
  - **CRITICAL FIX**: Changed popup to use `browser.runtime.sendMessage` instead of `chrome.runtime.sendMessage`
  - Fixed background script to use hybrid callback pattern (sendResponse + return true)
  - Added null safety checks for message responses in popup
  - iCal export now works correctly on Firefox temporary extensions (about:debugging)
  - Updated documentation with comprehensive Firefox compatibility guidelines
- **v1.9.0**: iCal export feature for Outlook, Apple Calendar, and other calendar apps
  - RFC 5545 compliant .ics file generation with UTC format
  - Enhanced Outlook link accessibility (URL in LOCATION field)
  - Title format consistency with Google Calendar API events
  - Proper description newline formatting
  - Respects all user preferences (reminders, display timing, colors)
- **v1.8.0**: Modular architecture refactor, improved pin detection, smart sync on extraction
- **v1.7.0**: Added dark mode support and theme system
- **v1.6.0**: Enhanced auto-sync with 24-hour intervals
- **v1.5.1**: Initial stable release with calendar sync

## License

MIT License - Open source and free to fork/improve.

## Support

- **Issues**: [GitHub Issues](https://github.com/Matut-E/gradescope-to-Cal/issues)
- **Email**: gradescope.to.cal@gmail.com
- **Chrome Web Store**: [Extension Link](https://chromewebstore.google.com/detail/gradescope-to-cal/bbepekfgnpdfclkpfoojmfclnbkkbbco)
