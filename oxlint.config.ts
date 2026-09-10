import { defineConfig } from "oxlint";

const sourceFiles = ["src/**/*", "workers/**/*"];
const hydrationGuardFiles = [
  "src/Document.tsx",
  "src/components/public-video-feed.tsx",
  "src/lib/api/request-origin.ts",
  "src/lib/host-context.tsx",
];

export default defineConfig({
  ignorePatterns: ["tools/oxlint/anti-slop/**", "tools/oxlint/design-tokens/**"],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    { name: "design-tokens", specifier: "./tools/oxlint/design-tokens/index.ts" },
  ],
  overrides: [
    {
      files: sourceFiles,
      rules: {
        "anti-slop/no-chained-type-assertions": "error",
        "design-tokens/no-bare-destructive-text": "error",
        "anti-slop/no-widen-then-assert": "error",
        "anti-slop/no-known-value-widening": "error",
        "anti-slop/no-unsafe-dictionary-type": "error",
        "anti-slop/no-module-mocking": "error",
        "anti-slop/no-unknown-type-aliases": "error",
        "anti-slop/require-safety-comment-for-type-assertion": "error",
        "anti-slop/no-unknown-returns": "error",
        "anti-slop/no-reflect-apply": "error",
        "anti-slop/no-reflect-get": "error",
        "anti-slop/no-runtime-typeof": ["warn", { allowInTypeGuards: true }],
        "anti-slop/no-unknown-parameters": "warn",
        "anti-slop/no-shape-in-symbol-names": "warn",
        "anti-slop/no-object-parameters": "off",
        "anti-slop/no-conditional-empty-object-spread": "warn",
        // The existing seam uses a short-circuit assignment; it is outside this policy's scope.
        "no-unused-expressions": "off",
      },
    },
    {
      // The guards assert the bare utility is not rendered; they stay as written.
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        "design-tokens/no-bare-destructive-text": "off",
      },
    },
    {
      files: ["src/lib/api/**/*", ...hydrationGuardFiles],
      rules: {
        "anti-slop/no-runtime-typeof": "off",
        "anti-slop/no-unknown-parameters": "off",
        "anti-slop/no-shape-in-symbol-names": "off",
      },
    },
    {
      // The runtime is a reviewed framework-neutral port from the legacy package;
      // preserve its validated parser/reducer implementation and test fixtures
      // byte-for-byte while it is owned by the Solid app.
      files: [
        "src/features/karaoke/runtime/**/*",
        "src/features/karaoke/capture/**/*",
        "src/features/karaoke/scoring/karaoke-scoring-controller*",
        "src/features/karaoke/karaoke-session-bridge*",
      ],
      rules: {
        "anti-slop/no-chained-type-assertions": "off",
        "anti-slop/no-widen-then-assert": "off",
        "anti-slop/no-known-value-widening": "off",
        "anti-slop/no-unsafe-dictionary-type": "off",
        "anti-slop/no-module-mocking": "off",
        "anti-slop/no-unknown-type-aliases": "off",
        "anti-slop/require-safety-comment-for-type-assertion": "off",
        "anti-slop/no-unknown-returns": "off",
        "anti-slop/no-reflect-apply": "off",
        "anti-slop/no-reflect-get": "off",
        "anti-slop/no-runtime-typeof": "off",
        "anti-slop/no-unknown-parameters": "off",
        "anti-slop/no-shape-in-symbol-names": "off",
        "anti-slop/no-conditional-empty-object-spread": "off",
      },
    },
  ],
});
