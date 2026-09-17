/// <reference types="vite/client" />

/** vite.config.ts codexConfigPlugin이 빌드 시 만들어 넣는 내장 설정 (config.json fetch 실패 시 폴백) */
declare module "virtual:codex-config" {
  import type { CodexConfig } from "./core/types";
  const config: CodexConfig;
  export default config;
}
