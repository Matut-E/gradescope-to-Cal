param(
    [switch]$SkipChecks
)

# Configuration
$SRC_DIR = "src"
$DIST_DIR = "dist"
$MANIFEST_FILE = "$SRC_DIR/manifest.json"
$PRODUCTION_CLIENT_ID = "589515007396-0frm2bh6mhobpqiuec8p2dlb2gs10gla.apps.googleusercontent.com"

# Colors for output
$RED = "Red"
$GREEN = "Green"
$YELLOW = "Yellow"
$CYAN = "Cyan"
$WHITE = "White"

Write-Host "🚀 Gradescope to Cal - Release Preparation Script" -ForegroundColor $CYAN
Write-Host "=" * 50 -ForegroundColor $CYAN

# Function to read JSON file
function Read-JsonFile {
    param($FilePath)
    try {
        return Get-Content $FilePath -Raw | ConvertFrom-Json
    }
    catch {
        Write-Host "❌ Error reading $FilePath`: $_" -ForegroundColor $RED
        exit 1
    }
}

# Function to prompt for Yes/No
function Prompt-YesNo {
    param($Question)
    do {
        $response = Read-Host "$Question (Y/N)"
        $response = $response.ToUpper()
    } while ($response -ne "Y" -and $response -ne "N")
    return $response -eq "Y"
}

# Check if we're in the right directory
if (-not (Test-Path $MANIFEST_FILE)) {
    Write-Host "❌ manifest.json not found in $SRC_DIR directory!" -ForegroundColor $RED
    Write-Host "Please run this script from the project root directory." -ForegroundColor $YELLOW
    exit 1
}

# Read manifest
Write-Host "📖 Reading manifest.json..." -ForegroundColor $CYAN
$manifest = Read-JsonFile $MANIFEST_FILE

# Extract current version
$currentVersion = $manifest.version
Write-Host "📋 Current version: $currentVersion" -ForegroundColor $GREEN

if (-not $SkipChecks) {
    # Check 1: Production Client ID
    Write-Host "`n🔍 STEP 1: Checking Production Client ID..." -ForegroundColor $CYAN
    
    $clientId = $manifest.oauth2.client_id
    Write-Host "Current client_id: $clientId"
    
    if ($clientId -eq $PRODUCTION_CLIENT_ID) {
        Write-Host "✅ Production client ID is correctly set!" -ForegroundColor $GREEN
    } else {
        Write-Host "⚠️  Current client ID does not match production ID" -ForegroundColor $YELLOW
        Write-Host "Expected: $PRODUCTION_CLIENT_ID" -ForegroundColor $YELLOW
        Write-Host "Found:    $clientId" -ForegroundColor $YELLOW
        
        if (-not (Prompt-YesNo "Do you want to continue anyway?")) {
            Write-Host "❌ Please update the client_id in manifest.json and try again." -ForegroundColor $RED
            exit 1
        }
    }

    # Check 2: Version Update Confirmation
    Write-Host "`n🔍 STEP 2: Version Update Confirmation..." -ForegroundColor $CYAN
    Write-Host "Current version in manifest: $currentVersion" -ForegroundColor $GREEN
    
    if (-not (Prompt-YesNo "Have you updated the version number for this release?")) {
        Write-Host "❌ Please update the version in manifest.json and try again." -ForegroundColor $RED
        exit 1
    }
}

# Check if dist directory exists
if (-not (Test-Path $DIST_DIR)) {
    Write-Host "📁 Creating dist directory..." -ForegroundColor $CYAN
    New-Item -ItemType Directory -Path $DIST_DIR | Out-Null
}

# Create release directory within dist
$releaseDir = "$DIST_DIR/v$currentVersion"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$releaseDirWithTime = "$DIST_DIR/v$currentVersion-$timestamp"

Write-Host "`n🔍 STEP 3: Creating Release Package..." -ForegroundColor $CYAN

