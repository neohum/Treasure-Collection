// scripts/serve.js
// Ultra-lightweight zero-dependency HTTP server for testing and local classroom delivery
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT_DIR = path.resolve(__dirname, '..');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
    // Parse URL & sanitize path
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let reqPath = decodeURIComponent(parsedUrl.pathname);

    if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
    }

    const safePath = path.normalize(path.join(ROOT_DIR, reqPath));

    // Security check: ensure path is within ROOT_DIR
    if (!safePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }

    fs.stat(safePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Headers for PWA and caching
        const headers = {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        };

        if (ext === '.webmanifest' || ext === '.json') {
            headers['Cache-Control'] = 'no-cache';
        } else if (safePath.endsWith('sw.js')) {
            headers['Service-Worker-Allowed'] = '/';
            headers['Cache-Control'] = 'no-cache';
        }

        res.writeHead(200, headers);
        const stream = fs.createReadStream(safePath);
        stream.pipe(res);
    });
});

if (require.main === module) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n======================================================`);
        console.log(`🏛️  5학년 역사 디지털 보물도감 PWA 서버 실행 중`);
        console.log(`🔗 로컬 주소:    http://localhost:${PORT}`);
        console.log(`📱 교실/크롬북:  http://0.0.0.0:${PORT}`);
        console.log(`======================================================\n`);
    });
}

module.exports = { server, PORT };
