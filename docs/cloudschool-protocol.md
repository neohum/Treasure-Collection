# Cloud-School 과제 수집 프로토콜 — collect / restore

교사의 런처-테스트 "과제 수집" 화면은 학생이 쓰는 **같은 `index.html`** 을 iframe으로 열고,
학생 목록에서 한 명을 고르면 그 학생이 저장해 둔 내용(해금 카드·소감·사진)을 원래 도감 화면에
**읽기 전용으로 그대로 재생**한다. Cloud-School의 제출 SDK는 캔버스·폼·URL만 잡기 때문에
앱이 아래 프로토콜을 명시적으로 노출한다. 코드: `src/core/bridge.ts`(순수 로직),
`src/main.ts`(window·postMessage 배선), `src/ui/app.ts`(재생 렌더).

## 1. 데이터 형식

`items`·`attachments`는 전송 API 계약(`Submission`, `src/core/types.ts`)과 같은 타입이다.

```ts
interface CloudSchoolCollected {
  schema: 1;
  appId: string;                       // config.toolId — "treasure-codex"
  studentLabel: string;                // 학생이 적은 번호/이름 (≤ 20자)
  submittedAt: string;                 // 오프셋 포함 ISO 8601, 예: 2026-09-18T14:05:00+09:00
  summary: { unlocked: number; total: number };
  items: SubmissionItem[];             // { id, mode: "keyword"|"photo", unlockedAt, note(≤ 200자) } — id 오름차순, ≤ 200개
  attachments: SubmissionAttachment[]; // 사진: { id: "photo-<treasureId>", name, mimeType: "image/jpeg", dataUrl, size? }
  document?: { title: string; printedAt: string }; // 교사 목록용 메타데이터 (title = config.title)
}
```

- 사진은 `extractAttachmentsFromRecords`(`src/core/submission.ts`)가 최대 1200px·JPEG 0.75로 압축한
  **JPEG data URL**이다. `id`는 반드시 `photo-<treasureId>` — restore가 사진을 카드에 되돌려 붙이는 열쇠다.
- `Submission`(`toolId` 필드)도 그대로 `restore`에 넣을 수 있다. 허브가 저장해 둔 전송 본문을 재생할 때 쓴다.

## 2. window 전역 API — `window.CloudSchoolApp`

부팅(`CodexApp.mount`) 직후 `src/main.ts`가 만든다. 같은 문서 안(예: 뷰어가 앱 JS를 인라인해 올린 경우)에서 바로 부른다.

```ts
interface CloudSchoolApp {
  version: 1;
  appId: string;                       // "treasure-codex"
  title: string;                       // "역사 보물도감"
  collect(): Promise<CloudSchoolCollected>;   // 학생의 현재 저장 상태(사진 포함)
  restore(payload: CloudSchoolCollected | Submission, opts?: { studentName?: string }): Promise<void>; // 읽기 전용 재생
  clearRestore(): Promise<void>;       // 이 기기의 실제 저장 상태로 복귀
}
```

- `collect()`는 [전송] 모달(`src/ui/submit.ts`)도 쓰는 **단일 출처**다. 재생 중에 부르면 그려 놓은 payload를
  그대로 돌려준다(다시 수집해도 같은 결과).
- `restore()`는 검증에 실패하면 한국어 사유로 reject한다(`console.warn`도 남긴다).

## 3. postMessage — iframe 부모 ↔ 앱

앱은 `window.parent`로, 부모는 `iframe.contentWindow`로 보낸다. targetOrigin은 현재 `"*"`(교사 화면의 배포
origin이 고정되지 않았다). 앱은 `event.origin`을 읽어 경고 로그에만 쓰고, `data.type`이 아래 표에 없는 메시지는
**아무 일도 하지 않는다**.

| 방향 | `type` | 본문 | 비고 |
| --- | --- | --- | --- |
| app → parent | `cloudschool_app_ready` | `{ appId, title, version: 1 }` | 부팅 직후, iframe 안(`window.parent !== window`)일 때만 |
| parent → app | `cloudschool_restore` | `{ payload: CloudSchoolCollected, studentName?: string }` | 검증 후 재생. 실패하면 응답 없이 `console.warn` |
| app → parent | `cloudschool_restored` | `{ appId, studentLabel, unlocked, total }` | 재생 완료 응답 |
| parent → app | `cloudschool_collect` | `{ requestId }` | 재생 중이면 그려 놓은 payload |
| app → parent | `cloudschool_collected` | `{ requestId, payload: CloudSchoolCollected }` | `requestId`는 문자열로 돌려준다 |
| parent → app | `cloudschool_clear_restore` | `{}` | 실제 저장 상태로 복귀 |
| app → parent | `cloudschool_restore_cleared` | `{}` | 복귀 완료 응답 |

