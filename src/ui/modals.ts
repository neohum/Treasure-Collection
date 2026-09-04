import { h, icon } from "./dom";

/**
 * 모달 셸. 열릴 때 첫 입력에 포커스, ESC/배경 클릭으로 닫힘, 닫히면 DOM에서 제거.
 * 한 번에 하나만 뜬다.
 */
let current: { root: HTMLElement; onClose: () => void } | null = null;

export function closeModal(): void {
  if (!current) return;
  current.root.remove();
  document.removeEventListener("keydown", onKeydown);
  const cb = current.onClose;
  current = null;
  cb();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") closeModal();
}

export interface ModalOptions {
  title: string;
  titleIcon: string;
  body: HTMLElement;
  footer: HTMLElement;
  onClose?: () => void;
  /** 초기 포커스 대상 셀렉터 */
  focus?: string;
  danger?: boolean;
}

export function openModal(opts: ModalOptions): HTMLElement {
  closeModal();
  const panel = h(
    "div",
    { class: "modal-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "modal-title" },
    h(
      "div",
      { class: `modal-head ${opts.danger ? "modal-head-danger" : ""}` },
      h("div", { class: "flex items-center gap-2" }, icon(opts.titleIcon, "text-amber-400"), h("h3", { id: "modal-title", class: "font-bold" }, opts.title)),
      h("button", { type: "button", class: "btn-icon", "aria-label": "닫기", onclick: closeModal }, icon("cross")),
    ),
    h("div", { class: "modal-body" }, opts.body),
    h("div", { class: "modal-foot" }, opts.footer),
  );
  const root = h("div", { class: "modal-backdrop no-print", onclick: (e: Event) => { if (e.target === root) closeModal(); } }, panel);
  document.body.appendChild(root);
  document.addEventListener("keydown", onKeydown);
  current = { root, onClose: opts.onClose ?? (() => {}) };
  const target = opts.focus ? panel.querySelector<HTMLElement>(opts.focus) : panel.querySelector<HTMLElement>("input, textarea, button");
  target?.focus();
  return panel;
}

export function button(label: string, opts: { icon?: string; variant?: "primary" | "secondary" | "danger" | "ghost"; onclick: () => void; type?: "button" | "submit"; id?: string }): HTMLButtonElement {
  const cls = { primary: "btn btn-primary", secondary: "btn btn-secondary", danger: "btn btn-danger", ghost: "btn btn-ghost" }[opts.variant ?? "secondary"];
  const el = h("button", { type: opts.type ?? "button", class: cls, onclick: opts.onclick, id: opts.id }, opts.icon ? icon(opts.icon) : null, h("span", {}, label));
  return el;
}

/** 확인 모달(초기화 등). 확인 시 true. */
export function confirmModal(opts: { title: string; message: string; confirmLabel: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const finish = (v: boolean) => { if (answered) return; answered = true; resolve(v); closeModal(); };
    openModal({
      title: opts.title,
      titleIcon: "exclamation",
      danger: true,
      body: h("p", { class: "text-sm text-slate-700" }, opts.message),
      footer: h("div", { class: "flex gap-2 justify-end" }, button("취소", { onclick: () => finish(false) }), button(opts.confirmLabel, { variant: "danger", icon: "trash", onclick: () => finish(true), id: "confirm-yes" })),
      onClose: () => finish(false),
      focus: "#confirm-yes",
    });
  });
}
