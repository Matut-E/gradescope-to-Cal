# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gradescope to Cal (Public Version)** is the open-source, MIT-licensed version of the browser extension that syncs UC Berkeley Gradescope assignments to Google Calendar. This is the production-ready version published on the Chrome Web Store.

**Key characteristics**:
- **Open source**: MIT licensed, publicly available
- **Core features only**: Calendar sync functionality without premium grade calculator
- **Production version**: v1.5.1 on Chrome Web Store
- **Privacy-first**: Zero-server architecture, all processing in browser

## Core Features (Public Repo Scope)

This repository contains:

1. **Assignment Extraction**: Extracts assignments from Gradescope dashboard and course pages
2. **Google Calendar Integration**: OAuth 2.0 authentication and Calendar API v3 integration
3. **Background Auto-Sync**: 24-hour interval automatic syncing with alarms
4. **All-Day Calendar Events**: Creates visible events with assignment details and Gradescope links
5. **Smart Deduplication**: Uses extended properties to prevent duplicate events

**What's NOT in this repo**:
- Comprehensive grade calculator (premium feature in dev repo)
- Assignment categorization system
- Weighted grade calculations
- Berkeley course templates
- Grade configuration interface

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
   - Implements auto-sync alarms (24-hour intervals)
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

- `assignments_<method>_<timestamp>`: Assignment data ready for calendar sync
  - `assignments`: Array of upcoming, unsubmitted assignments
  - `allAssignments`: All extracted assignments

- `authToken`, `refreshToken`, `tokenExpiry`: OAuth tokens
- `autoSyncEnabled`, `autoSyncInterval`, `lastAutoSync`: Auto-sync state
- `eventCache`: In-memory cache of calendar events for deduplication

## Key Implementation Details

### Authentication Strategy

- **Chrome/Chromium**: `chrome.identity.getAuthToken()` (native, fast)
- **Other browsers**: PKCE OAuth flow with refresh tokens
- Extension ID → Client ID mapping in `CONFIG.CHROME_EXTENSION_CLIENTS`
- Automatic token refresh on expiration

### Calendar Event Format

All events created as **all-day events**:
```js
{
  summary: "[Course] Assignment Title",
  start: { date: "2025-01-20" },
  end: { date: "2025-01-20" },
  description: "Assignment details + Gradescope link",
  extendedProperties: {
    private: { gradescope_assignment_id: "123456" }
  }
}
```

Deduplication via `gradescope_assignment_id` in extended properties.

### Assignment Extraction Logic

**Dashboard Extraction**:
- Detects current semester from `.courseList--term`
- Extracts courses from `.courseBox` elements
- Parallel fetches all course pages
- Filters for upcoming, unsubmitted assignments

**Course Page Extraction**:
- Parses `<table>` rows for assignments
- Extracts: title, due date, submission status
- Converts dates to ISO format for calendar events

### Event Cache Performance

`EventCache` class reduces API calls:
- Full refresh every 10 minutes
- In-memory Map of `assignmentId → eventId`
- Fallback to direct API search on cache miss
- Handles up to 1000 events

### Auto-Sync Flow

1. Alarm triggers every 24 hours
2. Background script fetches stored assignments
3. Checks for new assignments via event cache
4. Creates calendar events for new assignments
5. Updates `lastAutoSync` timestamp

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

## Privacy & Security

- **No external servers**: All processing in browser
- **No analytics/tracking**: Zero telemetry
- **Minimal permissions**: Only `storage`, `identity`, `alarms`, `scripting`
- **OAuth scopes**: Only `calendar` scope requested
- **Open source**: Publicly auditable code

## Key Files Reference

- `src/contentScript.js`: Assignment extraction from Gradescope pages
- `src/background.js`: Service worker - auth + calendar API + auto-sync
- `src/popup.js`: Extension UI with manual sync controls
- `src/manifest.json`: Extension metadata + permissions
- `prepare-release.ps1`: PowerShell script to package releases
- `dist/v1.5.1/`: Production build for Chrome Web Store

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
5. Auto-sync trigger after 24 hours
6. OAuth authentication flow
7. Token refresh on expiration
8. Cross-browser compatibility (Chrome-based browsers)

## Relationship to Dev Repo

- **This repo (public)**: Open source, calendar sync only, v1.5.1
- **Dev repo (private)**: Contains premium features (grade calculator, categorization, etc.)

Code changes flow: Dev repo → Public repo (feature releases without premium functionality)

## License

MIT License - Open source and free to fork/improve.

## Support

- **Issues**: [GitHub Issues](https://github.com/Matut-E/gradescope-to-Cal/issues)
- **Email**: gradescope.to.cal@gmail.com
- **Chrome Web Store**: [Extension Link](https://chromewebstore.google.com/detail/gradescope-to-cal/bbepekfgnpdfclkpfoojmfclnbkkbbco)
