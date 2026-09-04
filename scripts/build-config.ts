/**
 * public/config.json 생성기.
 * 입력: src/data/treasures.ts + content/keywords.json(없으면 src/data/keywords.example.json)
 * 출력: 평문 핵심어 없이 해시만 담은 CodexConfig.
 * 실행: pnpm build:config  (pnpm build 전에 자동으로 돈다 — package.json prebuild)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ERAS } from "../src/data/treasures";
import { buildKeywordHashes } from "../src/core/unlock";
import type { CodexConfig } from "../src/core/types";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };

export const TOOL_ID = "treasure-codex";
export const TOOL_TITLE = "역사 보물도감";

export async function buildConfig(keywordSource?: string): Promise<CodexConfig> {
  const teacherFile = resolve(root, "content/keywords.json");
  const exampleFile = resolve(root, "src/data/keywords.example.json");
  const source = keywordSource ?? (existsSync(teacherFile) ? teacherFile : exampleFile);
  const keywords = JSON.parse(readFileSync(source, "utf8")) as Record<string, string[] | string>;
  const cleaned: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(keywords)) {
    if (k.startsWith("_") || !Array.isArray(v)) continue;
    cleaned[k] = v;
  }
  const knownIds = new Set(ERAS.flatMap((e) => e.treasures.map((t) => t.id)));
  const unknown = Object.keys(cleaned).filter((id) => !knownIds.has(id));
  if (unknown.length > 0) throw new Error(`알 수 없는 유물 id: ${unknown.join(", ")}`);
  const missing = [...knownIds].filter((id) => !cleaned[id] || cleaned[id].length === 0);
  if (missing.length > 0) throw new Error(`핵심어가 없는 유물: ${missing.join(", ")}`);

  const hashSalt = `${TOOL_ID}:${pkg.version}`;
  return {
    schema: 1,
    toolId: TOOL_ID,
    version: pkg.version,
    title: TOOL_TITLE,
    hashSalt,
    eras: ERAS,
    keywordHashes: await buildKeywordHashes(hashSalt, cleaned),
  };
}

async function main() {
  const config = await buildConfig();
  const outDir = resolve(root, "public");
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, "config.json");
  writeFileSync(outFile, JSON.stringify(config, null, 2) + "\n", "utf8");
  const source = existsSync(resolve(root, "content/keywords.json")) ? "content/keywords.json (교사)" : "src/data/keywords.example.json (예시)";
  console.log(`config.json 생성: 유물 ${Object.keys(config.keywordHashes).length}종, 핵심어 출처 ${source}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
