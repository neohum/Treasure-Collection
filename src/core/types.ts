/** 해금 방식. `keyword`는 수업 핵심어 입력, `photo`는 교사가 배부한 사진 업로드. */
export type UnlockMode = "keyword" | "photo";

export interface Treasure {
  id: string;
  era: string;
  name: string;
  hint: string;
  description: string;
}

export interface EraCategory {
  id: string;
  name: string;
  /** Flaticon UIcons 이름(`fi-rr-` 뒤). 렌더 시 `fi fi-rr-<icon>`. */
  icon: string;
  description: string;
  treasures: Treasure[];
}

/** 번들에 들어가는 `config.json`. 평문 핵심어는 없고 해시만 있다. */
export interface CodexConfig {
  schema: 1;
  toolId: string;
  version: string;
  title: string;
  hashSalt: string;
  eras: EraCategory[];
  /** treasureId → 허용되는 정규화 핵심어의 SHA-256(hex) 목록 */
  keywordHashes: Record<string, string[]>;
}

/** IndexedDB에 저장되는 해금 기록. 사진은 Blob으로 같이 저장되며 전송 시에는 빠진다. */
export interface UnlockRecord {
  id: string;
  mode: UnlockMode;
  /** 오프셋 포함 ISO 8601, 예: 2026-09-04T13:50:01+09:00 */
  unlockedAt: string;
  note: string;
  image?: Blob;
}

export interface CodexMeta {
  studentLabel: string;
}

/** 전송 API 계약 본문 (계획서 "전송 API 계약" 절과 동일) */
export interface SubmissionItem {
  id: string;
  mode: UnlockMode;
  unlockedAt: string;
  note: string;
}

/** 학생 작업 첨부 파일(유물 발굴 사진 등) */
export interface SubmissionAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size?: number;
}

export interface Submission {
  schema: 1;
  toolId: string;
  studentLabel: string;
  submittedAt: string;
  summary: { unlocked: number; total: number };
  items: SubmissionItem[];
  attachments?: SubmissionAttachment[];
}

export const LIMITS = {
  studentLabelMax: 20,
  noteMax: 200,
  itemsMax: 200,
} as const;
