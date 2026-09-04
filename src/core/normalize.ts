/**
 * 핵심어 비교용 정규화. "빗살무늬 토기", "빗살무늬토기", " 빗살 무늬 토기 "가 같은 키가 되도록
 * NFC 정규화 → 소문자 → 글자(문자·숫자) 외 전부 제거. 초등학생 입력의 띄어쓰기·구두점 편차를
 * 흡수하되, 글자 자체가 다르면 다른 답이다.
 */
export function normalizeKeyword(raw: string): string {
  return raw.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
