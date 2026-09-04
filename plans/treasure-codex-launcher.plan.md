---
plan: treasure-codex-launcher
status: approved
risk: medium
owner: neohum
---
# Plan: 보물도감 학생 웹 번들 — 크롬북 PWA, 런처 LAN 배포, 결과 전송

## 승인 기록

- 2026-09-04: 소유자(neohum)가 계획서 두 장(이 문서와
  `all_market/plans/treasure-codex-classroom-results.plan.md`)을 읽고 "승인"으로 확정했다.
  이 승인은 `neohum/Treasure-Collection` 비공개 GitHub 저장소 생성(Step 7)을 포함한다.

## 배경 (2026-09-04)

용문초 서영인 교사가 5학년 역사수업용 '디지털 보물도감'을 요청했다. 한 차시마다
교과서 유물 하나를 수집해 도감을 완성한다. 해금 방식은 (1) 수업 핵심어 입력,
(2) 교사가 배부한 유물 사진 업로드 두 가지다. 시작점은 Gemini가 만든 단일 HTML
프로토타입 `code_artifact.html`(사진 업로드만 구현, 유물 20종, localStorage)이다.

소유자 결정: **all_market 런처로 배포하고, 학생이 [전송]을 누르면 교사 런처에서
결과를 확인하며, 마켓에 등록해 다른 교사에게도 배포한다.**

이 계획서는 **학생 쪽 웹 번들**(이 저장소)만 다룬다. 교사 런처 쪽 변경(번들 서빙,
결과 수신, 결과 화면, 실제 QR, 마켓 등록)은
`D:\works\all_market\plans\treasure-codex-classroom-results.plan.md`가 소유한다.
두 계획서는 아래 "전송 API 계약" 한 절을 공유하며, 그 절은 두 문서에서 글자 그대로
같아야 한다.

## all_market 쪽 사실 (탐색으로 확인, 2026-09-04)

- 도구 매니페스트는 `apps/launcher/internal/contracts/distribution.go`의
  `ToolDistributionManifest`가 권위다. 필수: `id`(`^[a-z0-9-]+$`), `name`, `version`,
  `audience`, `distributionMode`, `entrypoint`. 보물도감은
  `audience: student_distributable`, `distributionMode: lan_web_bundle`,
  `entrypoint: index.html`, `offlineCapable: true`.
- 서빙 허용 확장자: `.html .js .css .json .png .jpg .jpeg .svg .ico .woff .woff2 .wasm`.
  **`.webmanifest`, `.map`, `.txt`는 허용되지 않는다.** PWA 매니페스트는 `pwa.json`으로,
  소스맵은 끈다.
- 번들 무결성 해시: 경로 정렬 후 파일마다
  `uint64BE(len(path)) || path || uint64BE(len(content)) || content`를 이어 SHA-256,
  접두 `sha256:` (`internal/bundler/bundler.go:213-234`). TS로 같은 프레이밍을 구현하고
  all_market 쪽 Go 테스트가 교차 검증한다.
- 허브는 `/dist/{toolID}/…`로 도구를 노출하지만 **지금은 자리표시 HTML만 반환한다.**
  실제 파일 서빙은 all_market 계획서 Step 1이 만든다.
- 학생→교사 결과 수신 경로는 **없다.** all_market 계획서 Step 2가 만든다.
- 허브의 경계: 학생 기기 식별정보(IP·기기명·계정)를 저장·전달하지 않는다. PIN은
  출석 표식이지 접근 통제가 아니다(ADR-0015).
- 교실 도구 아이콘 표준은 Flaticon UIcons `fi fi-rr-*`(런처 프론트도 같은 패키지).

## Intent

크롬북 Chrome에서 설치형 PWA로 동작하고, all_market 런처 허브가 `/dist/treasure-codex/`로
서빙할 수 있는 **정적 웹 번들**을 만든다. 학생은 핵심어 입력 또는 사진 업로드로 유물을
해금하고, [전송]을 누르면 사진을 제외한 진도 요약이 교사 런처 허브로 POST된다.
허브 밖(GitHub Pages 등)에서 열면 같은 버튼이 JSON 내보내기로 동작한다.

## Non-goals

- 서버·클라우드·학생 계정. 학생 데이터는 학생 기기와 교사 PC 밖으로 나가지 않는다.
- 사진 전송. 전송 페이로드에는 이미지가 들어가지 않는다(용량·개인정보).
- 실시간 WebSocket 동기화(`classroom_shared`). v1은 `student_distributable` 단방향 POST.
- 교사가 도구 안에서 핵심어를 편집하는 UI. v1은 기본 5학년 세트를 번들에 넣고,
  `config.json` 교체로만 바꾼다(v2 과제로 남긴다).