# Check if version directory already exists
if (Test-Path $releaseDir) {
    Write-Host "⚠️  Version directory already exists: $releaseDir" -ForegroundColor $YELLOW
    $useTimestamp = Prompt-YesNo "Use timestamp in directory name to avoid conflict?"
    
    if ($useTimestamp) {
        $releaseDir = $releaseDirWithTime
    } else {
        if (-not (Prompt-YesNo "Overwrite existing directory?")) {
            Write-Host "❌ Release cancelled." -ForegroundColor $RED
            exit 1
        }
        Remove-Item $releaseDir -Recurse -Force
    }
}

# Create release directory
Write-Host "📁 Creating release directory: $releaseDir" -ForegroundColor $CYAN
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

# Files to include in release (exclude development files)
$filesToInclude = @(
    "manifest.json",
    "background.js", 
    "contentScript.js",
    "popup.html",
    "popup.js",
    "options.html", 
    "options.js",
    "icons"
)

# Copy files to release directory
Write-Host "📄 Copying extension files..." -ForegroundColor $CYAN

foreach ($file in $filesToInclude) {
    $sourcePath = "$SRC_DIR/$file"
    $destPath = "$releaseDir/$file"
    
    if (Test-Path $sourcePath) {
        if (Test-Path $sourcePath -PathType Container) {
            # It's a directory
            Copy-Item $sourcePath $destPath -Recurse -Force
            Write-Host "  ✅ Copied directory: $file" -ForegroundColor $GREEN
        } else {
            # It's a file
            Copy-Item $sourcePath $destPath -Force
            Write-Host "  ✅ Copied file: $file" -ForegroundColor $GREEN
        }
    } else {
        Write-Host "  ⚠️  File not found: $file" -ForegroundColor $YELLOW
    }
}

# Create zip file for Chrome Web Store in dist directory
$zipFileName = "gradescope-to-cal-v$currentVersion.zip"
$zipPath = "$DIST_DIR/$zipFileName"

Write-Host "`n📦 Creating Chrome Web Store package..." -ForegroundColor $CYAN
Write-Host "Zip file: $zipPath" -ForegroundColor $GREEN

# Remove existing zip if it exists
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Create zip (requires PowerShell 5.0+)
try {
    Compress-Archive -Path "$releaseDir/*" -DestinationPath $zipPath -Force
    Write-Host "✅ Zip file created successfully!" -ForegroundColor $GREEN
} catch {
    Write-Host "❌ Failed to create zip file: $_" -ForegroundColor $RED
    exit 1
}

# Get file size
$zipSize = (Get-Item $zipPath).Length / 1MB
$zipSizeMB = [math]::Round($zipSize, 2)

# Summary
Write-Host "`n🎉 RELEASE PACKAGE CREATED SUCCESSFULLY!" -ForegroundColor $GREEN
Write-Host "=" * 50 -ForegroundColor $GREEN
Write-Host "📋 Version: $currentVersion" -ForegroundColor $CYAN
Write-Host "📁 Release Directory: $releaseDir" -ForegroundColor $CYAN  
Write-Host "📦 Zip Package: $zipPath" -ForegroundColor $CYAN
Write-Host "📊 Package Size: $zipSizeMB MB" -ForegroundColor $CYAN

# Show contents of release
Write-Host "`n📄 Package Contents:" -ForegroundColor $CYAN
Get-ChildItem $releaseDir -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Replace("$PWD\$releaseDir\", "")
    if ($_.PSIsContainer) {
        Write-Host "  📁 $relativePath/" -ForegroundColor $YELLOW
    } else {
        Write-Host "  📄 $relativePath" -ForegroundColor $WHITE
    }
}

Write-Host "`n🚀 Ready for Chrome Web Store upload!" -ForegroundColor $GREEN
Write-Host "Upload the zip file: $zipPath" -ForegroundColor $CYAN

# Optional: Open dist folder
if (Prompt-YesNo "`nOpen dist folder in Explorer?") {
    Invoke-Item $DIST_DIR
}
