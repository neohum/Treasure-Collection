import "./styles.css";
import "./print.css";
// 별도 모듈로 import해야 vite.config.ts의 woff2-only 변환이 적용된다 (styles.css 주석 참고).
import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import { CodexApp } from "./ui/app";
import type { CodexConfig } from "./core/types";
import { CLOUDSCHOOL_PROTOCOL_VERSION, handleBridgeMessage, isInboundMessage, readyMessage, type BridgeHost, type CloudSchoolApp, type OutboundMessage } from "./core/bridge";
import { h, icon } from "./ui/dom";
import embeddedConfig from "virtual:codex-config";

/** `#restore`로 열렸는데 이 시간 안에 제출물이 오지 않으면 안내를 띄운다 */
const RESTORE_HINT_DELAY_MS = 3000;

/**
 * Cloud-School 교사 화면(과제 수집)과의 배선. 순수 로직은 src/core/bridge.ts, 전문은 docs/cloudschool-protocol.md.
 *  - window.CloudSchoolApp: 같은 문서 안에서 부르는 API (collect / restore / clearRestore)
 *  - postMessage: iframe 부모가 부르는 같은 API. 우리 타입(cloudschool_*)이 아닌 메시지는 무시하고, 아무것도 eval하지 않는다.
 */
function installCloudSchoolBridge(app: CodexApp, config: CodexConfig): void {
  const knownIds = new Set(config.eras.flatMap((e) => e.treasures.map((t) => t.id)));
  const host: BridgeHost = {
    appId: config.toolId,
    title: config.title,
    knownIds,
    collect: () => app.collect(),
    restore: (payload, opts) => app.restoreValidated(payload, opts),
    clearRestore: () => app.clearRestore(),
  };
  const api: CloudSchoolApp = {
    version: CLOUDSCHOOL_PROTOCOL_VERSION,
    appId: config.toolId,
    title: config.title,
    collect: () => app.collect(),
    restore: async (payload, opts) => {
      await app.restore(payload, opts);
    },
    clearRestore: () => app.clearRestore(),
  };
  window.CloudSchoolApp = api;

  const embedded = window.parent !== window;
  window.addEventListener("message", (event: MessageEvent) => {
    if (!isInboundMessage(event.data)) return;
    // 응답은 iframe 부모(프로토콜의 상대)로, 단독으로 열렸으면 보낸 창(팝업 opener 등)으로. 출처는 기록만 한다
    // (교사 화면 배포 origin이 고정되지 않았다) — targetOrigin은 아직 "*".
    const source = event.source;
    const target: Window | null = embedded ? window.parent : source && !(source instanceof MessagePort) ? (source as Window) : null;
    const reply = (msg: OutboundMessage) => {
      try {
        target?.postMessage(msg, "*");
      } catch (err) {
        console.warn(`[보물도감] 교사 화면으로 응답하지 못했습니다 (${event.origin}): ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    void handleBridgeMessage(host, event.data, reply, event.origin).catch((err: unknown) => {
      console.warn(`[보물도감] 교사 화면 메시지 처리 실패 (${event.origin}): ${err instanceof Error ? err.message : String(err)}`);
    });
  });
  if (embedded) window.parent.postMessage(readyMessage(host), "*");

  if (window.location.hash === "#restore") {
    window.setTimeout(() => {
      if (!app.readonly) app.setRestoreHint(true);
    }, RESTORE_HINT_DELAY_MS);
  }
}

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
    const app = await CodexApp.mount(root, config);
    installCloudSchoolBridge(app, config);
  } catch (err) {
    root.replaceChildren(
      h("div", { class: "boot-error", role: "alert" }, icon("exclamation", "text-red-500 text-2xl"), h("p", {}, "도감을 불러오지 못했습니다."), h("p", { class: "text-xs text-slate-500" }, err instanceof Error ? err.message : String(err))),
    );
  }
}

void boot();
