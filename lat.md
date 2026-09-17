# lat.md — Agent Lattice for Treasure-Collection

> 이 저장소의 지도. 짧고 사실대로, 최신으로 유지한다. 최상위 디렉터리를 지우거나
> 옮기면 같은 커밋에서 이 파일을 고친다.

## 무엇을 만드는가

5학년 역사수업용 '디지털 보물도감' **학생 웹 번들**. 프레임워크 없는 TypeScript + Vite +
Tailwind v4로 만든 설치형 PWA이며, all_market 구름학교 런처의 교실 LAN 허브가
`/dist/treasure-codex/`로 서빙한다. 교사 런처 쪽 코드는 `D:\works\all_market`에 있다
(`plans/treasure-codex-classroom-results.plan.md`).

## Top-level layout

```
.
├── index.html        # Vite 진입 HTML (루트에 이것 하나만)
├── src/
│   ├── main.ts       # 부트스트랩
│   ├── styles.css    # Tailwind v4 + Flaticon UIcons(fi fi-rr) + 토큰
│   ├── core/         # 도메인: 정규화·해금·저장(IndexedDB)·내보내기·전송 페이로드·허브 감지·교사 수집/재생 브리지(bridge.ts)
│   ├── data/         # 유물 20종 데이터, 핵심어 예시
│   ├── ui/           # DOM 렌더러 (innerHTML 금지, textContent만)
│   └── sw.ts         # service worker (Step 4)
├── public/           # 그대로 복사되는 정적 파일: 아이콘, pwa.json, config.json(생성)
├── content/          # keywords.json (gitignore) — 교사의 핵심어 평문
├── scripts/          # build-config.ts, pack-bundle.ts, integrity-hash.ts + 하네스 loop/
├── tests/            # vitest 단위(tests/*.test.ts) + Playwright e2e(tests/e2e/)
├── legacy/           # 2026-09-04 이전 정적 프로토타입(참고용, 빌드에 포함되지 않음)
├── plans/            # 계획서 (treasure-codex-launcher.plan.md, 승인됨)
├── evidence/         # 카드별 검증 증거
└── docs/             # 하네스 문서 + bundle-contract.md
```

## Module ownership

| Path          | Purpose                                   | Touched by                      |
| ------------- | ----------------------------------------- | ------------------------------- |
| `src/core/`   | 순수 도메인 로직, DOM 없음                | architect(설계), builder        |
| `src/ui/`     | DOM 렌더·모달·토스트                      | builder, 디자인은 DESIGN.md     |
| `src/data/`   | 유물 데이터·기본 핵심어                   | 교사 요청으로만 변경            |
| `scripts/*.ts`| 빌드·패키징 CLI                           | builder                         |
| `public/`     | 브랜드 자산·PWA 매니페스트                | brand-assets 규칙               |
| `legacy/`     | 읽기 전용 참고                            | 아무도 수정하지 않는다          |

## Dependency edges

- `src/ui/*` → `src/core/*` (UI가 도메인을 쓴다, 역방향 금지)
- `src/core/*`는 `document`/`window`를 직접 만지지 않는다 (vitest node 환경에서 돌아야 한다)
- `scripts/*.ts`는 `src/core/*`를 import할 수 있다(해시·설정 생성), `src/ui/*`는 안 된다

## External contracts

| 계약 | 어디 | 비고 |
| --- | --- | --- |
| 도구 매니페스트 | `dist/manifest.json` | all_market `ToolDistributionManifest`, 허용 확장자 12종 |
| 전송 API | `POST {hub}/api/tools/{toolID}/submissions` | 계획서 "전송 API 계약" 절, 두 저장소 동일 |
| 무결성 해시 | `scripts/integrity-hash.ts` | bundler.go:213 프레이밍, `tests/fixtures/mini-bundle` 교차 검증 |
| 교사 과제 수집/재생 | `window.CloudSchoolApp` + `cloudschool_*` postMessage | `docs/cloudschool-protocol.md`, 순수 로직 `src/core/bridge.ts` |

## Don't-touch list

- `legacy/` — 참고용 스냅샷. 고치지 말고 `src/`에 다시 쓴다.
- `scripts/loop/`, `.claude/`, `.agents/`, `.codex/` — 하네스가 관리한다(`harness-update`로만 갱신).
