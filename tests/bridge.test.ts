import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_MAX_BYTES,
  MSG,
  base64Bytes,
  collectSnapshot,
  collectedToRecords,
  collectedToSubmission,
  handleBridgeMessage,
  isInboundMessage,
  readyMessage,
  validateCollected,
  type BridgeHost,
  type CloudSchoolCollected,
  type OutboundMessage,
} from "../src/core/bridge";
import type { UnlockRecord } from "../src/core/types";

const APP = "treasure-codex";
const KNOWN = new Set(["art_01", "art_02", "art_07"]);
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAg=";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

function good(): CloudSchoolCollected {
  return {
    schema: 1,
    appId: APP,
    studentLabel: "12",
    submittedAt: "2026-09-18T14:05:00+09:00",
    summary: { unlocked: 2, total: 20 },
    items: [
      { id: "art_07", mode: "photo", unlockedAt: "2026-09-18T14:01:00+09:00", note: "금관이 화려하다" },
      { id: "art_01", mode: "keyword", unlockedAt: "2026-09-18T14:00:00+09:00", note: "정착 생활의 시작" },
    ],
    attachments: [{ id: "photo-art_07", name: "유물사진_art_07.jpg", mimeType: "image/jpeg", dataUrl: JPEG, size: 30 }],
    document: { title: "역사 보물도감", printedAt: "2026-09-18T14:05:00+09:00" },
  };
}

describe("validateCollected — 교사 화면에서 온 payload 검증", () => {
  it("올바른 payload는 정규화되어 통과한다 (항목 id 정렬, summary 재계산)", () => {
    const r = validateCollected(good(), { appId: APP, knownIds: KNOWN });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items.map((i) => i.id)).toEqual(["art_01", "art_07"]);
    expect(r.value.summary).toEqual({ unlocked: 2, total: 20 });
    expect(r.value.attachments).toHaveLength(1);
    expect(r.value.attachments[0]?.mimeType).toBe("image/jpeg");
    expect(r.value.document?.title).toBe("역사 보물도감");
  });

  it("Submission 형식(toolId)도 받는다 — 허브에 저장된 전송 본문을 그대로 재생할 수 있다", () => {
    const sub = { ...good(), appId: undefined, toolId: APP };
    const r = validateCollected(sub, { appId: APP, knownIds: KNOWN });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.appId).toBe(APP);
  });

  it.each([
    ["객체가 아님", "문자열", /객체/],
    ["schema 불일치", { ...good(), schema: 2 }, /schema/],
    ["다른 도구", { ...good(), appId: "other-tool" }, /다른 도구/],
    ["items 없음", { ...good(), items: undefined }, /items/],
    ["submittedAt 깨짐", { ...good(), submittedAt: "어제" }, /submittedAt/],
    ["attachments가 배열 아님", { ...good(), attachments: {} }, /attachments/],
  ])("%s → 거부 (한국어 사유)", (_name, raw, reason) => {
    const r = validateCollected(raw, { appId: APP, knownIds: KNOWN });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
  });

  it("모르는 유물 id·잘못된 모드·깨진 시각·중복 항목은 버리고 나머지는 살린다", () => {
    const raw = good();
    raw.items.push(
      { id: "art_99", mode: "keyword", unlockedAt: "2026-09-18T14:00:00+09:00", note: "" },
      { id: "art_02", mode: "magic" as "keyword", unlockedAt: "2026-09-18T14:00:00+09:00", note: "" },
      { id: "art_02", mode: "keyword", unlockedAt: "not-a-date", note: "" },
      { id: "art_01", mode: "keyword", unlockedAt: "2026-09-18T15:00:00+09:00", note: "중복" },
    );
    const r = validateCollected(raw, { appId: APP, knownIds: KNOWN });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.items.map((i) => i.id)).toEqual(["art_01", "art_07"]);
      expect(r.value.items[0]?.note).toBe("정착 생활의 시작");
    }
  });

  it("라벨 20자·소감 200자로 자르고 항목은 200개까지만 담는다", () => {
    const raw = good();
    raw.studentLabel = "가".repeat(40);
    raw.items[0]!.note = "금".repeat(500);
    const many = Array.from({ length: 300 }, (_, i) => `art_${String(i).padStart(3, "0")}`);
    raw.items = [...raw.items, ...many.map((id) => ({ id, mode: "keyword" as const, unlockedAt: "2026-09-18T14:00:00+09:00", note: "" }))];
    const r = validateCollected(raw, { appId: APP, knownIds: new Set([...KNOWN, ...many]) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Array.from(r.value.studentLabel)).toHaveLength(20);
      expect(Array.from(r.value.items.find((i) => i.id === "art_07")!.note)).toHaveLength(200);
      expect(r.value.items).toHaveLength(200);
    }
  });

  it("첨부는 image/jpeg·image/png data URL만, `photo-<id>` 짝이 있어야, 2 MB 이하만 받는다", () => {
    const big = "A".repeat(Math.ceil((ATTACHMENT_MAX_BYTES + 3) / 3) * 4);
    expect(base64Bytes(big)).toBeGreaterThan(ATTACHMENT_MAX_BYTES);
    const raw = good();
    raw.attachments = [
      { id: "photo-art_07", name: "ok.jpg", mimeType: "image/jpeg", dataUrl: JPEG },
      { id: "photo-art_01", name: "png.png", mimeType: "image/png", dataUrl: PNG },
      { id: "photo-art_02", name: "orphan.jpg", mimeType: "image/jpeg", dataUrl: JPEG }, // 항목 없음
      { id: "art_07", name: "badid.jpg", mimeType: "image/jpeg", dataUrl: JPEG }, // 접두사 없음
      { id: "photo-art_07", name: "svg.svg", mimeType: "image/svg+xml", dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
      { id: "photo-art_07", name: "html.html", mimeType: "text/html", dataUrl: "data:text/html;base64,PGI+eDwvYj4=" },
      { id: "photo-art_07", name: "blob", mimeType: "image/jpeg", dataUrl: "blob:http://x/abc" },
      { id: "photo-art_07", name: "too-big.jpg", mimeType: "image/jpeg", dataUrl: `data:image/jpeg;base64,${big}` },
    ];
    const r = validateCollected(raw, { appId: APP, knownIds: KNOWN });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.attachments.map((a) => [a.id, a.mimeType])).toEqual([
        ["photo-art_07", "image/jpeg"],
        ["photo-art_01", "image/png"],
      ]);
    }
  });

  it("2 MB 경계: 정확히 한도까지는 통과한다", () => {
    const exact = "A".repeat((ATTACHMENT_MAX_BYTES / 3) * 4); // 2 MiB는 3의 배수가 아니므로 내림
    const raw = good();
    raw.attachments = [{ id: "photo-art_07", name: "edge.jpg", mimeType: "image/jpeg", dataUrl: `data:image/jpeg;base64,${exact}` }];
    const r = validateCollected(raw, { appId: APP, knownIds: KNOWN });
    expect(r.ok && r.value.attachments.length).toBe(1);
  });
});

