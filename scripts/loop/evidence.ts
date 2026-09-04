// evidence.ts — "no evidence file means the verification did not happen".
//
// The contract already demands executable acceptance evidence, and the reviewer
// already returns AC ids with observed results. Both live in a model's answer.
// That is exactly the wrong place for them: it cannot be re-read next month, a
// human cannot audit it without replaying a transcript, and the claim "tests
// pass" is indistinguishable from the claim "tests would pass".
//
// So the loop writes verification to disk, in the shape oh-my-openagent uses:
//
//   evidence/<YYYYMMDD>-<card>/README.md   what was tested / observed /
//                                          why it is enough / what was omitted
//   evidence/<YYYYMMDD>-<card>/<artifact>  the captured output itself
//
// verifyEvidence() is a ship gate: a card that must carry evidence and does not
// is not committed. The four headings are not paperwork — each one answers a
// question a reviewer would otherwise have to ask, and "WHAT WAS OMITTED" is the
// one that keeps a redacted log honest.
//
// Usage:
//   node scripts/loop/evidence.ts open <card> ["intent"]
//   node scripts/loop/evidence.ts record <card> <name> [< file]
//   node scripts/loop/evidence.ts verify <card>

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planConfig, riskRank, specRisk, type PlanConfig } from "./plan-doc.ts";

/** The four questions. Order is the order a reviewer reads them in. */
export const EVIDENCE_SECTIONS = [
  "WHAT WAS TESTED",
  "WHAT WAS OBSERVED",
  "WHY IT IS ENOUGH",
  "WHAT WAS OMITTED",
] as const;

const PLACEHOLDER = /^(<.*>|todo|tbd|n\/a|-+)$/i;
const MIN_SECTION_CHARS = 20;

/** Local date, not UTC: this string is read by humans (contract: local time in human-facing output). */
export function localStamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
}

/**
 * Where this card's evidence lives.
 *
 * A card that is retried tomorrow must not start a second folder — the reviewer
 * would then see two half-populated directories and no way to tell which one the
 * shipped diff was verified against. So an existing `*-<card>` dir wins, newest
 * first, and only a card with none gets today's stamp.
 */
