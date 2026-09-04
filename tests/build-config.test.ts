import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildConfig } from "../scripts/build-config";
import { TOTAL_TREASURES } from "../src/data/treasures";

describe("build-config (AC-6)", () => {
  it("예시 핵심어로 유물 20종 전부의 해시를 만들고 평문은 담지 않는다", async () => {
    const config = await buildConfig();
    expect(config.schema).toBe(1);
    expect(config.toolId).toBe("treasure-codex");
    expect(Object.keys(config.keywordHashes)).toHaveLength(TOTAL_TREASURES);
    const json = JSON.stringify(config.keywordHashes);
    expect(json).not.toContain("빗살");
    expect(json).not.toContain("고인돌");
    for (const hashes of Object.values(config.keywordHashes)) {
      expect(hashes.length).toBeGreaterThan(0);
      for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("알 수 없는 유물 id나 핵심어가 빠진 유물이 있으면 실패한다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-kw-"));
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ art_01: ["a"], art_99: ["b"] }), "utf8");
    await expect(buildConfig(bad)).rejects.toThrow(/알 수 없는 유물 id: art_99/);
    const partial = join(dir, "partial.json");
    writeFileSync(partial, JSON.stringify({ art_01: ["a"] }), "utf8");
    await expect(buildConfig(partial)).rejects.toThrow(/핵심어가 없는 유물/);
  });
});