describe("collectedToRecords / collectedToSubmission", () => {
  it("첨부를 Blob으로 바꿔 해당 카드에 붙인다 (live 모드와 같은 UnlockRecord)", async () => {
    const r = validateCollected(good(), { appId: APP, knownIds: KNOWN });
    if (!r.ok) throw new Error(r.reason);
    const records = collectedToRecords(r.value);
    expect(records.map((x) => x.id)).toEqual(["art_01", "art_07"]);
    expect(records[0]?.image).toBeUndefined();
    const img = records[1]?.image;
    expect(img).toBeInstanceOf(Blob);
    expect(img?.type).toBe("image/jpeg");
    const bytes = new Uint8Array(await img!.arrayBuffer());
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  });

  it("전송 API 계약 본문(Submission)으로 되돌리면 toolId·attachments가 그대로다", () => {
    const sub = collectedToSubmission(good());
    expect(sub).toMatchObject({ schema: 1, toolId: APP, studentLabel: "12", summary: { unlocked: 2, total: 20 } });
    expect(sub.attachments).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(sub))).toEqual(sub);
    const none = collectedToSubmission({ ...good(), attachments: [] });
    expect(none.attachments).toBeUndefined();
  });
});

describe("collectSnapshot", () => {
  it("Submission과 같은 items에 appId·document를 더한 형태를 만든다", async () => {
    const records: UnlockRecord[] = [
      { id: "art_07", mode: "photo", unlockedAt: "2026-09-18T14:01:00+09:00", note: "금관" },
      { id: "art_01", mode: "keyword", unlockedAt: "2026-09-18T14:00:00+09:00", note: "신석기" },
    ];
    const c = await collectSnapshot({ toolId: APP, title: "역사 보물도감", studentLabel: " 12 ", records, total: 20, now: "2026-09-18T14:05:00+09:00" });
    expect(c).toMatchObject({ schema: 1, appId: APP, studentLabel: "12", submittedAt: "2026-09-18T14:05:00+09:00", summary: { unlocked: 2, total: 20 } });
    expect(c.items.map((i) => i.id)).toEqual(["art_01", "art_07"]);
    expect(c.document).toEqual({ title: "역사 보물도감", printedAt: "2026-09-18T14:05:00+09:00" });
    // node 환경(canvas 없음)에서는 사진이 압축되지 않아 첨부가 비지만 배열은 항상 있다
    expect(Array.isArray(c.attachments)).toBe(true);
  });
});

