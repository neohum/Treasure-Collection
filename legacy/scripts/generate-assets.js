// scripts/generate-assets.js
// Generates PWA icons, favicon, apple-touch-icon, and og-image in pure Node.js (zlib)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG chunks
function makeCrcTable() {
    let c;
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    return crcTable;
}
const crcTable = makeCrcTable();

function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
}

function createChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const typeAndData = buf.subarray(4, 8 + len);
    const crc = crc32(typeAndData);
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
}

function generatePng(width, height, pixelShader) {
    // PNG Header
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    // IHDR
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData.writeUInt8(8, 8); // 8-bit depth
    ihdrData.writeUInt8(6, 9); // RGBA
    ihdrData.writeUInt8(0, 10); // Compression
    ihdrData.writeUInt8(0, 11); // Filter
    ihdrData.writeUInt8(0, 12); // Interlace
    const ihdrChunk = createChunk('IHDR', ihdrData);

    // Scanlines
    const rawScanlines = Buffer.alloc(height * (1 + width * 4));
    let offset = 0;

    for (let y = 0; y < height; y++) {
        rawScanlines.writeUInt8(0, offset++); // Filter type: None
        for (let x = 0; x < width; x++) {
            const [r, g, b, a] = pixelShader(x, y, width, height);
            rawScanlines.writeUInt8(Math.max(0, Math.min(255, Math.round(r))), offset++);
            rawScanlines.writeUInt8(Math.max(0, Math.min(255, Math.round(g))), offset++);
            rawScanlines.writeUInt8(Math.max(0, Math.min(255, Math.round(b))), offset++);
            rawScanlines.writeUInt8(Math.max(0, Math.min(255, Math.round(a))), offset++);
        }
    }

    const compressedData = zlib.deflateSync(rawScanlines, { level: 9 });
    const idatChunk = createChunk('IDAT', compressedData);
    const iendChunk = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Shader for app icon: Deep slate navy background, rich amber-gold coin/box emblem with sparkles
function appIconShader(isMaskable = false) {
    return (x, y, w, h) => {
        const nx = x / w;
        const ny = y / h;
        const cx = 0.5;
        const cy = 0.5;
        const dx = nx - cx;
        const dy = ny - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Safe zone radius for maskable is 0.4 (80% diameter)
        const outerRadius = isMaskable ? 0.38 : 0.45;
        const innerRadius = outerRadius * 0.85;

        // Background color: Deep Slate 900 gradient (#0f172a to #1e293b)
        let r = 15 + ny * 15;
        let g = 23 + ny * 18;
        let b = 42 + ny * 25;
        let a = 255;

        // Outer golden glow / border
        if (dist <= outerRadius && dist > innerRadius) {
            // Gold ring
            const goldMix = (dist - innerRadius) / (outerRadius - innerRadius);
            r = 245 * (1 - goldMix * 0.2);
            g = 158 * (1 - goldMix * 0.1);
            b = 11;
        } else if (dist <= innerRadius) {
            // Inner vault / emblem background: Warm dark amber gradient
            r = 30 + (1 - ny) * 20;
            g = 25 + (1 - ny) * 15;
            b = 20;

            // Draw stylized treasure chest / crown silhouette
            // Chest base:
            const inChestX = Math.abs(dx) < (innerRadius * 0.55);
            const inChestY = (dy > -innerRadius * 0.15 && dy < innerRadius * 0.45);
            const inLid = (dy >= -innerRadius * 0.55 && dy <= -innerRadius * 0.15 && Math.abs(dx) < (innerRadius * 0.52));

            if (inChestY && inChestX) {
                // Chest body - rich golden amber
                const isBorder = (Math.abs(Math.abs(dx) - innerRadius * 0.55) < 0.02) || (Math.abs(dy - innerRadius * 0.45) < 0.02);
                const isLock = (Math.abs(dx) < innerRadius * 0.12 && Math.abs(dy - innerRadius * 0.1) < innerRadius * 0.12);
                if (isLock) {
                    r = 255; g = 255; b = 255; // lock highlight
                } else if (isBorder) {
                    r = 217; g = 119; b = 6;
                } else {
                    r = 245; g = 158; b = 11;
                }
            } else if (inLid) {
                // Chest curved lid
                const lidHeight = -innerRadius * 0.15 - dy;
                const maxLidY = innerRadius * 0.4;
                const lidCurve = 1 - Math.pow(dx / (innerRadius * 0.52), 2);
                if (lidHeight / maxLidY <= lidCurve) {
                    r = 251; g = 191; b = 36; // Amber-400
                }
            }

            // Top star / shine spark
            const sparkDist = Math.sqrt(Math.pow(dx + 0.15, 2) + Math.pow(dy + 0.18, 2));
            if (sparkDist < 0.04) {
                r = 255; g = 255; b = 255;
            }
        }

        return [r, g, b, a];
    };
}

// Shader for OG Social Preview (1200x630)
function ogImageShader(x, y, w, h) {
    const nx = x / w;
    const ny = y / h;

    // Dark sleek background
    let r = 15 + ny * 20;
    let g = 23 + ny * 25;
    let b = 42 + ny * 35;
    let a = 255;

    // Gold accent diagonal band in upper corner
    const diag = (nx * 0.8 + ny * 0.4);
    if (diag > 0.95 && diag < 1.05) {
        r = Math.min(255, r + 60);
        g = Math.min(255, g + 40);
        b = Math.min(255, b + 10);
    }

    // Left emblem badge circle
    const emblemCx = 0.25;
    const emblemCy = 0.5;
    const edx = (nx - emblemCx) * (w / h);
    const edy = (ny - emblemCy);
    const eDist = Math.sqrt(edx * edx + edy * edy);

    if (eDist < 0.3) {
        r = 245;
        g = 158;
        b = 11;
        if (eDist < 0.27) {
            r = 30;
            g = 41;
            b = 59;
            // Chest in emblem
            if (Math.abs(edx) < 0.12 && edy > -0.05 && edy < 0.12) {
                r = 251; g = 191; b = 36;
            }
        }
    }

    return [r, g, b, a];
}

// Generate SVG files
const faviconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <!-- Background rounded rect -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />
  <!-- Outer Gold Rim -->
  <circle cx="256" cy="256" r="196" fill="none" stroke="url(#goldGrad)" stroke-width="12" filter="url(#glow)" />
  <!-- Inner Coin Area -->
  <circle cx="256" cy="256" r="172" fill="#0b0f19" stroke="#d97706" stroke-width="4" />
  
  <!-- Treasure Chest Icon -->
  <g transform="translate(136, 146)">
    <!-- Lid -->
    <path d="M 20 80 Q 120 10 220 80 L 220 100 L 20 100 Z" fill="url(#goldGrad)" />
    <!-- Chest Box -->
    <rect x="20" y="105" width="200" height="115" rx="14" fill="#f59e0b" stroke="#b45309" stroke-width="6" />
    <!-- Metal Bands -->
    <rect x="65" y="105" width="22" height="115" fill="#78350f" opacity="0.4" />
    <rect x="153" y="105" width="22" height="115" fill="#78350f" opacity="0.4" />
    <!-- Lock Latch & Keyhole -->
    <rect x="105" y="95" width="30" height="40" rx="6" fill="#fef3c7" stroke="#b45309" stroke-width="4" />
    <circle cx="120" cy="110" r="5" fill="#78350f" />
    <polygon points="117,112 123,112 122,124 118,124" fill="#78350f" />
  </g>
  <!-- Sparkles -->
  <path d="M 120 140 L 126 156 L 142 162 L 126 168 L 120 184 L 114 168 L 98 162 L 114 156 Z" fill="#ffffff" opacity="0.9" />
  <path d="M 390 130 L 394 142 L 406 146 L 394 150 L 390 162 L 386 150 L 374 146 L 386 142 Z" fill="#fef3c7" opacity="0.95" />
</svg>`;

const logoSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" width="100%" height="100%">
  <defs>
    <linearGradient id="goldText" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
  </defs>
  <!-- Mark icon -->
  <g transform="translate(20, 20) scale(0.31)">
    <rect width="512" height="512" rx="112" fill="#0f172a" />
    <circle cx="256" cy="256" r="180" fill="none" stroke="#f59e0b" stroke-width="14" />
    <path d="M 156 226 Q 256 156 356 226 L 356 246 L 156 246 Z" fill="#fbbf24" />
    <rect x="156" y="251" width="200" height="115" rx="14" fill="#f59e0b" />
    <rect x="241" y="241" width="30" height="40" rx="6" fill="#ffffff" />
  </g>
  <!-- Text -->
  <text x="210" y="85" font-family="'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" font-size="22" font-weight="700" fill="#94a3b8" letter-spacing="1.5">
    초등학교 5학년 사회과 역사 프로젝트
  </text>
  <text x="210" y="145" font-family="'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" font-size="44" font-weight="900" fill="url(#goldText)">
    디지털 역사 보물도감
  </text>
  <rect x="670" y="108" width="105" height="34" rx="17" fill="#d97706" />
  <text x="722" y="130" font-family="'Noto Sans KR', sans-serif" font-size="14" font-weight="800" fill="#0f172a" text-anchor="middle">
    PWA 앱
  </text>
</svg>`;

// Ensure output directories
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const iconsDir = path.join(rootDir, 'icons');
const publicIconsDir = path.join(publicDir, 'icons');

[publicDir, iconsDir, publicIconsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

console.log('Generating SVG assets...');
fs.writeFileSync(path.join(rootDir, 'favicon.svg'), faviconSvg, 'utf8');
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg, 'utf8');
fs.writeFileSync(path.join(rootDir, 'logo.svg'), logoSvg, 'utf8');
fs.writeFileSync(path.join(publicDir, 'logo.svg'), logoSvg, 'utf8');

console.log('Generating PNG assets (pure Node.js + zlib)...');

// 192x192
const png192 = generatePng(192, 192, appIconShader(false));
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), png192);
fs.writeFileSync(path.join(publicIconsDir, 'icon-192.png'), png192);