export function evidenceDirFor(card: string, cwd = process.cwd(), cfg: PlanConfig = planConfig(cwd), now = new Date()): string {
  const root = resolve(cwd, cfg.evidenceDir);
  if (existsSync(root)) {
    // Anchored, not endsWith: a card named `one` must not adopt the directory of
    // a card named `step-one`, which would silently merge two cards' evidence.
    const mine = new RegExp(`^\\d{8}-${card.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
    const existing = readdirSync(root)
      .filter((name) => mine.test(name) && statSync(join(root, name)).isDirectory())
      .sort();
    const last = existing[existing.length - 1];
    if (last) return join(root, last);
  }
  return join(root, `${localStamp(now)}-${card}`);
}

function readmeTemplate(card: string, intent: string): string {
  return `# Evidence — ${card}

${intent ? `> ${intent}\n\n` : ""}## ${EVIDENCE_SECTIONS[0]}
<the command or manual action, the surface it drove, and the behaviour it was meant to prove>

## ${EVIDENCE_SECTIONS[1]}
<the before/after or new behaviour, plus the artifact file that holds the captured output>

## ${EVIDENCE_SECTIONS[2]}
<how this covers the intended behaviour, and what regression risk is left>

## ${EVIDENCE_SECTIONS[3]}
<what was redacted or summarised instead of pasted — secrets, tokens, env dumps — and what was not run>
`;
}

export function openEvidence(card: string, { intent = "", cwd = process.cwd(), cfg = planConfig(cwd), now = new Date() } = {}) {
  const dir = evidenceDirFor(card, cwd, cfg, now);
  mkdirSync(dir, { recursive: true });
  const readme = join(dir, "README.md");
  const created = !existsSync(readme);
  if (created) writeFileSync(readme, readmeTemplate(card, intent), "utf8");
  return { dir, readme, created };
}

/** Write one captured artifact next to the README. Returns its path. */
export function recordEvidence(card: string, name: string, content: string, { cwd = process.cwd(), cfg = planConfig(cwd) } = {}) {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "artifact.txt";
  const { dir } = openEvidence(card, { cwd, cfg });
  const path = join(dir, safe);
  writeFileSync(path, String(content ?? ""), "utf8");
  return path;
}

export interface EvidenceVerdict {
  ok: boolean;
  dir: string;
  exists: boolean;
  /** Headings absent from README.md. */
  missing: string[];
  /** Headings still holding the skeleton's `<...>` prompt. */
  placeholders: string[];
  /** Captured output files (README.md excluded). */
  artifacts: string[];
  reason: string;
}

/** Split a markdown body into `heading → text` for the headings we require. */
function sections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let current = "";
  const lines: string[] = [];
  const flush = () => { if (current) out.set(current, lines.join("\n").trim()); lines.length = 0; };
  for (const raw of body.split(/\r?\n/)) {
    const h = raw.match(/^#{2,}\s+(.*?)\s*$/);
    if (h) { flush(); current = (h[1] ?? "").trim().toUpperCase(); continue; }
    if (current) lines.push(raw);
  }
  flush();
  return out;
}

export function verifyEvidence(card: string, { cwd = process.cwd(), cfg = planConfig(cwd) } = {}): EvidenceVerdict {
  const dir = evidenceDirFor(card, cwd, cfg);
  const readme = join(dir, "README.md");
  if (!existsSync(readme)) {
    return {
      ok: false, dir, exists: false, missing: [...EVIDENCE_SECTIONS], placeholders: [], artifacts: [],
      reason: `no evidence at ${dir} — open it with: node scripts/loop/evidence.ts open ${card}`,
    };
  }
  const found = sections(readFileSync(readme, "utf8"));
  const missing: string[] = [];
  const placeholders: string[] = [];
  for (const heading of EVIDENCE_SECTIONS) {
    const text = found.get(heading);
    if (text === undefined) { missing.push(heading); continue; }
    const stripped = text.replace(/^\s*[-*]\s*/gm, "").trim();
    if (!stripped || stripped.length < MIN_SECTION_CHARS || PLACEHOLDER.test(stripped)) placeholders.push(heading);
  }
  const artifacts = readdirSync(dir).filter((f) => f !== "README.md" && statSync(join(dir, f)).isFile());
  const problems: string[] = [];
  if (missing.length) problems.push(`missing section(s): ${missing.join(", ")}`);
  if (placeholders.length) problems.push(`unfilled section(s): ${placeholders.join(", ")}`);
  // The README is a claim; the artifact is the proof. Requiring one file is what
  // stops "ran the tests, they passed" from being the whole record.
  if (!artifacts.length) problems.push("no captured artifact — record the actual command output");
  return {
    ok: !problems.length,
    dir, exists: true, missing, placeholders, artifacts,
    reason: problems.length ? `${dir}: ${problems.join("; ")}` : `${dir}: ${artifacts.length} artifact(s), all sections filled`,
  };
}

/**
 * Does this card have to carry evidence to ship?
 *
 * Threshold-based for the same reason the plan gate is: a typo fix that must
 * assemble a four-section dossier teaches everyone to route around the gate. A
 * card that came from a plan document is always in scope — the plan promised
 * verification, so the verification is the deliverable.
 */
export function evidenceRequired({ spec = "", source = "", cfg }: { spec?: string; source?: string; cfg: PlanConfig }): boolean {
  if (source === "plan-doc") return true;
  const threshold = cfg.evidence.requireAtRisk;
  if (String(threshold).toLowerCase() === "off") return false;
  return riskRank(specRisk(spec)) >= riskRank(threshold);
}

/**
 * Read piped evidence through Node's async stream machinery.
 *
 * `readFileSync(0)` can observe EAGAIN when libuv has marked stdin non-blocking
 * and the producer has not written its first chunk yet. A real test command may
 * take seconds before printing anything, so "no bytes right now" is not EOF.
 */
async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let content = "";
  for await (const chunk of process.stdin) content += String(chunk);
  return content;
}

// CLI
const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const [cmd, card, ...rest] = process.argv.slice(2);
  if (!cmd || !card) {
    console.error("usage: evidence.ts open <card> [\"intent\"] | record <card> <name> [< file] | verify <card>");
    process.exit(2);
  }
  if (cmd === "open") {
    const r = openEvidence(card, { intent: rest.join(" ") });
    console.log(`${r.created ? "opened" : "reusing"} ${r.dir}`);
  } else if (cmd === "record") {
    const name = rest[0] || "artifact.txt";
    // Content comes from stdin so a caller can pipe the real output of the real
    // command instead of a model's retelling of it.
    const stdin = process.stdin.isTTY ? "" : await readStdin();
    const path = recordEvidence(card, name, stdin || rest.slice(1).join(" "));
    console.log(`recorded ${path} (${(stdin || "").length} byte(s))`);
  } else if (cmd === "verify") {
    const v = verifyEvidence(card);
    console.log(`${v.ok ? "ok" : "BLOCK"} ${v.reason}`);
    if (!v.ok) process.exitCode = 1;
  } else {
    console.error(`evidence.ts: unknown command ${cmd}`);
    process.exit(2);
  }
}
