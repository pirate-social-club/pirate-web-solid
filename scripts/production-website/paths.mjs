import { fileURLToPath } from "node:url";

export const TOOLING_REPO = fileURLToPath(new URL("../../", import.meta.url));
export const APP_REPO = "/media/t42/codedrive/Code/pirate-workspace/.worktrees/pirate-web-solid/solid-website-only-production-release-20261031";
export const API_REPO = "/media/t42/codedrive/Code/pirate-workspace/.worktrees/api-next/api-website-production-release-tools-20261031";
export const APP_SOURCE = "2df88cf0200fb30535d4d3b5b1034b390e024c51";
export const APP_TREE = "17be34e2a66a0dfa01ff039050049c080f0949a4";
export const API_APP_SOURCE = "a6bb14b7669ec5900d20b20d1fb077a5bead38bc";
export const ARTIFACT = "e47e823ce38afbe7bb47824599f40419dfd7be6e70b62155da27eb37534a68e8";
export const PREPARED_RECEIPT = "abb8b7b7db04d30f15ddf82c9cfe048137797bf2719c83957e234ead960a53f1";
export const EVIDENCE_ROOT = "/media/t42/codedrive/Code/pirate-workspace/.archive/v1-shared-launch-execution-20261023/checkpoints-20261030/final-production-qualification-a6-333/website-production-operation-20261031/";
export const FACTS_PATH = EVIDENCE_ROOT + "live-facts.json";
export const WORKER = "pirate-web-solid-production";
export const ACCOUNT = "08a4c22cf52e2ecae883e36f80a33f4a";
export const CONFIG_PATH = "dist/ssr/wrangler.json";
export const NODE = "/home/t42/.nvm/versions/node/v24.14.0/bin/node";
export const WRANGLER_BIN = APP_REPO + "/node_modules/wrangler/bin/wrangler.js";
export const EXECUTOR = new URL("../production-website-cutover.mjs", import.meta.url);
