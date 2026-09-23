import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/auth.ts";
import { createCommunityAndVerifyAcceptance } from "./fixtures/create-community.ts";
import { e2eBaseURL, requireMutationEnvironment } from "./fixtures/environment.ts";
import { requireHnsJourneyRoot, writeHnsSessionHandoff } from "./fixtures/hns-session-handoff.ts";

test.describe("staging HNS authenticated handoff", { tag: "@hns-mutating" }, () => {
  test.beforeAll(() => {
    requireMutationEnvironment();
    if (e2eBaseURL() !== "https://web-next-staging.pirate.sc")
      throw new Error("HNS authenticated handoff requires the pinned staging browser origin.");
    requireHnsJourneyRoot(process.env.E2E_HNS_ROOT ?? "");
  });

  test("starts a provisional import in the UI and captures its exact authenticated session response", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const root = requireHnsJourneyRoot(process.env.E2E_HNS_ROOT ?? "");
    const marker = `E2E HNS ${randomUUID()}`;
    let communityId: string | undefined;
    const path = await createCommunityAndVerifyAcceptance(page, marker, testInfo, observation => {
      communityId = observation.communityId;
    });
    if (!communityId) throw new Error("Community creation did not return its identity.");
    await page.goto(`${path}/settings/namespace`);
    await expect(page.locator("[data-community-namespace-settings]")).toBeVisible();
    await page.getByLabel("Handshake root", { exact: true }).fill(root);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const startPath = `/api/communities/${encodeURIComponent(communityId)}/hns-root-imports`;
    const [started] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "POST" &&
        new URL(response.url()).pathname === startPath, { timeout: 60_000 }),
      page.getByRole("button", { name: "Start verification", exact: true }).click(),
    ]);
    if (!started.ok()) throw new Error(`HNS preparation returned HTTP ${started.status()}.`);
    const start = await started.json() as { root_import_session_id?: unknown; root_label?: unknown; community_id?: unknown };
    if (typeof start.root_import_session_id !== "string" || start.root_import_session_id.length === 0 ||
        start.root_label !== root || start.community_id !== communityId)
      throw new Error("HNS preparation did not bind the requested community and root.");
    const sessionId = start.root_import_session_id;
    testInfo.annotations.push({ type: "persistent-content", description: `Started staging HNS import for ${root}; no automatic deletion contract.` });
    const sessionPath = `${startPath}/${encodeURIComponent(sessionId)}`;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const response = await page.request.get(sessionPath, { failOnStatusCode: false });
      if (response.status() !== 200) throw new Error(`Authenticated HNS session read returned HTTP ${response.status()}.`);
      const bytes = await response.body();
      let summary: { status?: unknown; publish_plan?: unknown };
      try { summary = JSON.parse(bytes.toString("utf8")) as typeof summary; }
      catch { throw new Error("Authenticated HNS session response was not valid JSON."); }
      if ((summary.status === "awaiting_owner_update" || summary.status === "observing") &&
          typeof summary.publish_plan === "object" && summary.publish_plan !== null) {
        const handoff = await writeHnsSessionHandoff(bytes, response.url(), { communityId, root, sessionId });
        await testInfo.attach("hns-session-handoff-receipt", {
          body: JSON.stringify(handoff.receipt), contentType: "application/json",
        });
        console.log(JSON.stringify({ event: "hns-session-handoff", receipt_path: handoff.receiptPath,
          response_path: handoff.bodyPath, response_sha256: handoff.receipt.response_sha256 }));
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2_000));
    }
    throw new Error("HNS preparation did not return a publication plan within 180 seconds; no chain update attempted.");
  });
});
