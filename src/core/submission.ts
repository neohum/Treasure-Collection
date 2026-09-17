import { LIMITS, type Submission, type SubmissionAttachment, type SubmissionItem, type UnlockRecord } from "./types";

function clampRunes(value: string, max: number): string {
  const runes = Array.from(value.trim());
  return runes.length <= max ? runes.join("") : runes.slice(0, max).join("");
}

/**
 * Blob을 브라우저 Canvas를 통해 최대 maxDim(기본 1200px)으로 리사이즈하고 JPEG DataURL로 변환합니다.
 */
export async function compressBlobToDataUrl(blob: Blob, maxDim = 1200, quality = 0.75): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "";
  }
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } else {
          resolve("");
        }
      } catch {
        resolve("");
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve("");
    };
    img.src = objectUrl;
  });
}

/**
 * 해금 기록 중 사진(photo) 모드로 등록된 이미지들을 압축 첨부파일 목록으로 추출합니다.
 */
export async function extractAttachmentsFromRecords(records: UnlockRecord[]): Promise<SubmissionAttachment[]> {
  const attachments: SubmissionAttachment[] = [];
  const photoRecords = records.filter((r) => r.image instanceof Blob);

  for (let i = 0; i < photoRecords.length; i++) {
    const r = photoRecords[i];
    if (r.image) {
      const dataUrl = await compressBlobToDataUrl(r.image);
      if (dataUrl) {
        attachments.push({
          id: `photo-${r.id}`,
          name: `유물사진_${r.id}.jpg`,
          mimeType: "image/jpeg",
          dataUrl,
          size: Math.round((dataUrl.length * 3) / 4),
        });
      }
    }
  }

  return attachments;
}

/**
 * 전송 API 계약 본문을 만든다.
 * 사진(Blob) 자체는 items 레코드 내부에 직접 들어가지 않고,
 * 압축된 attachments 배열로만 안전하게 첨부된다.
 */
export function buildSubmission(input: {
  toolId: string;
  studentLabel: string;
  records: UnlockRecord[];
  total: number;
  submittedAt: string;
  attachments?: SubmissionAttachment[];
}): Submission {
  const items: SubmissionItem[] = input.records
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, LIMITS.itemsMax)
    .map((r) => ({
      id: r.id,
      mode: r.mode,
      unlockedAt: r.unlockedAt,
      note: clampRunes(r.note ?? "", LIMITS.noteMax),
    }));

  const sub: Submission = {
    schema: 1,
    toolId: input.toolId,
    studentLabel: clampRunes(input.studentLabel, LIMITS.studentLabelMax),
    submittedAt: input.submittedAt,
    summary: { unlocked: items.length, total: input.total },
    items,
  };

  if (input.attachments && input.attachments.length > 0) {
    sub.attachments = input.attachments;
  }

  return sub;
}

/**
 * 전송 전 검사: 라벨이 비어 있으면 보낼 수 없다 (계획서 Step 5 AC-5).
 */
export function validateSubmission(s: Submission): string | null {
  if (s.studentLabel.length === 0) return "번호(또는 이름)를 먼저 입력하세요.";
  if (s.items.length === 0) return "아직 해금한 보물이 없습니다.";
  return null;
}
