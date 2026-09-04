import { defineConfig } from "vitest/config";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

/**
 * all_market 교실 허브는 `.html .js .css .json .png .jpg .jpeg .svg .ico .woff .woff2 .wasm`만
 * 서빙한다. Flaticon UIcons의 @font-face는 eot·ttf도 함께 선언하므로, 그대로 두면 Vite가
 * 그 파일들을 dist/assets로 복사해 번들 검사기(Step 6)가 실패한다. 여기서 woff2 한 줄만
 * 남긴다 — 크롬북 Chrome은 woff2를 지원하니 기능 손실은 없다.
 */
function keepOnlyWoff2InIconFonts(): Plugin {
  return {
    name: "treasure-codex:woff2-only-icon-fonts",
    enforce: "pre",
    transform(code, id) {
      if (!/@flaticon[\\/]flaticon-uicons[\\/].*\.css$/.test(id)) return null;
      const rewritten = code.replace(/src:\s*([^;]+);/g, (match, srcList: string) => {
        const woff2 = srcList
          .split(",")
          .map((s) => s.trim())
          .find((s) => /\.woff2/.test(s));
        return woff2 ? `src: ${woff2};` : match;
      });
      return { code: rewritten, map: null };
    },
  };
}

export default defineConfig({
  // 허브는 `/dist/{toolID}/`, GitHub Pages는 `/Treasure-Collection/` 아래에서 서빙한다.
  // 상대 경로여야 두 곳 모두에서 에셋이 열린다.
  base: "./",
  plugins: [keepOnlyWoff2InIconFonts(), tailwindcss()],
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
