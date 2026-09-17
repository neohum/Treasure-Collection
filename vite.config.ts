import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** src/ 아래 .ts 파일에서 실제로 쓰는 fi-rr 아이콘 이름을 모은다 (icon("x"), icon: "x", 리터럴 fi-rr-x). */
export function collectUsedIconNames(srcDir = join(import.meta.dirname, "src")): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|html)$/.test(entry)) {
        const text = readFileSync(full, "utf8");
        for (const m of text.matchAll(/icon\(\s*"([a-z0-9-]+)"|icon:\s*"([a-z0-9-]+)"|fi-rr-([a-z0-9-]+)/g)) {
          names.add((m[1] ?? m[2] ?? m[3])!);
        }
      }
    }
  };
  walk(srcDir);
  return names;
}

/**
 * Flaticon UIcons CSS를 번들에 맞게 다듬는다.
 * 1) @font-face에서 woff2만 남긴다 — 교실 허브 허용 확장자에 eot·ttf가 없다.
 * 2) 실제로 쓰는 아이콘 규칙만 남긴다 — 전체 3,500여 개 중 30개 남짓만 쓰며, 남겨 두면
 *    `.fi-rr-javascript:before`, `.fi-rr-data:before` 같은 아이콘 이름이 마켓 보안 감사의
 *    `javascript:`·`data:` 문자열 검사에 걸린다(2026-09-17 마켓 심사 차단 사유). 크기도 185KB→수 KB.
 */
export function trimIconCss(code: string, used: Set<string>): string {
  const fontFace = code.replace(/src:\s*([^;]+);/g, (match, srcList: string) => {
    const woff2 = srcList.split(",").map((s) => s.trim()).find((s) => /\.woff2/.test(s));
    return woff2 ? `src: ${woff2};` : match;
  });
  // 규칙 단위로 자른다: `selector{...}`. 아이콘 규칙(.fi-rr-<name>:before)은 사용 목록에 있을 때만 남긴다.
  return fontFace.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector: string) => {
    const m = /^\s*\.fi-rr-([a-z0-9-]+):before\s*$/.exec(selector);
    if (!m) return rule; // @font-face·기본 셀렉터 등은 유지
    return used.has(m[1]!) ? rule : "";
  }).replace(/\.variable-selector-[0-9a-f]+:before\{[^}]*\}|\.combining-half-marks-[0-9a-f]+:before\{[^}]*\}/g, "");
}

function trimIconFontCss(): Plugin {
  return {
    name: "treasure-codex:trim-icon-css",
    enforce: "pre",
    transform(code, id) {
      if (!/@flaticon[\\/]flaticon-uicons[\\/].*\.css$/.test(id)) return null;
      return { code: trimIconCss(code, collectUsedIconNames()), map: null };
    },
  };
}

export default defineConfig({
  // 허브는 `/dist/{toolID}/`, GitHub Pages는 `/Treasure-Collection/` 아래에서 서빙한다.
  // 상대 경로여야 두 곳 모두에서 에셋이 열린다.
  base: "./",
  plugins: [trimIconFontCss(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  // Windows에서 "localhost"는 ::1(IPv6)에만 붙어 Playwright의 127.0.0.1 대기가 영원히 끝나지 않는다.
  // PREVIEW_PORT로 바꿀 수 있다 — 워크트리 여러 개가 동시에 e2e를 돌릴 때 서로의 preview를 집지 않도록.
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: Number(process.env["PREVIEW_PORT"] ?? 4179), strictPort: true },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "legacy/**"],
    environment: "node",
  },
});
