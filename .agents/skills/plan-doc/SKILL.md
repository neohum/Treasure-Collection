---
name: plan-doc
description: Write and execute a plan document (plans/<slug>.plan.md) instead of building straight from a card. Use for any change bigger than a one-line fix — features, migrations, multi-file refactors — and whenever a build was refused by the plan gate. The document compiles into ordered backlog cards, independent steps run as parallel waves, and every card ships with evidence on disk.
---

# Plan document first (계획서 우선)

Building from a one-line card means the design is invented at the same moment the
code is written, so the first reviewable artifact is the diff — after the money is
spent. A plan document moves that decision to a page a human reads in a minute.

```
plans/<slug>.plan.md  ──compile──▶  ordered cards  ──waves──▶  builds  ──▶  evidence/<date>-<card>/
```

## Steps

1. **Explore first.** Read the files you are about to name. Never plan from memory.
2. `node scripts/loop/plan-doc.ts init <slug> "title"` — writes the skeleton.
3. Fill in `## Intent`, `## Non-goals`, and one `### Step N: <card-slug>` per
   independently verifiable unit. Every step needs `Goal`, `Files`, `Acceptance`
   (`AC-1: …`) and `Tests` (a real command).
4. `node scripts/loop/plan-doc.ts check <slug>` — an invalid plan compiles nothing.
5. Set `status: approved` in the frontmatter (`owner:` is required at `risk: high`).
6. `node scripts/loop/plan-doc.ts compile` — every step becomes a backlog card,
   dependency-chained in the order written.
7. Build each card, then fill `evidence/<YYYYMMDD>-<card>/README.md` and record the
   real captured output: `node scripts/loop/evidence.ts record <card> <name> < out.txt`.

## Non-negotiables

- **`Files:` is the blast radius** and becomes the card's path allowlist. Editing
  outside it fails closed.
- **No approved plan → no medium/high-risk build.** That is the plan gate
  (`scripts/loop/plan-gate.ts`). Write the plan; do not disable the gate.
  `HARNESS_PLAN_GATE=off` is interactive-only and an unattended run refuses it.
- **No evidence → no ship.** Four sections, all filled, plus at least one captured
  artifact: WHAT WAS TESTED / WHAT WAS OBSERVED / WHY IT IS ENOUGH / WHAT WAS OMITTED.
- **Sequential by default.** A step waits for the one before it unless it declares
  `Parallel: yes` — use that only when it truly does not read the previous step's
  output.
- **When reality disagrees with the plan, edit the plan** and re-run `check`. A
  stale plan is worse than none: the next agent believes it.

`node scripts/loop/deps.ts` shows which cards are ready and which are waiting.
`node scripts/loop/plan-doc.ts waves <slug>` shows what can run at the same time.