// 512x512
const png512 = generatePng(512, 512, appIconShader(false));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), png512);
fs.writeFileSync(path.join(publicIconsDir, 'icon-512.png'), png512);

// 512x512 Maskable
const pngMaskable = generatePng(512, 512, appIconShader(true));
fs.writeFileSync(path.join(iconsDir, 'icon-maskable.png'), pngMaskable);
fs.writeFileSync(path.join(publicIconsDir, 'icon-maskable.png'), pngMaskable);

// Apple Touch Icon (180x180)
const pngApple = generatePng(180, 180, appIconShader(false));
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), pngApple);
fs.writeFileSync(path.join(publicIconsDir, 'apple-touch-icon.png'), pngApple);
fs.writeFileSync(path.join(rootDir, 'apple-touch-icon.png'), pngApple);
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pngApple);

// Favicon 48x48 as favicon.ico substitute / ico
const png48 = generatePng(48, 48, appIconShader(false));
fs.writeFileSync(path.join(rootDir, 'favicon.ico'), png48);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), png48);

// OG Image 1200x630
const pngOg = generatePng(1200, 630, ogImageShader);
fs.writeFileSync(path.join(iconsDir, 'og-image.png'), pngOg);
fs.writeFileSync(path.join(publicIconsDir, 'og-image.png'), pngOg);
fs.writeFileSync(path.join(rootDir, 'og-image.png'), pngOg);
fs.writeFileSync(path.join(publicDir, 'og-image.png'), pngOg);

console.log('✅ All PWA Brand assets generated successfully!');
