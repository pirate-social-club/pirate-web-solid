import { randomUUID } from "node:crypto";
import { test } from "./fixtures/auth.ts";
import { createCommunityAndVerifyAcceptance } from "./fixtures/create-community.ts";
import { requireMutationEnvironment } from "./fixtures/environment.ts";

test.describe("required community creation", { tag: "@community-creation" }, () => {
  // Also fail closed if this spec is invoked through the general configuration.
  test.beforeAll(() => requireMutationEnvironment());

  test("creates once and retains owner identity when reloading and reopening the intent", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const marker = `E2E community ${randomUUID()}`;
    await createCommunityAndVerifyAcceptance(page, marker, testInfo);
  });
});
