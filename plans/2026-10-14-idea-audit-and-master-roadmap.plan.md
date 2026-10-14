---
slug: 2026-10-14-idea-audit-and-master-roadmap
title: "Treasure-Collection 전수 아이디어·플랜 감사 및 마스터 개발 로드맵"
status: done
risk: medium
created: 2026-10-14
---

# Plan: Treasure-Collection 전수 아이디어·플랜 감사 및 마스터 개발 로드맵

## 1. 감사 개요 (Audit Summary)

초등 5학년 역사 디지털 보물도감(`Treasure-Collection`)의 보유 플랜 2종(`google-classroom-pwa.plan.md`, `treasure-codex-launcher.plan.md`)과 실제 소스 코드(`src/`, `scripts/`, `public/`, `tests/`, `legacy/`)를 전수 대조하였다.
1. 1차 `google-classroom-pwa.plan.md`는 모두 구현 완료된 뒤, 2차 플랜 Step 1 명세에 따라 `legacy/` 디렉터리로 아카이브되었고 브랜드 아이콘 자산은 `public/`으로 계승되었다.
2. 2차 `treasure-codex-launcher.plan.md`는 도메인 코어(`src/core/*`), UI(`src/ui/*`), 런처 허브 전송 및 오프라인 큐(`src/ui/submit.ts`, `src/core/queue.ts`), 번들 무결성 해시 패커(`scripts/pack-bundle.ts`, `scripts/integrity-hash.ts`) 및 13개 단위 테스트 + 5개 Playwright E2E 스펙이 구현되었다. 그러나 세부 대조 결과 **① Step 4의 서비스 워커 소스(`src/sw.ts`) 및 오프라인 새로고침 E2E 테스트(`tests/e2e/pwa.spec.ts`), `app-icon-{192,512}.png` 파일명 정합성 누락**, **② Step 6 AC-4의 `docs/bundle-contract.md` 한국어 계약 문서 누락**, **③ Step 7의 `.github/workflows/ci.yml` 및 `pages.yml` 미구축(구형 npm 기반 `deploy.yml`만 잔존)**이 미완결 항목으로 확인되었다.

---

## 2. 보유 플랜 실현 상태 판정 표

| 플랜 파일명 (`plans/*.plan.md`) | 실현 여부 | 코드 및 테스트 근거 | 추가 개발 가치 및 우선순위 |
| --- | --- | --- | --- |
| `google-classroom-pwa.plan.md` (구글 클래스룸 연동 PWA 서비스 구축 및 배포 준비) | **구현 완료** | 초기 단일 HTML PWA 및 검증 스크립트 전수 구현 후 `legacy/`(`index.html`, `sw.js`, `manifest.webmanifest`, `scripts/verify-*.js`)에 보존됨. 아이콘 자산은 `public/`에 계승됨 | **낮음 (완료/계승됨)** — 2차 Vite + TypeScript 번들 아키텍처로 승격 완료되었으므로 `legacy/` 보존 상태 유지 |
| `treasure-codex-launcher.plan.md` (보물도감 학생 웹 번들 — 크롬북 PWA, 런처 LAN 배포, 결과 전송) | **부분 구현** | Step 1·2·3·5 및 Step 6 스크립트(`src/core/*`, `src/ui/*`, `scripts/pack-bundle.ts`, `scripts/integrity-hash.ts`, `tests/*.test.ts`, `tests/e2e/{codex,restore,single-file,smoke,submit}.spec.ts`) 구현 완료. **단, ① Step 4 `src/sw.ts` 및 `tests/e2e/pwa.spec.ts` 미구현, ② Step 6 AC-4 `docs/bundle-contract.md` 미작성, ③ Step 7 `.github/workflows/{ci,pages}.yml` 미구현(구형 `deploy.yml`만 존재)** | **최우선 (P0)** — 오프라인 프리캐시 서비스 워커와 `pwa.spec.ts`, `docs/bundle-contract.md`, pnpm 기반 CI/Pages 워크플로우를 완성하여 Step 4·6·7 AC를 100% 충족해야 함 |

---

## 3. 미구현·개선 사항 단계별 개발 계획서 (Master Roadmap)

