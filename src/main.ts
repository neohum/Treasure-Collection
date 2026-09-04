import "./styles.css";
import "./print.css";
// 별도 모듈로 import해야 vite.config.ts의 woff2-only 변환이 적용된다 (styles.css 주석 참고).
import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import { CodexApp } from "./ui/app";
import type { CodexConfig } from "./core/types";
import { h, icon } from "./ui/dom";

async function loadConfig(): Promise<CodexConfig> {
  // 상대 경로: 허브(/dist/{id}/)와 GitHub Pages(/Treasure-Collection/) 모두에서 같은 파일을 가리킨다.
  const res = await fetch("./config.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`config.json 로드 실패 (${res.status})`);
  const config = (await res.json()) as CodexConfig;
  if (config.schema !== 1) throw new Error("지원하지 않는 config 버전");
  return config;
}

async function boot(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("app root not found");
  try {
    const config = await loadConfig();
    document.title = config.title;
    await CodexApp.mount(root, config);
  } catch (err) {
    root.replaceChildren(
      h("div", { class: "boot-error", role: "alert" }, icon("exclamation", "text-red-500 text-2xl"), h("p", {}, "도감을 불러오지 못했습니다."), h("p", { class: "text-xs text-slate-500" }, err instanceof Error ? err.message : String(err))),
    );
  }
}

void boot();
