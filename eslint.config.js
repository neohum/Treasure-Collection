import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // scripts/ 아래는 하네스가 관리하는 파일이 대부분이다. 이 저장소가 소유한 빌드 CLI만 린트한다.
    ignores: [
      "dist/**",
      "legacy/**",
      "node_modules/**",
      ".claude/**",
      ".agents/**",
      ".codex/**",
      ".dagger/**",
      ".github/**",
      "scripts/**",
      "!scripts/build-config.ts",
      "!scripts/pack-bundle.ts",
      "!scripts/integrity-hash.ts",
      "!scripts/make-icons.ts",
      "playwright-report/**",
      "test-results/**",
      "evidence/**",
      // 번들 해시 교차 검증용 고정 픽스처 — 내용이 바뀌면 해시가 바뀐다
      "tests/fixtures/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // innerHTML에 학생 입력을 넣는 실수를 린트에서 막는다 (계획서 Step 3 AC-4).
      "no-restricted-properties": [
        "error",
        { object: "*", property: "innerHTML", message: "textContent 또는 DOM API를 쓴다. 학생 입력이 HTML로 해석되면 안 된다." },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
