import { describe, expect, it } from "vitest";
import { detectHub, submissionsUrl } from "../src/core/hub";

describe("detectHub (AC-5)", () => {
  const origin = "http://192.168.0.10:8080";

  it("/dist/{toolID}/… 경로에서 허브 원점과 toolID를 뽑는다", () => {
    expect(detectHub({ origin, pathname: "/dist/treasure-codex/" })).toEqual({ hubOrigin: origin, toolId: "treasure-codex" });
    expect(detectHub({ origin, pathname: "/dist/treasure-codex/index.html" })).toEqual({ hubOrigin: origin, toolId: "treasure-codex" });
    expect(detectHub({ origin, pathname: "/dist/treasure-codex/assets/x.js" })?.toolId).toBe("treasure-codex");
  });

  it("허브 경로가 아니면 null (GitHub Pages, 로컬 preview, 슬래시 없는 /dist/{id})", () => {
    expect(detectHub({ origin: "https://neohum.github.io", pathname: "/Treasure-Collection/" })).toBeNull();
    expect(detectHub({ origin: "http://127.0.0.1:4179", pathname: "/" })).toBeNull();
    expect(detectHub({ origin, pathname: "/dist/treasure-codex" })).toBeNull();
    expect(detectHub({ origin, pathname: "/dist/Treasure_Codex/" })).toBeNull();
    expect(detectHub({ origin, pathname: "/tools/treasure-codex/" })).toBeNull();
  });

  it("전송 URL은 계약 경로다", () => {
    expect(submissionsUrl({ hubOrigin: origin, toolId: "treasure-codex" })).toBe(`${origin}/api/tools/treasure-codex/submissions`);
  });
});
