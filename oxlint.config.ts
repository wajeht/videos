import regexp from "eslint-plugin-regexp";
import sonarjs from "eslint-plugin-sonarjs";
import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
    "tools/oxlint/anti-slop/**",
  ],
  plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "node", "promise", "vitest", "vue"],
  jsPlugins: [
    {
      name: "anti-slop",
      specifier: "./tools/oxlint/anti-slop/index.ts",
    },
    {
      name: "regexp",
      specifier: "eslint-plugin-regexp",
    },
    {
      name: "sonarjs",
      specifier: "eslint-plugin-sonarjs",
    },
  ],
  rules: {
    ...regexp.configs["flat/recommended"].rules,
    ...sonarjs.configs.recommended.rules,
    complexity: "error",
    "sonarjs/unused-import": "off",
    "vitest/require-mock-type-parameters": "off",
    "vitest/require-to-throw-message": "off",
    "vitest/valid-expect": "off",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "src/test/**", "src/vue/test/**"],
      rules: {
        "sonarjs/no-hardcoded-passwords": "off",
      },
    },
  ],
});
