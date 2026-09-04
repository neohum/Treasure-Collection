// scripts/verify-index.js
const fs = require('fs');
const path = require('path');

console.log('--- Verifying index.html PWA, Classroom & UI Icons Standard ---');
let allPassed = true;

const indexPath = path.join(__dirname, '..', 'index.html');
if (!fs.existsSync(indexPath)) {
    console.error('❌ index.html not found');
    process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');

// 1. Check for legacy FontAwesome
if (html.includes('font-awesome') || html.includes('fa-solid') || html.includes('fa-')) {
    console.error('❌ Found legacy FontAwesome references. AGENTS.md mandates Flaticon UIcons (fi fi-rr-*) only!');
    allPassed = false;
} else {
    console.log('✓ Zero FontAwesome references found (Compliant with AGENTS.md)');
}

// 2. Check for Flaticon UIcons stylesheet
if (!html.includes('uicons-regular-rounded.css')) {
    console.error('❌ Missing Flaticon UIcons regular rounded stylesheet link');
    allPassed = false;
} else {
    console.log('✓ Flaticon UIcons regular rounded stylesheet linked');
}

// 3. Check for PWA tags
const pwaChecks = [
    '<link rel="manifest" href="manifest.webmanifest">',
    'name="theme-color"',
    'name="apple-mobile-web-app-capable"',
    'serviceWorker.register',
    'beforeinstallprompt'
];

pwaChecks.forEach(check => {
    if (!html.includes(check)) {
        console.error(`❌ Missing PWA feature: ${check}`);
        allPassed = false;
    } else {
        console.log(`✓ PWA feature present: ${check}`);
    }
});

// 4. Check for Google Classroom integration functions
const classroomChecks = [
    'shareToGoogleClassroom',
    'copySubmissionSummary',
    'classroom.google.com/share',
    'print-only',
    'exportDataJson',
    'importDataJson'
];

classroomChecks.forEach(check => {
    if (!html.includes(check)) {
        console.error(`❌ Missing Google Classroom / Education feature: ${check}`);
        allPassed = false;
    } else {
        console.log(`✓ Google Classroom / Education feature present: ${check}`);
    }
});

if (allPassed) {
    console.log('🎉 AC-1 Passed: index.html fully verified for PWA, Classroom, and UI icons standard.');
    process.exit(0);
} else {
    console.error('❌ index.html verification failed.');
    process.exit(1);
}
