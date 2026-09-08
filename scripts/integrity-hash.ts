/**
 * all_market 번들 무결성 해시. `apps/launcher/internal/bundler/bundler.go`의 computeIntegrityHash와
 * 바이트 단위로 같은 프레이밍이어야 한다:
 *   경로를 바이트 순으로 정렬 → 각 파일에 대해
 *   uint64BE(len(path)) ‖ path ‖ uint64BE(len(content)) ‖ content
 *   를 이어 붙여 SHA-256, 접두 "sha256:".
 * 길이를 앞에 붙이는 이유(구분자만으로는 경계가 애매함)는 Go 쪽 주석과 같다.
 * `manifest.json`은 해시 대상이 아니다(자기 자신의 해시를 담기 때문).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const MANIFEST_FILE = "manifest.json";

/** all_market `contracts.allowedExtensions` (distribution.go) — 여기서 하나라도 어긋나면 허브가 서빙을 거부한다 */
export const ALLOWED_EXTENSIONS = [".html", ".js", ".css", ".json", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".woff", ".woff2", ".wasm"] as const;

export type BundleFiles = Map<string, Uint8Array>;

function u64be(n: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), false);
  return b;
}

/** Go의 sort.Strings는 바이트 순이다. 경로를 ASCII로 제한하면 JS 기본 정렬과 같다. */
export function sortPaths(paths: Iterable<string>): string[] {
  const list = [...paths];
  for (const p of list) if (!/^[\x21-\x7e]+$/.test(p) || p.includes("\\")) throw new Error(`번들 경로는 ASCII·슬래시만 허용: ${p}`);
  return list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function integrityHash(files: BundleFiles): string {
  const hasher = createHash("sha256");
  for (const p of sortPaths(files.keys())) {
    const path = new TextEncoder().encode(p);
    const content = files.get(p)!;
    hasher.update(u64be(path.length));
    hasher.update(path);
    hasher.update(u64be(content.length));
    hasher.update(content);
  }
  return `sha256:${hasher.digest("hex")}`;
}

/** 디렉터리를 읽어 `manifest.json`을 뺀 파일 맵을 만든다 (경로는 '/' 구분, 루트 기준). */
export function readBundleDir(root: string): BundleFiles {
  const files: BundleFiles = new Map();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const rel = relative(root, full).split("\\").join("/");
        if (rel === MANIFEST_FILE) continue;
        files.set(rel, new Uint8Array(readFileSync(full)));
      }
    }
  };
  walk(root);
  return files;
}

export function disallowedFiles(files: BundleFiles): string[] {
  return [...files.keys()].filter((p) => !ALLOWED_EXTENSIONS.some((ext) => p.toLowerCase().endsWith(ext)));
}
