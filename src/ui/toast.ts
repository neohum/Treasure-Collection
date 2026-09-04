import { h, icon } from "./dom";

let host: HTMLElement | null = null;
let timer: number | undefined;

/** 우하단 토스트. 4초 뒤 사라진다. 작업을 막는 오류에는 쓰지 않는다(DESIGN.md). */
export function showToast(message: string, kind: "ok" | "warn" = "ok"): void {
  if (!host) {
    host = h("div", { id: "toast", class: "toast no-print", role: "status", "aria-live": "polite" });
    document.body.appendChild(host);
  }
  while (host.firstChild) host.removeChild(host.firstChild);
  host.append(icon(kind === "ok" ? "badge-check" : "exclamation", kind === "ok" ? "text-amber-400" : "text-red-400"), h("span", {}, message));
  host.classList.add("toast-visible");
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => host?.classList.remove("toast-visible"), 4000);
}
