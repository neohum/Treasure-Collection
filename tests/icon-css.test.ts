import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { collectUsedIconNames, trimIconCss } from "../vite.config";

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
