/**
 * 사람에게 보이는 시각은 로컬(Asia/Seoul), 기계 기록은 오프셋 붙은 ISO 8601 — AGENTS.md 규칙.
 * `Date.toISOString()`은 맨 UTC(Z)라 쓰지 않는다.
 */
export function toIsoWithOffset(date: Date = new Date()): string {
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const hh = pad(Math.trunc(offsetMin / 60));
  const mm = pad(offsetMin % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hh}:${mm}`
  );
}

/** 화면 표시용: 2026. 9. 4. 오후 2:05 */
export function formatLocal(iso: string, locale = "ko-KR"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
