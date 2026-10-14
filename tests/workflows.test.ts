import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("GitHub Actions Workflows (AC-1, AC-2)", () => {
  const root = join(import.meta.dirname, "..");

  it("ci.yml이 올바르게 구성되어 typecheck, test, build, pack:bundle을 실행한다", () => {
    const ciPath = join(root, ".github", "workflows", "ci.yml");
    expect(existsSync(ciPath)).toBe(true);
    const content = readFileSync(ciPath, "utf8");
    expect(content).toContain("pnpm typecheck");
    expect(content).toContain("pnpm test");
    expect(content).toContain("pnpm build");
    expect(content).toContain("pnpm pack:bundle");
    expect(content).toContain("pull_request");
    expect(content).toContain("push");
  });

  it("pages.yml이 올바르게 구성되어 dist/ 산출물을 Pages로 배포한다", () => {
    const pagesPath = join(root, ".github", "workflows", "pages.yml");
    expect(existsSync(pagesPath)).toBe(true);
    const content = readFileSync(pagesPath, "utf8");
    expect(content).toContain("pnpm build");
    expect(content).toContain("pnpm pack:bundle");
    expect(content).toContain("upload-pages-artifact");
    expect(content).toContain('path: "dist"');
    expect(content).toContain("deploy-pages");
  });
});
