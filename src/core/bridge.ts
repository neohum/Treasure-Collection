import { dataUrlToBlob } from "./export";
import { buildSubmission, extractAttachmentsFromRecords } from "./submission";
import { LIMITS, type Submission, type SubmissionAttachment, type SubmissionItem, type UnlockMode, type UnlockRecord } from "./types";

/**
 * Cloud-School 교사 화면(런처-테스트 "과제 수집")과의 프로토콜 — 순수 함수만 둔다.
 * window·document를 만지는 배선은 src/main.ts에 있다. 전문은 docs/cloudschool-protocol.md.
 *
 *  - collect: 학생의 현재 저장 상태(사진 포함)를 한 덩어리로 내준다
 *  - restore: 교사가 고른 학생의 덩어리를 같은 도감 화면에 읽기 전용으로 그린다 (IndexedDB에 쓰지 않는다)
 *  - 들어오는 payload는 전부 여기서 검증한다. eval·innerHTML 없음, 사진은 image data URL만.
 */

export const CLOUDSCHOOL_PROTOCOL_VERSION = 1 as const;

/** 교사 화면에 넘어가는 수집 결과. items·attachments는 전송 API 계약(Submission)과 같은 타입이다. */
export interface CloudSchoolCollected {
  schema: 1;
  appId: string;
  studentLabel: string;
  /** 오프셋 포함 ISO 8601 (src/core/time.ts toIsoWithOffset) */
  submittedAt: string;
  summary: { unlocked: number; total: number };
  items: SubmissionItem[];
  /** 사진은 JPEG data URL. id는 반드시 `photo-<treasureId>` — restore가 카드에 되돌려 붙이는 열쇠다. */
  attachments: SubmissionAttachment[];
  /** 교사 목록용 메타데이터 */
  document?: { title: string; printedAt: string };
}

export interface CloudSchoolApp {
  version: 1;
  appId: string;
  title: string;
  collect(): Promise<CloudSchoolCollected>;
  restore(payload: CloudSchoolCollected | Submission, opts?: { studentName?: string }): Promise<void>;
  clearRestore(): Promise<void>;
}

/** window.postMessage 메시지 타입 문자열 — 교사 쪽이 정확히 이 이름으로 맞춘다. */
export const MSG = {
  /** app → parent, 부팅 직후 */
  ready: "cloudschool_app_ready",
  /** parent → app */
  restore: "cloudschool_restore",
  collect: "cloudschool_collect",
  clearRestore: "cloudschool_clear_restore",
  /** app → parent 응답 */
  restored: "cloudschool_restored",
  collected: "cloudschool_collected",
  restoreCleared: "cloudschool_restore_cleared",
} as const;

export type InboundMessage =
  | { type: typeof MSG.restore; payload: unknown; studentName?: unknown }
  | { type: typeof MSG.collect; requestId?: unknown }
  | { type: typeof MSG.clearRestore };

export type OutboundMessage =
  | { type: typeof MSG.ready; appId: string; title: string; version: 1 }
  | { type: typeof MSG.restored; appId: string; studentLabel: string; unlocked: number; total: number }
  | { type: typeof MSG.collected; requestId: string; payload: CloudSchoolCollected }
  | { type: typeof MSG.restoreCleared };

const INBOUND_TYPES: ReadonlySet<string> = new Set([MSG.restore, MSG.collect, MSG.clearRestore]);

/** 우리 메시지인지 — `type`이 수신 목록에 있을 때만. 그 밖의 postMessage(광고 SDK·devtools 등)는 조용히 지나간다. */
export function isInboundMessage(data: unknown): data is InboundMessage {
  return typeof data === "object" && data !== null && typeof (data as { type?: unknown }).type === "string" && INBOUND_TYPES.has((data as { type: string }).type);
}

// ───────────────────────── collect ─────────────────────────

/** 학생의 현재 상태를 수집 payload로 만든다. [전송] 모달(src/ui/submit.ts)도 이 함수를 통해 본문을 만든다. */
export async function collectSnapshot(input: {
  toolId: string;
  title: string;
  studentLabel: string;
  records: UnlockRecord[];
  total: number;
  now: string;
}): Promise<CloudSchoolCollected> {
  const attachments = await extractAttachmentsFromRecords(input.records);
  const sub = buildSubmission({ toolId: input.toolId, studentLabel: input.studentLabel, records: input.records, total: input.total, submittedAt: input.now });
  return {
    schema: 1,
    appId: sub.toolId,
    studentLabel: sub.studentLabel,
    submittedAt: sub.submittedAt,
    summary: sub.summary,
    items: sub.items,
    attachments,
    document: { title: input.title, printedAt: input.now },
  };
}

