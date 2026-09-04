# Evidence — codex-scaffold (Step 1 / plans/treasure-codex-launcher.plan.md)

- 카드: `codex-scaffold`
- 브랜치: `feat/codex-scaffold` (base: master `f281099`)
- 날짜: 2026-09-04 (Asia/Seoul)

## WHAT WAS TESTED

- `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` (AC-1)
- `find dist -type f`로 산출물 확장자 전수 확인 — 허브 허용 12종 밖 파일 유무 (AC-2)
- `bash scripts/loop/health.sh` 전체 게이트: build · lint · typecheck · test · e2e · behavior-spec ·
  version-sync · brand-assets · deliverable-preview
- `pnpm e2e` (Playwright, chromium 1366×768): production preview(`http://127.0.0.1:4179/`)를 열어
  제목·h1·`fi fi-rr` 아이콘 폰트 적용·**외부 CDN 요청 0건** 확인, 스크린샷 캡처
- 기존 정적 PWA 파일 이동 결과 `ls legacy` (AC-4)
- CLAUDE.md "Project facts"·용어집, lat.md, DESIGN.md 참조 (AC-3)

실행 로그: [`gate-output.txt`](./gate-output.txt), 빌드 로그: [`build-log.txt`](./build-log.txt)

## WHAT WAS OBSERVED

- typecheck·lint 오류 0, vitest 2/2 통과, e2e 1/1 통과, health.sh `all gates passed`.
- `dist/`에는 `index.html`, `assets/*.js|*.css|*.woff2`, `pwa.json`, 아이콘 png/svg/ico만 있다.
  **`.eot`·`.woff`·`.map`·`.webmanifest`가 0개** — 첫 빌드에서는 Flaticon 폰트의 eot(1.09MB)·woff가
  복사됐고, `vite.config.ts`의 woff2-only 변환 플러그인 + `src/main.ts`에서의 별도 import로 해결했다
  (Tailwind가 CSS `@import`를 먼저 인라인해 변환이 적용되지 않던 문제).
- 스크린샷 [`screenshot-chromebook-1366x768.png`](./screenshot-chromebook-1366x768.png): 다크 헤더에
  보물상자 아이콘(`fi fi-rr-treasure-chest`)과 "역사 보물도감" 제목이 렌더된다. 본문은 Step 3에서 채운다.
- `legacy/`에 다른 세션이 남긴 `index.html`, `sw.js`, `manifest.webmanifest`, `manifest.json`,
  `package.json`, `README.md`, `scripts/*.js`, `docs/DEPLOY_GOOGLE_CLASSROOM_PWA.md`,
  `code_artifact.html`(Gemini 원본)이 그대로 남아 있다. 루트에는 Vite 진입 `index.html` 하나만 있다.
- 첫 e2e는 두 번 실패했다: (1) 4173 포트를 다른 프로세스(PID 31684, `[::1]:4173`)가 점유 → 4179로
  이동, (2) Vite가 `localhost`(::1)에만 바인딩해 Playwright의 127.0.0.1 대기가 타임아웃 → `host: "127.0.0.1"`
  고정. 이후 통과.

## WHY IT IS ENOUGH

- Step 1의 목적은 "게이트가 실제로 도는 스캐폴드"다. health.sh의 9개 게이트가 실제 명령으로 돌아
  초록을 냈고, 각 명령의 출력이 로그에 있다.
- 번들 확장자 제약은 이후 모든 단계의 전제이므로 여기서 실측했다. Step 6의 pack 검사기가 같은 규칙을
  기계적으로 강제한다.
- 외부 요청 0건 검사는 교실 Wi-Fi 단절 시나리오의 첫 관문이다(오프라인 캐시는 Step 4).
- 남은 회귀 위험: Tailwind v4 CSS-first 설정이라 계획서 Files의 `tailwind.config.ts`·`postcss.config.cjs`는
  만들지 않았다(필요 없음). `src/sw.ts`는 WebWorker lib가 필요해 tsconfig에서 제외해 두었고 Step 4에서
  별도 tsconfig로 검사한다.

## WHAT WAS OMITTED

- 로고: 기존 `public/logo.svg`(다른 세션 산출물)는 가로형 워드마크라 36px 헤더에서 판독되지 않는다.
  Step 4(codex-pwa-brand)에서 정방형 로고를 새로 그리고 brand-assets를 `created`로 갱신한다.
  이번 카드의 `brand-assets.json`은 `mode: reused`다.
- `pwa.json`은 브랜드 게이트의 appIcon 참조를 위해 최소 형태로만 넣었다. service worker·오프라인·
  설치 검증은 Step 4.
- 시크릿·토큰·env 덤프 없음(이 프로젝트에 시크릿이 없다).
- 크롬북 실기기 확인은 하지 않았다(Playwright chromium 1366×768 뷰포트로 대체). 실기기 확인은
  Step 7의 Pages 배포 뒤 교사 크롬북에서 한다.
