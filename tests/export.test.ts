import { describe, expect, it } from "vitest";
import { ImportError, exportProgress, importProgress } from "../src/core/export";
import type { UnlockRecord } from "../src/core/types";

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

describe("export / import (AC-3)", () => {
  it("내보낸 JSON을 다시 가져오면 사진 바이트까지 동일하게 복원된다", async () => {
    const records: UnlockRecord[] = [
      { id: "art_01", mode: "keyword", unlockedAt: "2026-09-04T13:00:00+09:00", note: "신석기" },
      { id: "art_07", mode: "photo", unlockedAt: "2026-09-04T13:05:00+09:00", note: "금관", image: new Blob([bytes], { type: "image/jpeg" }) },
    ];
    const file = await exportProgress("treasure-codex", { studentLabel: "12" }, records, "2026-09-04T14:00:00+09:00");
    expect(file.schema).toBe(1);
    expect(file.records[1]?.image).toMatch(/^data:image\/jpeg;base64,/);

    // JSON 왕복
    const restored = importProgress(JSON.parse(JSON.stringify(file)), "treasure-codex");
    expect(restored.meta.studentLabel).toBe("12");
    expect(restored.records.map((r) => r.id)).toEqual(["art_01", "art_07"]);
    expect(restored.records[0]?.image).toBeUndefined();
    const img = restored.records[1]?.image;
    expect(img?.type).toBe("image/jpeg");
    expect(new Uint8Array(await img!.arrayBuffer())).toEqual(bytes);
  });

  it("다른 도구·다른 버전·깨진 기록은 거부한다", () => {
    expect(() => importProgress({ schema: 2, toolId: "treasure-codex", records: [] }, "treasure-codex")).toThrow(ImportError);
    expect(() => importProgress({ schema: 1, toolId: "other", records: [] }, "treasure-codex")).toThrow(ImportError);
    expect(() => importProgress({ schema: 1, toolId: "treasure-codex", records: [{ id: 1 }] }, "treasure-codex")).toThrow(ImportError);
    expect(() => importProgress("문자열", "treasure-codex")).toThrow(ImportError);
  });
});
