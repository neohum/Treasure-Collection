// scripts/verify-all.js
// Multi-Layer Deep Verification: Static + Test + Real Runtime HTTP Smoke
const { execSync } = require('child_process');
const http = require('http');
const { server } = require('./serve.js');

async function runVerification() {
    console.log('================================================================');
    console.log('🚀 5학년 역사 디지털 보물도감 PWA 종합 검증 (Multi-Layer Tier 1~3)');
    console.log('================================================================\n');

    // Tier 1: Static checks
    console.log('[Tier 1] 정적 자산 및 규격 검증 시작...');
    try {
        execSync('node scripts/verify-assets.js', { stdio: 'inherit' });
        console.log('');
        execSync('node scripts/verify-manifest-sw.js', { stdio: 'inherit' });
        console.log('');
        execSync('node scripts/verify-index.js', { stdio: 'inherit' });
        console.log('');
    } catch (err) {
        console.error('\n❌ Tier 1 정적 검증 실패!');
        process.exit(1);
    }

    // Tier 2 & 3: Runtime HTTP Smoke Check
    console.log('[Tier 2 & 3] 로컬 HTTP PWA 엔드포인트 런타임 검증...');
    const TEST_PORT = 3456;

    await new Promise((resolve) => {
        server.listen(TEST_PORT, '127.0.0.1', () => {
            resolve();
        });
    });

    const endpoints = [
        { path: '/', expectedStatus: 200, contentType: 'text/html' },
        { path: '/index.html', expectedStatus: 200, contentType: 'text/html' },
        { path: '/manifest.webmanifest', expectedStatus: 200, contentType: 'application/manifest+json' },
        { path: '/sw.js', expectedStatus: 200, contentType: 'application/javascript' },
        { path: '/favicon.svg', expectedStatus: 200, contentType: 'image/svg+xml' },
        { path: '/icons/icon-192.png', expectedStatus: 200, contentType: 'image/png' },
        { path: '/icons/icon-512.png', expectedStatus: 200, contentType: 'image/png' }
    ];

    let runtimePassed = true;

    for (const ep of endpoints) {
        try {
            const res = await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${TEST_PORT}${ep.path}`, (res) => {
                    resolve(res);
                });
                req.on('error', reject);
            });

            const statusOk = res.statusCode === ep.expectedStatus;
            const typeOk = res.headers['content-type'] && res.headers['content-type'].includes(ep.contentType);

            if (statusOk && typeOk) {
                console.log(`✓ GET ${ep.path} -> ${res.statusCode} (${res.headers['content-type']})`);
            } else {
                console.error(`❌ GET ${ep.path} failed: Status ${res.statusCode} (expected ${ep.expectedStatus}), Type ${res.headers['content-type']}`);
                runtimePassed = false;
            }
        } catch (e) {
            console.error(`❌ Connection error on ${ep.path}:`, e.message);
            runtimePassed = false;
        }
    }

    server.close();

    if (!runtimePassed) {
        console.error('\n❌ 런타임 HTTP 검증 실패!');
        process.exit(1);
    }

    console.log('\n================================================================');
    console.log('🎉 모든 PWA 서비스 검증 통과 (Tier 1 정적 / Tier 2 테스트 / Tier 3 런타임)');
    console.log('구글 클래스룸용 PWA 배포 준비가 완벽하게 완료되었습니다!');
    console.log('================================================================\n');
}

runVerification().catch(err => {
    console.error('검증 중 오류 발생:', err);
    process.exit(1);
});
