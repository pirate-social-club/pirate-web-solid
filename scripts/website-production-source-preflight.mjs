import { execFileSync } from "node:child_process";

const origin = "https://github.com/pirate-social-club/pirate-web-solid.git";
const releaseRemote = origin;
const commitPattern = /^[0-9a-f]{40}$/u;

function refuse(reason) {
  throw new Error("website_production_refused:" + reason);
}

// Website releases use the same GitHub authority as protected source integration.
// Exact branch publication alone cannot promote a commit not accepted on main.
export function assertPublishedWebsiteSource(root, git = (args) =>
  execFileSync("git", args, {
    cwd: root, encoding: "utf8", timeout: 30_000,
    maxBuffer: 65_536, stdio: ["ignore", "pipe", "pipe"],
  }).trim()) {
  const branch = git(["branch", "--show-current"]);
  const release = /^release\/production-[a-z0-9][a-z0-9-]*$/u.test(branch);
  if (branch !== "main" && !release) refuse("source_is_not_main_or_production_release");
  if (git(["status", "--porcelain=v1"])) refuse("source_is_dirty");
  if (git(["remote", "get-url", "origin"]) !== origin) refuse("unexpected_origin");
  const sha = git(["rev-parse", "HEAD"]);
  if (!commitPattern.test(sha)) refuse("invalid_source_commit");
  if (!release) {
    const remote = git(["ls-remote", "origin", "refs/heads/main"]).split("\t")[0];
    if (remote !== sha) refuse("source_is_not_published_main");
  } else {
  const ref = "refs/heads/" + branch;
  const published = git(["ls-remote", releaseRemote, ref]);
  if (published !== sha + "\t" + ref) refuse("source_is_not_published_release");
  // FETCH_HEAD belongs to this checkout; do not advance the shared main ref.
  git(["fetch", "--no-tags", "origin", "refs/heads/main"]);
  const accepted = git(["rev-parse", "FETCH_HEAD"]);
  if (!commitPattern.test(accepted)
    || git(["merge-base", sha, accepted]) !== sha) refuse("release_source_not_accepted_on_main");
  }
  if (git(["rev-parse", "HEAD"]) !== sha || git(["status", "--porcelain=v1"])) {
    refuse("source_changed_during_preflight");
  }
  return sha;
}
