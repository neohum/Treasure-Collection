import { describe, expect, it } from "vitest";
import { buildKeywordHashes, checkKeyword, hashKeyword } from "../src/core/unlock";
import type { CodexConfig } from "../src/core/types";
import { ERAS } from "../src/data/treasures";

async function makeConfig(keywords: Record<string, string[]>): Promise<CodexConfig> {
  const hashSalt = "treasure-codex:test";
  return {
    schema: 1,
    toolId: "treasure-codex",
    version: "test",
    title: "t",
    hashSalt,
    eras: ERAS,
    keywordHashes: await buildKeywordHashes(hashSalt, keywords),
  };
}

describe("keyword unlock (AC-1)", () => {
  it("정규화가 같은 입력은 해시가 같고, 소금이 다르면 해시가 다르다", async () => {
    expect(await hashKeyword("s", "빗살무늬 토기")).toBe(await hashKeyword("s", "빗살무늬토기"));
    expect(await hashKeyword("s", "고인돌")).not.toBe(await hashKeyword("t", "고인돌"));
    expect(await hashKeyword("s", "고인돌")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("정답(표기 변형 포함)은 해금되고 오답은 해금되지 않는다", async () => {
    const config = await makeConfig({ art_01: ["빗살무늬 토기", "신석기"], art_02: ["고인돌"] });
    expect(await checkKeyword(config, "art_01", "빗살무늬토기")).toBe(true);
    expect(await checkKeyword(config, "art_01", " 빗살 무늬 토기 ")).toBe(true);
    expect(await checkKeyword(config, "art_01", "신석기!")).toBe(true);
    expect(await checkKeyword(config, "art_01", "고인돌")).toBe(false);
    expect(await checkKeyword(config, "art_02", "고인들")).toBe(false);
    expect(await checkKeyword(config, "art_99", "고인돌")).toBe(false);
  });

  it("빈 입력·구두점만 있는 입력은 절대 해금되지 않는다", async () => {
    const config = await makeConfig({ art_01: ["", " ", "빗살무늬 토기"] });
    expect(await checkKeyword(config, "art_01", "")).toBe(false);
    expect(await checkKeyword(config, "art_01", " ?! ")).toBe(false);
    // 빈 핵심어는 해시 목록에도 들어가지 않는다
    expect(config.keywordHashes["art_01"]).toHaveLength(1);
  });

  it("설정에는 평문 핵심어가 남지 않는다 (AC-6의 전제)", async () => {
    const config = await makeConfig({ art_01: ["빗살무늬 토기"] });
    expect(JSON.stringify(config.keywordHashes)).not.toContain("빗살");
  });

  it("_로 시작하는 메타 키(_comment)는 무시한다", async () => {
    const hashes = await buildKeywordHashes("s", { _comment: ["x"], art_01: ["a"] });
    expect(Object.keys(hashes)).toEqual(["art_01"]);
  });
});
