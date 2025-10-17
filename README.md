# Gradescope to Cal

A privacy-first browser extension that automatically syncs UC Berkeley Gradescope assignments to Google Calendar.

## Features

- **Automatic dashboard discovery**: Extracts all assignments from all enrolled courses
- **Intelligent sync**: First-time instant sync, daily background updates, and manual sync on-demand
- **Calendar events**: Creates events with assignment details and direct links
- **Smart deduplication**: Prevents duplicate events for the same assignments
- **Zero-server architecture**: All processing happens locally in your browser
- **Cross-browser support**: Chrome (Manifest v3) compatible

## Privacy First

- **No external servers**: All data processing occurs locally in your browser
- **No data collection**: We never see your assignments, grades, or personal information
- **Direct API integration**: Your data goes directly from your browser to Google Calendar
- **Minimal permissions**: Only accesses Gradescope and Google Calendar APIs
- **Open source**: Full transparency - inspect the code yourself

## Installation

### From Chrome Web Store (Recommended)
[Install from Chrome Web Store](https://chromewebstore.google.com/detail/gradescope-to-cal/bbepekfgnpdfclkpfoojmfclnbkkbbco)

## How It Works

1. **One-time setup**: Install the extension and connect your Google Calendar via secure OAuth authentication
2. **Automatic extraction**: Visit any Gradescope page - assignments are automatically discovered and extracted
3. **Instant first sync**: On first authentication, all extracted assignments immediately sync to your calendar
4. **Stay updated**: Daily automatic background sync keeps your calendar current with new assignments
5. **Cross-device access**: Calendar events sync to all your devices via Google Calendar

## Development Status

- [x] Competitive analysis and architecture planning
- [x] Gradescope assignment data extraction (dashboard + individual courses)
- [x] Google Calendar API integration with OAuth 2.0
- [x] Background sync automation (daily intervals + smart detection)
- [x] Rich calendar event creation with assignment metadata
- [x] Smart deduplication and error handling
- [x] Cross-browser compatibility (Chrome/Chromium-based)
- [x] Privacy policy and Chrome Web Store preparation
- [x] Chrome Web Store publication 

## Technical Architecture

- **Content Scripts**: Extract assignment data from Gradescope pages
- **Background Service Worker**: Handles OAuth authentication and calendar sync
- **Local Storage**: Stores assignment data and user preferences in browser
- **Google Calendar API v3**: Creates and manages calendar events
- **Zero external dependencies**: No servers, databases, or third-party services

## Current Limitations

- **Assignment discovery**: Requires visiting Gradescope pages to detect new assignments (auto-extracts on page load)
- **Course coverage**: Works with standard Gradescope course layouts
- **Authentication**: Requires Google account with Calendar access

## Privacy Policy

Full privacy policy available at: [Privacy Policy](https://matut-e.github.io/gradescope-to-Cal/privacy-policy.html)

## Support

- **Issues**: Report bugs via [GitHub Issues](../../issues)
- **Email**: gradescope.to.cal@gmail.com
- **Primary audience**: UC Berkeley students, usable by all Gradescope users worldwide

## Development

### Prerequisites
- Chrome/Chromium browser
- Google Cloud Console project with Calendar API enabled
- Basic understanding of browser extension development

### Setup
1. Clone this repository
2. Update `CLIENT_ID` in `background.js` with your Google OAuth client ID
3. Load extension in developer mode
4. Test with your actual Gradescope courses

### Contributing
Contributions welcome! Please read the code to understand the privacy-first architecture before making changes.

## License

MIT License - feel free to fork and improve!

## Acknowledgments

Built for UC Berkeley students. Usable by all Gradescope users. Inspired by the need for better assignment tracking without compromising privacy.
