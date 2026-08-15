import { defineConfig } from "oxlint";

const sourceFiles = ["src/**/*", "workers/**/*"];
const hydrationGuardFiles = [
  "src/Document.tsx",
  "src/components/public-video-feed.tsx",
  "src/lib/api/request-origin.ts",
  "src/lib/host-context.tsx",
];

export default defineConfig({
  ignorePatterns: ["tools/oxlint/anti-slop/**"],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  overrides: [
    {
      files: sourceFiles,
      rules: {
        "anti-slop/no-chained-type-assertions": "error",
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
        "no-unused-expressions": "off",
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
  ],
});
