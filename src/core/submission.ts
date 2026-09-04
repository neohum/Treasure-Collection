import { LIMITS, type Submission, type SubmissionItem, type UnlockRecord } from "./types";

function clampRunes(value: string, max: number): string {
  const runes = Array.from(value.trim());
  return runes.length <= max ? runes.join("") : runes.slice(0, max).join("");
}

/**
 * 전송 API 계약 본문을 만든다. 사진(Blob)은 어떤 경우에도 들어가지 않는다 — 스프레드로 레코드를
 * 복사하지 않고 필드를 하나씩 골라 담는 이유다. 라벨 20자, 소감 200자, 항목 200개 상한.
 */
export function buildSubmission(input: {
  toolId: string;
  studentLabel: string;
  records: UnlockRecord[];
  total: number;
  submittedAt: string;
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
  return {
    schema: 1,
    toolId: input.toolId,
    studentLabel: clampRunes(input.studentLabel, LIMITS.studentLabelMax),
    submittedAt: input.submittedAt,
    summary: { unlocked: items.length, total: input.total },
    items,
  };
}

/** 전송 전 검사: 라벨이 비어 있으면 보낼 수 없다 (계획서 Step 5 AC-5). */
export function validateSubmission(s: Submission): string | null {
  if (s.studentLabel.length === 0) return "번호(또는 이름)를 먼저 입력하세요.";
  if (s.items.length === 0) return "아직 해금한 보물이 없습니다.";
  return null;
}
