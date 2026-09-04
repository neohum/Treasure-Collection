# Evidence — codex-submit-button (Step 5 / plans/treasure-codex-launcher.plan.md)

- 카드: `codex-submit-button`
- 브랜치: `feat/codex-submit-button` (base: main `63e856e`)
- 날짜: 2026-09-04 (Asia/Seoul)

## WHAT WAS TESTED

- `pnpm test` — 10 파일 33건(신규 `tests/queue.test.ts` 5건: 201 영수증, 재시도 판정, 큐 순서, 부분 실패, 4xx 폐기)
- `pnpm e2e` — 11건 (신규 `tests/e2e/submit.spec.ts` 4건). 허브 경로는 Playwright `route`로 `/dist/treasure-codex/**`를
  루트로 되돌려 시뮬레이션하고, 전송 API는 `route`로 가로채 201/503을 돌려줬다. 로그: [`e2e-output.txt`](./e2e-output.txt)
- `bash scripts/loop/health.sh` 전체 게이트(visual·brand-assets·deliverable-preview 포함). 로그: [`gate-output.txt`](./gate-output.txt)

| AC | 테스트 | 증명 |
| --- | --- | --- |
| AC-1 | `허브 경로에서 [전송]이 계약 본문을 POST하고 영수증을 보여 준다` | `/dist/treasure-codex/`에서 [전송] 버튼 존재·[내보내기] 없음, POST 본문이 계약과 일치(schema·toolId·라벨·summary·items·오프셋 시각), 201의 `receiptId`가 모달에 표시 |
| AC-2 | `허브가 응답하지 못하면 큐에 남고 다음 [전송]에서 재시도된다` | 503 → 안내 문구 + "아직 전송되지 않은 기록 1건" 배지, 새로고침 후에도 배지 유지, 허브 복구 후 [전송] 한 번에 밀린 1건 + 이번 1건 순서대로 도착(수신 2건, unlocked 1→2) |
| AC-3 | `허브 경로가 아니면 같은 자리의 버튼이 [내보내기]가 되고 JSON을 내려받는다` | 루트 경로에서 `#btn-export` "내보내기", 다운로드 파일명 `보물도감-3-YYYY-MM-DD.json`, 내용 schema 1·records |
| AC-4 | AC-1 테스트 내 | POST 본문 JSON 문자열에 `"image"`·`"imageBase64"`·`"ip"`·`"remoteAddr"`·`"userAgent"`·`"deviceName"`·`data:image` 없음 |
| AC-5 | `번호가 비어 있으면 전송 버튼이 막히고 안내가 뜬다` | 라벨 없이 [전송] → "번호(또는 이름)를 먼저 입력하세요", 전송 버튼 disabled, POST 0건 |

## WHAT WAS OBSERVED

- 단위 33/33, e2e 11/11, 게이트 전부 초록. 영수증 모달 캡처: [`submit-receipt-1366x768.png`](./submit-receipt-1366x768.png)
- 전송 모달은 보내기 전에 "보내는 것: 번호, 해금 목록, 시각, 소감. 사진은 보내지 않아요."를 학생에게 보여 준다.
- 큐는 IndexedDB `queue` 스토어(Step 2)에 `submittedAt`을 키로 쌓이며, 4xx(본문 거부)는 재시도하지 않고 버린다 —
  같은 본문을 다시 보내도 결과가 같기 때문.
- 두 워크트리가 동시에 e2e를 돌릴 수 있도록 `PREVIEW_PORT` 환경변수를 도입했다(이 카드는 4181 사용).

## WHY IT IS ENOUGH

- 계약 본문은 e2e에서 실제 브라우저가 만든 POST를 잡아 필드 단위로 대조했고, 금지 키 부재는 문자열 전수 검사다.
- 재시도 경로는 실패 → 배지 → 새로고침 지속 → 복구 → 순서 보존까지 한 시나리오로 이어서 검증했다.
- 남은 회귀 위험: 실제 허브(`all_market` Step 2)의 검증 규칙(64KB·200자·DLP)과의 정합은 all_market 계획서 Step 2 e2e와
  이 저장소 `tests/submission.test.ts`의 절단 규칙이 같은 숫자를 쓰는지로만 보장된다. 실기 왕복은 all_market Step 4·5 뒤
  Tier 3에서 확인한다.

## WHAT WAS OMITTED

- 실제 허브 서버와의 왕복(다른 저장소, 진행 중). 여기서는 Playwright route로 대체했다.
- 브랜드 자산은 계속 `reused`(Step 4가 별도 브랜치에서 진행 중).
- 시크릿 없음.
