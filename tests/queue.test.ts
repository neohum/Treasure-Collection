import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { flushQueue, postSubmission, submitWithQueue, type FetchLike } from "../src/core/queue";
import { CodexStore } from "../src/core/storage";
import { buildSubmission } from "../src/core/submission";
import type { Submission } from "../src/core/types";

const URL_ = "http://192.168.0.10:8080/api/tools/treasure-codex/submissions";

function sub(label: string, at: string): Submission {
  return buildSubmission({ toolId: "treasure-codex", studentLabel: label, records: [{ id: "art_01", mode: "keyword", unlockedAt: at, note: "" }], total: 20, submittedAt: at });
}

function fetchScript(responses: Array<number | "network">): { fetch: FetchLike; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    if (r === "network") throw new TypeError("Failed to fetch");
    if (r === 201) return new Response(JSON.stringify({ receiptId: `r-${i}`, receivedAt: "2026-09-04T14:05:13+09:00" }), { status: 201 });
    return new Response(JSON.stringify({ error: r === 400 ? "잘못된 본문" : "hub down" }), { status: r });
  };
  return { fetch, calls };
}

let store: CodexStore;
beforeEach(async () => {
  store = await CodexStore.open(new IDBFactory());
});

describe("postSubmission", () => {
  it("201이면 영수증을 돌려주고 JSON 본문·Content-Type으로 보낸다", async () => {
    const calls: RequestInit[] = [];
    const f: FetchLike = async (_u, init) => { calls.push(init); return new Response(JSON.stringify({ receiptId: "abc", receivedAt: "x" }), { status: 201 }); };
    const r = await postSubmission(URL_, sub("12", "2026-09-04T14:00:00+09:00"), f);
    expect(r).toEqual({ ok: true, receiptId: "abc", receivedAt: "x" });
    expect(calls[0]?.method).toBe("POST");
    expect((calls[0]?.headers as Record<string, string>)["Content-Type"]).toContain("application/json");
  });

  it("네트워크 오류·5xx는 재시도 대상, 4xx는 아니다", async () => {
    const s = sub("12", "2026-09-04T14:00:00+09:00");
    expect((await postSubmission(URL_, s, fetchScript(["network"]).fetch)).ok).toBe(false);
    expect(await postSubmission(URL_, s, fetchScript(["network"]).fetch)).toMatchObject({ retryable: true });
    expect(await postSubmission(URL_, s, fetchScript([503]).fetch)).toMatchObject({ retryable: true, status: 503 });
    expect(await postSubmission(URL_, s, fetchScript([400]).fetch)).toMatchObject({ retryable: false, status: 400, error: "잘못된 본문" });
    expect(await postSubmission(URL_, s, fetchScript([403]).fetch)).toMatchObject({ retryable: false, status: 403 });
  });
});

describe("submitWithQueue / flushQueue (AC-2)", () => {
  it("실패하면 큐에 남고, 다음 전송에서 밀린 것부터 순서대로 보낸다", async () => {
    const first = sub("12", "2026-09-04T14:00:00+09:00");
    const down = fetchScript(["network"]);
    const r1 = await submitWithQueue(store, URL_, first, down.fetch);
    expect(r1.result.ok).toBe(false);
    expect(r1.queued).toBe(true);
    expect(await store.listQueue()).toHaveLength(1);

    const second = sub("12", "2026-09-04T14:10:00+09:00");
    const up = fetchScript([201]);
    const r2 = await submitWithQueue(store, URL_, second, up.fetch);
    expect(r2.result.ok).toBe(true);
    expect(r2.flushed).toEqual({ sent: 1, remaining: 0 });
    expect(up.calls.map((c) => (c.body as Submission).submittedAt)).toEqual(["2026-09-04T14:00:00+09:00", "2026-09-04T14:10:00+09:00"]);
    expect(await store.listQueue()).toHaveLength(0);
  });

  it("큐 전송 중 다시 실패하면 거기서 멈추고 남은 것을 보고한다", async () => {
    await store.enqueue({ queuedAt: "2026-09-04T13:00:00+09:00", body: sub("1", "2026-09-04T13:00:00+09:00") });
    await store.enqueue({ queuedAt: "2026-09-04T13:05:00+09:00", body: sub("1", "2026-09-04T13:05:00+09:00") });
    const flaky = fetchScript([201, 503]);
    const r = await flushQueue(store, URL_, flaky.fetch);
    expect(r).toMatchObject({ sent: 1, remaining: 1 });
    expect(await store.listQueue()).toHaveLength(1);
  });

  it("허브가 4xx로 거부한 큐 항목은 무한 재시도하지 않고 버린다", async () => {
    await store.enqueue({ queuedAt: "2026-09-04T13:00:00+09:00", body: sub("1", "2026-09-04T13:00:00+09:00") });
    const r = await flushQueue(store, URL_, fetchScript([400]).fetch);
    expect(r).toEqual({ sent: 0, remaining: 0 });
    expect(await store.listQueue()).toHaveLength(0);
  });
});
