import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

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

/**
 * 도감 설정(config.json)을 빌드 시점에 만들어 두 경로로 제공한다.
 *  - `virtual:codex-config` 모듈: JS 번들 안에 내장 → 배포 환경이 어디에 서빙하든 fetch 실패로 앱이 죽지 않는다
 *    (cloud-school 뷰어처럼 index.html을 번들과 다른 경로에서 여는 경우 `./config.json`이 404였다, 2026-09-17)
 *  - `dist/config.json`: 교사가 파일만 바꿔 핵심어를 교체하는 경로. 생성 스크립트가 public/config.json을
 *    쓰고 Vite가 public/을 그대로 복사한다. `vite build`를 직접 불러도(prebuild 생략) 여기서 만들어진다.
 */
function codexConfigPlugin(): Plugin {
  const VIRTUAL = "virtual:codex-config";
  const RESOLVED = "\0" + VIRTUAL;
  let json = "";
  return {
    name: "treasure-codex:config",
    buildStart() {
      // 소스 모듈을 vite.config에 직접 import하면 Vite 설정 로더가 확장자 경고를 쏟는다.
      // 생성 스크립트를 자식 프로세스로 돌리고(prebuild와 같은 명령) 산출물 파일만 읽는다.
      const out = join(import.meta.dirname, "public", "config.json");
      execFileSync(process.execPath, ["--import", "tsx", join(import.meta.dirname, "scripts", "build-config.ts")], {
        cwd: import.meta.dirname,
        stdio: ["ignore", "ignore", "inherit"],
        env: process.env,
      });
      json = readFileSync(out, "utf8");
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : null;
    },
    load(id) {
      return id === RESOLVED ? `export default ${json};` : null;
    },
  };
}

/**
 * 최종 CSS의 아이콘 폰트 `src:`를 세 단계 폴백으로 넓힌다 (2026-09-17 cloud-school 배포 관찰: index.html만
 * JS·CSS를 인라인해 올리고 나머지 파일은 전부 404 → 아이콘이 전부 빈칸).
 *  1) `./<hash>.woff2`         — Vite가 낸 그대로. assets/ 안의 CSS에서 열린다 (허브·GitHub Pages, 오프라인)
 *  2) `./assets/<hash>.woff2`  — CSS가 번들 루트 index.html에 인라인됐을 때 열린다
 *  3) jsDelivr CDN            — index.html 하나만 살아남은 인터넷 배포에서 열린다
 * 브라우저는 앞에서부터 시도해 처음 성공한 소스에서 멈추므로 교실 LAN에서는 CDN 요청이 나가지 않는다.
 * data: URL은 마켓 보안 감사(`scripts/pack-bundle.ts` auditBundleText)가 거부하므로 쓰지 않는다.
 */
export function withIconFontFallbacks(css: string, cdnUrl: string): string {
  return css.replace(
    /src:\s*url\((["']?)\.\/([^)"']+\.woff2)\1\)\s*format\("woff2"\);/g,
    (_m, _q, file: string) =>
      `src:url(./${file})format("woff2"),url(./assets/${file})format("woff2"),url(${cdnUrl})format("woff2");`,
  );
}

const UICONS_PKG = join(import.meta.dirname, "node_modules", "@flaticon", "flaticon-uicons");

/** 설치된 패키지 안의 실제 woff2 경로로 jsDelivr URL을 만든다 — 파일명에 해시가 붙어 버전마다 달라진다. */
export function uiconsCdnUrl(cssFileId: string, originalCss: string): string {
  const { version } = JSON.parse(readFileSync(join(UICONS_PKG, "package.json"), "utf8")) as { version: string };
  const m = /url\((["']?)([^)"']+\.woff2)\1\)/.exec(originalCss);
  if (!m) throw new Error("flaticon-uicons CSS에서 woff2 src를 찾지 못했습니다");
  const abs = resolve(dirname(cssFileId), m[2]!);
  if (!existsSync(abs)) throw new Error(`flaticon-uicons woff2가 패키지에 없습니다: ${abs}`);
  // pnpm은 node_modules/@flaticon/… 를 .pnpm/ 아래 실경로로 심볼릭 링크하고 Vite id는 실경로다 → 둘 다 실경로로 비교
  const inPkg = relative(realpathSync(UICONS_PKG), realpathSync(abs)).split(sep).join("/");
  if (inPkg.startsWith("..")) throw new Error(`flaticon-uicons woff2가 패키지 밖을 가리킵니다: ${inPkg}`);
  return `https://cdn.jsdelivr.net/npm/@flaticon/flaticon-uicons@${version}/${inPkg}`;
}

function trimIconFontCss(): Plugin {
  let cdnUrl = "";
  return {
    name: "treasure-codex:trim-icon-css",
    enforce: "pre",
    transform(code, id) {
      if (!/@flaticon[\\/]flaticon-uicons[\\/].*\.css$/.test(id)) return null;
      cdnUrl = uiconsCdnUrl(id, code);
      return { code: trimIconCss(code, collectUsedIconNames()), map: null };
    },
    // Vite가 woff2를 해시 이름으로 내보내고 CSS를 압축한 뒤(최종 산출물)에서만 폴백을 덧붙인다.
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "asset" || !item.fileName.endsWith(".css")) continue;
        if (!cdnUrl) throw new Error("아이콘 폰트 CDN URL이 준비되지 않았습니다 (flaticon CSS transform이 돌지 않음)");
        const css = typeof item.source === "string" ? item.source : new TextDecoder().decode(item.source);
        const out = withIconFontFallbacks(css, cdnUrl);
        if (out === css) throw new Error(`${item.fileName}: 아이콘 폰트 src를 찾지 못해 폴백을 붙이지 못했습니다`);
        item.source = out;
      }
    },
  };
}

export default defineConfig({
  // 허브는 `/dist/{toolID}/`, GitHub Pages는 `/Treasure-Collection/` 아래에서 서빙한다.
  // 상대 경로여야 두 곳 모두에서 에셋이 열린다.
  base: "./",
  plugins: [codexConfigPlugin(), trimIconFontCss(), tailwindcss()],
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
