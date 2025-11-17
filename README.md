# Gradescope to Cal

A privacy-first browser extension that automatically syncs Gradescope assignments to Google Calendar.

**Current Version: v1.9.1** — Available on Chrome Web Store & Firefox Add-ons

## Features

### Core Functionality
- **Automatic dashboard discovery**: Extracts all assignments from all enrolled courses
- **Four intelligent sync mechanisms**:
  - **First-time sync**: Immediate sync when you first connect your calendar
  - **Manual sync**: User-triggered sync on-demand
  - **24-hour auto-sync**: Scheduled background updates (configurable)
  - **Smart sync on extraction**: Instant sync when new assignments detected (60-min cooldown)
- **Smart deduplication**: Prevents duplicate events for the same assignments
- **Upcoming assignments only**: Automatically filters out past assignments to keep your calendar clean

### Calendar Integration
- **Google Calendar sync**: Creates rich calendar events with assignment details and direct Gradescope links
- **iCal export**: One-time export for Outlook, Apple Calendar, and other calendar apps
  - RFC 5545 compliant .ics files
  - Enhanced Outlook compatibility with clickable links
  - Respects all your customization preferences

### Event Customization
- **Event colors**: Choose from 11 Google Calendar colors to match your style
- **Flexible reminders**:
  - None, single (1 day), double (1 day + 1 hour), or custom (up to 3 reminders)
  - Customizable reminder timing to fit your workflow
- **Display timing**:
  - **Deadline time** (default): Shows event at actual due time (e.g., 11:59 PM)
  - **All-day event**: Shows at top of calendar for maximum visibility

### User Experience
- **Dark mode support**: Toggle between light and dark themes for comfortable viewing
- **Interactive onboarding**: First-time user tutorial to get you started quickly
- **Context-aware UI**: Smart interface that adapts to your current Gradescope page

### Privacy & Architecture
- **Zero-server architecture**: All processing happens locally in your browser
- **Cross-browser support**: Chrome/Chromium (Manifest v3) and Firefox compatible

## Privacy First

- **No external servers**: All data processing occurs locally in your browser
- **No data collection**: We never see your assignments, grades, or personal information
- **Direct API integration**: Your data goes directly from your browser to Google Calendar
- **Minimal permissions**: Only accesses Gradescope and Google Calendar APIs
- **Open source**: Full transparency, you can inspect the code yourself

## Installation

