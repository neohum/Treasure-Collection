import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packBundle } from "../scripts/pack-bundle";
import { integrityHash, readBundleDir } from "../scripts/integrity-hash";

const schema = JSON.parse(readFileSync(new URL("./fixtures/distribution.schema.json", import.meta.url), "utf8")) as {
  required: string[];
  properties: Record<string, { type?: string; enum?: string[]; pattern?: string }>;
  additionalProperties: boolean;
};

/** 의존성 없이 스키마의 required·enum·pattern·additionalProperties만 검사한다 (그 이상은 스키마가 요구하지 않는다) */
function validateAgainstSchema(obj: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const key of schema.required) if (!(key in obj)) errors.push(`missing ${key}`);
  for (const [key, value] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) { if (!schema.additionalProperties) errors.push(`additional ${key}`); continue; }
    if (prop.type && typeof value !== prop.type) errors.push(`${key}: type`);
    if (prop.enum && !prop.enum.includes(String(value))) errors.push(`${key}: enum`);
    if (prop.pattern && !new RegExp(prop.pattern).test(String(value))) errors.push(`${key}: pattern`);
  }
  return errors;
}

function makeDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "codex-dist-"));
  for (const [p, content] of Object.entries(files)) {
    const full = join(dir, p);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return dir;
}

const meta = { id: "treasure-codex", name: "역사 보물도감", version: "0.1.0", category: "역사 학습" };

describe("pack-bundle (AC-1, AC-3)", () => {
  it("manifest.json이 all_market 스키마를 통과하고 해시가 manifest 제외 파일과 일치한다", () => {
    const dir = makeDist({ "index.html": "<html></html>", "assets/app.js": "1", "pwa.json": "{}" });
    const result = packBundle(dir, meta);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Record<string, unknown>;
    expect(validateAgainstSchema(manifest)).toEqual([]);
    expect(manifest).toMatchObject({ id: "treasure-codex", audience: "student_distributable", distributionMode: "lan_web_bundle", entrypoint: "index.html", offlineCapable: true });
    expect(manifest["integrityHash"]).toMatch(/^sha256:[a-f0-9]{64}$/);
    // 다시 읽어도(manifest.json 제외) 같은 해시
    expect(integrityHash(readBundleDir(dir))).toBe(manifest["integrityHash"]);
    expect(result.fileCount).toBe(3);
  });

  it("허용 확장자 밖 파일이 있으면 실패하고 manifest를 쓰지 않는다", () => {
    const dir = makeDist({ "index.html": "x", "assets/app.js.map": "{}" });
    expect(() => packBundle(dir, meta)).toThrow(/assets\/app\.js\.map/);
    expect(() => readFileSync(join(dir, "manifest.json"))).toThrow();
    const dir2 = makeDist({ "index.html": "x", "pwa.webmanifest": "{}" });
    expect(() => packBundle(dir2, meta)).toThrow(/pwa\.webmanifest/);
  });

  it("마켓 감사에 걸리는 문자열(javascript:, data:, svg+xml)이 html/css에 있으면 실패한다", () => {
    const bad = makeDist({ "index.html": '<link rel="icon" href="a.svg" type="image/svg+xml">', "assets/a.css": ".fi-rr-javascript:before{content:\"x\"}" });
    expect(() => packBundle(bad, meta)).toThrow(/index\.html: "svg\+xml"/);
    expect(() => packBundle(bad, meta)).toThrow(/assets\/a\.css: "javascript:"/);
    // JS 안의 data: 는 정상 코드(내보내기 data URL)라 허용, html/css만 본다
    const ok = makeDist({ "index.html": "<html></html>", "assets/a.js": 'const u = "data:" + t;' });
    expect(() => packBundle(ok, meta)).not.toThrow();
  });

  it("index.html이 없으면 빌드를 먼저 하라고 실패한다", () => {
    const dir = makeDist({ "assets/app.js": "1" });
    expect(() => packBundle(dir, meta)).toThrow(/pnpm build/);
  });
});