### Step 1: pwa-service-worker-and-offline-e2e
- Goal: `treasure-codex-launcher.plan.md` Step 4(`codex-pwa-brand`)의 누락 요소인 서비스 워커(`src/sw.ts` 또는 빌드 산출물 `dist/sw.js` precache), 아이콘 파일(`public/icons/app-icon-192.png`, `app-icon-512.png`), 오프라인 새로고침 Playwright E2E(`tests/e2e/pwa.spec.ts`)를 완성한다.
- Files: src/sw.ts, vite.config.ts, public/pwa.json, public/icons/app-icon-192.png, public/icons/app-icon-512.png, src/main.ts, tests/e2e/pwa.spec.ts
- Acceptance:
  - AC-1: 빌드 시 `dist/sw.js`가 생성되어 정적 에셋을 프리캐시하고 `/api/` 경로 요청은 네트워크 전용(캐시 제외)으로 처리한다.
  - AC-2: `public/pwa.json`과 `public/icons/app-icon-{192,512}.png`가 정확히 매핑되고 `index.html`에서 `rel="manifest"`로 참조된다.
  - AC-3: `tests/e2e/pwa.spec.ts`에서 `navigator.serviceWorker.ready` 확인 후 `context.setOffline(true)` 상태에서 새로고침해도 보물도감 화면이 정상 렌더링된다.
- Tests: pnpm build && pnpm test && npx playwright test tests/e2e/pwa.spec.ts
- Risk: low
- Complexity: medium

### Step 2: bundle-contract-documentation
- Goal: `treasure-codex-launcher.plan.md` Step 6 AC-4에서 요구한 `docs/bundle-contract.md`를 한국어로 작성하고 `tests/pack-bundle.test.ts`에서 문서 존재 및 계약 항목을 검증한다.
- Files: docs/bundle-contract.md, tests/pack-bundle.test.ts
- Acceptance:
  - AC-1: `docs/bundle-contract.md`에 번들 디렉터리 레이아웃, 허용 확장자 규칙(`.webmanifest`/`.map`/`.txt` 금지), `ToolDistributionManifest` 스키마, `integrityHash` 프레이밍 규격, 학생→교사 전송 API(`POST /api/tools/{toolID}/submissions`) 명세가 한국어로 문서화된다.
  - AC-2: `pnpm test && pnpm pack:bundle`이 exit 0으로 통과한다.
- Tests: pnpm test && pnpm pack:bundle
- Depends on: pwa-service-worker-and-offline-e2e
- Risk: low
- Complexity: low

### Step 3: github-actions-ci-and-pages-workflows
- Goal: Step 7(`codex-github-pages`) 명세에 맞춰 구형 npm 기반 `deploy.yml`을 정비하고, pnpm 기반 `.github/workflows/ci.yml` 및 `.github/workflows/pages.yml`과 교사용 `README.md` 안내를 완성한다.
- Files: .github/workflows/ci.yml, .github/workflows/pages.yml, README.md, tests/workflows.test.ts
- Acceptance:
  - AC-1: `.github/workflows/ci.yml`이 PR 및 push에서 `pnpm typecheck && pnpm test && pnpm build && pnpm pack:bundle`을 실행하도록 정의된다.
  - AC-2: `.github/workflows/pages.yml`이 `main` 브랜치에서 `dist/` 산출물을 GitHub Pages로 배포하도록 구성된다.
  - AC-3: `README.md`에 크롬북 PWA 설치법, `content/keywords.json` 핵심어 교체 및 `pnpm build` 방법, `all_market` 런처 번들 반입 절차가 한국어로 기술된다.
- Tests: pnpm typecheck && pnpm test && pnpm build && pnpm pack:bundle
- Depends on: bundle-contract-documentation
- Risk: low
- Complexity: low

### Step 4: teacher-keyword-customizer-and-era-filter
- Goal: 향후 v2 확장 과제로 언급된 교사용 핵심어·힌트 JSON 생성 마법사(브라우저 내 로컬 설정 생성기)와 시대별/해금상태별 빠른 필터 및 검색 기능을 추가한다.
- Files: src/core/filter.ts, src/ui/app.ts, tests/filter.test.ts
- Acceptance:
  - AC-1: 상단 필터 바에서 '전체 / 해금됨 / 잠김' 상태 필터 및 유물 이름·시대 검색이 즉시 동작한다.
  - AC-2: 교사 모드(`?teacher=1`)에서 학급 맞춤형 핵심어 세트를 입력하면 해시 변환된 `config.json`을 즉시 다운로드할 수 있다.
- Tests: pnpm typecheck && pnpm test && pnpm build
- Depends on: github-actions-ci-and-pages-workflows
- Risk: low
- Complexity: medium

## 4. Verification
- **Tier 1 (정적 검사)**: `pnpm typecheck && pnpm lint`
- **Tier 2 (단위·번들 테스트)**: `pnpm test && pnpm pack:bundle`
- **Tier 3 (E2E 및 오프라인 검증)**: `pnpm e2e` (Playwright `codex.spec.ts`, `pwa.spec.ts`, `submit.spec.ts`, `restore.spec.ts`, `single-file.spec.ts`)
