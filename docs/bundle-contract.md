# 번들 계약 — 보물도감이 all_market 교실 허브에 반입되는 형식

이 문서는 `pnpm pack:bundle`이 만드는 `dist/`가 all_market 구름학교 런처(`apps/launcher`)의
교실 LAN 허브에 그대로 반입·서빙되기 위한 계약을 적는다. Go 쪽 권위 소스는
`apps/launcher/internal/contracts/distribution.go`와 `internal/bundler/bundler.go`이며, 여기 적힌
값이 그쪽과 어긋나면 **Go가 맞다**.

## 1. 레이아웃

```
dist/
  index.html          entrypoint (매니페스트 entrypoint 필드)
  manifest.json       ToolDistributionManifest — 해시 대상 아님
  pwa.json            PWA 매니페스트 (.webmanifest는 허용 확장자가 아니다)
  sw.js, precache.json  service worker (Step 4)
  config.json         유물 데이터 + 핵심어 해시(평문 없음)
  assets/*.js|*.css|*.woff2
  icons/*.png, favicon.ico, favicon.svg, logo.svg
```

- 모든 URL은 상대 경로다. 허브는 `/dist/treasure-codex/`, GitHub Pages는 `/Treasure-Collection/` 아래에서
  같은 파일을 서빙한다.
- 슬래시 없는 `/dist/treasure-codex`는 허브가 301로 `/dist/treasure-codex/`에 보낸다(all_market PR #514).

## 2. 허용 확장자 (전수)

`.html .js .css .json .png .jpg .jpeg .svg .ico .woff .woff2 .wasm`

이 밖의 파일(`.map`, `.webmanifest`, `.txt`, `.eot`, `.ttf`, 확장자 없음)이 하나라도 있으면
`pack:bundle`이 exit 1로 실패하고, 있더라도 허브가 404를 돌려준다. 경로는 ASCII와 `/`만 쓴다.

## 3. manifest.json

```json
{
  "id": "treasure-codex",
  "name": "역사 보물도감",
  "version": "0.1.0",
  "category": "역사 학습",
  "audience": "student_distributable",
  "distributionMode": "lan_web_bundle",
  "entrypoint": "index.html",
  "integrityHash": "sha256:…",
  "offlineCapable": true
}
```

- 필드는 `apps/launcher/contracts/distribution.schema.json`(`additionalProperties: false`)이 허용하는 것만 쓴다.
  Go 구조체에는 `description`이 있지만 스키마에는 없어 넣지 않는다(양쪽 모두 통과).
- `artifactType`·`publisherId`·`signature`·`approvalState`는 발행자 레지스트리 경로(마켓 등록)에서만 채워진다.
  런처 [번들 가져오기] 경로(레거시 교실 도구)에서는 비워 둔다 — 비어 있으면 Go `Validate()`가 서명을 요구하지 않는다.
- `id`는 `^[a-z0-9-]+$`. 허브 URL과 전송 API 경로가 이 값을 쓴다.

## 4. 무결성 해시

`manifest.json`을 제외한 모든 파일을 **경로 바이트 순**으로 정렬한 뒤

```
uint64BE(len(path)) ‖ path ‖ uint64BE(len(content)) ‖ content
```

를 이어 붙여 SHA-256, 접두 `sha256:`. 구현: `scripts/integrity-hash.ts`(TS) ↔ `bundler.go computeIntegrityHash`(Go).
두 구현은 `tests/fixtures/mini-bundle/`에 대해 같은 값을 내야 하며, 그 값은
`tests/fixtures/mini-bundle/expected-hash.txt`에 있다(all_market 계획서 Step 4가 Go 쪽 테스트로 대조).
바이너리(PNG·woff2)는 바이트 그대로 센다 — JSON 문자열로 실어 보내는 `prepareBundle` 동작으로는 손실되므로
런처는 디렉터리 반입(`importBundleDir`)을 쓴다.

## 5. 전송 API 계약

`POST {hubOrigin}/api/tools/treasure-codex/submissions` — 본문·응답 코드·상한은
`plans/treasure-codex-launcher.plan.md`의 "전송 API 계약" 절(all_market 계획서와 글자 그대로 동일)을 따른다.
사진·IP·기기 정보는 어떤 경우에도 본문에 들어가지 않는다(`src/core/submission.ts`, `tests/submission.test.ts`).

## 6. 교사 사용 절차

1. (선택) `content/keywords.json`에 우리 반 핵심어를 적는다 — 형식은 `src/data/keywords.example.json`.
2. `pnpm build && pnpm pack:bundle` → `dist/`.
3. 구름학교 런처 → 교실 → [번들 가져오기] → `dist/` 폴더 선택 → 배포 켜기.
4. 학생은 QR 또는 `http://<교사PC IP>:<포트>/dist/treasure-codex/`로 접속한다.
