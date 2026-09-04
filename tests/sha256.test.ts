import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/core/sha256";

async function webcrypto(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("sha256 순수 JS 폴백", () => {
  it("알려진 벡터", () => {
    expect(sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("WebCrypto와 결과가 같다 (한글·긴 입력·블록 경계 포함)", async () => {
    const samples = ["", "a", "treasure-codex:0.1.0:빗살무늬토기", "가".repeat(55), "x".repeat(56), "y".repeat(64), "z".repeat(1000), "🏛️ 보물"];
    for (const s of samples) {
      expect(sha256Hex(new TextEncoder().encode(s)), s.slice(0, 10)).toBe(await webcrypto(s));
    }
  });
});
