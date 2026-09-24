import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/auth.ts";
import { createCommunityAndVerifyAcceptance } from "./fixtures/create-community.ts";
import { e2eBaseURL, requireMutationEnvironment } from "./fixtures/environment.ts";
import { requireHnsJourneyRoot, writeHnsSessionHandoff } from "./fixtures/hns-session-handoff.ts";
import { publishFreshHnsSessionOnRegtest, runRegtestJourneyStep,
  verifyRegtestRunnerOnHost } from "./fixtures/hns-regtest-publisher.ts";

const publishRegtest = process.env.E2E_HNS_PUBLISH_REGTEST === "1";
const generatedRoot = `e2e${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const selectedRoot = process.env.E2E_HNS_ROOT ?? (publishRegtest ? generatedRoot : "");

function requireBudget(remainingMs: number, minimumMs: number, stage: string) {
  if (remainingMs < minimumMs)
    throw new Error(`Insufficient Playwright time for ${stage}; no further regtest command attempted.`);
}

test.describe("staging HNS authenticated handoff", { tag: "@hns-mutating" }, () => {
  test.beforeAll(async () => {
    requireMutationEnvironment();
    if (e2eBaseURL() !== "https://web-next-staging.pirate.sc")
      throw new Error("HNS authenticated handoff requires the pinned staging browser origin.");
    requireHnsJourneyRoot(selectedRoot);
    if (publishRegtest &&
        !/^[0-9a-f]{64}$/u.test(process.env.E2E_HNS_RUNNER_SHA256 ?? ""))
      throw new Error("Regtest publication requires the exact reviewed host runner SHA-256 before login.");
    if (publishRegtest)
      await verifyRegtestRunnerOnHost(process.env.E2E_HNS_RUNNER_SHA256 ?? "");
  });

  test("starts a provisional import and binds the authenticated response to optional regtest publication", async ({ page }, testInfo) => {
    test.setTimeout(1_200_000);
    if (testInfo.retry !== 0)
      throw new Error("HNS regtest journey refuses Playwright retries after a possible UPDATE.");
    const root = requireHnsJourneyRoot(selectedRoot);
    const runnerSha256 = process.env.E2E_HNS_RUNNER_SHA256 ?? "";
    // The lease is released automatically only when no UPDATE was attempted.
    // After an attempt it stays held with the receipt until reconciled.
    let leaseTaken = false;
    let publishAttempted = false;
    let leaseReleased = false;
    if (publishRegtest) {
      requireBudget(testInfo.timeout - testInfo.duration, 800_000, "lease and name acquisition");
      console.log(JSON.stringify({ event: "hns-regtest-selected-root", root }));
      const lease = await runRegtestJourneyStep("begin", root, runnerSha256);
      leaseTaken = true;
      await testInfo.attach("hns-regtest-lease-receipt", {
        body: JSON.stringify(lease), contentType: "application/json",
      });
      const acquisition = await runRegtestJourneyStep("acquire", root, runnerSha256);
      await testInfo.attach("hns-regtest-acquisition-receipt", {
        body: JSON.stringify(acquisition), contentType: "application/json",
      });
    }
    try {
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
      requireBudget(testInfo.timeout - testInfo.duration, publishRegtest ? 550_000 : 210_000,
        "provisioning poll and guarded publication");
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
          if (publishRegtest) {
            // Never publish the saved preparation snapshot. Re-read through the
            // authenticated context immediately before protected copy and UPDATE.
            const fresh = await page.request.get(sessionPath, { failOnStatusCode: false });
            if (fresh.status() !== 200) throw new Error(`Fresh authenticated HNS session read returned HTTP ${fresh.status()}.`);
            const freshBytes = await fresh.body();
            const freshHandoff = await writeHnsSessionHandoff(freshBytes, fresh.url(), { communityId, root, sessionId });
            if (freshHandoff.receipt.publish_plan_sha256 !== handoff.receipt.publish_plan_sha256)
              throw new Error("HNS publication plan drifted after preparation; no chain update attempted.");
            await testInfo.attach("hns-fresh-session-receipt", {
              body: JSON.stringify(freshHandoff.receipt), contentType: "application/json",
            });
            // Copy 30 s + publish 120 s + advance-safe 180 s + end 120 s.
            requireBudget(testInfo.timeout - testInfo.duration, 460_000,
              "UPDATE dispatch, safe observation and lease release");
            publishAttempted = true;
            const published = await publishFreshHnsSessionOnRegtest(
              freshBytes, fresh.url(), { communityId, root, sessionId },
              handoff.receipt.publish_plan_sha256, runnerSha256,
              undefined,
              async copyReceipt => {
                await testInfo.attach("hns-protected-copy-receipt", {
                  body: JSON.stringify(copyReceipt), contentType: "application/json",
                });
                console.log(JSON.stringify({ event: "hns-regtest-update-dispatch-fence",
                  root, response_sha256: copyReceipt.responseSha256,
                  interrupted_outcome: "ambiguous_stop_and_reconcile_no_retry" }));
              },
            );
            await testInfo.attach("hns-regtest-publication-receipt", {
              body: JSON.stringify(published), contentType: "application/json",
            });
            console.log(JSON.stringify({ event: "hns-regtest-publication", ...published }));
            // advance-safe 180 s + end 120 s.
            requireBudget(testInfo.timeout - testInfo.duration, 310_000,
              "safe observation and lease release");
            const safe = await runRegtestJourneyStep("advance-safe", root, runnerSha256, {
              remotePath: published.remotePath, responseSha256: published.responseSha256,
            });
            await testInfo.attach("hns-regtest-safe-receipt", {
              body: JSON.stringify(safe), contentType: "application/json",
            });
            const released = await runRegtestJourneyStep("end", root, runnerSha256);
            leaseReleased = true;
            await testInfo.attach("hns-regtest-lease-release-receipt", {
              body: JSON.stringify(released), contentType: "application/json",
            });
          }
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2_000));
      }
      throw new Error("HNS preparation did not return a publication plan within 180 seconds; no chain update attempted.");
    } finally {
      if (leaseTaken && !publishAttempted && !leaseReleased) {
        try {
          await runRegtestJourneyStep("end", root, runnerSha256);
          console.log(JSON.stringify({ event: "hns-regtest-lease-released-without-publish", root }));
        } catch {
          console.log(JSON.stringify({ event: "hns-regtest-lease-release-failed", root,
            action: "reconcile the host lease before the next journey" }));
        }
      }
    }
  });
});
