import { shrinkImage } from "../core/image";
import { CodexStore } from "../core/storage";
import { toIsoWithOffset, formatLocal } from "../core/time";
import { checkKeyword } from "../core/unlock";
import { exportProgress, importProgress, ImportError } from "../core/export";
import { LIMITS, type CodexConfig, type EraCategory, type Treasure, type UnlockRecord } from "../core/types";
import { detectHub, type HubContext } from "../core/hub";
import { collectSnapshot, collectedToRecords, validateCollected, type CloudSchoolCollected } from "../core/bridge";
import { renderCard } from "./card";
import { append, clear, h, icon } from "./dom";
import { renderLogo } from "./logo";
import { button, closeModal, confirmModal, openModal } from "./modals";
import { openSubmitModal } from "./submit";
import { showToast } from "./toast";

/** 교사 화면이 고른 학생의 제출물을 읽기 전용으로 그리는 동안의 상태. IndexedDB에는 아무것도 쓰지 않는다. */
interface RestoreView {
  payload: CloudSchoolCollected;
  studentName?: string;
}

/**
 * 도감 앱 상태와 렌더. 상태가 바뀌면 그리드를 통째로 다시 그린다(유물 20종이라 충분히 싸다).
 * 사진 objectURL은 렌더마다 회수한다.
 */
export class CodexApp {
  private progress = new Map<string, UnlockRecord>();
  private studentLabel = "";
  private activeFilter = "all";
  private expanded = new Set<string>();
  private objectUrls: string[] = [];
  private justUnlocked: string | null = null;
  private pendingCount = 0;
  /** 읽기 전용 재생 중이면 존재. progress·studentLabel은 이 payload에서 온 메모리 값으로 바뀐다. */
  private restoreView: RestoreView | null = null;
  /** `#restore`로 열렸는데 3초 안에 아무 제출물도 오지 않았을 때의 안내 */
  private restoreHint = false;
  /** 허브(/dist/{toolID}/)에서 열렸을 때만 존재. 없으면 [전송] 대신 [내보내기]. */
  private readonly hub: HubContext | null;

  private readonly root: HTMLElement;
  private constructor(
    private readonly config: CodexConfig,
    private readonly store: CodexStore,
    root: HTMLElement,
  ) {
    this.root = root;
    this.hub = detectHub(window.location);
    for (const era of config.eras) this.expanded.add(era.id);
  }

  static async mount(root: HTMLElement, config: CodexConfig, store?: CodexStore): Promise<CodexApp> {
    const app = new CodexApp(config, store ?? (await CodexStore.open()), root);
    await app.reload();
    app.render();
    return app;
  }

  get total(): number {
    return this.config.eras.reduce((n, e) => n + e.treasures.length, 0);
  }

  /** 읽기 전용 재생 중인가 (교사 화면이 학생 제출물을 보는 중). */
  get readonly(): boolean {
    return this.restoreView !== null;
  }

  private get knownIds(): Set<string> {
    return new Set(this.config.eras.flatMap((e) => e.treasures.map((t) => t.id)));
  }

  private async reload(): Promise<void> {
    this.progress = new Map((await this.store.getAllProgress()).map((r) => [r.id, r]));
    this.studentLabel = (await this.store.getMeta()).studentLabel;
    this.pendingCount = (await this.store.listQueue()).length;
  }

  private openSubmit(): void {
    if (!this.hub || this.readonly) return;
    openSubmitModal({
      store: this.store,
      hub: this.hub,
      toolId: this.config.toolId,
      total: this.total,
      getLabel: () => this.studentLabel,
      getRecords: () => [...this.progress.values()],
      collect: () => this.collect(),
      onDone: () => void this.reload().then(() => this.render()),
    });
  }

  // ───────────────────────── Cloud-School collect / restore ─────────────────────────

  /**
   * 학생의 현재 저장 상태(사진 포함)를 한 덩어리로. [전송]과 교사 화면 수집이 같은 함수를 쓴다.
   * 재생 중에는 그려 놓은 payload를 그대로 돌려준다 — 다시 수집해도 같은 결과(멱등).
   */
  async collect(): Promise<CloudSchoolCollected> {
    if (this.restoreView) return this.restoreView.payload;
    return collectSnapshot({
      toolId: this.config.toolId,
      title: this.config.title,
      studentLabel: this.studentLabel,
      records: [...this.progress.values()],
      total: this.total,
      now: toIsoWithOffset(),
    });
  }