기존 `edulinker_submission`(`src/ui/submit.ts`, [전송] 시 부모로 보내는 메시지)은 호환을 위해 그대로 두었다.
그 `data`는 여전히 `Submission`이며 `collect()` 결과에서 `collectedToSubmission`으로 만든다.

## 4. 재생(restore) 화면 동작

- **IndexedDB에 쓰지 않는다.** payload는 메모리에서만 `UnlockRecord[]`로 바뀌고(사진 data URL → Blob →
  objectURL, live 모드와 같은 경로) 화면을 다시 그린다. `clearRestore`는 저장소를 다시 읽어 원래 상태로 돌아간다.
- 헤더 바로 아래 고정 배너(`#restoreBanner`): `fi fi-rr-eye` + "12번 학생의 제출물 보기 (읽기 전용) · 제출 2026. 9. 18. 오후 2:05".
  `studentName`이 오면 그 이름을, 없으면 `studentLabel`(숫자면 "n번")을 쓴다. [내 도감으로 돌아가기] 버튼은
  단독으로 열렸을 때만 보이고, iframe 안에서는 교사 UI가 학생 전환을 맡으므로 숨긴다.
- `#app[data-readonly="true"]`. 해금·사진·초기화·가져오기·전송/내보내기 버튼은 그리지 않고, 학생 라벨 입력은
  `readonly`. 코드 경로도 한 번 더 막는다(`unlock`·`saveLabel`·`reset` 등은 재생 중 즉시 return).
- 상세 모달은 열린다(소감 전문·사진 확인, [사진 변경] 없음). [도감 출력]은 남아 학생 도감을 그대로 인쇄한다.
- `index.html#restore`로 열렸는데 3초 안에 아무 제출물도 오지 않으면 헤더 아래에 "선생님 화면에서 학생을 선택하세요"
  안내(`#restoreHint`)를 띄운다. 비차단이며 재생이 시작되면 사라진다.

## 5. 보안

- **eval 없음, innerHTML 없음.** 메시지는 구조화된 객체로만 다루고 학생 소감은 `textContent`로만 붙는다.
- **payload 검증**(`validateCollected`): `schema === 1`, `appId`(또는 `toolId`)가 이 도구와 같아야 한다.
  문자열은 `LIMITS`(라벨 20자·소감 200자·항목 200개)로 자른다. 모르는 유물 id·잘못된 모드·깨진 시각·중복 항목은
  **그 항목만 버린다**. 첨부는 `data:image/jpeg` 또는 `data:image/png` base64만, 디코딩 후 **2 MB 이하**만,
  `photo-<id>`가 items에 있는 id를 가리킬 때만 받는다. 실패 사유는 한국어로 `console.warn`.
- **재생 중 IndexedDB 쓰기 없음.** 교사 PC에서 학생 A를 보다가 B를 봐도 교사 기기의 저장소는 비어 있다(e2e AC-2가
  clear 뒤 `collect()` 0건·새로고침 후 0건으로 확인).
- 사진은 image data URL만 통과한다. `blob:`·`http(s):`·`svg+xml`·`text/html`은 첨부에서 걸러진다.

## 6. 교사 쪽에서 쓰는 방법 (기대 흐름)

1. `<iframe src=".../index.html">`를 열고 `message` 리스너에서 `cloudschool_app_ready`를 기다린다.
2. 학생 목록에서 한 명을 고르면 저장해 둔 `CloudSchoolCollected`를 `cloudschool_restore`로 보내고
   `cloudschool_restored`로 표시 상태(해금 수)를 갱신한다. 다른 학생을 고르면 다시 `cloudschool_restore`만 보내면 된다
   (앞 학생의 재생은 덮어써진다).
3. 학생 기기에서 수집할 때는 같은 문서 안이면 `window.CloudSchoolApp.collect()`, iframe이면
   `cloudschool_collect` → `cloudschool_collected`.
4. 인쇄는 iframe 안의 [도감 출력] 또는 `iframe.contentWindow.print()`.
5. 재생을 끝내려면 `cloudschool_clear_restore`.

검증: `tests/bridge.test.ts`(검증·라우팅·멱등), `tests/e2e/restore.spec.ts`(수집 형태, iframe 재생·해제, `#restore` 안내).
