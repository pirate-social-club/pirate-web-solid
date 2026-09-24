import { randomUUID } from "node:crypto";
import type { Page } from "playwright/test";
import type { GetUsersMeCommunityMembershipsResponse } from "@pirate/api-client";
import { test, expect } from "./fixtures/auth.ts";
import { readonlyApi } from "./fixtures/api.ts";
import { createCommunityAndVerifyAcceptance } from "./fixtures/create-community.ts";
import { e2eBaseURL, requireMutationEnvironment } from "./fixtures/environment.ts";
import { requireHnsJourneyRoot, writeHnsSessionHandoff } from "./fixtures/hns-session-handoff.ts";
import { publishFreshHnsSessionOnRegtest, remainingTestBudgetMs, runRegtestJourneyStep,
  verifyRegtestRunnerOnHost } from "./fixtures/hns-regtest-publisher.ts";

const publishRegtest = process.env.E2E_HNS_PUBLISH_REGTEST === "1";
const generatedRoot = `e2e${randomUUID().replaceAll("-", "").slice(0, 24)}`;
const selectedRoot = process.env.E2E_HNS_ROOT ?? (publishRegtest ? generatedRoot : "");
// Each fresh community creates a persona, and accounts hold at most ten, three
// of them new per day. A named community the account owns can be reused instead.
const reusedCommunityId = process.env.E2E_HNS_COMMUNITY_ID ?? "";

function requireBudget(remainingMs: number, minimumMs: number, stage: string) {
  if (remainingMs < minimumMs)
    throw new Error(`Insufficient Playwright time for ${stage}; no further regtest command attempted.`);
}

