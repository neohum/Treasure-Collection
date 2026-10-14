import type { EraCategory, Treasure, UnlockRecord } from "./types";

export type UnlockFilterStatus = "all" | "unlocked" | "locked";

export interface FilterOptions {
  eraId?: string;
  status?: UnlockFilterStatus;
  query?: string;
}

/**
 * 특정 유물이 현재 필터 조건(시대, 해금 여부, 검색어)에 부합하는지 판정한다.
 */
export function matchesFilter(
  treasure: Treasure,
  era: EraCategory,
  progress: Map<string, UnlockRecord>,
  options: FilterOptions,
): boolean {
  const { eraId = "all", status = "all", query = "" } = options;

  // 1. 시대 필터
  if (eraId !== "all" && era.id !== eraId) {
    return false;
  }

  // 2. 해금 상태 필터
  const isUnlocked = progress.has(treasure.id);
  if (status === "unlocked" && !isUnlocked) return false;
  if (status === "locked" && isUnlocked) return false;

  // 3. 검색어 필터 (유물 이름, 시대 이름, 힌트, 설명)
  const q = query.trim().toLowerCase();
  if (q.length > 0) {
    const haystack = `${treasure.name} ${era.name} ${treasure.hint} ${treasure.description}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

/**
 * 전체 시대 목록을 받아 조건에 맞는 유물들로 필터링된 시대별 그룹을 반환한다.
 */
export function filterTreasures(
  eras: EraCategory[],
  progress: Map<string, UnlockRecord>,
  options: FilterOptions,
): Array<{ era: EraCategory; treasures: Treasure[] }> {
  return eras
    .map((era) => {
      const filtered = era.treasures.filter((t) => matchesFilter(t, era, progress, options));
      return { era, treasures: filtered };
    })
    .filter((group) => {
      if (options.eraId && options.eraId !== "all") {
        if (group.era.id !== options.eraId) return false;
      }
      if ((options.query && options.query.trim().length > 0) || (options.status && options.status !== "all")) {
        return group.treasures.length > 0;
      }
      return true;
    });
}
