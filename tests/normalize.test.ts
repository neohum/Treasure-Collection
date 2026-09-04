import { describe, expect, it } from "vitest";
import { normalizeKeyword } from "../src/core/normalize";

describe("normalizeKeyword", () => {
  it("띄어쓰기·구두점·앞뒤 공백 차이를 같은 키로 만든다 (AC-1)", () => {
    const key = normalizeKeyword("빗살무늬 토기");
    expect(normalizeKeyword("빗살무늬토기")).toBe(key);
    expect(normalizeKeyword(" 빗살 무늬 토기 ")).toBe(key);
    expect(normalizeKeyword("빗살무늬 토기!")).toBe(key);
    expect(normalizeKeyword("빗살무늬(토기)")).toBe(key);
  });

  it("영문 대소문자와 NFC/NFD 조합 차이를 흡수한다", () => {
    expect(normalizeKeyword("Cheomseongdae")).toBe(normalizeKeyword("cheomseongdae"));
    // 한글 자모 분해형(NFD)과 완성형(NFC)
    expect(normalizeKeyword("한글".normalize("NFD"))).toBe(normalizeKeyword("한글"));
  });

  it("글자가 다르면 다른 키다", () => {
    expect(normalizeKeyword("고인돌")).not.toBe(normalizeKeyword("고인들"));
  });

  it("빈 문자열과 구두점만 있는 문자열은 빈 키가 된다", () => {
    expect(normalizeKeyword("")).toBe("");
    expect(normalizeKeyword(" !?. ")).toBe("");
  });
});
