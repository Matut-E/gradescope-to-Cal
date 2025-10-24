#!/usr/bin/env node

/**
 * Build Script for Gradescope to Cal Extension
 * Supports both Chrome (MV3) and Firefox (MV2) builds
 *
 * Usage:
 *   npm run build           # Build both Chrome and Firefox
 *   npm run build:chrome    # Build Chrome only
 *   npm run build:firefox   # Build Firefox only
 *   npm run clean           # Clean build directories (preserves versioned builds)
 */

const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

// Paths
const SRC_DIR = path.join(__dirname, '../src');
const PLATFORM_DIR = path.join(__dirname, '../platform');
const BUILD_DIR = path.join(__dirname, '../build');

// Junk files to exclude from builds
const JUNK_FILES = [
    '.DS_Store',
    'Thumbs.db',
    '.backup',
    '.tmp',
    '.swp',
    '~',
    '.git',
    '.gitignore',
    'desktop.ini',
    '.localized'
];

/**
 * Check if a file should be excluded from the build
 */
function shouldExclude(filename) {
    return JUNK_FILES.some(junk =>
        filename === junk ||
        filename.endsWith(junk) ||
        filename.startsWith('.')
    );
}

/**
 * Copy source files to build directory, filtering out junk files
 */
async function copySourceFiles(targetDir) {
    console.log(`📦 Copying source files to ${path.basename(targetDir)}...`);

    await fs.ensureDir(targetDir);

    // Copy all files from src/ to target, filtering junk files
    const files = await fs.readdir(SRC_DIR);

    for (const file of files) {
        if (shouldExclude(file)) {
            console.log(`   ⏭️  Skipped: ${file}`);
            continue;
        }

        const srcPath = path.join(SRC_DIR, file);
        const destPath = path.join(targetDir, file);

        const stat = await fs.stat(srcPath);
        if (stat.isDirectory()) {
            await fs.copy(srcPath, destPath, {
                filter: (src) => {
                    const basename = path.basename(src);
                    return !shouldExclude(basename);
                }
            });
        } else {
            await fs.copy(srcPath, destPath);
        }
    }

    console.log('   ✅ Source files copied');
}

/**
 * Copy platform-specific manifest
 */
async function copyManifest(platform, targetDir) {
    console.log(`📋 Copying ${platform} manifest...`);

    const manifestSrc = path.join(PLATFORM_DIR, platform, 'manifest.json');
    const manifestDest = path.join(targetDir, 'manifest.json');

    if (!await fs.pathExists(manifestSrc)) {
        throw new Error(`Manifest not found: ${manifestSrc}`);
    }

    await fs.copy(manifestSrc, manifestDest);
    console.log('   ✅ Manifest copied');
}

/**
 * Copy WebExtension Polyfill for cross-browser compatibility
 */
async function copyPolyfill(targetDir) {
    console.log(`📚 Copying WebExtension Polyfill...`);

    const polyfillSrc = path.join(__dirname, '../node_modules/webextension-polyfill/dist/browser-polyfill.min.js');
    const polyfillDest = path.join(targetDir, 'lib/browser-polyfill.js');

    if (!await fs.pathExists(polyfillSrc)) {
        throw new Error(`Polyfill not found: ${polyfillSrc}. Run 'npm install' first.`);
    }

    await fs.ensureDir(path.join(targetDir, 'lib'));
    await fs.copy(polyfillSrc, polyfillDest);
    console.log('   ✅ Polyfill copied');
}

/**
 * Read version from manifest
 */
async function getVersion(platform) {
    const manifestPath = path.join(PLATFORM_DIR, platform, 'manifest.json');
    const manifest = await fs.readJson(manifestPath);
    return manifest.version;
}

/**
 * Create versioned release folder and ZIP
 */
async function createRelease(platform) {
    const version = await getVersion(platform);
    const releaseName = `gradescope-to-cal-${platform}-v${version}`;
    const releaseDir = path.join(BUILD_DIR, releaseName);
    const zipPath = path.join(BUILD_DIR, `${releaseName}.zip`);

    console.log(`📦 Creating versioned release: ${releaseName}`);

    // Copy from working build directory to versioned directory
    const workingDir = path.join(BUILD_DIR, platform);
    await fs.copy(workingDir, releaseDir);
    console.log(`   ✅ Created ${releaseDir}`);

    // Create ZIP archive
    console.log(`🗜️  Creating ZIP archive...`);
    await createZip(releaseDir, zipPath);
    console.log(`   ✅ Created ${zipPath}`);

    return { releaseDir, zipPath };
}

/**
 * Create ZIP archive from directory
 */
function createZip(sourceDir, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

/**
 * Build for specific platform
 */
async function buildPlatform(platform) {
    console.log('');
    console.log('═'.repeat(80));
    console.log(`🚀 Building ${platform.toUpperCase()} version`);
    console.log('═'.repeat(80));

    const targetDir = path.join(BUILD_DIR, platform);

    // Copy source files
    await copySourceFiles(targetDir);

    // Copy platform-specific manifest
    await copyManifest(platform, targetDir);

    // Copy WebExtension Polyfill for cross-browser compatibility
    await copyPolyfill(targetDir);

    // Create versioned release
    const { releaseDir, zipPath } = await createRelease(platform);

    console.log('');
    console.log('✅ Build complete!');
    console.log(`   Working build: ${targetDir}`);
    console.log(`   Release folder: ${releaseDir}`);
    console.log(`   Release ZIP: ${zipPath}`);
    console.log('');
}

/**
 * Clean build directories (only working builds, not versioned releases)
 */
async function clean() {
    console.log('🧹 Cleaning build directories...');

    const chromeBuild = path.join(BUILD_DIR, 'chrome');
    const firefoxBuild = path.join(BUILD_DIR, 'firefox');

    if (await fs.pathExists(chromeBuild)) {
        await fs.remove(chromeBuild);
        console.log('   ✅ Removed build/chrome/');
    }

    if (await fs.pathExists(firefoxBuild)) {
        await fs.remove(firefoxBuild);
        console.log('   ✅ Removed build/firefox/');
    }

    console.log('');
    console.log('ℹ️  Versioned builds preserved (e.g., gradescope-to-cal-chrome-v1.8.5/)');
    console.log('');
}

/**
 * Main build function
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || '--all';

    try {
        switch (command) {
            case '--chrome':
                await buildPlatform('chrome');
                break;

            case '--firefox':
                await buildPlatform('firefox');
                break;

            case '--all':
                await buildPlatform('chrome');
                await buildPlatform('firefox');
                break;

            case '--clean':
                await clean();
                break;

            default:
                console.error(`Unknown command: ${command}`);
                console.error('Usage: node build.js [--chrome|--firefox|--all|--clean]');
                process.exit(1);
        }

        console.log('🎉 All done!');

    } catch (error) {
        console.error('');
        console.error('❌ Build failed:');
        console.error('   ', error.message);
        console.error('');
        console.error('Stack trace:');
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the build
main();
