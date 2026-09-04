@AGENTS.md

# Treasure-Collection — Claude Code adapter (Harness v0.4.20)

> Loaded by Claude Code at the start of every session. The shared contract is
> imported from `AGENTS.md`; Claude-native agents, commands, permissions, and MCP
> configuration live under `.claude/` and `.mcp.json`.
> Generated 2026-09-04 by `create-agent-harness` (v0.4.20).

## Active behavior mode

**Autonomous.** Carry out requested engineering work proactively, including
appropriate edits and verification, under the shared contract.

## Startup Update Check (세션 시작 시 필수 실행)

Claude Code 세션이 시작되면 가장 먼저 다음 명령어를 실행하여 에이전트 CLI들의 업데이트 상태를 확인하고 사용자에게 알려주세요.
```bash
node scripts/check-updates.ts
```
이 체크는 더 새 Harness 커밋도 함께 보고하며, `HARNESS_AUTO_UPDATE=1`은 비파괴 `--update` 적용을, `HARNESS_UPDATE_PULL=1`은 깨끗한 Harness 소스의 ff-only pull을 선택적으로 활성화합니다.

## Roles and routing

세 역할(**architect** 설계·판단 / **researcher** 실행·오케스트레이션 / **typist**
기계적 편집)이 이 머신에 설치된 CLI 순서대로 해석된다.
`node scripts/route.ts "<task>"`가 라우터의 선택을 보여주고
`--agent=architect|researcher|typist`로 덮어쓴다. 특정 CLI 고정은 `ROUTE_<ROLE>_CLI`.

**토큰 예산 계약(요약).** Claude/Opus는 리드 아키텍처와 최종 독립 리뷰에 쓴다. 그 외
구현은 Codex(`node scripts/agent-session.ts --agent codex "<bounded task>"`), 넓은
읽기 전용 탐색은 AGY/Gemini로 보내고 Claude는 그 diff와 증거를 리뷰한다. 독립적인
Read·검색·셸 확인은 한 턴에 묶는다. **절감은 라우팅·배칭·중복 제거에서 나오고, 필요한
게이트를 건너뛰어서 나오지 않는다.** 역할 표, 계약 전문, 협업 병목:
[`docs/harness-roles.md`](docs/harness-roles.md).

## Senior-engineer defaults (apply to all agents)

- **Read before you write.** Open the file, scan callers, then edit. Prefer `Edit` over `Write`.
- **No speculative scope.** Bug fix ≠ refactor. Don't add layers or "future-proofing" unrequested.
- **No dead validation & No silent failures.** Validate at boundaries only; never fake a fix.
- **Dependencies.** Standard problems take a maintained library; hand-roll only for domain rules.
- **Comments & Errors.** Comments for *why*; errors point at root causes (no `--no-verify`).
- **Dynamic Context Pruning.** Avoid prompt stuffing; load task-focused sub-skills on-demand.
- **Respect Institutional Memory (ADR).** Consult `docs/adr/` before refactoring core logic.
- **Anti-False Consensus (Independent Review).** Never review own work; pass to another provider.
- **Multi-Layer Deep Verification.** Tier 1 static → Tier 2 tests → Tier 3 real runtime evidence.
- **Confirm before destructive ops.** Pause before `rm -rf`, `git reset --hard`, force push, drops.
- **UI Icons Standard.** `fi fi-rr-*` (Flaticon Regular Rounded) 스타일 통일.
- **GitHub PR & Main Squash Merge.** 작업 브랜치 푸시 ➔ `gh pr create` ➔ 독립 검증 ➔ `gh pr merge --squash --delete-branch`.
- **지식베이스 자동 기록**: 세션 완료 전 작업 요약을 `node scripts/loop/knowledge.ts add`로 기록.
- **플랫폼별 빌드(특히 Wails)**: [`docs/harness-conventions.md`](docs/harness-conventions.md).

## Project facts

- **Stack:** TypeScript 5.9(프레임워크 없음, DOM API 직접) + Vite 8 + Tailwind v4(`@tailwindcss/vite`) + Flaticon UIcons. 서버 없음, 정적 PWA 번들.
- **Package manager:** pnpm 10 (`packageManager` 필드 고정)
- **Entry points:** `index.html` → `src/main.ts`; 도메인은 `src/core/`, 화면은 `src/ui/`, 빌드 CLI는 `scripts/*.ts`
- **Test runner:** `pnpm test` (vitest, node 환경, `tests/*.test.ts`) / `pnpm e2e` (Playwright, `tests/e2e/`, production preview 상대)
- **Lint / typecheck:** `pnpm lint` (eslint flat config, `innerHTML` 금지 규칙 포함) / `pnpm typecheck` (tsc --noEmit)
- **Dev server:** `pnpm dev` → http://localhost:5173 ; production 미리보기 `pnpm build && pnpm preview` → http://127.0.0.1:4179
- **Bundle:** `pnpm pack:bundle` → `dist/` + `dist/manifest.json` (all_market 허브 반입용, 허용 확장자 12종만)
- **Deploy:** GitHub Pages(main 머지 시, Google Classroom 링크용) + all_market 런처 반입(교실 LAN)

## Domain glossary

| Term | Meaning |
| --- | --- |
| 보물도감 / codex | 유물 20종을 시대별로 모으는 학생 화면. 도구 ID `treasure-codex` |
| 해금(unlock) | 잠긴 유물 카드를 열기. `keyword`(핵심어 입력, 해시 대조) 또는 `photo`(교사가 배부한 사진 업로드) |
| 핵심어(keyword) | 수업 중 배운 정답 단어. 평문은 `content/keywords.json`(gitignore), 번들에는 정규화 후 SHA-256만 |
| 전송(submit) | 허브 경로(`/dist/{toolID}/`)에서 진도 요약을 `POST /api/tools/{toolID}/submissions`로 보내는 것. 사진은 절대 포함하지 않는다 |
| 허브(hub) | all_market 구름학교 런처 안의 교실 LAN 웹서버. 교사 PC 사설 IP에만 바인딩 |
| 번들(bundle) | `dist/` 전체 + `manifest.json`(`ToolDistributionManifest`). 허브가 그대로 반입·서빙 |
| 학생 라벨(studentLabel) | 학생이 스스로 적는 번호 또는 이름(1~20자). 번호 권장. PC 밖으로 나가지 않는다 |

## See also

- [`docs/harness-roles.md`](docs/harness-roles.md) — roles, routing, token budget, Orca
- [`docs/harness-loop.md`](docs/harness-loop.md) — coordination protocol, continuity
- [`docs/harness-gates.md`](docs/harness-gates.md) — the hard rules in full
- [`docs/PLAN_DOCS.md`](docs/PLAN_DOCS.md) — 계획서 형식과 게이트
- [`docs/behavior-specs.md`](docs/behavior-specs.md) — 반복되는 처신을 적은 행동 스펙
- [`lat.md`](./lat.md) — code-graph / file-level map of the repo
- [`DESIGN.md`](./DESIGN.md) — UI/UX system & component contract
- [`docs/HARNESS.md`](./docs/HARNESS.md) — how the multi-agent harness works
