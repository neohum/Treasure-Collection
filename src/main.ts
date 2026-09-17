import "./styles.css";
import "./print.css";
// 별도 모듈로 import해야 vite.config.ts의 woff2-only 변환이 적용된다 (styles.css 주석 참고).
import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import { CodexApp } from "./ui/app";
import type { CodexConfig } from "./core/types";
import { h, icon } from "./ui/dom";
import embeddedConfig from "virtual:codex-config";

/**
 * 설정 로드 순서 — 교사가 config.json만 바꿔 핵심어를 교체할 수 있게 파일을 먼저 찾되,
 * 어떤 경로에서 열려도 앱이 죽지 않게 내장 설정으로 끝난다.
 *  1. 번들 JS 자신의 위치 기준 `../config.json` — index.html이 번들과 다른 URL에서 열리는
 *     배포(cloud-school 뷰어 등)에서도 자산 경로는 맞으므로 이것이 가장 믿을 만하다
 *  2. 페이지 기준 `./config.json` — 허브(/dist/{id}/)·GitHub Pages·로컬 preview
 *  3. 빌드 시 JS에 내장된 설정 (virtual:codex-config)
 */
export function configCandidates(scriptUrl: string, pageBase: string): string[] {
  const urls: string[] = [];
  try { urls.push(new URL("../config.json", scriptUrl).href); } catch { /* 비표준 URL(blob: 등) */ }
  try { urls.push(new URL("./config.json", pageBase).href); } catch { /* */ }
  return [...new Set(urls)];
}

async function loadConfig(): Promise<{ config: CodexConfig; source: string }> {
  for (const url of configCandidates(import.meta.url, document.baseURI)) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) continue;
      const config = (await res.json()) as CodexConfig;
      if (config.schema === 1 && Array.isArray(config.eras)) return { config, source: url };
    } catch {
      /* 다음 후보 */
    }
  }
  return { config: embeddedConfig, source: "embedded" };
}

async function boot(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("app root not found");
  try {
    const { config, source } = await loadConfig();
    document.title = config.title;
    root.dataset["configSource"] = source === "embedded" ? "embedded" : "file";
    await CodexApp.mount(root, config);
  } catch (err) {
    root.replaceChildren(
      h("div", { class: "boot-error", role: "alert" }, icon("exclamation", "text-red-500 text-2xl"), h("p", {}, "도감을 불러오지 못했습니다."), h("p", { class: "text-xs text-slate-500" }, err instanceof Error ? err.message : String(err))),
    );
  }
}

void boot();
