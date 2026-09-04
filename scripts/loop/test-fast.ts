#!/usr/bin/env node
/**
 * test-fast.ts — Incremental & Targeted Fast Test Runner for AI Coding Agents.
 *
 * Speeds up test execution by 10x-50x during iterative agent turns by:
 *   1. Running only tests corresponding to git-modified files instead of the full 49-file suite.
 *   2. Providing instant targeted feedback (<1s vs 40s+).
 *   3. Supporting explicit file/module target pointers.
 *
 * Usage:
 *   node scripts/loop/test-fast.ts [specific-test-or-source-file]
 *   node scripts/loop/test-fast.ts --quick
 *   node scripts/loop/test-fast.ts --all
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve, basename, extname } from "node:path";

const ROOT = resolve(process.cwd());
const TESTS_DIR = resolve(ROOT, "tests");

function getGitChangedFiles(): string[] {
  try {
    const res = spawnSync("git", ["status", "--porcelain"], {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
    });
    if (res.status !== 0) return [];
    return res.stdout
      .split("\n")
      .map((line) => line.trim().slice(3))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function findMatchingTests(files: string[]): string[] {
  if (!existsSync(TESTS_DIR)) return [];
  const allTests = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".test.ts"));
  const matched = new Set<string>();

  for (const file of files) {
    const base = basename(file, extname(file)).replace(/\.tmpl$/, "");

    // Direct test file modified
    if (file.startsWith("tests/") && file.endsWith(".test.ts")) {
      matched.add(file);
      continue;
    }

    // Direct match: <name>.ts -> <name>.test.ts
    const directCandidate = `${base}.test.ts`;
    if (allTests.includes(directCandidate)) {
      matched.add(`tests/${directCandidate}`);
    }

    // Mapping heuristics for common harness domains
    if (file.includes("mode") || file.includes("collaborator")) {
      matched.add("tests/typecheck.test.ts");
    }
    if (file.includes("context") || file.includes("AGENTS") || file.includes("CLAUDE") || file.includes("rules")) {
      matched.add("tests/context-budget.test.ts");
    }
    if (file.includes("quality") || file.includes("gates") || file.includes("evidence")) {
      matched.add("tests/quality-gates.test.ts");
    }
    if (file.includes("version") || file.includes("package")) {
      matched.add("tests/version-sync.test.ts");
    }
  }

  return Array.from(matched);
}

export function runFastTests(targetArg?: string): number {
  let testTargets: string[] = [];

  if (targetArg && targetArg !== "--quick" && targetArg !== "--all") {
    if (existsSync(resolve(ROOT, targetArg))) {
      testTargets = [targetArg];
    } else if (existsSync(resolve(TESTS_DIR, targetArg))) {
      testTargets = [`tests/${targetArg}`];
    } else if (existsSync(resolve(TESTS_DIR, `${targetArg}.test.ts`))) {
      testTargets = [`tests/${targetArg}.test.ts`];
    }
  }

  if (targetArg === "--quick" || (!testTargets.length && !targetArg)) {
    const changed = getGitChangedFiles();
    testTargets = findMatchingTests(changed);
    if (!testTargets.length) {
      // Default fast sanity suite
      testTargets = [
        "tests/typecheck.test.ts",
        "tests/context-budget.test.ts",
        "tests/quality-gates.test.ts",
      ];
    }
  }

  if (targetArg === "--all") {
    testTargets = ["tests/**/*.test.ts"];
  }

  console.log(`\n⚡ [Fast Test Runner] Running targeted tests: ${testTargets.join(", ")}`);
  const startTime = Date.now();

  const res = spawnSync(
    process.execPath,
    ["--test", ...testTargets],
    {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    }
  );

  const durationMs = Date.now() - startTime;
  console.log(`⏱️ 완료 소요 시간: ${(durationMs / 1000).toFixed(2)}s\n`);
  return res.status ?? 0;
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  return process.argv[1].endsWith("test-fast.ts");
})();

if (isMainModule) {
  const arg = process.argv[2];
  process.exit(runFastTests(arg));
}
