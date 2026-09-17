/**
 * innerHTML 없는 작은 DOM 헬퍼. 학생 입력(소감·라벨)이 HTML로 해석될 길을 애초에 없앤다
 * (eslint no-restricted-properties가 innerHTML을 막는다).
 */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "class") {
      el.className = String(value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, ...children);
  return el;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * 인라인 SVG 요소를 DOM API로 만든다 (브랜드 로고 전용 — 아이콘은 여전히 `icon()`의 fi fi-rr만 쓴다).
 * 별도 파일·data: URL 없이 그리므로 index.html 하나만 배포된 환경에서도 깨진 이미지가 생기지 않는다.
 */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  for (const child of children) el.appendChild(child);
  return el;
}

/** 아이콘 단일 표준: `fi fi-rr-<name>` (Flaticon UIcons Regular Rounded) */
export function icon(name: string, extraClass = ""): HTMLElement {
  return h("i", { class: `fi fi-rr-${name}${extraClass ? " " + extraClass : ""}`, "aria-hidden": "true" });
}
