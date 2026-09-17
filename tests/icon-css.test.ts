import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { collectUsedIconNames, trimIconCss, uiconsCdnUrl, withIconFontFallbacks } from "../vite.config";

const FULL = readFileSync(new URL("../node_modules/@flaticon/flaticon-uicons/css/regular/rounded.css", import.meta.url), "utf8");

describe("trimIconCss — 마켓 감사 오탐 방지 + 번들 축소", () => {
  it("실제 쓰는 아이콘 규칙만 남기고 javascript:·data: 이름의 아이콘은 사라진다", () => {
    const used = collectUsedIconNames();
    expect(used.size).toBeGreaterThan(20);
    expect(used.has("key")).toBe(true);
    expect(used.has("javascript")).toBe(false);

    const out = trimIconCss(FULL, used);
    expect(out).toContain("@font-face");
    expect(out).toMatch(/src:\s*url\([^)]*\.woff2\) format\("woff2"\);/);
    expect(out).not.toContain(".eot");
    expect(out).not.toContain(".woff)");
    expect(out).toContain(".fi-rr-key:before");
    expect(out).toContain(".fi-rr-campfire:before");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:");
    expect(out).not.toContain("variable-selector");
    // 기본 셀렉터(폰트 적용 규칙)는 살아 있다
    expect(out).toContain('i[class^=fi-rr-]:before');
    expect(out.length).toBeLessThan(FULL.length / 10);
  });

  it("사용 목록에 없는 아이콘을 쓰면 규칙이 없어 화면에서 빠진다 — 목록 수집이 소스 전체를 훑는지 확인", () => {
    const used = collectUsedIconNames();
    // src/data/treasures.ts의 시대 아이콘(icon: "…")도 수집된다
    for (const era of ["campfire", "shield", "monument", "scroll", "crown"]) expect(used.has(era), era).toBe(true);
  });
});

describe("withIconFontFallbacks — index.html만 배포돼도 아이콘 폰트가 열린다 (2026-09-17 cloud-school 404)", () => {
  const CDN = "https://cdn.jsdelivr.net/npm/@flaticon/flaticon-uicons@3.3.1/css/uicons-regular-rounded-J3WOUERV.woff2";
  const MINIFIED = '@font-face{font-family:uicons-regular-rounded;src:url(./uicons-regular-rounded-J3WOUERV-0sU45oCT.woff2)format("woff2");font-weight:400}';

  it("Vite가 낸 해시 파일을 첫 소스로 두고 ./assets/ 경로와 CDN을 그 뒤에 붙인다 (정확히 url 3개)", () => {
    const out = withIconFontFallbacks(MINIFIED, CDN);
    const srcs = out.match(/src:[^;]+;/g);
    expect(srcs).toHaveLength(1);
    const urls = [...srcs![0]!.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
    expect(urls).toEqual([
      "./uicons-regular-rounded-J3WOUERV-0sU45oCT.woff2",
      "./assets/uicons-regular-rounded-J3WOUERV-0sU45oCT.woff2",
      CDN,
    ]);
    expect(out).not.toContain("data:");
    expect(out).not.toContain("svg+xml");
    // 그 밖의 CSS는 손대지 않는다
    expect(out.startsWith("@font-face{font-family:uicons-regular-rounded;")).toBe(true);
    expect(out.endsWith(";font-weight:400}")).toBe(true);
  });

  it("공백·따옴표가 있는 비압축 형태도 같은 결과로 바꾸고, 대상이 없으면 그대로 돌려준다", () => {
    const loose = 'src: url("./uicons-regular-rounded-AB.woff2") format("woff2");';
    expect(withIconFontFallbacks(loose, CDN)).toBe(
      `src:url(./uicons-regular-rounded-AB.woff2)format("woff2"),url(./assets/uicons-regular-rounded-AB.woff2)format("woff2"),url(${CDN})format("woff2");`,
    );
    expect(withIconFontFallbacks(".a{color:red}", CDN)).toBe(".a{color:red}");
  });

  it("CDN URL은 설치된 패키지 버전과 실제 woff2 경로에서 만든다 (파일명 해시가 버전마다 다르다)", () => {
    const cssId = fileURLToPath(new URL("../node_modules/@flaticon/flaticon-uicons/css/regular/rounded.css", import.meta.url));
    const pkg = JSON.parse(readFileSync(new URL("../node_modules/@flaticon/flaticon-uicons/package.json", import.meta.url), "utf8")) as { version: string };
    const url = uiconsCdnUrl(cssId, FULL);
    expect(url).toMatch(new RegExp(`^https://cdn\\.jsdelivr\\.net/npm/@flaticon/flaticon-uicons@${pkg.version.replace(/\./g, "\\.")}/css/uicons-regular-rounded-[A-Z0-9]+\\.woff2$`));
    expect(() => uiconsCdnUrl(cssId, ".a{}")).toThrow(/woff2/);
  });
});
