import type { Treasure, UnlockRecord } from "../core/types";
import { h, icon } from "./dom";

export interface CardActions {
  onKeyword: (t: Treasure) => void;
  onPhoto: (t: Treasure) => void;
  onDetail: (t: Treasure) => void;
  /** 교사 화면의 읽기 전용 재생: 해금 버튼을 그리지 않는다 ([자세히 보기]는 남는다) */
  readonly?: boolean;
}

/** 해금된 카드의 사진 URL은 호출자가 만들고(objectURL) 회수한다. */
export function renderCard(t: Treasure, record: UnlockRecord | undefined, imageUrl: string | undefined, actions: CardActions, justUnlocked: boolean): HTMLElement {
  if (!record) {
    return h(
      "article",
      { class: "card card-locked", "data-treasure": t.id, "data-state": "locked" },
      h("div", { class: "card-lock" }, icon("lock")),
      h("span", { class: "badge badge-muted" }, `${t.era} 미션`),
      h("h4", { class: "card-title" }, t.name),
      h("p", { class: "card-hint" }, t.hint),
      actions.readonly
        ? h("p", { class: "card-readonly-note" }, "아직 해금하지 않은 보물")
        : h(
            "div",
            { class: "card-actions no-print" },
            h("button", { type: "button", class: "btn btn-primary btn-sm", onclick: () => actions.onKeyword(t), "data-action": "keyword" }, icon("key"), h("span", {}, "핵심어 입력")),
            h("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => actions.onPhoto(t), "data-action": "photo" }, icon("camera"), h("span", {}, "사진 등록")),
          ),
    );
  }

  const media = imageUrl
    ? h("img", { src: imageUrl, alt: t.name, class: "card-image" })
    : h("div", { class: "card-keyword-art" }, icon("key", "text-4xl"), h("span", { class: "text-xs font-bold" }, "핵심어로 해금"));

  return h(
    "article",
    { class: `card card-unlocked ${justUnlocked ? "card-just-unlocked" : ""}`, "data-treasure": t.id, "data-state": "unlocked", "data-mode": record.mode },
    h(
      "div",
      { class: "card-media" },
      media,
      h("span", { class: "badge badge-era" }, t.era),
      h("span", { class: "badge badge-done" }, icon("badge-check"), h("span", {}, "해금 완료")),
    ),
    h(
      "div",
      { class: "card-body" },
      h("h4", { class: "card-title" }, t.name),
      // 학생 소감은 textContent로만 들어간다 — h()는 문자열을 createTextNode로 붙인다.
      h("p", { class: "card-note", "data-role": "note" }, record.note || "큐레이터 메모 없음"),
    ),
    h("div", { class: "card-actions no-print" }, h("button", { type: "button", class: "btn btn-dark btn-sm w-full", onclick: () => actions.onDetail(t), "data-action": "detail" }, icon("search"), h("span", {}, "자세히 보기"))),
  );
}
