import type { EraCategory } from "../core/types";

/** 5학년 사회(역사) 시대별 대표 유물 20종. legacy/code_artifact.html의 데이터를 그대로 옮겼다. */
export const ERAS: EraCategory[] = [
  {
    id: "prehistoric",
    name: "선사 및 고조선",
    icon: "campfire",
    description: "한반도 역사의 시작과 돌, 청동을 다루던 시대",
    treasures: [
      { id: "art_01", era: "신석기", name: "빗살무늬 토기", hint: "뾰족한 밑바닥과 빗살 무늬가 특징인 신석기 시대 대표 토기입니다.", description: "식량을 저장하고 조리하며 정착 생활을 가능하게 한 인류의 지혜가 담긴 토기입니다." },
      { id: "art_02", era: "청동기", name: "고인돌", hint: "거대한 돌을 올려 만든 청동기 시대 지배자의 대표적 무덤입니다.", description: "당시 계급의 등장과 정복 사회의 시작을 보여주는 대형 석조 유적입니다." },
      { id: "art_03", era: "청동기", name: "비파형 청동검", hint: "비파라는 악기 모양을 닮은 청동검으로 고조선의 세력 범위를 나타냅니다.", description: "독자적인 금속 가공 기술과 우수한 군사력을 상징하는 고조선의 청동기 유물입니다." },
    ],
  },
  {
    id: "three_kingdoms",
    name: "삼국 및 가야",
    icon: "shield",
    description: "고구려, 백제, 신라, 가야가 찬란한 문화를 꽃피운 시대",
    treasures: [
      { id: "art_04", era: "고구려", name: "고구려 수막새", hint: "연꽃무늬가 새겨진 기와의 끝 장식으로 기상의 당당함을 자랑합니다.", description: "건물의 품격을 높이고 빗물을 막는 고구려의 우수한 전통 기와 기법입니다." },
      { id: "art_05", era: "고구려", name: "무용총 무용도", hint: "고구려 고분 벽화에 그려진 화려한 의상과 무용수들의 모습입니다.", description: "고구려 사람들의 생활 모습과 무용, 의복 문화를 생생히 전해주는 벽화입니다." },
      { id: "art_06", era: "백제", name: "백제 금동대향로", hint: "용, 봉황, 신선이 섬세하게 새겨진 백제 금속 공예의 최고 걸작입니다.", description: "도교와 불교 사상이 어우러진 백제의 세계적인 공예 문화유산입니다." },
      { id: "art_07", era: "신라", name: "신라 금관", hint: "나뭇가지와 사슴뿔 모양 장식이 돋보이는 신라 왕의 화려한 왕관입니다.", description: "신라의 뛰어난 금속 세공 기술과 왕권의 위엄을 상징하는 국보급 유물입니다." },
      { id: "art_08", era: "신라", name: "첨성대", hint: "동양에서 가장 오래된 별을 관측하던 신라의 천문대입니다.", description: "농사와 계절을 살피기 위해 별을 관찰했던 선조들의 우수한 과학 유산입니다." },
      { id: "art_09", era: "가야", name: "가야 기마인물형 토기", hint: "말 탄 무사의 모습과 뿔잔이 결합된 가야의 제철·토기 문화유산입니다.", description: "철의 나라 가야의 뛰어난 철제 갑옷 기술과 내세관을 보여주는 유물입니다." },
    ],
  },
  {
    id: "unified_silla_balhae",
    name: "통일신라 및 발해",
    icon: "monument",
    description: "찬란한 불교 예술과 해동성국 발해의 자부심",
    treasures: [
      { id: "art_10", era: "통일신라", name: "석굴암 본존불", hint: "신라 건축과 조각 예술의 정수가 집약된 인공 석굴 사원입니다.", description: "빛과 수학적 비율이 완벽히 조화된 통일신라 불교 조각의 대걸작입니다." },
      { id: "art_11", era: "통일신라", name: "불국사 다보탑", hint: "화강암을 마치 나무를 깎듯 다듬어 쌓아 올린 독창적인 석탑입니다.", description: "통일신라 석조 건축 예술의 섬세함과 창의성을 대표하는 문화재입니다." },
      { id: "art_12", era: "발해", name: "발해 이불병좌상", hint: "두 부처님이 나란히 앉아 있는 발해의 대표적인 불상 유물입니다.", description: "고구려 양식을 계승한 해동성국 발해의 자부심 높은 문화유산입니다." },
    ],
  },
  {
    id: "goryeo",
    name: "고려 시대",
    icon: "scroll",
    description: "비색의 청자와 세계 최고의 인쇄술이 꽃피운 시대",
    treasures: [
      { id: "art_13", era: "고려", name: "고려 상감청자", hint: "흙에 도안을 파고 다른 흙을 채워 비색 유약을 바른 도자기입니다.", description: "세계가 찬사한 고려 독자적인 도자기 제작 기법(상감)의 결정체입니다." },
      { id: "art_14", era: "고려", name: "팔만대장경판", hint: "외세의 침입을 부처님의 힘으로 막고자 8만 여 장의 목판에 새긴 경전입니다.", description: "글자 하나마다 절을 하며 정성을 다해 새긴 세계기록유산입니다." },
      { id: "art_15", era: "고려", name: "직지심체요절", hint: "세계에서 가장 오래된 금속 활자로 인쇄된 서책입니다.", description: "서양의 구텐베르크보다 앞선 고려의 뛰어난 금속 활자 인쇄 기술 증거입니다." },
    ],
  },
  {
    id: "joseon",
    name: "조선 시대",
    icon: "crown",
    description: "애민 정신과 과학 기술, 기록 문화가 만난 시대",
    treasures: [
      { id: "art_16", era: "조선", name: "훈민정음 해례본", hint: "세종대왕이 한글을 창제한 원리와 사용법을 기록한 서책입니다.", description: "백성을 사랑하는 세종의 애민 정신과 한글의 과학성이 집약된 유네스코 세계기록유산입니다." },
      { id: "art_17", era: "조선", name: "앙부일구 (오목해시계)", hint: "글을 모르는 백성도 시간을 알 수 있도록 그림을 새긴 해시계입니다.", description: "절기와 시각을 정밀하게 측정했던 조선의 대표 과학 유산입니다." },
      { id: "art_18", era: "조선", name: "자격루 (자동물시계)", hint: "물줄기의 힘으로 종과 북을 울려 정해진 시간을 알려주던 장치입니다.", description: "장영실과 조선 학자들의 정밀한 공학 기술이 집약된 자동 물시계입니다." },
      { id: "art_19", era: "조선", name: "수원화성", hint: "정약용의 거중기와 과학적 건축 기술로 쌓아 올린 조선 성곽입니다.", description: "자연 지형과 실용적 성벽 구조가 결합된 세계문화유산입니다." },
      { id: "art_20", era: "조선", name: "대동여지도", hint: "김정호가 전국을 직접 발로 뛰며 만든 대형 수공식 지도입니다.", description: "산줄기와 물줄기, 십리마다 점을 찍어 거리를 정밀하게 나타낸 지리학 보물입니다." },
    ],
  },
];

export const ALL_TREASURES = ERAS.flatMap((era) => era.treasures);
export const TOTAL_TREASURES = ALL_TREASURES.length;

export function findTreasure(id: string) {
  return ALL_TREASURES.find((t) => t.id === id);
}
