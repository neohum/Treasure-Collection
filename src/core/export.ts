import type { CodexMeta, UnlockMode, UnlockRecord } from "./types";

/** 내보내기 파일 형식(schema 1). 사진은 data URL로 포함된다 — 기기 간 이동·백업용이지 전송용이 아니다. */
export interface ExportFile {
  schema: 1;
  toolId: string;
  exportedAt: string;
  meta: CodexMeta;
  records: Array<{
    id: string;
    mode: UnlockMode;
    unlockedAt: string;
    note: string;
    /** data:image/jpeg;base64,… */
    image?: string;
  }>;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("잘못된 data URL");
  const mime = match[1] ?? "application/octet-stream";
  const payload = match[3] ?? "";
  const binary = match[2] ? atob(payload) : decodeURIComponent(payload);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

export async function exportProgress(
  toolId: string,
  meta: CodexMeta,
  records: UnlockRecord[],
  exportedAt: string,
): Promise<ExportFile> {
  const out: ExportFile["records"] = [];
  for (const r of records) {
    const row: ExportFile["records"][number] = { id: r.id, mode: r.mode, unlockedAt: r.unlockedAt, note: r.note };
    if (r.image) row.image = await blobToDataUrl(r.image);
    out.push(row);
  }
  return { schema: 1, toolId, exportedAt, meta: { studentLabel: meta.studentLabel }, records: out };
}

export class ImportError extends Error {}

const MODES: ReadonlySet<string> = new Set(["keyword", "photo"]);

/** 가져오기: 형식을 검증하고 UnlockRecord[]로 복원한다. 알 수 없는 유물 id는 호출자가 걸러낸다. */
export function importProgress(json: unknown, expectedToolId: string): { meta: CodexMeta; records: UnlockRecord[] } {
  if (typeof json !== "object" || json === null) throw new ImportError("파일 내용이 객체가 아닙니다");
  const file = json as Partial<ExportFile>;
  if (file.schema !== 1) throw new ImportError("지원하지 않는 파일 버전입니다");
  if (file.toolId !== expectedToolId) throw new ImportError("다른 도구에서 내보낸 파일입니다");
  if (!Array.isArray(file.records)) throw new ImportError("기록 목록이 없습니다");
  const records: UnlockRecord[] = [];
  for (const row of file.records) {
    if (!row || typeof row.id !== "string" || !MODES.has(String(row.mode)) || typeof row.unlockedAt !== "string") {
      throw new ImportError("기록 형식이 잘못되었습니다");
    }
    const rec: UnlockRecord = { id: row.id, mode: row.mode, unlockedAt: row.unlockedAt, note: typeof row.note === "string" ? row.note : "" };
    if (typeof row.image === "string") rec.image = dataUrlToBlob(row.image);
    records.push(rec);
  }
  const studentLabel = typeof file.meta?.studentLabel === "string" ? file.meta.studentLabel : "";
  return { meta: { studentLabel }, records };
}
