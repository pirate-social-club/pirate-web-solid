import { fileURLToPath } from "node:url";

export const TOOLING_REPO = fileURLToPath(new URL("../../", import.meta.url));
export const APP_REPO = "/media/t42/codedrive/Code/pirate-workspace/.worktrees/pirate-web-solid/solid-website-only-production-release-20261031";
export const API_REPO = "/media/t42/codedrive/Code/pirate-workspace/.worktrees/api-next/api-website-production-release-tools-20261031";
export const APP_SOURCE = "d836786fde57a2a5c8446b7d8cd864cc2550e336";
export const APP_TREE = "b833f7055d6f53aba462d340c1e4f7d6f37deb7e";
export const API_APP_SOURCE = "6862fa976a2fc387ee0e0274ba9f1b2abc447427";
export const ARTIFACT = "243d3e612d75f26d7c5bef7722f76031309726df40057803e9baf7bb4be40af2";
export const PREPARED_RECEIPT = "75e457081424dc9c4d81c5217d6009b1f3fd16dfd519bbcf9307166c72da1aeb";
export const EVIDENCE_ROOT = "/media/t42/codedrive/Code/pirate-workspace/.archive/v1-shared-launch-execution-20261023/checkpoints-20261030/final-production-qualification-a6-333/website-production-operation-20261031/";
export const FACTS_PATH = EVIDENCE_ROOT + "live-facts.json";
export const WORKER = "pirate-web-solid-production";
export const ACCOUNT = "08a4c22cf52e2ecae883e36f80a33f4a";
export const CONFIG_PATH = "dist/ssr/wrangler.json";
export const NODE = "/home/t42/.nvm/versions/node/v24.14.0/bin/node";
export const WRANGLER_BIN = APP_REPO + "/node_modules/wrangler/bin/wrangler.js";
export const EXECUTOR = new URL("../production-website-cutover.mjs", import.meta.url);
