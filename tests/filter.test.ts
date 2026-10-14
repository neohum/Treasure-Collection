import { describe, expect, it } from "vitest";
import { filterTreasures, matchesFilter } from "../src/core/filter";
import type { EraCategory, Treasure, UnlockRecord } from "../src/core/types";

describe("core/filter (AC-1)", () => {
  const sampleEras: EraCategory[] = [
    {
      id: "prehistoric",
      name: "선사 시대",
      icon: "flame",
      description: "구석기, 신석기, 청동기",
      treasures: [
        { id: "comb-pottery", era: "prehistoric", name: "빗살무늬 토기", hint: "신석기", description: "음식을 담음" },
        { id: "dolmen", era: "prehistoric", name: "고인돌", hint: "청동기", description: "지배자의 무덤" },
      ],
    },
    {
      id: "three-kingdoms",
      name: "삼국 시대",
      icon: "crown",
      description: "고구려, 백제, 신라",
      treasures: [
        { id: "gilt-crown", era: "three-kingdoms", name: "금관총 금관", hint: "신라", description: "황금의 나라" },
      ],
    },
  ];

  const progress = new Map<string, UnlockRecord>([
    ["comb-pottery", { id: "comb-pottery", mode: "keyword", unlockedAt: "2026-10-14T10:00:00+09:00", note: "멋짐" }],
  ]);

  it("시대 필터가 올바르게 작동한다", () => {
    const res = filterTreasures(sampleEras, progress, { eraId: "prehistoric" });
    expect(res).toHaveLength(1);
    expect(res[0]!.era.id).toBe("prehistoric");
    expect(res[0]!.treasures).toHaveLength(2);
  });

  it("해금 상태 필터(unlocked/locked)가 올바르게 분기된다", () => {
    const unlocked = filterTreasures(sampleEras, progress, { status: "unlocked" });
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]!.treasures[0]!.id).toBe("comb-pottery");

    const locked = filterTreasures(sampleEras, progress, { status: "locked" });
    const lockedIds = locked.flatMap((g) => g.treasures.map((t) => t.id));
    expect(lockedIds).toEqual(["dolmen", "gilt-crown"]);
  });

  it("검색어 필터가 이름과 설명, 힌트에서 검색된다", () => {
    const resName = filterTreasures(sampleEras, progress, { query: "금관" });
    expect(resName).toHaveLength(1);
    expect(resName[0]!.treasures[0]!.id).toBe("gilt-crown");

    const resHint = filterTreasures(sampleEras, progress, { query: "청동기" });
    expect(resHint).toHaveLength(1);
    expect(resHint[0]!.treasures[0]!.id).toBe("dolmen");
  });

  it("복합 필터가 정상 적용된다", () => {
    const res = filterTreasures(sampleEras, progress, {
      eraId: "prehistoric",
      status: "unlocked",
      query: "토기",
    });
    expect(res).toHaveLength(1);
    expect(res[0]!.treasures[0]!.id).toBe("comb-pottery");

    const none = filterTreasures(sampleEras, progress, {
      eraId: "three-kingdoms",
      status: "unlocked",
    });
    expect(none).toHaveLength(0);
  });
});
