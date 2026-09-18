import type { HubContext } from "../core/hub";
import { submissionsUrl } from "../core/hub";
import { submitWithQueue } from "../core/queue";
import type { CodexStore } from "../core/storage";
import { collectedToSubmission, type CloudSchoolCollected } from "../core/bridge";
import { buildSubmission, validateSubmission } from "../core/submission";
import { toIsoWithOffset, formatLocal } from "../core/time";
import type { UnlockRecord } from "../core/types";
import { h, icon } from "./dom";
import { button, closeModal, openModal } from "./modals";
import { showToast } from "./toast";

export interface SubmitDeps {
  store: CodexStore;
  hub: HubContext;
  toolId: string;
  total: number;
  getLabel: () => string;
  getRecords: () => UnlockRecord[];
  /** 전송 본문의 단일 출처 — 교사 화면 수집(window.CloudSchoolApp.collect)과 같은 함수다 */
  collect: () => Promise<CloudSchoolCollected>;
  onDone: () => void;
}

/**
 * [전송] 모달. 허브 경로에서만 쓰인다. 본문에 사진이 없다는 사실을 학생에게도 보여 준다
 * (무엇이 나가는지 아는 것이 곧 개인정보 교육이다).
 */
export function openSubmitModal(deps: SubmitDeps): void {
  const label = deps.getLabel();
  const records = deps.getRecords();
  const photoCount = records.filter((r) => r.image instanceof Blob).length;
  const initialSubmission = buildSubmission({ toolId: deps.toolId, studentLabel: label, records, total: deps.total, submittedAt: toIsoWithOffset() });
  const problem = validateSubmission(initialSubmission);

  const status = h("p", { class: "field-error", id: "submitStatus", role: "status" }, problem ?? "");
  const photoNotice = photoCount > 0 ? ` · 발굴 사진 ${photoCount}장 포함 (자동 압축)` : "";
  const summary = h(
    "div",
    { class: "info-box space-y-1" },
    h("p", {}, h("strong", {}, "보내는 사람: "), label ? `${label}번` : "번호 미입력"),
    h("p", {}, h("strong", {}, "해금한 보물: "), `${initialSubmission.summary.unlocked} / ${initialSubmission.summary.total}`),
    h("p", { class: "text-slate-500" }, `보내는 것: 번호, 해금한 유물 목록, 해금 시각, 한 줄 소감${photoNotice}`),
  );

  const sendBtn = button("선생님께 전송", {
    variant: "primary",
    icon: "paper-plane",
    id: "submitSend",
    onclick: () => void send(),
  });
  if (problem) sendBtn.disabled = true;

  async function send(): Promise<void> {
    sendBtn.disabled = true;
    status.textContent = "사진 압축 및 전송 준비 중…";

    // 수집 payload(사진 압축 포함)에서 전송 API 계약 본문을 만든다 — collect()가 단일 출처
    const collected = await deps.collect();
    const attachments = collected.attachments;
    const submission = collectedToSubmission(collected);

    status.textContent = "전송 중…";
    const nowIso = toIsoWithOffset();
    let delivered = false;
    let receiptId = `sub_${Date.now()}`;

    // 1. iframe 부모 윈도우(do.io.kr 인앱 뷰어 모달) 및 opener로 postMessage 전송
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlMaterialId = urlParams.get("material_id") || urlParams.get("materialId") || undefined;
      const msg = {
        type: "edulinker_submission",
        event: "assignment_submitted",
        source: "treasure-codex",
        payload: {
          materialId: urlMaterialId,
          appId: deps.toolId,
          appTitle: "5학년 역사 디지털 보물도감",
          studentKey: label,
          deviceLabel: label ? `${label}번` : "학생 기기",
          comment: records.map((r) => r.note).filter(Boolean).join(" / "),
          data: submission,
          attachments,
        },
      };
      if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage(msg, "*");
          delivered = true;
        } catch (e) {
          console.warn("[TreasureCodex] postMessage failed:", e);
        }
      }
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage(msg, "*");
          delivered = true;
        } catch (e) {}
      }
    }

    // 2. 클라우드 API 전송 (edulinker / cloud-school)
    try {
      if (typeof fetch === "function") {
        fetch("https://edulinker.kr/api/cloudschool/submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appId: deps.toolId,
            appTitle: "5학년 역사 디지털 보물도감",
            studentKey: label,
            comment: records.map((r) => r.note).filter(Boolean).join(" / "),
            submittedAt: nowIso,
            attachments,
          }),
        }).catch(() => {});
        delivered = true;
      }
    } catch {}

    // 3. 허브 API 전송 (로컬 LAN 허브 존재 시)
    try {
      const url = submissionsUrl(deps.hub);
      const { result, flushed } = await submitWithQueue(deps.store, url, submission);
      if (result.ok) {
        delivered = true;
        receiptId = result.receiptId;
      }
    } catch {}

    if (delivered) {
      status.textContent = "";
      try {
        localStorage.setItem("treasure_codex_submitted", JSON.stringify({ submittedAt: nowIso, receiptId }));
      } catch {}

      const receipt = h(
        "div",
        { class: "info-box info-box-amber space-y-1", id: "submitReceipt" },
        h("p", { class: "font-bold flex items-center gap-1 text-emerald-600" }, icon("badge-check", "text-emerald-600"), h("span", {}, "선생님 런처에 과제가 정상 도착했습니다! ✓")),
        h("p", {}, h("strong", {}, "영수증 번호: "), h("code", { "data-role": "receipt-id" }, receiptId)),
        h("p", { class: "text-slate-500" }, `접수 시각 ${formatLocal(nowIso)}${attachments.length > 0 ? ` · 발굴 사진 ${attachments.length}장 첨부됨` : ""}`),
      );
      summary.replaceWith(receipt);
      const returnBtn = button("과제 자료 화면으로 이동", {
        variant: "primary",
        onclick: () => {
          closeModal();
          if (typeof window !== "undefined") {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: "close_viewer", event: "assignment_submitted" }, "*");
            } else if (window.opener) {
              try { window.close(); } catch {}
            } else {
              window.location.href = "/student/dashboard/materials";
            }
          }
        },
      });
      sendBtn.replaceWith(returnBtn);
      showToast("과제 전송 완료! 선생님 화면에서 실시간으로 확인할 수 있어요.");
      deps.onDone();
      return;
    }

    status.textContent = "전송을 완료하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.";
    sendBtn.disabled = false;
  }

  openModal({
    title: "선생님께 전송",
    titleIcon: "paper-plane",
    body: h("div", { class: "space-y-3" }, summary, status),
    footer: h("div", { class: "flex gap-2 justify-end" }, button("취소", { onclick: closeModal }), sendBtn),
    focus: "#submitSend",
  });
}
