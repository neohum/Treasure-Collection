/**
 * pnpm pack:bundle — dist/를 all_market 교실 허브가 그대로 반입하는 번들로 확정한다.
 *  1. 허용 확장자 밖의 파일이 하나라도 있으면 exit 1
 *  2. manifest.json(ToolDistributionManifest)을 만들고 integrityHash를 계산해 넣는다
 *  3. 검증 요약을 출력한다
 * `pnpm build` 뒤에 실행한다. manifest.json 자체는 해시 대상이 아니다.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALLOWED_EXTENSIONS, MANIFEST_FILE, disallowedFiles, integrityHash, readBundleDir } from "./integrity-hash";

const root = resolve(import.meta.dirname, "..");

/** all_market `ToolDistributionManifest` 중 JSON 스키마(additionalProperties:false)가 허용하는 필드만 */
export interface ToolDistributionManifest {
  id: string;
  name: string;
  version: string;
  category: string;
  audience: "teacher_only" | "student_distributable" | "classroom_shared";
  distributionMode: "standalone" | "lan_web_bundle" | "realtime_socket";
  entrypoint: string;
  integrityHash: string;
  offlineCapable: boolean;
}

export interface PackResult {
  manifest: ToolDistributionManifest;
  fileCount: number;
  totalBytes: number;
  disallowed: string[];
}

/**
 * 마켓 보안 감사 사전검사. 마켓 심사기는 문자열 매칭으로 스킴 주입을 찾는다(2026-09-17 차단 사유:
 * Flaticon 아이콘 클래스 `.fi-rr-javascript:before`와 favicon의 `type="image/svg+xml"`). 실제 위험이
 * 아니어도 출품이 막히므로, 같은 문자열이 번들에 다시 들어오면 여기서 먼저 잡는다.
 */
const TEXT_AUDIT: Array<{ ext: RegExp; needles: string[] }> = [
  { ext: /\.(html|css|js)$/i, needles: ["javascript:", "vbscript:"] },
  { ext: /\.(html|css)$/i, needles: ["data:", "svg+xml"] },
];

export function auditBundleText(files: import("./integrity-hash").BundleFiles): string[] {
  const hits: string[] = [];
  const decoder = new TextDecoder();
  for (const [path, bytes] of files) {
    for (const rule of TEXT_AUDIT) {
      if (!rule.ext.test(path)) continue;
      const text = decoder.decode(bytes);
      for (const needle of rule.needles) if (text.includes(needle)) hits.push(`${path}: "${needle}"`);
    }
  }
  return hits;
}

export function packBundle(distDir: string, meta: { id: string; name: string; version: string; category: string }): PackResult {
  if (!existsSync(resolve(distDir, "index.html"))) throw new Error(`${distDir}에 index.html이 없습니다. 먼저 pnpm build를 실행하세요.`);
  const files = readBundleDir(distDir);
  const disallowed = disallowedFiles(files);
  if (disallowed.length > 0) {
    throw new Error(`허브 허용 확장자(${ALLOWED_EXTENSIONS.join(" ")}) 밖의 파일: ${disallowed.join(", ")}`);
  }
  const auditHits = auditBundleText(files);
  if (auditHits.length > 0) {
    throw new Error(`마켓 보안 감사에 걸리는 문자열: ${auditHits.join("; ")}`);
  }
  const manifest: ToolDistributionManifest = {
    id: meta.id,
    name: meta.name,
    version: meta.version,
    category: meta.category,
    audience: "student_distributable",
    distributionMode: "lan_web_bundle",
    entrypoint: "index.html",
    integrityHash: integrityHash(files),
    offlineCapable: true,
  };
  writeFileSync(resolve(distDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  let totalBytes = 0;
  for (const f of files.values()) totalBytes += f.length;
  return { manifest, fileCount: files.size, totalBytes, disallowed };
}

function main() {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
  const result = packBundle(resolve(root, "dist"), { id: "treasure-codex", name: "역사 보물도감", version: pkg.version, category: "역사 학습" });
  console.log(`번들 확정: 파일 ${result.fileCount}개, ${(result.totalBytes / 1024).toFixed(0)} KB, ${result.manifest.integrityHash}`);
  console.log(`dist/${MANIFEST_FILE} 작성 — 런처 [번들 가져오기]로 dist/ 폴더를 선택하면 됩니다.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
