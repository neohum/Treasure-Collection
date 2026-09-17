# Evidence — cloudschool-collect-restore (교사 과제 수집용 collect/restore 프로토콜)

- 브랜치: `feat/cloudschool-collect-restore` (base: main `349b5df`)
- 날짜: 2026-09-18 (Asia/Seoul)
- 계기: 교사의 런처-테스트 "과제 수집" 화면이 **같은 index.html**을 열고 학생을 고르면 그 학생이 저장한 내용(해금 카드·소감·
  사진)을 원래 도감 화면에 읽기 전용으로 재생해야 한다. Cloud-School 제출 SDK는 캔버스·폼·URL만 잡으므로 앱이 명시적
  프로토콜을 노출한다. 교사 쪽은 정확히 이 이름들에 맞춰 병렬로 만들어진다. 전문: [`docs/cloudschool-protocol.md`](../../docs/cloudschool-protocol.md).

## WHAT WAS TESTED

- **프로토콜 순수 로직** `src/core/bridge.ts`: `CloudSchoolCollected`/`CloudSchoolApp` 타입, `MSG` 타입 문자열
  (`cloudschool_app_ready`·`cloudschool_restore`·`cloudschool_restored`·`cloudschool_collect`·`cloudschool_collected`·
  `cloudschool_clear_restore`·`cloudschool_restore_cleared`), `collectSnapshot`(= `buildSubmission` + `extractAttachmentsFromRecords`
  + `document`), `collectedToSubmission`, `validateCollected`(schema 1·appId/toolId 일치·LIMITS 절단·모르는 유물 id 무시·첨부는
  `data:image/jpeg|png` base64 2 MB 이하·`photo-<id>` 짝 필수), `collectedToRecords`(data URL → Blob, `src/core/export.ts`의
  `dataUrlToBlob`를 export해 재사용), `handleBridgeMessage`(우리 타입만 처리, 검증 실패는 한국어 `warn`만).
- **배선** `src/main.ts`: 부팅 뒤 `window.CloudSchoolApp = { version: 1, appId, title, collect, restore, clearRestore }`,
  `message` 리스너(eval 없음, `data.type`이 목록 밖이면 무시, `event.origin`은 로그용), iframe 안이면 `cloudschool_app_ready`,
  `#restore` 해시면 3초 뒤 안내.
- **재생 렌더** `src/ui/app.ts`·`card.ts`·`styles.css`: IndexedDB 쓰기 없이 메모리 `progress`만 교체, `#app[data-readonly=true]`,
  헤더 안 고정 배너(`fi fi-rr-eye` + "12번 학생의 제출물 보기 (읽기 전용) · 제출 …", 단독 열림일 때만 [내 도감으로 돌아가기]),
  라벨 입력 `readonly`, 해금·사진·전송/내보내기·가져오기·초기화·[이전으로] 버튼 미렌더 + 코드 경로 가드, 상세 모달 유지(사진 변경
  버튼 없음), [도감 출력] 유지. 재생 중 `collect()`는 그려 놓은 payload를 그대로 돌려준다(멱등).
- **[전송] 단일 출처** `src/ui/submit.ts`: 본문을 `deps.collect()` → `collectedToSubmission`으로 만든다. `edulinker_submission`
  메시지 형태는 그대로(`data`는 `Submission`).
- 단위: `tests/bridge.test.ts` +19 (검증 good/bad 13, 변환 2, collect 1, 라우팅 4). 기존 49 유지 → 68/68.
- e2e 신규 `tests/e2e/restore.spec.ts` 3건 + 기존 15건 = 18/18 (`PREVIEW_PORT=4185`, production preview). 로그:
  [`e2e-output.txt`](./e2e-output.txt)
- 게이트: `PREVIEW_PORT=4185 bash scripts/loop/health.sh` — build·lint·typecheck·vitest·e2e·visual·behavior-spec·version-sync·
  brand-assets·deliverable-preview 전부 통과. 로그: [`gate-output.txt`](./gate-output.txt). 빌드·pack·마켓 감사 문자열:
  [`build-log.txt`](./build-log.txt) (`exitCode=0`, 16개 파일, html/css `data:`·`svg+xml`·`javascript:`·`vbscript:` 0건, js
  `javascript:`·`vbscript:` 0건).

