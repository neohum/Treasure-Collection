import type { HubContext } from "../core/hub";
import { submissionsUrl } from "../core/hub";
import { submitWithQueue } from "../core/queue";
import type { CodexStore } from "../core/storage";
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
  onDone: () => void;
}

/**
 * [전송] 모달. 허브 경로에서만 쓰인다. 본문에 사진이 없다는 사실을 학생에게도 보여 준다
 * (무엇이 나가는지 아는 것이 곧 개인정보 교육이다).
 */
export function openSubmitModal(deps: SubmitDeps): void {
  const label = deps.getLabel();
  const records = deps.getRecords();
  const submission = buildSubmission({ toolId: deps.toolId, studentLabel: label, records, total: deps.total, submittedAt: toIsoWithOffset() });
  const problem = validateSubmission(submission);

  const status = h("p", { class: "field-error", id: "submitStatus", role: "status" }, problem ?? "");
  const summary = h(
    "div",
    { class: "info-box space-y-1" },
    h("p", {}, h("strong", {}, "보내는 사람: "), label ? `${label}번` : "번호 미입력"),
    h("p", {}, h("strong", {}, "해금한 보물: "), `${submission.summary.unlocked} / ${submission.summary.total}`),
    h("p", { class: "text-slate-500" }, "보내는 것: 번호, 해금한 유물 목록, 해금 시각, 한 줄 소감. 사진은 보내지 않아요."),
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
    status.textContent = "전송 중…";
    const url = submissionsUrl(deps.hub);
    const { result, flushed, queued } = await submitWithQueue(deps.store, url, submission);
    if (result.ok) {
      status.textContent = "";
      const receipt = h(
        "div",
        { class: "info-box info-box-amber space-y-1", id: "submitReceipt" },
        h("p", { class: "font-bold flex items-center gap-1" }, icon("badge-check", "text-emerald-600"), h("span", {}, "선생님 런처에 도착했습니다!")),
        h("p", {}, h("strong", {}, "영수증 번호: "), h("code", { "data-role": "receipt-id" }, result.receiptId)),
        h("p", { class: "text-slate-500" }, `접수 시각 ${formatLocal(result.receivedAt)}${flushed.sent > 0 ? ` · 밀린 기록 ${flushed.sent}건도 함께 보냈어요` : ""}`),
      );
      summary.replaceWith(receipt);
      sendBtn.replaceWith(button("닫기", { variant: "primary", onclick: closeModal }));
      showToast("전송 완료! 선생님 화면에서 확인할 수 있어요.");
      deps.onDone();
      return;
    }
    status.textContent = queued ? `${result.error} 이번 기록은 저장해 두었다가 다음 [전송] 때 다시 보내요.` : result.error;
    sendBtn.disabled = false;
    if (queued) deps.onDone();
  }

  openModal({
    title: "선생님께 전송",
    titleIcon: "paper-plane",
    body: h("div", { class: "space-y-3" }, summary, status),
    footer: h("div", { class: "flex gap-2 justify-end" }, button("취소", { onclick: closeModal }), sendBtn),
    focus: "#submitSend",
  });
}