### Chrome/Chromium Browsers
[Install from Chrome Web Store](https://chromewebstore.google.com/detail/gradescope-to-cal/bbepekfgnpdfclkpfoojmfclnbkkbbco)

### Firefox
[Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/gradescope-to-cal/)

## How It Works

1. **One-time setup**: Install the extension and connect your Google Calendar via secure OAuth authentication
2. **Automatic extraction**: Visit any Gradescope page - assignments are automatically discovered and extracted
3. **Instant first sync**: On first authentication, all extracted assignments immediately sync to your calendar
4. **Stay updated automatically**: Four sync mechanisms keep your calendar current:
   - **First-time sync**: Immediate sync when you connect your calendar
   - **Manual sync**: Click "Sync to Calendar" button anytime
   - **24-hour auto-sync**: Daily background updates (can be disabled in settings)
   - **Smart sync**: Instant sync when new assignments are detected (60-min cooldown)
5. **Customize your events**: Set colors, reminders, and display timing in the options page
6. **Export if needed**: Generate iCal files for Outlook, Apple Calendar, or other calendar apps
7. **Cross-device access**: Calendar events sync to all your devices via Google Calendar

## Version History

### v1.9.2 (Current) - Bug Fixes
- Fixed visual bug with extracted assignment count and fixed first stage of redundant deduplication logic

### v1.9.1 - Firefox Compatibility
- Fixed Firefox compatibility for iCal export (message passing bug fix)

### v1.9.0 - iCal Export
- iCal export feature for Outlook, Apple Calendar, and other calendar apps
- RFC 5545 compliant .ics file generation with UTC format
- Enhanced Outlook link accessibility (URL in LOCATION field)
- Title format consistency with Google Calendar API events
- Proper description newline formatting

### v1.8.0 - Smart Sync & Architecture
- Modular architecture refactor for improved maintainability
- Improved pin detection for browser toolbar
- Smart sync on extraction (instant sync for new assignments)

### v1.7.0 - Dark Mode
- Added dark mode support with theme toggle
- CSS variable-based theming system
- Consistent dark mode across popup and options pages

### v1.6.0 - Enhanced Auto-Sync
- 24-hour auto-sync intervals with configurable settings
- Auto-sync toggle in options page

### v1.5.1 - Initial Public Release
- Chrome Web Store publication
- Core calendar sync functionality
- OAuth authentication and token management

## Development Status

- [x] Competitive analysis and architecture planning
- [x] Gradescope assignment data extraction (dashboard + individual courses)
- [x] Google Calendar API integration with OAuth 2.0
- [x] Background sync automation (daily intervals + smart detection)
- [x] Rich calendar event creation with assignment metadata
- [x] Smart deduplication and error handling
- [x] Event customization (colors, reminders, display timing)
- [x] Dark mode support with theme system
- [x] iCal export for non-Google calendar apps
- [x] Cross-browser compatibility (Chrome/Chromium + Firefox)
- [x] Privacy policy and web store preparation
- [x] Chrome Web Store & Firefox Add-ons publication 

## Technical Architecture

- **Content Scripts**: Extract assignment data from Gradescope pages with intelligent parsing
- **Background Service Worker**: Handles OAuth authentication, calendar sync, and auto-sync scheduling
- **Event Cache**: Performance layer with 10-minute refresh cycle, handles up to 1000 events
- **Dual Authentication Strategy**:
  - Chrome/Chromium: Native `chrome.identity.getAuthToken()` for fast authentication
  - Firefox: PKCE OAuth flow with refresh tokens
- **Local Storage**: Stores assignment data and user preferences in browser
- **Google Calendar API v3**: Creates and manages calendar events with extended properties for deduplication
- **iCal Generator**: RFC 5545 compliant .ics file generation for universal calendar compatibility
- **Zero external dependencies**: No servers, databases, or third-party services

## Current Limitations

- **Assignment discovery**: Requires visiting Gradescope pages to detect new assignments (auto-extracts on page load)
- **Course coverage**: Works with standard Gradescope course layouts
- **Google Calendar sync**: Requires Google account with Calendar access
- **iCal export**: One-time export without deduplication tracking (re-importing the same .ics file will create duplicates)

## Privacy Policy

Full privacy policy available at: [Privacy Policy](https://www.gs2cal.me/privacy-policy.html)

## Support

- **Issues**: Report bugs via [GitHub Issues](../../issues)
- **Email**: gradescope.to.cal@gmail.com
- **Primary audience**: Gradescope users worldwide

## Development

### Prerequisites
- Chrome/Chromium or Firefox browser
- Google Cloud Console project with Calendar API enabled
- Basic understanding of browser extension development (Manifest v3)

### Setup
1. Clone this repository
2. Update `CLIENT_ID` in `background.js` with your Google OAuth client ID
3. Load extension in developer mode:
   - **Chrome**: Extensions → Developer Mode → "Load unpacked" → select `src/` folder
   - **Firefox**: about:debugging → "This Firefox" → "Load Temporary Add-on" → select `manifest.json`
4. Test with your actual Gradescope courses

### Testing
When making changes, test:
- Dashboard extraction (multiple courses)
- Individual course page extraction
- Calendar event creation with custom colors/reminders
- All four sync mechanisms (first-time, manual, 24-hour, smart sync)
- iCal export functionality
- Dark mode toggle
- Cross-browser compatibility (Chrome + Firefox)

### Contributing
Contributions welcome! Please read the code to understand the privacy-first architecture before making changes.

## License

MIT License - feel free to fork and improve!

## Acknowledgments

Built for UC Berkeley students. Usable by all Gradescope users. Inspired by the need for better assignment tracking without compromising privacy.
