import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { integrityHash, readBundleDir, sortPaths, disallowedFiles } from "../scripts/integrity-hash";

const enc = (s: string) => new TextEncoder().encode(s);
const FIXTURE = new URL("./fixtures/mini-bundle/", import.meta.url);

/**
 * 2026-09-04 all_market `internal/bundler.computeIntegrityHash`(Go)로 같은 픽스처를 돌려 얻은 값.
 * all_market 계획서 Step 4의 Go 테스트가 같은 파일(expected-hash.txt)을 대조한다.
 */
const GO_HASH = "sha256:cd16c10dfc01178770efd5276f9b20f6448975085cc1a1fdc0821a95cf257505";

describe("integrityHash — bundler.go 프레이밍 호환 (AC-2)", () => {
  it("mini-bundle 픽스처가 Go와 같은 해시를 낸다 (manifest.json·expected-hash.txt 제외)", () => {
    const files = readBundleDir(FIXTURE.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    files.delete("expected-hash.txt");
    expect([...files.keys()].sort()).toEqual(["assets/app.js", "index.html"]);
    const hash = integrityHash(files);
    expect(hash).toBe(GO_HASH);
    expect(hash).toBe(readFileSync(new URL("expected-hash.txt", FIXTURE), "utf8").trim());
    // manifest.json의 integrityHash 필드와도 일치
    const manifest = JSON.parse(readFileSync(new URL("manifest.json", FIXTURE), "utf8")) as { integrityHash: string };
    expect(manifest.integrityHash).toBe(hash);
  });

  it("빈 번들의 해시는 빈 입력의 SHA-256이다", () => {
    expect(integrityHash(new Map())).toBe("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("삽입 순서와 무관하고, 경로가 다르면 다른 해시다", () => {
    const a = new Map([["b.js", enc("1")], ["a.js", enc("2")]]);
    const b = new Map([["a.js", enc("2")], ["b.js", enc("1")]]);
    expect(integrityHash(a)).toBe(integrityHash(b));
    const c = new Map([["a.js", enc("2")], ["c.js", enc("1")]]);
    expect(integrityHash(c)).not.toBe(integrityHash(a));
  });

  it("길이 프레이밍 덕에 경계가 다른 분할은 다른 해시다", () => {
    const one = new Map([["a", enc("xy")]]);
    const two = new Map([["a", enc("x")], ["ay", enc("")]]);
    expect(integrityHash(one)).not.toBe(integrityHash(two));
  });

  it("경로는 ASCII·슬래시만 허용하고 바이트 순으로 정렬한다", () => {
    expect(sortPaths(["b/x.js", "B/x.js", "a.js", "_z"])).toEqual(["B/x.js", "_z", "a.js", "b/x.js"]);
    expect(() => sortPaths(["한글.js"])).toThrow(/ASCII/);
    expect(() => sortPaths(["a\\b.js"])).toThrow(/ASCII/);
  });

  it("허용 확장자 밖 파일을 찾아낸다", () => {
    const files = new Map([["index.html", enc("")], ["a.map", enc("")], ["pwa.webmanifest", enc("")], ["font.woff2", enc("")], ["README", enc("")]]);
    expect(disallowedFiles(files)).toEqual(["a.map", "pwa.webmanifest", "README"]);
  });
});
