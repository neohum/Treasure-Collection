import { svg } from "./dom";

/**
 * 헤더 브랜드 로고 — 보물상자 마크를 인라인 SVG로 그린다.
 * `<img src="./logo.svg">`였을 때 cloud-school처럼 index.html만 배포되는 곳에서 깨진 이미지가 떴다(2026-09-17).
 * data: URL은 마켓 보안 감사가 거부하므로 DOM으로 직접 그린다. 같은 그림이 public/logo.svg(PWA·브랜드 게이트)에 있다.
 * 아이콘이 아니라 브랜드 마크이므로 fi fi-rr 표준의 예외다 — 화면 안의 아이콘은 계속 icon()만 쓴다.
 */
export function renderLogo(size = 40): SVGSVGElement {
  return svg(
    "svg",
    { viewBox: "0 0 64 64", width: size, height: size, role: "img", "aria-label": "역사 보물도감 로고", class: "app-logo" },
    svg("rect", { width: 64, height: 64, rx: 14, fill: "#1e293b" }),
    svg("circle", { cx: 32, cy: 32, r: 24, fill: "none", stroke: "#f59e0b", "stroke-width": 2.5 }),
    // 뚜껑
    svg("path", { d: "M 18 28 Q 32 18 46 28 L 46 31 L 18 31 Z", fill: "#fbbf24" }),
    // 상자
    svg("rect", { x: 18, y: 32, width: 28, height: 15, rx: 3, fill: "#f59e0b" }),
    // 잠금쇠
    svg("rect", { x: 30, y: 29, width: 4, height: 7, rx: 1, fill: "#fef3c7" }),
  );
}
