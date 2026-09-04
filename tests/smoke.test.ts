import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
  type?: string;
};

describe("scaffold", () => {
  it("헬스 게이트가 찾는 스크립트가 모두 있다", () => {
    for (const name of ["build", "typecheck", "lint", "test", "e2e", "pack:bundle"]) {
      expect(pkg.scripts[name], `scripts.${name}`).toBeTruthy();
    }
  });

  it("ESM 패키지다 (하네스 스크립트 경고 제거)", () => {
    expect(pkg.type).toBe("module");
  });
});