- 교사 런처 쪽 코드. all_market 계획서의 몫이다.
- Tailwind Play CDN·FontAwesome·이모지 아이콘 등 프로토타입의 외부 의존은 모두 제거한다.

## 전송 API 계약 (all_market 계획서와 글자 그대로 공유)

```
POST {hubOrigin}/api/tools/{toolID}/submissions
Content-Type: application/json; charset=utf-8

{
  "schema": 1,
  "toolId": "treasure-codex",
  "studentLabel": "12",                       // 학생이 입력한 번호 또는 이름, 1~20자
  "submittedAt": "2026-09-04T14:05:12+09:00", // 오프셋 포함 ISO 8601
  "summary": { "unlocked": 7, "total": 20 },
  "items": [
    { "id": "art_01", "mode": "keyword", "unlockedAt": "2026-09-04T13:50:01+09:00", "note": "…(≤200자)" }
  ]
}

201 { "receiptId": "<random>", "receivedAt": "…" }
400 잘못된 본문 / 413 64KB 초과 / 404 미등록 도구 / 403 비활성 또는 teacher_only 도구
```

- 본문 ≤ 64KB, `items` ≤ 200개, `mode`는 `keyword|photo`만. 이미지·IP·기기명·계정 없음.
- `toolID`는 번들이 서빙된 경로 `/dist/{toolID}/`에서 읽는다. 그 경로가 아니면 허브가
  아니므로 [전송]은 JSON 내보내기로 대체된다.
- 실패(오프라인·5xx)는 로컬 큐에 남기고 다음 [전송]에서 재시도한다.

## 번들 레이아웃 (Step 6이 확정)

```
dist/
  index.html            entrypoint
  pwa.json              PWA 매니페스트 (.webmanifest 금지)
  sw.js                 service worker (precache)
  config.json           유물 데이터 + 핵심어 해시 + 도구 메타
  manifest.json         ToolDistributionManifest (integrityHash 포함, Step 6 생성)
  assets/*.js|*.css|*.woff2|*.png|*.svg
  icons/app-icon-{192,512}.png, favicon.ico, logo.svg
```

## Steps

### Step 1: codex-scaffold
- Goal: pnpm + Vite + TypeScript(프레임워크 없음) + Tailwind(빌드타임) + Vitest + Playwright 스캐폴드가 서고, 헬스 게이트 명령이 실제로 돈다. 2026-09-04 11:15에 다른 세션이 남긴 미커밋 정적 PWA(루트 `index.html`·`sw.js`·`manifest.webmanifest`·`scripts/serve.js` 등, Tailwind CDN 의존)는 **입력**으로 취급해 `legacy/`로 옮기고 아이콘(`public/icons/*`, `logo.svg`, `favicon.*`)만 재사용한다
- Files: package.json, pnpm-lock.yaml, pnpm-workspace.yaml, tsconfig.json, vite.config.ts, tailwind.config.ts, postcss.config.cjs, playwright.config.ts, index.html, src/main.ts, src/styles.css, src/vite-env.d.ts, tests/smoke.test.ts, .gitignore, CLAUDE.md, lat.md, DESIGN.md, legacy/, sw.js, manifest.json, manifest.webmanifest, scripts/serve.js, scripts/verify-all.js, scripts/verify-assets.js, scripts/verify-index.js, scripts/generate-assets.js, README.md, docs/DEPLOY_GOOGLE_CLASSROOM_PWA.md, public/
- Acceptance: AC-1: `pnpm install && pnpm typecheck && pnpm test && pnpm build`가 exit 0이고 `dist/`가 생성된다. AC-2: `dist/` 안에 `.map`·`.webmanifest`·`.txt` 파일이 없다(빌드 설정으로 보장, `tests/smoke.test.ts`가 아님 — Step 6의 검사기가 최종 보증). AC-3: CLAUDE.md "Project facts" 빈칸(스택·패키지 매니저·테스트·린트·개발 서버)이 실제 값으로 채워진다. AC-4: 기존 정적 PWA 파일이 삭제되지 않고 `legacy/`에 그대로 남아 있으며(`git mv` 아님, 미커밋 상태이므로 이동), 루트에는 Vite 진입 `index.html` 하나만 있다
- Tests: pnpm typecheck && pnpm test && pnpm build
- Risk: low
- Complexity: low

