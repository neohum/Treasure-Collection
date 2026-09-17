# Evidence — config-load-anywhere (cloud-school 배포에서 "config.json 로드 실패 (404)")

- 브랜치: `fix/config-load-anywhere` (base: main `39e5ab7`)
- 날짜: 2026-09-17 (Asia/Seoul)
- 계기: 런처-테스트 → 로컬 빌드 → cloud-school 배포 → Chrome 실행 시
  "도감을 불러오지 못했습니다. config.json 로드 실패 (404)".

## WHAT WAS TESTED

- 원인 분석: 앱이 `fetch("./config.json")`를 **페이지 URL 기준**으로 풀었다. cloud-school 뷰어처럼 index.html을
  번들 자산과 다른 경로에서 열면 자산은 로드되지만 `./config.json`은 뷰어 경로 아래를 가리켜 404가 된다.
- 수정: (1) 번들 JS 자신의 위치(`import.meta.url`) 기준 `../config.json`을 먼저 시도, (2) 페이지 기준 `./config.json`,
  (3) 빌드 시 JS에 내장한 설정(`virtual:codex-config`)으로 폴백. 어떤 경로에서도 앱이 죽지 않는다.
- e2e 신규 2건(`tests/e2e/smoke.spec.ts`):
  - `index.html이 번들과 다른 경로에서 열려도 …` — `/viewer/app`에서 자산을 절대 URL로 바꾼 index.html을 서빙해
    뷰어 상황을 재현 → 도감 렌더, `data-config-source="file"`(스크립트 기준 경로로 찾음)
  - `config.json이 어디에도 없어도 …` — 모든 `config.json` 요청을 404로 → 도감 렌더, `data-config-source="embedded"`,
    오류 화면 없음, 번들 JS에 평문 핵심어 없음
- `pnpm exec vite build`(prebuild 생략)로도 `dist/config.json`과 내장 설정이 만들어지는지 확인.
- 전체 게이트: typecheck·lint·vitest 46·e2e 13·build·pack·health.sh. 로그: [`gate-output.txt`](./gate-output.txt)

## WHAT WAS OBSERVED

- e2e 13/13, 단위 46/46, typecheck·lint 0. prebuild 없이 `vite build`만 돌려도 `public/config.json`·`dist/config.json` 생성.
- JS 번들 30KB → 40KB (설정 내장, 유물 20종 + 해시).
- 스크린샷: [`screenshot-chromebook-1366x768.png`](./screenshot-chromebook-1366x768.png)

## WHY IT IS ENOUGH

- 실패 원인(페이지 기준 상대 경로)을 e2e로 재현했고, 수정 후 같은 시나리오와 "파일이 아예 없는" 최악 시나리오 모두 통과했다.
- 교사가 `config.json`만 바꿔 핵심어를 교체하는 경로는 유지된다(파일이 있으면 파일이 우선).

## WHAT WAS OMITTED

- cloud-school 실배포에서의 재확인은 사용자가 런처-테스트로 다시 배포해 확인해야 한다(여기서는 뷰어 시뮬레이션).
- 브랜드 자산은 계속 `reused`.