  /**
   * 교사 화면이 고른 학생의 제출물을 이 도감 화면에 읽기 전용으로 그린다. IndexedDB에는 쓰지 않는다.
   * 검증에 실패하면 한국어 사유로 거부한다(postMessage 경로는 src/main.ts가 warn만 남기고 삼킨다).
   */
  async restore(raw: unknown, opts: { studentName?: string } = {}): Promise<{ studentLabel: string; unlocked: number; total: number }> {
    const result = validateCollected(raw, { appId: this.config.toolId, knownIds: this.knownIds });
    if (!result.ok) {
      console.warn(`[보물도감] 제출물을 그릴 수 없습니다 — ${result.reason}`);
      throw new Error(result.reason);
    }
    return this.restoreValidated(result.value, opts);
  }

  async restoreValidated(payload: CloudSchoolCollected, opts: { studentName?: string } = {}): Promise<{ studentLabel: string; unlocked: number; total: number }> {
    closeModal();
    const view: RestoreView = { payload };
    if (opts.studentName) view.studentName = opts.studentName;
    this.restoreView = view;
    this.restoreHint = false;
    this.progress = new Map(collectedToRecords(payload).map((r) => [r.id, r]));
    this.studentLabel = payload.studentLabel;
    this.expanded = new Set(this.config.eras.map((e) => e.id));
    this.activeFilter = "all";
    this.render();
    return { studentLabel: payload.studentLabel, unlocked: this.progress.size, total: this.total };
  }

  /** 읽기 전용 재생을 끝내고 이 기기의 실제 저장 상태로 돌아간다. */
  async clearRestore(): Promise<void> {
    if (!this.restoreView) return;
    closeModal();
    this.restoreView = null;
    await this.reload();
    this.render();
  }

  /** `#restore`로 열렸는데 제출물이 오지 않을 때의 안내(비차단). 재생이 시작되면 사라진다. */
  setRestoreHint(on: boolean): void {
    if (this.restoreView) return;
    this.restoreHint = on;
    this.render();
  }

  // ───────────────────────── render ─────────────────────────

  render(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls = [];
    clear(this.root);
    // 읽기 전용 재생: CSS·e2e·교사 화면이 이 속성 하나로 상태를 읽는다
    if (this.readonly) this.root.dataset["readonly"] = "true";
    else delete this.root.dataset["readonly"];
    append(this.root, this.renderHeader(), this.renderMain());
    this.justUnlocked = null;
  }

  /** 헤더 바로 아래 고정 배너: 누구의 제출물을 보고 있는지, 언제 제출됐는지. */
  private renderRestoreBanner(view: RestoreView): HTMLElement {
    const label = view.payload.studentLabel;
    const who = view.studentName ?? (label ? (/^\d+$/.test(label) ? `${label}번` : label) : "이름 없는");
    // 교사 UI가 iframe 안에서 학생 전환을 맡으므로 내장됐을 때는 [돌아가기]를 숨긴다
    const embedded = window.parent !== window;
    return h(
      "div",
      { class: "restore-banner no-print", id: "restoreBanner", role: "status", "aria-live": "polite" },
      h(
        "div",
        { class: "restore-banner-inner" },
        h("p", { class: "restore-banner-text" }, icon("eye", "text-amber-300"), h("span", {}, `${who} 학생의 제출물 보기 (읽기 전용) · 제출 ${formatLocal(view.payload.submittedAt)}`)),
        embedded
          ? null
          : h("button", { type: "button", class: "btn btn-secondary btn-sm", id: "btn-clear-restore", onclick: () => void this.clearRestore() }, icon("arrow-left"), h("span", {}, "내 도감으로 돌아가기")),
      ),
    );
  }