/** 수집 payload → 전송 API 계약 본문 (허브 POST·edulinker_submission의 `data`). */
export function collectedToSubmission(c: CloudSchoolCollected): Submission {
  const sub: Submission = {
    schema: 1,
    toolId: c.appId,
    studentLabel: c.studentLabel,
    submittedAt: c.submittedAt,
    summary: { unlocked: c.summary.unlocked, total: c.summary.total },
    items: c.items.map((i) => ({ ...i })),
  };
  if (c.attachments.length > 0) sub.attachments = c.attachments.map((a) => ({ ...a }));
  return sub;
}

// ───────────────────────── validate ─────────────────────────

export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
const ATTACHMENT_ID = /^photo-(.+)$/;
const DATA_URL_IMAGE = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+=*)$/;
const MODES: ReadonlySet<string> = new Set<UnlockMode>(["keyword", "photo"]);

export type ValidationResult = { ok: true; value: CloudSchoolCollected } | { ok: false; reason: string };

function clampRunes(value: string, max: number): string {
  const runes = Array.from(value.trim());
  return runes.length <= max ? runes.join("") : runes.slice(0, max).join("");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** base64 본문의 디코딩 후 바이트 수 (패딩 감안) */
export function base64Bytes(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * 교사 화면에서 온 payload를 검증·정규화한다. `Submission`(toolId)도 받는다.
 *  - schema 1, appId(또는 toolId)가 이 도구와 같아야 한다
 *  - 문자열은 LIMITS로 자른다. 모르는 유물 id·짝이 없는 첨부·모드 오류 항목은 버린다(전체 거부 아님)
 *  - 첨부는 `data:image/jpeg` 또는 `data:image/png` base64만, 디코딩 후 2 MB 이하
 * 실패 사유는 한국어 문장으로 돌려주며 호출자가 console.warn에 쓴다.
 */
export function validateCollected(raw: unknown, ctx: { appId: string; knownIds: ReadonlySet<string> }): ValidationResult {
  if (!isRecord(raw)) return { ok: false, reason: "payload가 객체가 아닙니다" };
  if (raw["schema"] !== 1) return { ok: false, reason: `지원하지 않는 schema입니다: ${String(raw["schema"])}` };
  const appId = typeof raw["appId"] === "string" ? raw["appId"] : typeof raw["toolId"] === "string" ? raw["toolId"] : "";
  if (appId !== ctx.appId) return { ok: false, reason: `다른 도구의 payload입니다: ${appId || "(없음)"}` };
  if (!Array.isArray(raw["items"])) return { ok: false, reason: "items 배열이 없습니다" };
  const submittedAt = typeof raw["submittedAt"] === "string" ? raw["submittedAt"] : "";
  if (!submittedAt || Number.isNaN(Date.parse(submittedAt))) return { ok: false, reason: "submittedAt이 ISO 8601 시각이 아닙니다" };
  if (raw["attachments"] !== undefined && !Array.isArray(raw["attachments"])) return { ok: false, reason: "attachments가 배열이 아닙니다" };

  const studentLabel = clampRunes(typeof raw["studentLabel"] === "string" ? raw["studentLabel"] : "", LIMITS.studentLabelMax);

  const items: SubmissionItem[] = [];
  const seen = new Set<string>();
  for (const row of raw["items"] as unknown[]) {
    if (items.length >= LIMITS.itemsMax) break;
    if (!isRecord(row)) continue;
    const id = row["id"];
    const mode = row["mode"];
    const unlockedAt = row["unlockedAt"];
    if (typeof id !== "string" || !ctx.knownIds.has(id) || seen.has(id)) continue;
    if (typeof mode !== "string" || !MODES.has(mode)) continue;
    if (typeof unlockedAt !== "string" || Number.isNaN(Date.parse(unlockedAt))) continue;
    seen.add(id);
    items.push({ id, mode: mode as UnlockMode, unlockedAt, note: clampRunes(typeof row["note"] === "string" ? row["note"] : "", LIMITS.noteMax) });
  }
  items.sort((a, b) => a.id.localeCompare(b.id));

  const attachments: SubmissionAttachment[] = [];
  const attachedFor = new Set<string>();
  for (const row of (raw["attachments"] as unknown[] | undefined) ?? []) {
    if (!isRecord(row)) continue;
    const id = row["id"];
    const dataUrl = row["dataUrl"];
    if (typeof id !== "string" || typeof dataUrl !== "string") continue;
    const idMatch = ATTACHMENT_ID.exec(id);
    if (!idMatch || !seen.has(idMatch[1]!) || attachedFor.has(idMatch[1]!)) continue;
    const urlMatch = DATA_URL_IMAGE.exec(dataUrl);
    if (!urlMatch) continue;
    if (base64Bytes(urlMatch[2]!) > ATTACHMENT_MAX_BYTES) continue;
    attachedFor.add(idMatch[1]!);
    const att: SubmissionAttachment = {
      id,
      name: clampRunes(typeof row["name"] === "string" ? row["name"] : `유물사진_${idMatch[1]}.${urlMatch[1] === "png" ? "png" : "jpg"}`, 120),
      mimeType: `image/${urlMatch[1]}`,
      dataUrl,
    };
    if (typeof row["size"] === "number" && Number.isFinite(row["size"])) att.size = row["size"];
    attachments.push(att);
  }

  const total = isRecord(raw["summary"]) && typeof raw["summary"]["total"] === "number" && Number.isFinite(raw["summary"]["total"]) ? Math.max(items.length, Math.trunc(raw["summary"]["total"])) : items.length;

  const value: CloudSchoolCollected = { schema: 1, appId, studentLabel, submittedAt, summary: { unlocked: items.length, total }, items, attachments };
  const doc = raw["document"];
  if (isRecord(doc) && typeof doc["title"] === "string" && typeof doc["printedAt"] === "string") {
    value.document = { title: clampRunes(doc["title"], 120), printedAt: doc["printedAt"] };
  }
  return { ok: true, value };
}

/** 검증된 payload → 화면이 그리는 해금 기록. 사진 data URL은 Blob으로 바꿔 live 모드와 같은 objectURL 경로를 탄다. */
export function collectedToRecords(c: CloudSchoolCollected): UnlockRecord[] {
  const photos = new Map<string, Blob>();
  for (const a of c.attachments) {
    const m = ATTACHMENT_ID.exec(a.id);
    if (!m) continue;
    try {
      photos.set(m[1]!, dataUrlToBlob(a.dataUrl));
    } catch {
      /* 검증을 통과한 data URL이므로 도달하지 않지만, 깨진 첨부 하나가 전체를 막지 않게 한다 */
    }
  }
  return c.items.map((i) => {
    const rec: UnlockRecord = { id: i.id, mode: i.mode, unlockedAt: i.unlockedAt, note: i.note };
    const img = photos.get(i.id);
    if (img) rec.image = img;
    return rec;
  });
}

// ───────────────────────── message routing ─────────────────────────

export interface BridgeHost {
  appId: string;
  title: string;
  collect(): Promise<CloudSchoolCollected>;
  /** 검증된 payload를 그린다. 반환값은 응답 메시지에 실린다. */
  restore(payload: CloudSchoolCollected, opts: { studentName?: string }): Promise<{ studentLabel: string; unlocked: number; total: number }>;
  clearRestore(): Promise<void>;
  knownIds: ReadonlySet<string>;
  warn?: (message: string) => void;
}

export function readyMessage(host: Pick<BridgeHost, "appId" | "title">): OutboundMessage {
  return { type: MSG.ready, appId: host.appId, title: host.title, version: CLOUDSCHOOL_PROTOCOL_VERSION };
}

/**
 * 들어온 메시지 하나를 처리하고 응답을 `reply`로 보낸다. 우리 타입이 아니면 아무것도 하지 않는다.
 * origin은 기록용으로만 받는다(교사 화면의 출처가 배포마다 달라 현재는 제한하지 않는다).
 */
export async function handleBridgeMessage(host: BridgeHost, data: unknown, reply: (msg: OutboundMessage) => void, origin = ""): Promise<boolean> {
  if (!isInboundMessage(data)) return false;
  const warn = host.warn ?? ((m: string) => console.warn(m));
  const from = origin ? ` (origin: ${origin})` : "";
  switch (data.type) {
    case MSG.restore: {
      const result = validateCollected(data.payload, { appId: host.appId, knownIds: host.knownIds });
      if (!result.ok) {
        warn(`[보물도감] 교사 화면에서 온 제출물을 무시했습니다 — ${result.reason}${from}`);
        return true;
      }
      const opts: { studentName?: string } = {};
      if (typeof data.studentName === "string" && data.studentName.trim()) opts.studentName = clampRunes(data.studentName, LIMITS.studentLabelMax);
      const shown = await host.restore(result.value, opts);
      reply({ type: MSG.restored, appId: host.appId, studentLabel: shown.studentLabel, unlocked: shown.unlocked, total: shown.total });
      return true;
    }
    case MSG.collect: {
      const requestId = typeof data.requestId === "string" || typeof data.requestId === "number" ? String(data.requestId) : "";
      const payload = await host.collect();
      reply({ type: MSG.collected, requestId, payload });
      return true;
    }
    case MSG.clearRestore: {
      await host.clearRestore();
      reply({ type: MSG.restoreCleared });
      return true;
    }
  }
}

declare global {
  interface Window {
    CloudSchoolApp?: CloudSchoolApp;
  }
}