describe("handleBridgeMessage — postMessage 라우팅", () => {
  function fakeHost() {
    const calls: string[] = [];
    let restored: CloudSchoolCollected | null = null;
    const host: BridgeHost = {
      appId: APP,
      title: "역사 보물도감",
      knownIds: KNOWN,
      warn: (m) => calls.push(`warn:${m}`),
      collect: async () => {
        calls.push("collect");
        return restored ?? { ...good(), items: [], attachments: [], summary: { unlocked: 0, total: 20 } };
      },
      restore: async (payload, opts) => {
        calls.push(`restore:${opts.studentName ?? ""}`);
        restored = payload;
        return { studentLabel: payload.studentLabel, unlocked: payload.items.length, total: 20 };
      },
      clearRestore: async () => {
        calls.push("clear");
        restored = null;
      },
    };
    return { host, calls };
  }

  it("우리 타입이 아닌 메시지는 건드리지 않는다", async () => {
    const { host, calls } = fakeHost();
    const sent: OutboundMessage[] = [];
    for (const data of [null, "x", 42, {}, { type: "edulinker_submission" }, { type: "cloudschool_app_ready" }, { type: "eval", code: "alert(1)" }]) {
      expect(isInboundMessage(data)).toBe(false);
      expect(await handleBridgeMessage(host, data, (m) => sent.push(m))).toBe(false);
    }
    expect(sent).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("ready 메시지 형태", () => {
    expect(readyMessage({ appId: APP, title: "역사 보물도감" })).toEqual({ type: "cloudschool_app_ready", appId: APP, title: "역사 보물도감", version: 1 });
  });

  it("restore → restored 응답, 이후 collect는 재생 중인 payload를 돌려준다(멱등), clear → restore_cleared", async () => {
    const { host, calls } = fakeHost();
    const sent: OutboundMessage[] = [];
    const reply = (m: OutboundMessage) => sent.push(m);

    await handleBridgeMessage(host, { type: MSG.restore, payload: good(), studentName: "12번" }, reply, "https://teacher.example");
    expect(sent[0]).toEqual({ type: "cloudschool_restored", appId: APP, studentLabel: "12", unlocked: 2, total: 20 });
    expect(calls).toEqual(["restore:12번"]);

    await handleBridgeMessage(host, { type: MSG.collect, requestId: "req-1" }, reply);
    await handleBridgeMessage(host, { type: MSG.collect, requestId: 7 }, reply);
    const c1 = sent[1];
    const c2 = sent[2];
    expect(c1?.type).toBe("cloudschool_collected");
    if (c1?.type !== "cloudschool_collected" || c2?.type !== "cloudschool_collected") throw new Error("collected 응답이 아님");
    expect(c1.requestId).toBe("req-1");
    expect(c2.requestId).toBe("7");
    expect(c1.payload.items.map((i) => i.id)).toEqual(["art_01", "art_07"]);
    expect(c2.payload).toEqual(c1.payload);

    await handleBridgeMessage(host, { type: MSG.clearRestore }, reply);
    expect(sent[3]).toEqual({ type: "cloudschool_restore_cleared" });
    await handleBridgeMessage(host, { type: MSG.collect, requestId: "after" }, reply);
    const after = sent[4];
    if (after?.type !== "cloudschool_collected") throw new Error("collected 응답이 아님");
    expect(after.payload.items).toEqual([]);
    expect(calls).toEqual(["restore:12번", "collect", "collect", "clear", "collect"]);
  });

  it("검증에 실패한 restore는 한국어 warn만 남기고 응답하지 않는다", async () => {
    const { host, calls } = fakeHost();
    const sent: OutboundMessage[] = [];
    const handled = await handleBridgeMessage(host, { type: MSG.restore, payload: { ...good(), appId: "evil" } }, (m) => sent.push(m), "https://evil.example");
    expect(handled).toBe(true);
    expect(sent).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^warn:\[보물도감\] .*무시했습니다 — 다른 도구의 payload입니다: evil \(origin: https:\/\/evil\.example\)$/);
  });
});
