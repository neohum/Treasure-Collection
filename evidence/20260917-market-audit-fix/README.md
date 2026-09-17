# Evidence — market-audit-fix (마켓 보안 감사 차단 해제)

- 브랜치: `fix/market-audit` (base: main `03ceb2f`)
- 날짜: 2026-09-17 (Asia/Seoul)
- 계기: 마켓플레이스 출품 시 저작권·보안 감사가 4건으로 제출을 차단함
  (LICENSE 부재, 저작자 미기재, `dist/assets/index-*.css`·`index.html`의 "XSS / Scheme Injection" 탐지)

## WHAT WAS TESTED

- 원인 조사: `grep`으로 감사 대상 파일에서 `javascript:`·`vbscript:`·`data:`·`svg+xml` 문자열 위치를 찾음.
  CSS는 Flaticon 전체 아이콘 CSS의 `.fi-rr-javascript:before`·`.fi-rr-data:before` 클래스 이름,
  HTML은 파비콘 링크의 `type="image/svg+xml"`이 원인(둘 다 실행 가능한 코드가 아닌 오탐).
- 수정 뒤 `pnpm typecheck`·`pnpm lint`·`pnpm test`(13 파일 46건)·`pnpm build`·`pnpm pack:bundle`·`pnpm e2e`(11건).
  로그: [`gate-output.txt`](./gate-output.txt)
- 신규 단위 테스트: `tests/icon-css.test.ts`(사용 아이콘만 남기고 문제 이름이 사라짐, 크기 1/10 이하),
  `tests/pack-bundle.test.ts`(감사 문자열이 html/css에 있으면 pack 실패, js의 data URL은 허용).

## WHAT WAS OBSERVED

- `dist/index.html`·`dist/assets/*.css`에 `javascript:`·`vbscript:`·`svg+xml`·`data:` 문자열 0건.
- 아이콘 CSS가 3,586개 규칙 → 사용 중인 27개 규칙으로 줄어 CSS 번들 185KB → 70KB(Tailwind 포함).
  e2e 아이콘 전수 검사(비표준 0·이모지 0)는 그대로 통과.
- `LICENSE`(MIT, 저작권자 명시, 서드파티 고지) 생성, `package.json`에 `license`·`author`·`repository` 추가.
- 다른 세션이 올린 #7의 타입 오류 2건(`src/core/submission.ts`, `tests/submission.test.ts`)도 함께 고쳤다
  (`noUncheckedIndexedAccess` 위반).

## WHY IT IS ENOUGH

- 마켓 심사기는 문자열 매칭이므로 "문자열이 없다"가 곧 통과 조건이다. 같은 검사를 `pack:bundle`에 넣어
  앞으로 아이콘 추가나 링크 변경으로 재발하면 로컬에서 먼저 실패한다.
- 기능 손실 없음: Chrome은 `.svg` 확장자로 파비콘을 인식하고, 남긴 27개 아이콘이 화면의 전부다.

## WHAT WAS OMITTED

- 마켓 출품 화면의 "제3자 저작물 권리 확인 서약" 체크박스는 코드가 아니라 제출 화면에서 사람이 동의해야 한다.
- 저작권자 표기는 `neohum (정일)`로 넣었다. 실명·소속 학교를 다르게 적어야 하면 `LICENSE`와 `package.json`
  두 곳을 고친다.
- #7이 추가한 사진 첨부 전송(`attachments`, `postMessage("*")`)은 이 카드 범위 밖이라 손대지 않았다.
