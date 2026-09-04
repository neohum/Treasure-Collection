import { normalizeKeyword } from "./normalize";
import { sha256Hex } from "./sha256";
import type { CodexConfig } from "./types";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** WebCrypto가 있으면 그것을, 없으면(비보안 HTTP 원점) 순수 JS 구현을 쓴다. */
export async function sha256HexOf(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) return toHex(await subtle.digest("SHA-256", data as BufferSource));
  return sha256Hex(data);
}

/**
 * 핵심어 해시. 번들은 정적 파일이라 학생이 소스를 볼 수 있으므로 평문 대신 해시를 담는다.
 * 완전한 비밀은 아니지만(사전 대입 가능) "소스 보기로 답을 읽는" 수준은 막는다.
 */
export async function hashKeyword(salt: string, raw: string): Promise<string> {
  return sha256HexOf(new TextEncoder().encode(`${salt}:${normalizeKeyword(raw)}`));
}

/** 입력이 해당 유물의 허용 핵심어 중 하나와 일치하면 true. 빈 입력은 항상 false. */
export async function checkKeyword(config: CodexConfig, treasureId: string, input: string): Promise<boolean> {
  if (normalizeKeyword(input).length === 0) return false;
  const allowed = config.keywordHashes[treasureId];
  if (!allowed || allowed.length === 0) return false;
  const digest = await hashKeyword(config.hashSalt, input);
  return allowed.includes(digest);
}

/** 교사 핵심어 평문 목록 → 번들용 해시 목록. build-config.ts가 쓴다. */
export async function buildKeywordHashes(
  salt: string,
  keywords: Record<string, string[]>,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const [treasureId, words] of Object.entries(keywords)) {
    if (treasureId.startsWith("_")) continue; // _comment 같은 메타 키
    const hashes = new Set<string>();
    for (const word of words) {
      if (normalizeKeyword(word).length === 0) continue;
      hashes.add(await hashKeyword(salt, word));
    }
    out[treasureId] = [...hashes].sort();
  }
  return out;
}
