# 🏛️ 5학년 역사 디지털 보물도감 (Google Classroom PWA)

> **초등학교 5학년 사회과 역사 교육과정 연계 디지털 유물 수집 포트폴리오**  
> 구글 클래스룸(Google Classroom) 수업 배포 및 크롬북/스마트폰 오프라인 PWA(Progressive Web App) 서비스

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-orange?logo=pwa)](./manifest.webmanifest)
[![Google Classroom](https://img.shields.io/badge/Google_Classroom-Integrated-green?logo=googleclassroom)](./docs/DEPLOY_GOOGLE_CLASSROOM_PWA.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./package.json)

---

## 🌟 핵심 기능

1. **📶 오프라인 100% 지원 PWA (Service Worker)**:
   - 학교 교실의 불안정한 Wi-Fi 환경에서도 캐싱된 앱으로 완벽하게 동작
   - 데스크톱/크롬북/스마트폰 원클릭 앱 설치(`beforeinstallprompt`) 지원
2. **🎓 구글 클래스룸(Google Classroom) 연동**:
   - 구글 클래스룸 원클릭 과제 링크 공유 (`classroom.google.com/share` 인텐트)
   - 학생 인적사항(학교, 학년, 반, 번호, 이름) 설정 및 관리
   - **과제 요약 클립보드 원클릭 복사**: 클래스룸 과제 비공개 댓글에 즉시 제출 가능
   - **A4 포트폴리오 인쇄 / PDF 저장**: 선생님 확인 직인란이 포함된 깔끔한 과제 제출서 출력
   - **JSON 데이터 백업/복원**: 학교 크롬북과 집 PC 간 데이터 동기화 및 교사 제출 지원
3. **🏛️ 5개 시대 20종 대표 유물 수록**:
   - 선사 및 고조선 (빗살무늬 토기, 고인돌, 비파형 청동검)
   - 삼국 및 가야 (고구려 수막새, 무용총 무용도, 백제 금동대향로, 신라 금관, 첨성대, 가야 기마인물형 토기)
   - 통일신라 및 발해 (석굴암 본존불, 불국사 다보탑, 발해 이불병좌상)
   - 고려 시대 (고려 상감청자, 팔만대장경판, 직지심체요절)
   - 조선 시대 (훈민정음 해례본, 앙부일구, 자격루, 수원화성, 대동여지도)
4. **🎨 디자인 & UI 표준**:
   - 하네스 규칙(AGENTS.md) 준수: **Flaticon UIcons Regular Rounded (`fi fi-rr-*`)** 단일 표준
   - 고화질 벡터 SVG 에셋 (`favicon.svg`, `logo.svg`) 및 PWA 표준 규격 아이콘(192, 512, maskable) 탑재

---

## 🚀 빠른 시작 (로컬 실행)

별도의 복잡한 빌드 도구나 외부 의존성 없이 Node.js 표준 환경에서 즉시 실행됩니다.

```bash
# 1. 로컬 HTTP 서버 실행
npm start
# 또는
node scripts/serve.js

# 2. 브라우저에서 접속
# http://localhost:3000
```

---

## 🧪 전체 검증 테스트

Multi-Layer Deep Verification (정적 자산 + 규격 검사 + 로컬 HTTP 런타임 스모크 테스트):

```bash
npm test
# 또는
node scripts/verify-all.js
```

---

## 📖 구글 클래스룸 배포 및 수업 활용 가이드

선생님께서 구글 클래스룸에 본 PWA를 과제로 등록하고, 학생들이 크롬북에서 앱으로 설치하여 과제를 제출하는 상세 가이드는 아래 문서를 참고하세요:

👉 **[구글 클래스룸용 PWA 배포 및 수업 활용 완전 가이드 (docs/DEPLOY_GOOGLE_CLASSROOM_PWA.md)](docs/DEPLOY_GOOGLE_CLASSROOM_PWA.md)**

---

## 📂 프로젝트 구조

```text
Treasure-Collection/
├── index.html                   # 메인 웹앱 진입점 (PWA + 클래스룸 연동 UI)
├── manifest.webmanifest         # W3C PWA 웹 매니페스트
├── manifest.json                # PWA 매니페스트 호환용
├── sw.js                        # 오프라인 캐싱 및 백그라운드 Service Worker
├── favicon.svg / logo.svg       # 고품질 벡터 브랜드 에셋
├── apple-touch-icon.png         # iOS 홈화면 아이콘
├── og-image.png                 # 클래스룸 링크 미리보기 오픈그래프 이미지
├── icons/                       # PWA 규격 아이콘 세트 (192, 512, maskable)
├── docs/
│   └── DEPLOY_GOOGLE_CLASSROOM_PWA.md  # 구글 클래스룸 배포/수업 운영 가이드
├── .github/workflows/
│   └── deploy.yml               # GitHub Pages 원클릭 자동 배포 액션
├── scripts/
│   ├── serve.js                 # 초경량 로컬 정적 웹 서버
│   ├── generate-assets.js       # PWA 아이콘/에셋 생성 스크립트
│   ├── verify-assets.js         # 에셋 규격 검증
│   ├── verify-manifest-sw.js    # Manifest 및 SW 검증
│   ├── verify-index.js          # index.html 표준 및 클래스룸 기능 검증
│   └── verify-all.js            # Tier 1~3 종합 검증 스위트
└── package.json                 # 프로젝트 메타데이터 및 스크립트
```
