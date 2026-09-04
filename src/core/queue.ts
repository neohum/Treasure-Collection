import type { CodexStore } from "./storage";
import type { Submission } from "./types";

/**
 * 전송과 재시도 큐. 교실 Wi-Fi는 자주 끊기므로 실패한 전송은 IndexedDB 큐에 남기고
 * 다음 [전송] 때 먼저 흘려보낸다. 순서: 큐(오래된 것부터) → 이번 전송.
 */
export type SendResult =
  | { ok: true; receiptId: string; receivedAt: string }
  | { ok: false; status?: number; error: string; retryable: boolean };

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const RECEIPT_ERROR = "허브 응답을 읽을 수 없습니다";

export async function postSubmission(url: string, body: Submission, fetchImpl: FetchLike = fetch): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "교실 허브에 연결할 수 없습니다. Wi-Fi를 확인하세요.", retryable: true };
  }
  if (res.status === 201) {
    try {
      const data = (await res.json()) as { receiptId?: unknown; receivedAt?: unknown };
      if (typeof data.receiptId === "string" && typeof data.receivedAt === "string") {
        return { ok: true, receiptId: data.receiptId, receivedAt: data.receivedAt };
      }
    } catch {
      /* fallthrough */
    }
    return { ok: false, status: 201, error: RECEIPT_ERROR, retryable: true };
  }
  let message = "";
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string") message = data.error;
  } catch {
    /* 본문 없음 */
  }
  // 4xx는 본문 자체가 거부된 것이라 다시 보내도 같다. 5xx·네트워크만 재시도 대상.
  const retryable = res.status >= 500;
  const fallback = retryable ? "허브가 지금 응답하지 못했습니다. 잠시 후 다시 시도하세요." : `허브가 전송을 거부했습니다 (${res.status}).`;
  return { ok: false, status: res.status, error: message || fallback, retryable };
}

export interface FlushResult {
  sent: number;
  remaining: number;
  lastError?: string;
}

/** 큐에 쌓인 전송분을 오래된 순으로 보낸다. 실패하면 거기서 멈추고 나머지는 남긴다. */
export async function flushQueue(store: CodexStore, url: string, fetchImpl: FetchLike = fetch): Promise<FlushResult> {
  const pending = (await store.listQueue()).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  let sent = 0;
  for (const entry of pending) {
    const result = await postSubmission(url, entry.body as Submission, fetchImpl);
    if (result.ok || !result.retryable) {
      // 성공했거나 영구 거부(4xx)면 큐에서 뺀다 — 4xx를 계속 재시도해도 결과는 같다
      await store.dequeue(entry.queuedAt);
      if (result.ok) sent++;
      continue;
    }
    return { sent, remaining: pending.length - sent, lastError: result.error };
  }
  return { sent, remaining: 0 };
}

/** 큐를 먼저 비우고 이번 전송을 보낸다. 실패(재시도 가능)면 큐에 넣는다. */
export async function submitWithQueue(store: CodexStore, url: string, submission: Submission, fetchImpl: FetchLike = fetch): Promise<{ result: SendResult; flushed: FlushResult; queued: boolean }> {
  const flushed = await flushQueue(store, url, fetchImpl);
  const result = await postSubmission(url, submission, fetchImpl);
  let queued = false;
  if (!result.ok && result.retryable) {
    await store.enqueue({ queuedAt: submission.submittedAt, body: submission });
    queued = true;
  }
  return { result, flushed, queued };
}