### Step 2: codex-domain-core
- Goal: 유물 데이터, 두 가지 해금 규칙, IndexedDB 저장, 내보내기·가져오기, 전송 페이로드 빌더가 UI 없이 단위 테스트로 증명된다
- Files: src/data/treasures.ts, src/data/keywords.example.json, src/core/normalize.ts, src/core/unlock.ts, src/core/storage.ts, src/core/export.ts, src/core/submission.ts, src/core/hub.ts, src/core/types.ts, tests/normalize.test.ts, tests/unlock.test.ts, tests/storage.test.ts, tests/export.test.ts, tests/submission.test.ts, tests/hub.test.ts, scripts/build-config.ts, content/keywords.json, .gitignore
- Acceptance: AC-1: 핵심어 정규화(NFC, 공백·구두점 제거, 소문자)가 "빗살무늬 토기"·"빗살무늬토기"·"빗살 무늬 토기 "를 같은 키로 만들고, SHA-256 해시 비교로 해금이 판정된다. 오답은 해금되지 않는다. AC-2: 사진 해금은 이미지를 최대 800px·JPEG 0.7로 축소해 IndexedDB에 저장하고, `fake-indexeddb`로 저장·조회·삭제가 테스트된다. AC-3: 내보내기 JSON(스키마 1, 이미지 포함)을 가져오면 동일 진도가 복원된다. AC-4: `buildSubmission()`이 "전송 API 계약"의 본문을 만들고 이미지·IP·기기명을 절대 포함하지 않으며, `note`는 200자·`studentLabel`은 20자에서 잘린다. AC-5: `detectHub(location)`가 `/dist/{toolID}/…` 경로에서 `{hubOrigin, toolID}`를 뽑고 그 외에는 `null`을 준다. AC-6: `scripts/build-config.ts`가 `content/keywords.json`(gitignore) 또는 `src/data/keywords.example.json`을 읽어 평문 없이 해시만 담은 `public/config.json`을 생성한다
- Tests: pnpm test
- Risk: low
- Complexity: medium

### Step 3: codex-ui-codex
- Goal: 프로토타입의 화면(시대별 아코디언, 잠김/해금 카드, 진도 바, 상세·업로드·초기화 모달, 인쇄)이 fi fi-rr 아이콘과 빌드된 Tailwind로 다시 구현되고, 핵심어 입력 해금이 추가된다
- Files: index.html, src/main.ts, src/ui/app.ts, src/ui/codex-grid.ts, src/ui/era-section.ts, src/ui/card.ts, src/ui/modals.ts, src/ui/toast.ts, src/ui/icons.ts, src/styles.css, src/print.css, tests/e2e/codex.spec.ts, playwright.config.ts
- Acceptance: AC-1: 잠긴 카드에 [핵심어 입력]과 [사진 등록] 두 버튼이 있고, 정답 입력 시 해금 애니메이션 후 카드가 해금 상태로 바뀐다(Playwright). AC-2: 사진 등록 모달로 PNG를 올리면 해금되고 새로고침 후에도 유지된다(IndexedDB). AC-3: 화면의 모든 아이콘이 `fi fi-rr-*` 클래스이며 FontAwesome·이모지·인라인 SVG 아이콘이 0개다(`tests/e2e/codex.spec.ts`가 DOM에서 센다). AC-4: 학생이 쓴 소감이 `textContent`로만 렌더되어 img 태그·onerror 핸들러가 담긴 문자열이 실행되지 않는다. AC-5: 1280×800·1366×768(크롬북)·375×812 뷰포트 스크린샷이 `evidence/`에 남는다. AC-6: [도감 출력]에서 `no-print` 요소가 숨겨진 인쇄 레이아웃이 나온다
- Tests: pnpm test && pnpm build && pnpm e2e
- Risk: medium
- Complexity: high

### Step 4: codex-pwa-brand
- Goal: 크롬북 Chrome에서 "설치" 가능한 PWA가 되고 오프라인에서 열리며, 로고·앱 아이콘·파비콘이 실제로 참조된다
- Files: public/pwa.json, src/sw.ts, vite.config.ts, index.html, public/icons/app-icon-192.png, public/icons/app-icon-512.png, public/icons/favicon.ico, public/icons/logo.svg, scripts/make-icons.ts, tests/e2e/pwa.spec.ts
- Acceptance: AC-1: `pwa.json`(name·short_name·start_url `./`·display standalone·icons 192/512·theme_color)이 rel="manifest" link 태그로 연결되고 Playwright에서 `navigator.serviceWorker.ready`가 해결된다. AC-2: 첫 로드 후 오프라인 모드(`context.setOffline(true)`)에서 새로고침해도 앱이 렌더된다. AC-3: `logo.svg`가 헤더에, `favicon.ico`가 rel="icon" link 태그에, 앱 아이콘이 `pwa.json`에 실제로 참조된다. AC-4: service worker의 precache 목록이 빌드 산출물과 일치하고 `/api/` 요청은 캐시하지 않는다
- Tests: pnpm build && pnpm e2e
- Risk: low
- Complexity: medium
- Parallel: yes

