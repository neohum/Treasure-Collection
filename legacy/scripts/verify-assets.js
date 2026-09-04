// scripts/verify-assets.js
const fs = require('fs');
const path = require('path');

const requiredFiles = [
    'favicon.svg',
    'logo.svg',
    'favicon.ico',
    'apple-touch-icon.png',
    'og-image.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable.png',
    'icons/apple-touch-icon.png'
];

let allPassed = true;
console.log('--- Verifying Brand & PWA Assets ---');

requiredFiles.forEach(relPath => {
    const fullPath = path.join(__dirname, '..', relPath);
    if (!fs.existsSync(fullPath)) {
        console.error(`❌ Missing asset: ${relPath}`);
        allPassed = false;
    } else {
        const stats = fs.statSync(fullPath);
        if (stats.size === 0) {
            console.error(`❌ Empty asset file: ${relPath}`);
            allPassed = false;
        } else {
            console.log(`✓ ${relPath} (${stats.size} bytes)`);
        }
    }
});

if (allPassed) {
    console.log('🎉 AC-1 Passed: All brand and PWA assets verified successfully.');
    process.exit(0);
} else {
    console.error('❌ Verification failed: some assets are missing or invalid.');
    process.exit(1);
}
