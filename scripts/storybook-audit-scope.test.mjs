import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { affectedStories, auditPlan } from "./storybook-audit-scope.mjs";

const root = path.resolve(import.meta.dirname, "..");
const absolute = (file) => path.join(root, file);
const story = absolute("src/features/rewards/contribution.stories.tsx");
const unrelated = absolute("src/features/legal/document.stories.tsx");
const model = absolute("src/features/rewards/model.ts");
const helper = absolute("src/api/recovery.ts");
const graph = new Map([[story, [model]], [model, [helper]], [helper, [model]], [unrelated, []]]);
const dependencies = (file) => graph.get(file) ?? [];

test("selects transitive users, handles cycles and includes changed stories", () => {
  assert.deepEqual(affectedStories(["src/api/recovery.ts"], [story, unrelated], dependencies), [story]);
  assert.deepEqual(affectedStories(["src/features/legal/document.stories.tsx"], [story, unrelated], dependencies), [unrelated]);
});

test("docs, isolated transport and tests do not require a browser", () => {
  assert.equal(auditPlan("pull_request", ["docs/plan.md", "src/api/unused.ts", "src/api/recovery.test.ts"], [story, unrelated], dependencies).scope, "none");
});

test("shared UI, global styling and main/manual runs keep the complete catalog", () => {
  for (const file of ["packages/solid-ui/src/button.tsx", ".storybook/preview.tsx", "src/index.css", "public/logo.svg", "vite.config.ts", "src/lib/ui-locale.tsx", "src/lib/ui-locale-core.ts", "src/locales/ar/routes.json"]) {
    assert.equal(auditPlan("pull_request", [file], [story], dependencies).scope, "full");
  }
  for (const event of ["push", "workflow_dispatch"]) assert.equal(auditPlan(event, [], [story], dependencies).scope, "full");
});

test("the runner filter matches only exact selected import paths", () => {
  const plan = auditPlan("pull_request", ["src/api/recovery.ts"], [story, unrelated], dependencies);
  assert.equal(plan.scope, "affected");
  const filter = new RegExp(plan.filter, "i");
  assert.equal(filter.test("./src/features/rewards/contribution.stories.tsx"), true);
  assert.equal(filter.test("./src/features/legal/document.stories.tsx"), false);
  assert.equal(filter.test("./src/features/rewards/contributionXstoriesXtsx"), false);
});