### Step 5: codex-submit-button
- Goal: 허브에서 서빙될 때 [전송]이 계약대로 POST하고 영수증을 표시하며, 허브 밖에서는 JSON 내보내기로 동작한다
- Files: src/ui/submit.ts, src/core/submission.ts, src/core/hub.ts, src/core/queue.ts, src/ui/app.ts, tests/queue.test.ts, tests/e2e/submit.spec.ts
- Acceptance: AC-1: Playwright `page.route`로 `/api/tools/treasure-codex/submissions`를 가로챈 뒤 `/dist/treasure-codex/index.html` 경로에서 [전송]을 누르면 계약 본문이 POST되고 201 응답의 `receiptId`가 화면에 표시된다. AC-2: 응답이 실패하면 큐에 남고 "아직 전송되지 않은 기록 1건" 배지가 뜨며 다음 [전송]에서 재시도된다. AC-3: 허브 경로가 아닐 때 같은 버튼의 라벨이 "내보내기"로 바뀌고 JSON을 다운로드한다. AC-4: 전송 본문에 `imageBase64`·`image`·`ip` 키가 없음을 테스트가 JSON 전체를 훑어 확인한다. AC-5: `studentLabel`이 비어 있으면 전송 전에 번호 입력을 요구한다
- Tests: pnpm test && pnpm e2e
- Risk: medium
- Complexity: medium
- Depends on: codex-ui-codex, codex-domain-core

### Step 6: codex-bundle-pack
- Goal: `pnpm pack:bundle`이 all_market 허브가 그대로 반입할 수 있는 번들(`manifest.json` + 허용 확장자만)을 만들고 무결성 해시를 계산한다
- Files: scripts/pack-bundle.ts, scripts/integrity-hash.ts, tests/integrity-hash.test.ts, tests/pack-bundle.test.ts, package.json, docs/bundle-contract.md
- Acceptance: AC-1: `dist/manifest.json`이 `{id:"treasure-codex", name:"역사 보물도감", version, category:"역사 학습", audience:"student_distributable", distributionMode:"lan_web_bundle", entrypoint:"index.html", offlineCapable:true, integrityHash:"sha256:…", description}`을 담고 `apps/launcher/contracts/distribution.schema.json`으로 검증된다(스키마 파일은 테스트 픽스처로 복사). AC-2: `integrity-hash.ts`가 bundler.go의 프레이밍을 구현하고, 고정 픽스처(`tests/fixtures/mini-bundle/`)에 대한 기대 해시가 테스트에 상수로 박혀 있다(all_market 계획서 Step 4가 같은 픽스처로 Go 쪽 값을 대조한다). AC-3: 허용 확장자 밖의 파일이 `dist/`에 하나라도 있으면 pack이 exit 1로 실패한다. AC-4: `docs/bundle-contract.md`가 레이아웃·매니페스트·전송 계약을 한국어로 적는다
- Tests: pnpm test && pnpm pack:bundle
- Risk: low
- Complexity: medium
- Depends on: codex-pwa-brand, codex-submit-button

### Step 7: codex-github-pages
- Goal: GitHub origin이 생기고 PR 흐름이 열리며, main 머지마다 GitHub Pages로 배포되어 Google Classroom에 붙일 수 있는 링크가 나온다
- Files: .github/workflows/pages.yml, .github/workflows/ci.yml, vite.config.ts, README.md
- Acceptance: AC-1: `gh repo create neohum/Treasure-Collection --private --source . --push`로 origin이 생기고(이 계획서 승인이 곧 저장소 생성 승인이다; 공개 전환은 마켓 등록 시 별도 결정), `.githooks/pre-push`가 main 직접 푸시를 막는다. AC-2: `ci.yml`이 PR에서 `pnpm typecheck && pnpm test && pnpm build && pnpm pack:bundle`을 돌린다. AC-3: `pages.yml`이 main에서 `dist/`를 Pages에 올리고, 배포 URL에서 앱이 렌더된 스크린샷이 `evidence/`에 남는다. AC-4: README가 교사용 사용법(설치·핵심어 교체·런처 반입)을 한국어로 적는다
- Tests: pnpm build && gh run list --limit 1
- Risk: medium
- Complexity: low
- Depends on: codex-bundle-pack

## Verification
- Tier 1: `pnpm typecheck` (tsc --noEmit), `pnpm lint` (eslint)
- Tier 2: `pnpm test` (vitest + fake-indexeddb), `pnpm e2e` (Playwright, chromium)
- Tier 3: `pnpm build && pnpm preview`를 실제 Chrome에서 열어 PWA 설치·오프라인·인쇄·전송을
  확인하고 크롬북 해상도 스크린샷을 `evidence/<날짜>-<카드>/`에 남긴다. all_market 허브에
  번들을 반입해 `/dist/treasure-codex/`에서 열리고 [전송]이 201을 받는 것은 all_market
  계획서의 Step 4·5 증거로 교차 확인한다.

## Reviewer topology
builder=codex, reviewer=claude(독립 프로바이더), control=agy(읽기 전용 감사), challenge=on