| AC | 테스트 | 관찰 |
| --- | --- | --- |
| AC-1 `collect()` 형태: 해금 2건(art_01 핵심어+소감, art_07 사진+소감), 첨부 1장 `photo-art_07` JPEG data URL, studentLabel | `restore.spec.ts` "AC-1: …" — `./`에서 라벨 12 입력, 핵심어 "신석기", `#photoInput`에 1×1 PNG, `page.evaluate(() => window.CloudSchoolApp.collect())` | pass — `{schema:1, appId:"treasure-codex", studentLabel:"12", summary:{unlocked:2,total:20}}`, `submittedAt` 오프셋 ISO, items `[art_01 keyword "정착 생활의 시작", art_07 photo "금관이 화려하다"]`, attachments 1건 `id photo-art_07 / image/jpeg / data:image/jpeg;base64,…`, `document.title "역사 보물도감"`, 두 번 수집해도 items·attachments 동일 |
| AC-2 빈 IndexedDB 컨텍스트의 교사 페이지(`/teacher/` route, `<iframe src="/">`)에 postMessage로 재생·해제 | `restore.spec.ts` "AC-2: …" — `browser.newContext()`; 부모가 `cloudschool_app_ready` 수신 후 `cloudschool_restore`(AC-1 payload, `studentName:"12번"`) 전송 | pass — 부모 수신 `{type:"cloudschool_app_ready", appId, title, version:1}` → `{type:"cloudschool_restored", appId, studentLabel:"12", unlocked:2, total:20}`; iframe 안 `#restoreBanner` visible·"12번 학생의 제출물 보기 (읽기 전용)"·`i.fi-rr-eye`·[돌아가기] 없음, `#app[data-readonly=true]`, `#studentLabel` value 12 + readonly, art_01/art_07 `data-state=unlocked`, art_07 `img.card-image` src `blob:`, art_02 locked, 진도 "2 / 20 (10%)", `[data-action=keyword|photo]` 0개, `#btn-submit/#btn-export/#btn-import/#btn-reset` 0개, `#btn-print` visible; 상세 모달 소감 "금관이 화려하다"+`img.detail-image` blob, 푸터 버튼 1개(닫기); `cloudschool_collect` → `cloudschool_collected` requestId "r-1" + 같은 items/첨부; print 매체에서 `.no-print` 전부 숨김·`.card-unlocked` 2개 표시; `cloudschool_clear_restore` → `cloudschool_restore_cleared`, 배너 사라짐, art_01/art_07 locked, "0 / 20 (0%)", 해금 버튼 복귀; live `collect()` items·attachments `[]`·label "" , reload 후 0/20; 다른 도구 payload·`{type:"eval"}`·문자열 메시지에 응답 없음·pageerror 0. 캡처 [`restore-1366x768.png`](./restore-1366x768.png) |
| AC-3 `#restore` 안내·보통 페이지 무영향 | `restore.spec.ts` "AC-3: …" | pass — `./#restore` 로드 직후 `#restoreHint` 0개 → 6초 안에 visible, 텍스트 "선생님 화면에서 학생을 선택하세요", 해금 버튼 그대로·readonly 아님; `./`에서 3.5초 뒤 `#restoreBanner`·`#restoreHint` 0개. 기존 15 spec 전부 통과 |
| 검증(단위) | `bridge.test.ts` | pass — 객체 아님/schema 2/다른 appId/items 없음/submittedAt 깨짐/attachments 비배열 거부(한국어 사유); 모르는 id·잘못된 모드·깨진 시각·중복 항목만 탈락; 라벨 20자·소감 200자·항목 200개 절단; 첨부는 jpeg·png만, 짝 없는 `photo-art_02`·접두사 없는 id·svg+xml·text/html·blob:·2 MB 초과 탈락, 정확히 2 MB 경계 통과; `Submission(toolId)` 수용 |
| 라우팅(단위) | `bridge.test.ts` | pass — `edulinker_submission`·`cloudschool_app_ready`·`{type:"eval"}`·원시값은 무처리; restore→restored, collect(문자·숫자 requestId)→collected 두 번 동일 payload, clear→restore_cleared 뒤 collect는 빈 items; 검증 실패 restore는 warn 1건 `… 무시했습니다 — 다른 도구의 payload입니다: evil (origin: https://evil.example)` + 응답 0 |

