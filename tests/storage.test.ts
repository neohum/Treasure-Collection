import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { CodexStore } from "../src/core/storage";
import type { UnlockRecord } from "../src/core/types";

let store: CodexStore;

beforeEach(async () => {
  // 테스트마다 새 팩토리 → 완전히 빈 DB
  store = await CodexStore.open(new IDBFactory());
});

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: "image/jpeg" });

describe("CodexStore (AC-2)", () => {
  it("사진 Blob을 포함한 해금 기록을 저장·조회·삭제한다", async () => {
    const rec: UnlockRecord = { id: "art_07", mode: "photo", unlockedAt: "2026-09-04T13:50:01+09:00", note: "금관", image: jpeg() };
    await store.putProgress(rec);

    const loaded = await store.getProgress("art_07");
    expect(loaded?.mode).toBe("photo");
    expect(loaded?.image).toBeInstanceOf(Blob);
    expect(loaded?.image?.size).toBe(7);
    expect(loaded?.image?.type).toBe("image/jpeg");

    await store.deleteProgress("art_07");
    expect(await store.getProgress("art_07")).toBeUndefined();
  });

  it("같은 id를 다시 저장하면 덮어쓰고, 전체 조회는 id 순으로 정렬된다", async () => {
    await store.putProgress({ id: "art_02", mode: "keyword", unlockedAt: "2026-09-04T13:00:00+09:00", note: "a" });
    await store.putProgress({ id: "art_01", mode: "keyword", unlockedAt: "2026-09-04T13:01:00+09:00", note: "b" });
    await store.putProgress({ id: "art_02", mode: "photo", unlockedAt: "2026-09-04T13:02:00+09:00", note: "c", image: jpeg() });

    const all = await store.getAllProgress();
    expect(all.map((r) => r.id)).toEqual(["art_01", "art_02"]);
    expect(all[1]?.mode).toBe("photo");
  });

  it("학생 라벨은 기본값이 빈 문자열이고 저장 후 유지된다", async () => {
    expect(await store.getMeta()).toEqual({ studentLabel: "" });
    await store.setMeta({ studentLabel: "12" });
    expect(await store.getMeta()).toEqual({ studentLabel: "12" });
  });

  it("전송 큐는 순서를 보존하고 개별 제거된다", async () => {
    await store.enqueue({ queuedAt: "2026-09-04T14:00:00+09:00", body: { n: 1 } });
    await store.enqueue({ queuedAt: "2026-09-04T14:05:00+09:00", body: { n: 2 } });
    expect((await store.listQueue()).map((q) => (q.body as { n: number }).n)).toEqual([1, 2]);
    await store.dequeue("2026-09-04T14:00:00+09:00");
    expect(await store.listQueue()).toHaveLength(1);
  });

  it("초기화는 진도·라벨·큐를 모두 지운다", async () => {
    await store.putProgress({ id: "art_01", mode: "keyword", unlockedAt: "2026-09-04T13:00:00+09:00", note: "" });
    await store.setMeta({ studentLabel: "7" });
    await store.enqueue({ queuedAt: "2026-09-04T14:00:00+09:00", body: {} });
    await store.wipe();
    expect(await store.getAllProgress()).toEqual([]);
    expect(await store.getMeta()).toEqual({ studentLabel: "" });
    expect(await store.listQueue()).toEqual([]);
  });
});