// Only communities this spec created are candidates, so another lane's test
// community is never given an HNS import.
async function findSpareHnsCommunity(page: Page): Promise<string> {
  let cursor: string | null = null;
  for (let index = 0; index < 20; index++) {
    const query: string = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) }).toString();
    const response = await page.request.get(`/api/users/me/community-memberships?${query}`);
    if (response.status() !== 200) throw new Error(`Membership listing returned HTTP ${response.status()}.`);
    const result = await response.json() as GetUsersMeCommunityMembershipsResponse;
    for (const item of result.items) {
      if (!item.display_name.startsWith("E2E HNS ") || item.canonical_route !== null) continue;
      const imports = await page.request.get(
        `/api/communities/${encodeURIComponent(item.community_id)}/hns-root-imports`, { failOnStatusCode: false });
      if (imports.status() !== 200) continue;
      const snapshot = await imports.json() as { session?: unknown; attachment?: unknown };
      if (snapshot.session === null && snapshot.attachment === null) return item.community_id;
    }
    if (result.next_cursor === null) break;
    cursor = result.next_cursor;
  }
  throw new Error("No spare E2E HNS community without an import; set E2E_HNS_COMMUNITY_ID or free a persona slot.");
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
    const startedAt = Date.now();
    const remainingMs = () => remainingTestBudgetMs(testInfo.timeout, startedAt);
    if (testInfo.retry !== 0)
      throw new Error("HNS regtest journey refuses Playwright retries after a possible UPDATE.");
    const root = requireHnsJourneyRoot(selectedRoot);
    const runnerSha256 = process.env.E2E_HNS_RUNNER_SHA256 ?? "";
    // The lease is released automatically only when no UPDATE was attempted.
    // After an attempt it stays held with the receipt until reconciled.
    let leaseTaken = false;
    let publishAttempted = false;
    let leaseReleased = false;
    let leaseReceipt: unknown = null;
    if (publishRegtest) {
      requireBudget(remainingMs(), 800_000, "lease and name acquisition");
      console.log(JSON.stringify({ event: "hns-regtest-selected-root", root }));
      leaseReceipt = await runRegtestJourneyStep("begin", root, runnerSha256);
      leaseTaken = true;
    }
    // The try opens immediately after the lease, so any later failure before an
    // UPDATE attempt, including attaching the receipt, reaches the release.
    try {
      if (publishRegtest) {
        await testInfo.attach("hns-regtest-lease-receipt", {
          body: JSON.stringify(leaseReceipt), contentType: "application/json",
        });
        // Inside the try: a failed acquisition attempted no UPDATE, so the
        // finally block still releases the lease.
        const acquisition = await runRegtestJourneyStep("acquire", root, runnerSha256);
        await testInfo.attach("hns-regtest-acquisition-receipt", {
          body: JSON.stringify(acquisition), contentType: "application/json",
        });
      }
      let communityId: string | undefined;
      let path: string;
      if (reusedCommunityId) {
        const chosen = reusedCommunityId === "auto" ? await findSpareHnsCommunity(page) : reusedCommunityId;
        if (!/^community_[0-9a-f-]{36}$/u.test(chosen))
          throw new Error("E2E_HNS_COMMUNITY_ID must be a community identifier or auto.");
        const api = readonlyApi(page);
        const capabilities = await api.ownerCapabilities(chosen);
        if (capabilities.role !== "owner") throw new Error("The reused HNS community is not owned by the test account.");
        // A route is optional; without one the community answers at its identifier.
        const preview = await api.communityPreview(chosen);
        communityId = chosen;
        path = `/c/${encodeURIComponent(preview.route_slug || chosen)}`;
        console.log(JSON.stringify({ event: "hns-reused-community", community_id: chosen }));
      } else {
        path = await createCommunityAndVerifyAcceptance(page, `E2E HNS ${randomUUID()}`, testInfo, observation => {
          communityId = observation.communityId;
        });
      }
      if (!communityId) throw new Error("Community creation did not return its identity.");
      console.log(JSON.stringify({ event: "hns-community", community_id: communityId }));
      // The root field renders only when the community has no import session,
      // so name the server's state instead of timing out on a missing field.
      const startPath = `/api/communities/${encodeURIComponent(communityId)}/hns-root-imports`;
      const snapshotResponse = await page.request.get(startPath, { failOnStatusCode: false });
      if (snapshotResponse.status() !== 200)
        throw new Error(`HNS namespace snapshot returned HTTP ${snapshotResponse.status()}.`);
      const snapshot = await snapshotResponse.json() as {
        session?: { status?: unknown; root_label?: unknown; community_id?: unknown; root_import_session_id?: unknown } | null;
      };
      let sessionId: string;
      if (snapshot.session !== null) {
        // Only a reused community may resume, and only its own session for
        // exactly this root; the chain side stays fenced by the runner lease.
        const existing = snapshot.session;
        if (!reusedCommunityId || existing?.root_label !== root || existing.community_id !== communityId ||
            typeof existing.root_import_session_id !== "string" || existing.root_import_session_id.length === 0)
          throw new Error(`HNS namespace snapshot already holds a session in ${JSON.stringify(existing?.status ?? null)}.`);
        sessionId = existing.root_import_session_id;
        console.log(JSON.stringify({ event: "hns-resumed-session", status: existing.status ?? null }));
      } else {
        await page.goto(`${path}/settings/namespace`);
        await expect(page.locator("[data-community-namespace-settings]")).toBeVisible({ timeout: 45_000 });
        // The required marker is part of the label, so match the name's start.
        await page.getByRole("textbox", { name: /^Handshake root\b/u }).fill(root);
        await page.getByRole("button", { name: "Continue", exact: true }).click();
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
        sessionId = start.root_import_session_id;
        testInfo.annotations.push({ type: "persistent-content", description: `Started staging HNS import for ${root}; no automatic deletion contract.` });
      }
      const sessionPath = `${startPath}/${encodeURIComponent(sessionId)}`;
      requireBudget(remainingMs(), publishRegtest ? 550_000 : 210_000,
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
            requireBudget(remainingMs(), 460_000,
              "UPDATE dispatch, safe observation and lease release");
            const published = await publishFreshHnsSessionOnRegtest(
              freshBytes, fresh.url(), { communityId, root, sessionId },
              handoff.receipt.publish_plan_sha256, runnerSha256,
              undefined,
              async copyReceipt => {
                // Runs only after the verified protected copy and immediately
                // before dispatch; a failed copy sent nothing and releases.
                publishAttempted = true;
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
            requireBudget(remainingMs(), 310_000,
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
