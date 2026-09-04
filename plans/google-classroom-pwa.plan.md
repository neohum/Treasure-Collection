---
plan: google-classroom-pwa
status: approved
risk: low
owner: antigravity
---
# Plan: 구글 클래스룸 연동 PWA(Progressive Web App) 서비스 구축 및 배포 준비

## Intent
초등학교 5학년 역사 디지털 보물도감을 구글 클래스룸 수업 환경(크롬북, 스마트폰, 태블릿, PC)에서 오프라인 캐싱 및 원클릭 설치(PWA)가 가능하고, 구글 클래스룸 과제 제출/공유/백업이 원활한 프로덕션 PWA 서비스로 패키징 및 배포 준비를 완료한다.

## Non-goals
- 별도의 유료 백엔드 데이터베이스 서버 구축 (학생 개인정보 보호 및 학교 네트워크 방화벽을 고려하여 클라이언트 중심 LocalStorage + JSON 백업/복원 + Service Worker 오프라인 구조 유지)
- FontAwesome 등 비표준 아이콘 사용 (AGENTS.md 표준인 Flaticon UIcons `fi fi-rr-*` 준수)

## Steps

### Step 1: generate-pwa-brand-assets
- Goal: PWA 표준 매니페스트 및 DESIGN.md/AGENTS.md 하드 룰에 부합하는 고품질 벡터 로고, 파비콘, PWA 규격 아이콘(192x192, 512x512, maskable, apple-touch-icon) 및 오픈그래프 이미지를 생성한다.
- Files: public/favicon.svg, public/logo.svg, public/icons/icon-192.png, public/icons/icon-512.png, public/icons/icon-maskable.png, public/icons/apple-touch-icon.png, public/icons/og-image.png, favicon.ico
- Acceptance: AC-1: 모든 아이콘 파일이 올바른 크기와 유효한 바이너리/SVG 포맷으로 존재한다.
- Tests: node scripts/verify-assets.js
- Risk: low
- Complexity: low

### Step 2: build-pwa-core-service
- Goal: PWA 웹 매니페스트(manifest.webmanifest), 오프라인 캐싱 서비스 워커(sw.js), 오프라인 감지 및 설치 프롬프트(beforeinstallprompt) 로직을 구축한다.
- Files: manifest.webmanifest, sw.js
- Acceptance: AC-1: manifest.webmanifest가 W3C PWA 규격을 충족하고, sw.js가 주요 정적 에셋 및 CDN 리소스를 오프라인 캐싱하도록 구성된다.
- Tests: node scripts/verify-manifest-sw.js
- Risk: low
- Complexity: low

### Step 3: refactor-index-html-classroom-and-uicons
- Goal: code_artifact.html을 index.html로 승격하면서, Flaticon UIcons(fi fi-rr-*) 단일 표준으로 전면 교체하고, 구글 클래스룸 공유/과제 제출, 학생 인적사항(학교/반/번호/이름) 저장, A4 과제 리포트 인쇄/PDF 저장, JSON 백업/복원, 클립보드 제출 요약 복사, PWA 설치 버튼을 구현한다.
- Files: index.html
- Acceptance: AC-1: 모든 UI 아이콘이 fi fi-rr-* 클래스를 사용하고 FontAwesome 잔재가 없으며, 구글 클래스룸 공유/인쇄/백업/복원 기능이 정상 동작한다.
- Tests: node scripts/verify-index.js
- Risk: low
- Complexity: medium

### Step 4: setup-packaging-and-deployment-guide
- Goal: 로컬 테스트 서버, GitHub Pages 자동 배포 워크플로우(.github/workflows/deploy.yml), 구글 클래스룸 교사용/학생용 배포 가이드 문서를 완성하고 전체 검증을 수행한다.
- Files: package.json, scripts/serve.js, .github/workflows/deploy.yml, docs/DEPLOY_GOOGLE_CLASSROOM_PWA.md, README.md
- Acceptance: AC-1: 로컬 개발 서버가 정상 기동되고 전체 PWA 검증 스크립트가 pass하며, 배포 가이드가 완비된다.
- Tests: node scripts/verify-all.js
- Risk: low
- Complexity: low

## Verification
- Tier 1 정적 검사: Manifest, Service Worker, HTML 태그, Flaticon UIcons 표준 준수 검사
- Tier 2 테스트: 자동화 검증 스크립트(verify-assets.js, verify-manifest-sw.js, verify-index.js, verify-all.js) 통과
- Tier 3 실행·시각 검증: 로컬 HTTP 서버 실행 후 index.html 및 PWA 리소스 HTTP 200 응답 확인 및 헤드리스/브라우저 검증

## Reviewer topology
- builder: AGY (Antigravity), reviewer: Claude/Autonomous Loop
