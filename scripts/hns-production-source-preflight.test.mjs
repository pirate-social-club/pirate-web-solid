import assert from "node:assert/strict";
import test from "node:test";
import { assertPublishedProductionSource } from "./hns-production-source-preflight.mjs";

const sha = "a".repeat(40);
const later = "b".repeat(40);
const origin = "https://github.com/pirate-social-club/pirate-web-solid.git";
const releaseRemote = "rad://z8oQouP48Kq9CtNa62uf57VNBe8i/z6MkpE2GsUNs7QxVYLuwpYowpJH9GXEFFGc6uuVuwWbfsV8k";
const branch = "release/production-reconciliation-20261006-solid";

function fixture(overrides = {}) {
  const calls = [];
  const state = {
    branch, dirty: "", origin, head: sha,
    published: sha + "\trefs/heads/" + branch,
    accepted: later, ancestor: sha,
    ...overrides,
  };
  let headReads = 0;
  return {
    calls,
    git(args) {
      calls.push(args);
      switch (args.join(" ")) {
        case "branch --show-current": return state.branch;
        case "status --porcelain=v1": return state.dirty;
        case "remote get-url origin": return state.origin;
        case "rev-parse HEAD": return ++headReads > 1 ? (state.nextHead ?? state.head) : state.head;
        case "ls-remote origin refs/heads/main": return state.main ?? sha + "\trefs/heads/main";
        case "fetch --no-tags origin refs/heads/main": return "";
        case "rev-parse FETCH_HEAD": return state.accepted;
        case `merge-base ${sha} ${later}`: return state.ancestor;
        case `ls-remote ${releaseRemote} refs/heads/${branch}`: return state.published;
        default: throw new Error("unexpected Git operation: " + args.join(" "));
      }
    },
  };
}

test("a frozen accepted release remains valid after main advances", () => {
  const f = fixture();
  assert.equal(assertPublishedProductionSource("unused", f.git), sha);
  assert.ok(f.calls.some((args) => args.join(" ") === "fetch --no-tags origin refs/heads/main"));
  assert.ok(!f.calls.some((args) => args.includes("push") || args.includes("checkout")));
});

test("main still requires the exact current published commit", () => {
  const f = fixture({ branch: "main" });
  assert.equal(assertPublishedProductionSource("unused", f.git), sha);
  assert.ok(!f.calls.some((args) => args[0] === "fetch"));
  const stale = fixture({ branch: "main", main: later + "\trefs/heads/main" });
  assert.throws(() => assertPublishedProductionSource("unused", stale.git), /source_is_not_published_main/u);
});

for (const [description, changes, reason] of [
  ["feature branches", { branch: "fix/not-accepted" }, "source_is_not_main_or_production_release"],
  ["detached source", { branch: "" }, "source_is_not_main_or_production_release"],
  ["dirty source", { dirty: " M wrangler.jsonc" }, "source_is_dirty"],
  ["another origin", { origin: "https://example.invalid/repo.git" }, "unexpected_origin"],
  ["invalid commits", { head: "short" }, "invalid_source_commit"],
  ["unpublished releases", { published: "" }, "source_is_not_published_release"],
  ["moved release refs", { published: later + "\trefs/heads/" + branch }, "source_is_not_published_release"],
  ["unaccepted source", { ancestor: later }, "release_source_not_accepted_on_main"],
  ["source changing during verification", { nextHead: later }, "source_changed_during_preflight"],
]) {
  test("production refuses " + description, () => {
    const f = fixture(changes);
    assert.throws(() => assertPublishedProductionSource("unused", f.git), new RegExp(reason, "u"));
  });
}

test("a publication check error fails closed", () => {
  const f = fixture();
  assert.throws(() => assertPublishedProductionSource("unused", (args) => {
    if (args[0] === "ls-remote") throw new Error("remote unavailable");
    return f.git(args);
  }), /remote unavailable/u);
});
