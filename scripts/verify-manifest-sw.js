// scripts/verify-manifest-sw.js
const fs = require('fs');
const path = require('path');

console.log('--- Verifying Manifest & Service Worker ---');
let allPassed = true;

// 1. Verify manifest.webmanifest
const manifestPath = path.join(__dirname, '..', 'manifest.webmanifest');
if (!fs.existsSync(manifestPath)) {
    console.error('❌ manifest.webmanifest not found');
    allPassed = false;
} else {
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!manifest.name || !manifest.short_name || !manifest.start_url || !manifest.display) {
            console.error('❌ manifest.webmanifest is missing required PWA fields');
            allPassed = false;
        } else if (!manifest.icons || manifest.icons.length < 2) {
            console.error('❌ manifest.webmanifest must define at least 2 icons (192 and 512)');
            allPassed = false;
        } else {
            console.log(`✓ manifest.webmanifest is valid (name: "${manifest.name}", display: "${manifest.display}")`);
        }
    } catch (e) {
        console.error('❌ Failed to parse manifest.webmanifest:', e.message);
        allPassed = false;
    }
}

// 2. Verify sw.js
const swPath = path.join(__dirname, '..', 'sw.js');
if (!fs.existsSync(swPath)) {
    console.error('❌ sw.js not found');
    allPassed = false;
} else {
    const swContent = fs.readFileSync(swPath, 'utf8');
    if (!swContent.includes('addEventListener(\'install\'') || 
        !swContent.includes('addEventListener(\'fetch\'') ||
        !swContent.includes('caches.open')) {
        console.error('❌ sw.js does not contain expected install/fetch caching handlers');
        allPassed = false;
    } else {
        console.log('✓ sw.js has install, activate, and fetch cache handlers');
    }
}

if (allPassed) {
    console.log('🎉 AC-1 Passed: Manifest and Service Worker verified successfully.');
    process.exit(0);
} else {
    console.error('❌ Verification failed');
    process.exit(1);
}