  private renderHeader(): HTMLElement {
    const labelInput = h("input", {
      type: "text",
      id: "studentLabel",
      class: "label-input",
      placeholder: "번호 (예: 12)",
      maxlength: String(LIMITS.studentLabelMax),
      value: this.studentLabel,
      "aria-label": "학생 번호 또는 이름",
      readonly: this.readonly,
      onchange: () => void this.saveLabel(labelInput.value),
    }) as HTMLInputElement;

    const backBtn = h(
      "button",
      {
        type: "button",
        class: "btn btn-secondary btn-sm no-print flex items-center gap-1 shrink-0",
        title: "이전으로 가기",
        id: "btn-back-to-portal",
        onclick: () => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.href = "/student/dashboard/materials";
          }
        },
      },
      icon("arrow-left"),
      h("span", { class: "hidden xs:inline" }, "이전으로"),
    );

    return h(
      "header",
      { class: "app-header" },
      h(
        "div",
        { class: "app-header-inner" },
        h(
          "div",
          { class: "flex items-center gap-2 sm:gap-3" },
          // 재생 중(교사 iframe)에 [이전으로]는 iframe 자체를 다른 곳으로 보내 버린다 — 전환은 교사 UI가 맡는다
          this.readonly ? null : backBtn,
          // 파일이 아니라 인라인 SVG: index.html만 살아남는 배포에서도 로고가 깨지지 않는다 (src/ui/logo.ts)
          renderLogo(40),
          h("div", {}, h("h1", { class: "app-title" }, this.config.title), h("p", { class: "app-subtitle" }, "5학년 사회 · 시대별 대표 보물 20종")),
        ),
        h(
          "div",
          { class: "flex items-center gap-2 flex-wrap no-print" },
          h("label", { class: "label-wrap" }, icon("id-badge", "text-amber-400"), labelInput),
          h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => window.print(), title: "도감 출력", id: "btn-print" }, icon("print"), h("span", { class: "hidden sm:inline" }, "도감 출력")),
          // 읽기 전용 재생 중에는 저장 상태를 바꾸는 버튼(전송·내보내기·가져오기·초기화)을 그리지 않는다. 출력은 남는다.
          ...(this.readonly ? [] : this.renderMutatingButtons()),
        ),
      ),
      this.restoreView ? this.renderRestoreBanner(this.restoreView) : null,
      this.restoreHint
        ? h("div", { class: "restore-hint no-print", id: "restoreHint", role: "status" }, icon("info", "text-amber-300"), h("span", {}, "선생님 화면에서 학생을 선택하세요"))
        : null,
    );
  }

  private renderMutatingButtons(): HTMLElement[] {
    return [
      // 허브에서 열렸으면 [전송], 아니면(GitHub Pages·로컬) 같은 자리의 버튼이 [내보내기]가 된다.
      this.hub
        ? h(
            "button",
            { type: "button", class: "btn btn-primary btn-sm", onclick: () => this.openSubmit(), title: "선생님께 전송", id: "btn-submit", "data-pending": String(this.pendingCount) },
            icon("paper-plane"),
            h("span", {}, "전송"),
            this.pendingCount > 0 ? h("span", { class: "badge badge-pending", id: "pendingBadge" }, `아직 전송되지 않은 기록 ${this.pendingCount}건`) : null,
          )
        : h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => void this.exportJson(), title: "내보내기", id: "btn-export" }, icon("download"), h("span", {}, "내보내기")),
      h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => this.importJson(), title: "가져오기", id: "btn-import" }, icon("upload"), h("span", { class: "hidden sm:inline" }, "가져오기")),
      h("button", { type: "button", class: "btn btn-danger-ghost btn-sm", onclick: () => void this.reset(), title: "초기화", "aria-label": "초기화", id: "btn-reset" }, icon("rotate-right")),
    ];
  }

  private renderMain(): HTMLElement {
    const unlocked = this.progress.size;
    const pct = Math.round((unlocked / this.total) * 100);
    const owner = this.studentLabel ? `${this.studentLabel}번의` : "나만의";

    const summary = h(
      "section",
      { class: "panel summary" },
      h(
        "div",
        { class: "summary-row" },
        h("div", {}, h("span", { class: "badge badge-amber" }, "5학년 사회"), h("h2", { class: "summary-title" }, `${owner} 보물 수집 현황`)),
        h(
          "div",
          { class: "progress-wrap" },
          h("div", { class: "progress-text" }, h("span", {}, "전체 달성률"), h("span", { id: "progressText", class: "font-extrabold text-amber-600" }, `${unlocked} / ${this.total} (${pct}%)`)),
          h("div", { class: "progress-track", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(this.total), "aria-valuenow": String(unlocked) }, h("div", { class: "progress-bar", style: `width:${pct}%` })),
        ),
      ),
      h(
        "div",
        { class: "summary-foot no-print" },
        this.readonly
          ? h("p", { class: "tip" }, icon("eye", "text-amber-600"), h("span", {}, "학생이 제출한 도감을 그대로 보고 있습니다. 카드의 [자세히 보기]로 소감과 사진을 확인하고, [도감 출력]으로 인쇄할 수 있어요."))
          : h("p", { class: "tip" }, icon("bulb", "text-amber-600"), h("span", {}, "수업에서 배운 핵심어를 입력하거나, 선생님이 나눠 준 유물 사진을 올려 보물을 해금하세요.")),
        h(
          "div",
          { class: "flex gap-2" },
          h("button", { type: "button", class: "btn btn-secondary btn-xs", onclick: () => this.toggleAll(true) }, icon("folder-open"), h("span", {}, "모두 펼치기")),
          h("button", { type: "button", class: "btn btn-secondary btn-xs", onclick: () => this.toggleAll(false) }, icon("folder"), h("span", {}, "모두 접기")),
        ),
      ),
    );

    const tabs = h("nav", { class: "tabs no-print", "aria-label": "시대 필터" });
    const mkTab = (id: string, label: string, iconName: string) =>
      h("button", { type: "button", class: `tab ${this.activeFilter === id ? "tab-active" : ""}`, onclick: () => this.filter(id), "data-filter": id }, icon(iconName), h("span", {}, label));
    append(tabs, mkTab("all", "전체 보기", "apps"), ...this.config.eras.map((e) => mkTab(e.id, e.name, e.icon)));

    const eras = h("div", { class: "eras", id: "eras" });
    const visible = this.activeFilter === "all" ? this.config.eras : this.config.eras.filter((e) => e.id === this.activeFilter);
    append(eras, ...visible.map((era) => this.renderEra(era)));

    return h("main", { class: "app-main" }, summary, tabs, eras);
  }

  private renderEra(era: EraCategory): HTMLElement {
    const open = this.expanded.has(era.id);
    const done = era.treasures.filter((t) => this.progress.has(t.id)).length;
    const pct = Math.round((done / era.treasures.length) * 100);
    const grid = h("div", { class: "card-grid" });
    for (const t of era.treasures) {
      const rec = this.progress.get(t.id);
      let url: string | undefined;
      if (rec?.image) {
        url = URL.createObjectURL(rec.image);
        this.objectUrls.push(url);
      }
      grid.appendChild(
        renderCard(t, rec, url, { onKeyword: (x) => this.openKeyword(x), onPhoto: (x) => this.openPhoto(x), onDetail: (x) => this.openDetail(x), readonly: this.readonly }, this.justUnlocked === t.id),
      );
    }
    return h(
      "section",
      { class: "era", "data-era": era.id },
      h(
        "button",
        { type: "button", class: "era-head", onclick: () => this.toggleEra(era.id), "aria-expanded": String(open) },
        h("span", { class: "era-icon" }, icon(era.icon)),
        h("span", { class: "era-text" }, h("span", { class: "era-name" }, era.name, h("span", { class: "badge badge-count" }, `${done} / ${era.treasures.length} 완료`)), h("span", { class: "era-desc" }, era.description)),
        h("span", { class: "era-meta" }, h("span", { class: "era-pct" }, `${pct}%`), h("span", { class: `era-chevron ${open ? "rotate-180" : ""}` }, icon("angle-down"))),
      ),
      h("div", { class: `era-content ${open ? "" : "hidden"}` }, grid),
    );
  }

  // ───────────────────────── state changes ─────────────────────────

  private filter(id: string): void {
    this.activeFilter = id;
    if (id !== "all") this.expanded.add(id);
    this.render();
  }

  private toggleEra(id: string): void {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.render();
  }

  private toggleAll(open: boolean): void {
    this.expanded = new Set(open ? this.config.eras.map((e) => e.id) : []);
    this.render();
  }

  private async saveLabel(value: string): Promise<void> {
    if (this.readonly) return;
    this.studentLabel = value.trim().slice(0, LIMITS.studentLabelMax);
    await this.store.setMeta({ studentLabel: this.studentLabel });
    this.render();
    showToast("학생 정보가 저장되었습니다.");
  }

  private async unlock(t: Treasure, mode: "keyword" | "photo", note: string, image?: Blob): Promise<void> {
    // 읽기 전용 재생 중 저장은 학생 기록을 교사 화면 데이터로 덮어쓰는 사고다 — 버튼을 숨겼어도 한 번 더 막는다
    if (this.readonly) return;
    const record: UnlockRecord = { id: t.id, mode, unlockedAt: toIsoWithOffset(), note: note.trim().slice(0, LIMITS.noteMax) };
    if (image) record.image = image;
    await this.store.putProgress(record);
    this.progress.set(t.id, record);
    this.justUnlocked = t.id;
    closeModal();
    this.render();
    showToast(`${t.name} 보물이 도감에 등재되었습니다!`);
  }

  // ───────────────────────── modals ─────────────────────────

  private openKeyword(t: Treasure): void {
    if (this.readonly) return;
    const input = h("input", { type: "text", id: "keywordInput", class: "input", placeholder: "수업에서 배운 핵심어", autocomplete: "off", "aria-label": "핵심어" }) as HTMLInputElement;
    const note = h("textarea", { id: "noteInput", class: "input", rows: "2", maxlength: String(LIMITS.noteMax), placeholder: "예: 백성을 지키려는 선조들의 마음이 느껴졌다." }) as HTMLTextAreaElement;
    const error = h("p", { class: "field-error", id: "keywordError", role: "alert" });
    const submit = async () => {
      error.textContent = "";
      const ok = await checkKeyword(this.config, t.id, input.value);
      if (!ok) {
        error.textContent = "핵심어가 맞지 않아요. 수업 내용을 다시 떠올려 보세요.";
        input.classList.add("shake");
        window.setTimeout(() => input.classList.remove("shake"), 500);
        input.select();
        return;
      }
      await this.unlock(t, "keyword", note.value);
    };
    const form = h("form", { onsubmit: (e: Event) => { e.preventDefault(); void submit(); } },
      h("div", { class: "hint-box" }, h("span", { class: "badge badge-era" }, t.era), h("strong", {}, t.name), h("p", {}, t.hint)),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "1. 핵심어 입력"), input),
      error,
      h("label", { class: "field" }, h("span", { class: "field-label" }, "2. 큐레이터 한 줄 소감 (선택)"), note),
    );
    openModal({
      title: `${t.name} 해금하기`,
      titleIcon: "key",
      body: form,
      footer: h("div", { class: "flex gap-2 justify-end" }, button("취소", { onclick: closeModal }), button("도감에 등재하기", { variant: "primary", icon: "unlock", onclick: () => void submit(), id: "keywordSubmit" })),
      focus: "#keywordInput",
    });
  }

  private openPhoto(t: Treasure): void {
    if (this.readonly) return;
    const existing = this.progress.get(t.id);
    let selected: Blob | null = null;
    const preview = h("img", { class: "preview hidden", alt: "선택한 사진 미리보기", id: "photoPreview" }) as HTMLImageElement;
    const placeholder = h("div", { class: "drop-placeholder", id: "photoPlaceholder" }, icon("picture", "text-3xl text-slate-400"), h("p", { class: "text-xs font-bold text-slate-600" }, "여기를 눌러 사진 파일 선택"), h("p", { class: "text-[11px] text-slate-400" }, "JPG, PNG (크롬북 다운로드 폴더)"));
    const fileInput = h("input", { type: "file", id: "photoInput", accept: "image/*", class: "sr-only" }) as HTMLInputElement;
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) { showToast("이미지 파일만 선택할 수 있어요.", "warn"); return; }
      try {
        selected = await shrinkImage(file);
        if (preview.src) URL.revokeObjectURL(preview.src);
        preview.src = URL.createObjectURL(selected);
        preview.classList.remove("hidden");
        placeholder.classList.add("hidden");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "이미지를 읽을 수 없습니다.", "warn");
      }
    });
    const drop = h("label", { class: "drop", for: "photoInput" }, fileInput, placeholder, preview);
    const note = h("textarea", { id: "noteInput", class: "input", rows: "2", maxlength: String(LIMITS.noteMax), placeholder: "예: 백성을 지키려는 선조들의 마음이 느껴졌다." }) as HTMLTextAreaElement;
    if (existing) note.value = existing.note;
    const submit = async () => {
      const image = selected ?? existing?.image;
      if (!image) { showToast("선생님이 나눠 준 유물 사진을 올려 주세요.", "warn"); return; }
      await this.unlock(t, "photo", note.value, image);
    };
    openModal({
      title: `${t.name} ${existing ? "사진 변경" : "해금하기"}`,
      titleIcon: "camera",
      body: h("div", {},
        h("div", { class: "hint-box" }, h("span", { class: "badge badge-era" }, t.era), h("strong", {}, t.name), h("p", {}, t.hint)),
        h("div", { class: "field" }, h("span", { class: "field-label" }, "1. 클래스룸에서 받은 사진 파일 선택"), drop),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "2. 큐레이터 한 줄 소감 (선택)"), note),
      ),
      footer: h("div", { class: "flex gap-2 justify-end" }, button("취소", { onclick: closeModal }), button("도감에 등재하기", { variant: "primary", icon: "unlock", onclick: () => void submit(), id: "photoSubmit" })),
      onClose: () => { if (preview.src) URL.revokeObjectURL(preview.src); },
      focus: "#photoSubmit",
    });
  }

  private openDetail(t: Treasure): void {
    const rec = this.progress.get(t.id);
    if (!rec) return;
    let url: string | undefined;
    const media = rec.image ? (url = URL.createObjectURL(rec.image), h("img", { src: url, alt: t.name, class: "detail-image" })) : h("div", { class: "card-keyword-art detail-art" }, icon("key", "text-5xl"));
    openModal({
      title: t.name,
      titleIcon: "treasure-chest",
      body: h("div", { class: "space-y-3" },
        h("div", { class: "detail-media" }, media),
        h("div", { class: "info-box" }, h("div", { class: "info-title" }, icon("scroll", "text-amber-600"), h("span", {}, "유물 개요 및 역사적 가치")), h("p", {}, t.description)),
        h("div", { class: "info-box info-box-amber" }, h("div", { class: "info-title" }, icon("pencil", "text-amber-700"), h("span", {}, this.readonly ? "학생이 적은 큐레이터 한 줄" : "내가 적은 큐레이터 한 줄")), h("p", { class: "italic", "data-role": "detail-note" }, rec.note || "큐레이터 메모 없음")),
        h("p", { class: "text-xs text-slate-500" }, `${rec.mode === "keyword" ? "핵심어" : "사진"}으로 해금 · ${formatLocal(rec.unlockedAt)}`),
      ),
      footer: h("div", { class: `flex ${this.readonly ? "justify-end" : "justify-between"} items-center gap-2` },
        this.readonly ? null : button(rec.image ? "사진 변경하기" : "사진 추가하기", { variant: "ghost", icon: "camera", onclick: () => this.openPhoto(t) }),
        button("닫기", { variant: "primary", onclick: closeModal })),
      onClose: () => { if (url) URL.revokeObjectURL(url); },
    });
  }

  // ───────────────────────── export / import / reset ─────────────────────────

  private async exportJson(): Promise<void> {
    if (this.readonly) return;
    const file = await exportProgress(this.config.toolId, { studentLabel: this.studentLabel }, [...this.progress.values()], toIsoWithOffset());
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `보물도감-${this.studentLabel || "학생"}-${file.exportedAt.slice(0, 10)}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("도감을 파일로 내보냈습니다.");
  }

  private importJson(): void {
    if (this.readonly) return;
    const input = h("input", { type: "file", accept: "application/json,.json", class: "sr-only", id: "importInput" }) as HTMLInputElement;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const parsed = importProgress(JSON.parse(await file.text()), this.config.toolId);
        const known = new Set(this.config.eras.flatMap((e) => e.treasures.map((t) => t.id)));
        let n = 0;
        for (const r of parsed.records) {
          if (!known.has(r.id)) continue;
          await this.store.putProgress(r);
          n++;
        }
        if (parsed.meta.studentLabel) await this.store.setMeta(parsed.meta);
        await this.reload();
        this.render();
        showToast(`${n}개의 보물 기록을 가져왔습니다.`);
      } catch (err) {
        showToast(err instanceof ImportError ? err.message : "파일을 읽을 수 없습니다.", "warn");
      }
    });
    document.body.appendChild(input);
    input.click();
  }

  private async reset(): Promise<void> {
    if (this.readonly) return;
    const ok = await confirmModal({ title: "보물도감 초기화", message: "모든 유물 사진과 기록이 삭제됩니다. 정말로 초기화할까요?", confirmLabel: "초기화 진행" });
    if (!ok) return;
    await this.store.wipe();
    await this.reload();
    this.render();
    showToast("보물도감이 초기화되었습니다.");
  }
}
