# Gradescope-To-Cal

A privacy-first browser extension that automatically syncs UC Berkeley Gradescope assignments to Google Calendar.

## Features

- **Automatic dashboard discovery**: Extracts all assignments from all enrolled courses
- **Background sync**: Checks for new assignments every 30 minutes
- **All-day calendar events**: Creates prominent events with assignment details and direct links
- **Smart deduplication**: Prevents duplicate events for the same assignments
- **Zero-server architecture**: All processing happens locally in your browser
- **Cross-browser support**: Chrome (Manifest v3) and Firefox (Manifest v2) compatible

## Privacy First

- **No external servers**: All data processing occurs locally in your browser
- **No data collection**: We never see your assignments, grades, or personal information
- **Direct API integration**: Your data goes directly from your browser to Google Calendar
- **Minimal permissions**: Only accesses Gradescope and Google Calendar APIs
- **Open source**: Full transparency - inspect the code yourself

## Installation

### From Chrome Web Store (Recommended)
*Coming soon - currently in review process*

### Manual Installation (Current)
1. Download the latest release from [Releases](../../releases)
2. Extract the ZIP file
3. Open Chrome → Extensions → Enable Developer Mode
4. Click "Load Unpacked" and select the `src` folder
5. Navigate to Gradescope and authenticate with Google Calendar when prompted

### Firefox Installation
Use the `firefox_manifest.json` file and follow Firefox's extension loading process.

## How It Works

1. **One-time setup**: Connect your Google Calendar via OAuth authentication
2. **Visit Gradescope**: Go to your dashboard or course pages as you normally would
3. **Automatic sync**: Every 30 minutes, newly discovered assignments appear in your calendar
4. **Cross-device access**: Calendar events sync to all your devices via Google Calendar

## Development Status

- [x] Competitive analysis and architecture planning
- [x] Gradescope assignment data extraction (dashboard + individual courses)
- [x] Google Calendar API integration with OAuth 2.0
- [x] Background sync automation (30-minute intervals)
- [x] Rich calendar event creation with assignment metadata
- [x] Smart deduplication and error handling
- [x] Cross-browser compatibility (Chrome/Firefox)
- [x] Privacy policy and Chrome Web Store preparation
- [ ] Chrome Web Store publication (in review)

## Technical Architecture

- **Content Scripts**: Extract assignment data from Gradescope pages
- **Background Service Worker**: Handles OAuth authentication and calendar sync
- **Local Storage**: Stores assignment data and user preferences in browser
- **Google Calendar API v3**: Creates and manages calendar events
- **Zero external dependencies**: No servers, databases, or third-party services

## Current Limitations

- **Assignment discovery**: Requires visiting Gradescope pages to detect new assignments
- **Course coverage**: Works with standard Gradescope course layouts
- **Authentication**: Requires Google account with Calendar access

## Privacy Policy

Full privacy policy available at: [Privacy Policy](https://matut-e.github.io/gradescope-to-Cal/privacy-policy.html)

## Support

- **Issues**: Report bugs via [GitHub Issues](../../issues)
- **Email**: gradescope.to.cal@gmail.com
- **Target users**: UC Berkeley students using Gradescope

## Development

### Prerequisites
- Chrome/Firefox browser
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
