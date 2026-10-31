import assert from "node:assert/strict";
import test from "node:test";
import { apiPublishedTip, assertWebsitePackage, validateApiPublication } from "./context.mjs";

const source = "a".repeat(40), main = "b".repeat(40);
const ref = "refs/heads/release/v1-website-qualified-tooling-r2-20261031";
function witness() {
  return { source, main, source_is_ancestor: false, application_is_ancestor: true, release_ref: ref, release_tip: source,
    objects: Object.fromEntries([["scripts/production-release", "tree"], ["scripts/production-compatibility", "tree"], ["tsconfig.scripts.json", "blob"]]
      .map(([path, type], index) => [path, { source_oid: String(index + 1).repeat(40), main_oid: String(index + 1).repeat(40), source_type: type, main_type: type }])) };
}
test("pre-import API witness accepts ancestry or the exact accepted frozen tooling trees", () => {
  validateApiPublication({ source, main, source_is_ancestor: true, application_is_ancestor: true });
  validateApiPublication(witness());
  for (const change of [{ application_is_ancestor: false }, { release_tip: main }, { release_ref: "refs/heads/main" }, { objects: undefined }])
    assert.throws(() => validateApiPublication({ ...witness(), ...change }));
  for (const path of Object.keys(witness().objects)) {
    for (const field of ["source_oid", "main_oid", "source_type", "main_type"]) {
      const value = witness(); value.objects[path][field] = field.endsWith("oid") ? "f".repeat(40) : "commit";
      assert.throws(() => validateApiPublication(value));
    }
    const missing = witness(); delete missing.objects[path]; assert.throws(() => validateApiPublication(missing));
  }
  const extra = witness(); extra.objects.foreign = extra.objects["scripts/production-release"];
  assert.throws(() => validateApiPublication(extra));
});
test("pre-import branch advertisement must identify exactly one fixed ref tip", () => {
  assert.equal(apiPublishedTip(source + "\t" + ref + "\n", ref), source);
  for (const value of ["", source, source + "\trefs/heads/main", "invalid\t" + ref, source + "\t" + ref + "\n" + source + "\t" + ref])
    assert.throws(() => apiPublishedTip(value, ref));
});

const base = "node --test scripts/website-production-config.test.mjs scripts/website-production-artifacts.test.mjs scripts/website-production-source-preflight.test.mjs";
const suffix = " && bun run test:production:website-executor";
const executor = "node --test scripts/production-website/*.test.mjs";
const original = () => ({ name: "fixture", dependencies: { fixed: "1.0.0" }, scripts: { other: "unchanged", "test:production:website": base } });
function integrated() {
  const value = original(); value.scripts["test:production:website"] += suffix;
  value.scripts["test:production:website-executor"] = executor; return value;
}
test("only the original and already-integrated exact package baselines are accepted", () => {
  assertWebsitePackage(original(), integrated()); assertWebsitePackage(integrated(), integrated());
  for (const mutate of [
    value => { value.scripts["test:production:website"] += suffix; },
    value => { value.scripts["test:production:website-executor"] = "other"; },
    value => { delete value.scripts["test:production:website-executor"]; },
  ]) {
    const before = integrated(); mutate(before); assert.throws(() => assertWebsitePackage(before, integrated()));
  }
  for (const mutate of [
    value => { value.dependencies.fixed = "2.0.0"; }, value => { value.scripts.other = "changed"; },
    value => { value.scripts["test:production:website"] += suffix; },
  ]) {
    const after = integrated(); mutate(after); assert.throws(() => assertWebsitePackage(integrated(), after));
  }
});
