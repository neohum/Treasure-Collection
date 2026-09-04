# Evidence — codex-domain-core (Step 2 / plans/treasure-codex-launcher.plan.md)

- 카드: `codex-domain-core`
- 브랜치: `feat/codex-domain-core` (base: main `efb0876`)
- 날짜: 2026-09-04 (Asia/Seoul)

## WHAT WAS TESTED

`pnpm test` (vitest, node 환경) — 8 파일 26건. 로그: [`gate-output.txt`](./gate-output.txt)

| AC | 테스트 | 무엇을 증명하나 |
| --- | --- | --- |
| AC-1 | `tests/normalize.test.ts`, `tests/unlock.test.ts` | "빗살무늬 토기"·"빗살무늬토기"·" 빗살 무늬 토기 "가 같은 키; SHA-256 해시 대조로 정답만 해금, 오답·빈 입력·구두점만은 불가 |
| AC-2 | `tests/storage.test.ts` | fake-indexeddb로 Blob 포함 기록 저장·조회·삭제, 덮어쓰기, 라벨, 전송 큐, 초기화 |
| AC-3 | `tests/export.test.ts` | 내보내기 JSON → 가져오기 왕복에서 사진 바이트가 동일; 다른 도구·버전·깨진 기록 거부 |
| AC-4 | `tests/submission.test.ts` | 계약 본문 생성, JSON 전체를 훑어 Blob·data URL·`image`·`ip`·`userAgent` 키 부재 확인, 라벨 20자·소감 200자·항목 200개 절단 |
| AC-5 | `tests/hub.test.ts` | `/dist/{toolID}/…`에서만 `{hubOrigin, toolId}`; Pages·preview·슬래시 없는 경로·대문자 id는 null |
| AC-6 | `tests/build-config.test.ts` | 예시 핵심어로 20종 전부 해시 생성, 평문 없음, 알 수 없는 id·누락 유물은 실패 |

추가로 `bash scripts/loop/health.sh` 전체 게이트(build·lint·typecheck·test·e2e·cli-smoke·behavior-spec·version-sync·brand-assets·deliverable-preview)가 통과했다.

## WHAT WAS OBSERVED

- 26/26 통과, typecheck·lint 오류 0.
- `pnpm build:config`가 `public/config.json`을 만들고 출처를 출력한다(`content/keywords.json`이 없으면 예시 사용).
  `prebuild`로 `pnpm build` 앞에 자동 실행된다. `config.json`은 gitignore(생성물).
- 사진 축소(800px·JPEG 0.7)는 `canvas`가 필요한 브라우저 전용 코드라 이 카드에서는 저장 계층만 검증했다.
  축소 자체는 Step 3의 Playwright e2e(AC-2)에서 확인한다.

## WHY IT IS ENOUGH

- 도메인 규칙(정규화·해금·절단·경로 판정)은 전부 순수 함수라 단위 테스트가 곧 명세다.
- IndexedDB는 실제 구현(fake-indexeddb는 사양 준수 구현)으로 Blob 구조적 복제까지 확인했다.
- 전송 본문은 "무엇이 들어가는가"보다 "무엇이 절대 안 들어가는가"가 계약이므로 전수 순회로 검사했다.
- 남은 회귀 위험: 브라우저 `crypto.subtle`은 HTTPS 또는 localhost/사설 IP HTTP에서만 동작한다.
  허브(`http://192.168.x.x`)는 Chrome이 "잠재적으로 신뢰할 수 있는 원점"으로 보지 않을 수 있어
  Step 3에서 `crypto.subtle` 부재 시 순수 JS SHA-256 폴백을 넣고 e2e로 확인한다.

## WHAT WAS OMITTED

- 화면·시각 검증 없음(UI 파일 변경 없음, 브랜드·프리뷰 게이트 비적용 — `isVisualSurface` 결과 빈 배열).
- 교사의 실제 핵심어는 아직 받지 못해 `src/data/keywords.example.json`(유물 이름 기반)으로 만들었다.
- 시크릿·토큰 없음.
