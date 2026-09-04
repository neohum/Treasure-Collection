# Evidence — codex-ui-codex (Step 3 / plans/treasure-codex-launcher.plan.md)

- 카드: `codex-ui-codex`
- 브랜치: `feat/codex-ui-codex` (base: main `6c4dd1d`)
- 날짜: 2026-09-04 (Asia/Seoul)

## WHAT WAS TESTED

- `pnpm e2e` (Playwright chromium 1366×768, production preview 상대) — `tests/e2e/codex.spec.ts` 6건 + smoke 1건.
  로그: [`e2e-output.txt`](./e2e-output.txt)
- `bash scripts/loop/health.sh` — build · lint · typecheck · test(28) · e2e(7) · visual · cli-smoke ·
  behavior-spec · version-sync · brand-assets · deliverable-preview. 로그: [`gate-output.txt`](./gate-output.txt)
- 단위: `tests/sha256.test.ts`(순수 JS SHA-256이 WebCrypto와 동일, 한글·블록 경계 포함) 추가.

| AC | 테스트 | 증명 |
| --- | --- | --- |
| AC-1 | `핵심어 입력으로 해금되고 오답은 거부된다` | 잠긴 카드 [핵심어 입력]·[사진 등록] 두 버튼, 오답 "고인돌" → 오류 문구·잠김 유지, " 빗살 무늬 토기 " → 해금·`card-just-unlocked` 애니메이션·소감 표시·진도 1/20 |
| AC-2 | `사진 등록으로 해금되고 새로고침 후에도 유지된다` | PNG 업로드 → 미리보기 → 해금(mode=photo) → reload 후에도 해금·`blob:` 이미지 → 상세 모달에 사진·소감 |
| AC-3 | `아이콘은 전부 fi fi-rr…` | 모달 포함 DOM의 `i`·`svg`·`fa-*` 전수 검사: 비표준 0개, 이모지 0개, fi-rr 아이콘 20개 초과 |
| AC-4 | `학생 소감은 HTML로 해석되지 않는다` | `<img onerror>` 문자열이 그대로 텍스트로 보이고 `window.__xss` 미설정, note 안에 img/b 요소 0개 |
| AC-5 | `…뷰포트 스크린샷과 인쇄 레이아웃` | [`codex-1280x800.png`](./codex-1280x800.png), [`codex-1366x768.png`](./codex-1366x768.png), [`codex-375x812.png`](./codex-375x812.png) |
| AC-6 | 같은 테스트 | `emulateMedia(print)`에서 `.no-print` 전부 `display:none`, 접힌 시대도 `.era-content` 표시. [`codex-print-preview.png`](./codex-print-preview.png) |
| 추가 | `초기화하면 모든 기록이 사라진다` | 확인 모달 → 0/20, reload 후에도 0/20 |

## WHAT WAS OBSERVED

- e2e 7/7, 단위 28/28, 게이트 전부 초록. `dist/`는 `.woff2`·`.js`·`.css`·`.html`·`.json`·이미지만.
- 1366×768 캡처: 다크 헤더(로고·제목·번호 입력·출력·내보내기·가져오기·초기화), 요약 배너(진도 바),
  시대 필터 탭 6개, 시대 아코디언 5개, 해금 카드(핵심어 해금 아트·해금 완료 뱃지·소감)와 잠김 카드(점 배경·자물쇠·두 버튼).
- 사진 축소(`src/core/image.ts`, createImageBitmap → canvas → JPEG 0.7)가 실제 Chrome에서 동작해 1×1 PNG가
  JPEG Blob으로 저장·재표시됐다.
- `crypto.subtle` 부재 대비 순수 JS SHA-256 폴백을 넣었다(허브가 `http://192.168.x.x`라 비보안 원점일 수 있음).

## WHY IT IS ENOUGH

- 계획서 AC 여섯 개가 각각 하나의 Playwright 테스트 이름에 대응하고, 모두 production 빌드를 상대로 돈다.
- XSS는 "innerHTML을 안 쓴다"는 정적 규칙(eslint)과 "실제로 실행되지 않는다"는 동적 검사 두 겹이다.
- 아이콘 표준은 DOM 전수 검사라 새 아이콘이 잘못 들어오면 즉시 잡힌다.
- 남은 회귀 위험: 실제 학교 크롬북(ChromeOS)에서의 파일 선택기·인쇄 대화상자는 Playwright가 대신하지 못한다.
  Step 7 배포 뒤 교사 크롬북에서 확인한다.

## WHAT WAS OMITTED

- 로고는 여전히 재사용(`mode: reused`). Step 4에서 새로 그린다.
- 전송 버튼 없음(Step 5). 내보내기·가져오기 버튼은 이 카드에서 헤더에 넣었고 동작은 단위 테스트(Step 2)로만 검증했다
  — 브라우저 다운로드 대화상자는 e2e 범위 밖.
- 시크릿 없음.
