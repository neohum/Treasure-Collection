import { describe, expect, it } from "vitest";
import { buildSubmission, validateSubmission } from "../src/core/submission";
import type { UnlockRecord } from "../src/core/types";

const img = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

function walk(value: unknown, visit: (key: string, v: unknown) => void, key = ""): void {
  visit(key, value);
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, visit, String(i)));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, visit, k);
}

describe("buildSubmission (AC-4)", () => {
  const records: UnlockRecord[] = [
    { id: "art_07", mode: "photo", unlockedAt: "2026-09-04T13:05:00+09:00", note: "금".repeat(250), image: img },
    { id: "art_01", mode: "keyword", unlockedAt: "2026-09-04T13:00:00+09:00", note: "신석기" },
  ];

  it("계약 본문을 만들고 사진·IP·기기 정보는 어디에도 없다", () => {
    const s = buildSubmission({ toolId: "treasure-codex", studentLabel: " 12 ", records, total: 20, submittedAt: "2026-09-04T14:05:12+09:00" });
    expect(s).toMatchObject({ schema: 1, toolId: "treasure-codex", studentLabel: "12", summary: { unlocked: 2, total: 20 } });
    expect(s.items.map((i) => i.id)).toEqual(["art_01", "art_07"]);

    const forbidden = new Set(["image", "imageBase64", "ip", "remoteAddr", "userAgent", "deviceName"]);
    const seenKeys: string[] = [];
    walk(s, (key, v) => {
      seenKeys.push(key);
      expect(v).not.toBeInstanceOf(Blob);
      if (typeof v === "string") expect(v).not.toMatch(/^data:image/);
    });
    for (const key of seenKeys) expect(forbidden.has(key), key).toBe(false);
    // JSON 직렬화가 가능해야 한다 (Blob이 섞이면 {}로 변해 조용히 깨진다)
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it("라벨은 20자, 소감은 200자에서 잘리고 항목은 200개까지만 담는다", () => {
    const many: UnlockRecord[] = Array.from({ length: 250 }, (_, i) => ({ id: `art_${String(i).padStart(3, "0")}`, mode: "keyword", unlockedAt: "2026-09-04T13:00:00+09:00", note: "" }));
    const s = buildSubmission({ toolId: "t", studentLabel: "가".repeat(30), records: [...records, ...many], total: 300, submittedAt: "2026-09-04T14:00:00+09:00" });
    expect(Array.from(s.studentLabel)).toHaveLength(20);
    expect(s.items).toHaveLength(200);
    expect(s.summary.unlocked).toBe(200);
    const heavy = s.items.find((i) => i.id === "art_07");
    expect(Array.from(heavy!.note)).toHaveLength(200);
  });

  it("라벨이 비었거나 해금이 없으면 전송할 수 없다 (AC-5)", () => {
    const empty = buildSubmission({ toolId: "t", studentLabel: "", records, total: 20, submittedAt: "x" });
    expect(validateSubmission(empty)).toContain("번호");
    const none = buildSubmission({ toolId: "t", studentLabel: "3", records: [], total: 20, submittedAt: "x" });
    expect(validateSubmission(none)).toContain("해금");
    const ok = buildSubmission({ toolId: "t", studentLabel: "3", records, total: 20, submittedAt: "x" });
    expect(validateSubmission(ok)).toBeNull();
  });

  it("attachments가 전달되면 Submission 최상위 attachments에 정상 포함된다", () => {
    const s = buildSubmission({
      toolId: "t",
      studentLabel: "3",
      records,
      total: 20,
      submittedAt: "2026-09-17T13:00:00+09:00",
      attachments: [
        {
          id: "att-1",
          name: "유물사진.jpg",
          mimeType: "image/jpeg",
          dataUrl: "data:image/jpeg;base64,ZmFrZQ==",
          size: 100,
        },
      ],
    });

    expect(s.attachments).toBeDefined();
    expect(s.attachments).toHaveLength(1);
    expect(s.attachments![0].name).toBe("유물사진.jpg");
    expect(s.attachments![0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });
});
