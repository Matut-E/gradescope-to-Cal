# Fix background.js - move console logs after polyfill import
import re

with open('src/background.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the early console logs (lines 46-49)
content = re.sub(
    r"(ALARM_NAME: 'gradescope_auto_sync'\n};)\n\nconsole\.log\('🚀 Enhanced background script[^\n]+\n"
    r"console\.log\(`📱 Extension ID[^\n]+\n"
    r"console\.log\(`🔑 Chrome Client ID[^\n]+\n"
    r"console\.log\(`🌐 Web Client ID[^\n]+\n",
    r"\1\n",
    content
)

# Add the console logs after the importScripts block
content = re.sub(
    r"(console\.log\('✅ Firefox: Modules loaded via manifest\.json'\);\n})",
    r"\1\n\n// Log configuration AFTER polyfill is loaded\n"
    r"console.log('🚀 Enhanced background script with dual authentication loaded');\n"
    r"console.log(`📱 Extension ID: ${browser.runtime.id}`);\n"
    r"console.log(`🔑 Chrome Client ID: ${CONFIG.CHROME_EXTENSION_CLIENTS[browser.runtime.id] || 'not configured'}`);\n"
    r"console.log(`🌐 Web Client ID: ${CONFIG.WEB_CLIENT_ID}`);\n",
    content
)

with open('src/background.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Fixed background.js - console logs moved after polyfill import")
