# Evidence — single-file-resilience (index.html만 배포돼도 아이콘 폰트·로고가 살아남는다)

- 브랜치: `fix/single-file-resilience` (base: main `4691579`)
- 날짜: 2026-09-17 (Asia/Seoul)
- 계기: cloud-school 배포(https://class.cloud-school.kr/pvn73/)를 2026-09-17에 확인한 결과, 뷰어는 **index.html 하나에
  JS·CSS를 인라인**해 올리고 나머지 dist 파일은 전부 404였다 — `assets/uicons-….woff2`(모든 `fi fi-rr` 아이콘이 빈칸),
  `logo.svg`(깨진 이미지), 파비콘·아이콘 PNG, `config.json`(내장 설정으로 이미 해결). 인라인된 CSS의 `url(./uicons-….woff2)`는
  `assets/` 기준으로 쓰인 상대 경로라 파일이 있었더라도 번들 루트에서는 엉뚱한 곳을 가리켰다.

## WHAT WAS TESTED

- **아이콘 폰트 3단 폴백** (`vite.config.ts` `withIconFontFallbacks`, `generateBundle`): Vite가 woff2를 해시 이름으로 내보내고 CSS를
  압축한 **뒤** 최종 CSS의 `src:`를 `url(./<hash>.woff2)` → `url(./assets/<hash>.woff2)` → `url(https://cdn.jsdelivr.net/npm/@flaticon/flaticon-uicons@3.3.1/css/uicons-regular-rounded-J3WOUERV.woff2)`
  세 개로 넓힌다. 첫 소스는 Vite가 낸 그대로라 교실 LAN 허브·GitHub Pages는 여전히 오프라인으로 열리고(브라우저는 처음 성공한
  소스에서 멈춘다), CDN은 index.html만 살아남은 인터넷 배포에서만 쓰인다. CDN URL은 설치된 패키지의 버전과 **실제 파일 경로**
  (`css/uicons-regular-rounded-J3WOUERV.woff2`, 파일명에 해시가 붙어 `fonts/…`는 존재하지 않음)에서 만들고, `curl -sI`로
  200·`font/woff2`·`access-control-allow-origin: *`를 확인했다. `data:` URL은 마켓 감사가 거부하므로 쓰지 않았다.
- **인라인 SVG 로고** (`src/ui/dom.ts` `svg()`, `src/ui/logo.ts` `renderLogo()`): 헤더의 `<img src="./logo.svg">`를 DOM API
  (`createElementNS`)로 그린 보물상자 마크(`role="img" aria-label="역사 보물도감 로고"`, viewBox 0 0 64 64, amber #f59e0b on slate
  #1e293b)로 바꿨다. innerHTML·data URL 없음. 기존 `public/logo.svg`는 800×200 워드마크라 40px에서 읽히지 않았으므로 같은 마크로
  다시 그렸고(`mode: created`), `public/pwa.json` `icons`에 `{ "src": "logo.svg", "sizes": "any" }`로 참조한다(`type` 없음 — `svg+xml`
  문자열은 마켓 감사 오탐).
- `fi fi-rr` 표준은 그대로다. 전송 버튼(`icon("paper-plane")`)은 손대지 않았다. AC-3 e2e(인라인 SVG 아이콘 금지)는 `svg.app-logo[role=img]`
  브랜드 마크만 예외로 둔다.
- 단위: `tests/icon-css.test.ts` +3 (url 정확히 3개·순서, 비압축 형태, CDN URL이 설치 버전·실경로에서 나옴). `tests/pack-bundle.test.ts` 유지.
- e2e 신규 `tests/e2e/single-file.spec.ts` 2건, 기존 13건 유지. 전체 로그: [`e2e-output.txt`](./e2e-output.txt)
- 게이트: `PREVIEW_PORT=4183 bash scripts/loop/health.sh` — build·lint·typecheck·vitest·e2e·visual·behavior-spec·version-sync·brand-assets·
  deliverable-preview. 로그: [`gate-output.txt`](./gate-output.txt). 빌드: [`build-log.txt`](./build-log.txt) (`exitCode=0`, pack 16개 파일).

| AC | 테스트 | 관찰 |
| --- | --- | --- |
| AC-1 로컬 woff2가 전부 404여도 CDN 폴백으로 폰트 로드, CDN 요청 정확히 1회 | `single-file.spec.ts` "AC-1: …" — `**/assets/uicons-*.woff2`·`**/uicons-*.woff2` 404, jsDelivr는 로컬 dist woff2 바이트로 fulfill | pass — `document.fonts.check('1em uicons-regular-rounded')` true, FontFace status `["loaded"]`, `header i.fi-rr-id-badge::before` font-family에 `uicons-regular-rounded`, CDN hits 1, 404 순서 `/assets/<hash>.woff2` → `/assets/assets/<hash>.woff2` |
| AC-2 index.html만 살아남은 배포(JS·CSS 인라인, `/single/` 아래 전부 404, `config.json` 404) | `single-file.spec.ts` "AC-2: …" — `dist/index.html`에 `dist/assets/*.js`·`*.css`를 스플라이스해 `/single/`로 서빙 | pass — `.era` 5, `data-config-source="embedded"`, `.boot-error` 0, pageerror 0, `header svg.app-logo[role=img]` visible(aria-label 일치), 깨진 `<img>` 0, 폰트 loaded, CDN hits 1, `/single/<hash>.woff2`·`/single/assets/<hash>.woff2` 404 확인. 캡처 [`single-file-1366x768.png`](./single-file-1366x768.png) |
| AC-3 정상 배치에서는 외부 CDN 요청이 없다 | `smoke.spec.ts` "production 빌드가 열리고 아이콘 폰트가 로드된다" (기존) | pass — 로컬 woff2가 먼저 열려 external `[]` |
| 마켓 감사 문자열 0 | `grep -c "data:\|svg+xml\|javascript:\|vbscript:" dist/index.html dist/assets/*.css` | 0 / 0 |

## WHAT WAS OBSERVED

- 최종 `dist/assets/index-BfLEYFyG.css`의 `src:` (url 정확히 3개, 첫 번째가 Vite 해시 파일):
  `src:url(./uicons-regular-rounded-J3WOUERV-0sU45oCT.woff2)format("woff2"),url(./assets/uicons-regular-rounded-J3WOUERV-0sU45oCT.woff2)format("woff2"),url(https://cdn.jsdelivr.net/npm/@flaticon/flaticon-uicons@3.3.1/css/uicons-regular-rounded-J3WOUERV.woff2)format("woff2");`
- 단위 49/49 (13 파일), e2e 15/15, visual 1/1, typecheck·lint 0, health `all gates passed`.
- `PREVIEW_PORT=4183 pnpm preview` pid 43792 → `curl http://127.0.0.1:4183/` 200 (1085 bytes), CSS 200 → `taskkill` 정리.
- 단일 HTML 시뮬레이션 화면: 헤더 인라인 로고, 헤더·시대·카드의 모든 `fi fi-rr` 아이콘이 CDN 폰트로 그려진다.
- 정상 배치 캡처: [`screenshot-chromebook-1366x768.png`](./screenshot-chromebook-1366x768.png), 코덱스 캡처 `codex-*.png`.

## WHY IT IS ENOUGH

- 실패한 배포 형태(index.html 단독 + 나머지 404)를 그대로 재현한 e2e가 초록이고, 폴백 사슬을 **순서대로** 밟았다는 404 요청
  경로까지 단언했다. 정상 배치에서 CDN 요청이 없다는 기존 검사가 그대로 살아 있어 오프라인 교실은 회귀하지 않는다.
- 로고는 파일 의존 자체를 없앴다(인라인 DOM). data URL·innerHTML 없이 마켓 감사 규칙도 그대로 통과한다.
- CDN 경로는 손으로 적은 것이 아니라 설치된 패키지에서 계산하고 존재를 검증하므로, 버전을 올리면 URL도 같이 바뀐다.

## WHAT WAS OMITTED

- cloud-school 실배포에서의 재확인은 사용자가 런처-테스트로 다시 배포해 확인해야 한다(여기서는 Playwright 시뮬레이션; CDN 응답도
  로컬 woff2 바이트로 채웠고 실제 jsDelivr는 `curl -sI`로 200만 확인).
- 파비콘·apple-touch-icon·PWA 아이콘 PNG는 단일 HTML 배포에서 여전히 404다 — 화면 렌더에는 영향이 없고, data URL 없이 해결할
  방법이 없어 범위 밖으로 남긴다.
- `dist/manifest.json`은 이전 PR들과 같이 커밋하지 않았다(허브 반입 직전 `pnpm pack:bundle`로 생성).