## WHAT WAS OBSERVED

- 단위 68/68 (14 파일), e2e 18/18, visual 1/1, lint·typecheck 0, health `all gates passed`.
- `PREVIEW_PORT=4185 pnpm preview` → listening pid 30352, `curl http://127.0.0.1:4185/` 200 (1085 bytes), CSS 200 → `taskkill //PID 30352 //F`
  정리 (로그 [`preview-observe.txt`](./preview-observe.txt)).
- 재생 화면 캡처(교사 iframe 시뮬레이션, 1366×768): 헤더에 [이전으로]·전송/내보내기·가져오기·초기화 없음, 라벨 12 고정, 주황 배너
  "12번 학생의 제출물 보기 (읽기 전용) · 제출 2026. 9. 18. 오전 …", 요약 "12번의 보물 수집 현황 2 / 20 (10%)", 빗살무늬 토기 카드
  해금(핵심어) + 소감, 잠긴 카드에 해금 버튼 없음.
- 마켓 감사 문자열: html/css 0, js 0 (`build-log.txt`). `pnpm pack:bundle` 16개 파일.

## WHAT WAS OMITTED

- 교사 쪽(런처-테스트 과제 수집 화면)은 다른 저장소에서 병렬 구현 중이라 **실제 교사 UI와의 연동은 여기서 검증하지 않았다**. 여기서는
  `page.route`로 만든 부모 페이지(`/teacher/`)가 같은 이름의 메시지를 주고받는 것으로 계약을 검증했다.
- postMessage `targetOrigin`은 `"*"`이고 수신 origin을 제한하지 않는다(교사 화면의 배포 origin이 아직 고정되지 않음). origin 고정은
  교사 쪽 배포 주소가 정해진 뒤의 후속 작업이다. 그때까지의 방어선은 payload 검증(appId·schema·첨부 MIME/크기)과 "IndexedDB에
  쓰지 않음"이다.
- 팝업(`window.opener`) 형태의 교사 화면은 프로토콜에 없어 다루지 않았다(단독 열림에서 보낸 창으로 응답하는 경로만 있다).
- 사진 첨부는 JPEG 1200px/0.75 압축본이라 학생 기기의 원본(800px JPEG 0.7)과 바이트가 같지 않다 — 교사 화면 확인용으로 충분하다.
- `dist/manifest.json`은 이전 PR들과 같이 커밋하지 않았다(`pnpm pack:bundle`이 생성). 나머지 `dist/`는 최종 코드로 다시 빌드해 커밋했다.

## WHY IT IS ENOUGH

- 프로토콜의 모든 메시지 타입과 window API가 실제 production 번들 위에서, 실제 iframe 부모↔자식 postMessage로 왕복하는 e2e가
  초록이다. 재생 뒤 저장소가 비어 있음을 `clearRestore` 직후 `collect()`와 새로고침으로 두 번 확인했다.
- 들어오는 payload의 거부·절단·부분 수용 규칙은 단위 테스트가 경계값(2 MB, 200자, 200개)까지 고정한다.
- [전송] 본문이 `collect()` 하나에서 나오므로 교사 화면이 받는 것과 허브가 받는 것이 같은 코드 경로다(`submit.spec.ts` 4건 유지).
- 아이콘은 `fi fi-rr-eye`·`fi fi-rr-info`만 추가했고 AC-3 e2e(인라인 SVG 아이콘 금지·이모지 없음)가 그대로 통과한다.
