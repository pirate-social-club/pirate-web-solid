import type { Page } from "playwright/test";
import { test, expect } from "./fixtures/auth.ts";
import { readonlyApi } from "./fixtures/api.ts";
import { e2eBaseURL, requireMutationEnvironment } from "./fixtures/environment.ts";
import { requireHnsJourneyRoot } from "./fixtures/hns-session-handoff.ts";

// The phase after a regtest UPDATE: the owner confirms publication in the
// product, the server observes and checks readiness on its own cadence, and
// the owner activates. Opt-in, because the lifecycle cadence makes it slow.
const activate = process.env.E2E_HNS_ACTIVATE === "1";
const root = process.env.E2E_HNS_ROOT ?? "";
const communityId = process.env.E2E_HNS_COMMUNITY_ID ?? "";
const readyWaitMs = Number(process.env.E2E_HNS_READY_WAIT_MS ?? 2_400_000);

type Lifecycle = Readonly<{
  phase?: string;
  pending_reason?: string | null;
  next_check_at?: string | null;
  deadline?: Readonly<{ kind?: string; at?: string }> | null;
  server_time?: string;
  permitted_actions?: ReadonlyArray<string>;
}>;
type Session = Readonly<{
  community_id?: string;
  root_import_session_id?: string;
  root_label?: string;
  status?: string;
  failure_reason?: string | null;
  lifecycle?: Lifecycle | null;
}>;
type Snapshot = Readonly<{
  attachment: Readonly<{ status?: string; canonical_route?: Readonly<{ root_label?: string; app_host?: string | null }> }> | null;
  session: Session | null;
}>;

async function readSnapshot(page: Page): Promise<Snapshot> {
  const response = await page.request.get(
    `/api/communities/${encodeURIComponent(communityId)}/hns-root-imports`, { failOnStatusCode: false });
  if (response.status() !== 200) throw new Error(`HNS namespace snapshot returned HTTP ${response.status()}.`);
  return await response.json() as Snapshot;
}

function describe(session: Session | null) {
  return {
    status: session?.status ?? null,
    failure_reason: session?.failure_reason ?? null,
    phase: session?.lifecycle?.phase ?? null,
    pending_reason: session?.lifecycle?.pending_reason ?? null,
    next_check_at: session?.lifecycle?.next_check_at ?? null,
    deadline: session?.lifecycle?.deadline ?? null,
    server_time: session?.lifecycle?.server_time ?? null,
    permitted_actions: session?.lifecycle?.permitted_actions ?? [],
  };
}

test.describe("staging HNS activation", { tag: "@hns-mutating" }, () => {
  test.skip(!activate, "Set E2E_HNS_ACTIVATE=1 to run the post-publication phase.");

  test.beforeAll(() => {
    requireMutationEnvironment();
    if (e2eBaseURL() !== "https://web-next-staging.pirate.sc")
      throw new Error("HNS activation requires the pinned staging browser origin.");
    requireHnsJourneyRoot(root);
    if (!/^community_[0-9a-f-]{36}$/u.test(communityId))
      throw new Error("HNS activation requires E2E_HNS_COMMUNITY_ID.");
    if (!Number.isFinite(readyWaitMs) || readyWaitMs < 60_000 || readyWaitMs > 3_600_000)
      throw new Error("E2E_HNS_READY_WAIT_MS must be between one minute and one hour.");
  });

  test("confirms publication, waits for readiness and activates the community address", async ({ page }) => {
    test.setTimeout(readyWaitMs + 300_000);
    const capabilities = await readonlyApi(page).ownerCapabilities(communityId);
    if (capabilities.role !== "owner") throw new Error("The HNS community is not owned by the test account.");
    const namespacePath = `/c/${encodeURIComponent(communityId)}/settings/namespace`;

    let snapshot = await readSnapshot(page);
    const session = snapshot.session;
    if (!session || session.root_label !== root || session.community_id !== communityId)
      throw new Error("The community holds no import session for this root.");
    console.log(JSON.stringify({ event: "hns-activation-start", ...describe(session) }));

    // The owner confirms the complete resource was published; the product
    // then schedules the server's own publication check.
    if (session.status === "awaiting_owner_update") {
      await page.goto(namespacePath);
      await expect(page.locator("[data-community-namespace-settings]")).toBeVisible({ timeout: 45_000 });
      const pollPath = `/api/communities/${encodeURIComponent(communityId)}/hns-root-imports/${encodeURIComponent(session.root_import_session_id ?? "")}/poll`;
      const [polled] = await Promise.all([
        page.waitForResponse(response => response.request().method() === "POST" &&
          new URL(response.url()).pathname === pollPath, { timeout: 60_000 }),
        page.getByRole("button", { name: "I published all records manually", exact: true }).click(),
      ]);
      if (!polled.ok()) throw new Error(`HNS publication confirmation returned HTTP ${polled.status()}.`);
      console.log(JSON.stringify({ event: "hns-publication-confirmed" }));
    }

    // Readiness advances on the server's cadence; only read, never force.
    const deadline = Date.now() + readyWaitMs;
    let last = "";
    while (Date.now() < deadline) {
      snapshot = await readSnapshot(page);
      const current = describe(snapshot.session);
      const key = JSON.stringify(current);
      if (key !== last) {
        console.log(JSON.stringify({ event: "hns-activation-progress", at: new Date().toISOString(), ...current }));
        last = key;
      }
      if (current.status === "ready" || current.status === "activated") break;
      if (current.status === "failed" || current.status === "expired" || current.phase === "recovery_required")
        throw new Error(`HNS session stopped in ${current.status} (${current.phase ?? "no phase"}, ${current.failure_reason ?? "no reason"}).`);
      await new Promise(resolve => setTimeout(resolve, 15_000));
    }
    if (snapshot.session?.status !== "ready" && snapshot.session?.status !== "activated")
      throw new Error(`HNS session was not ready within ${Math.round(readyWaitMs / 60_000)} minutes.`);

    if (snapshot.session?.status === "ready") {
      await page.goto(namespacePath);
      const activatePath = `/api/communities/${encodeURIComponent(communityId)}/hns-root-imports/${encodeURIComponent(snapshot.session.root_import_session_id ?? "")}/activate`;
      const [activated] = await Promise.all([
        page.waitForResponse(response => response.request().method() === "POST" &&
          new URL(response.url()).pathname === activatePath, { timeout: 60_000 }),
        page.getByRole("button", { name: "Activate community address", exact: true }).click(),
      ]);
      if (!activated.ok()) throw new Error(`HNS activation returned HTTP ${activated.status()}.`);
      console.log(JSON.stringify({ event: "hns-activated" }));
    }

    // A reload reads the attachment back from the server, not from the page.
    await page.reload();
    await expect(page.locator("[data-namespace-attachment]")).toContainText(root, { timeout: 45_000 });
    snapshot = await readSnapshot(page);
    if (snapshot.attachment?.status !== "active" || snapshot.attachment.canonical_route?.root_label !== root)
      throw new Error("The community address is not attached after activation.");
    console.log(JSON.stringify({ event: "hns-attachment", app_host: snapshot.attachment.canonical_route?.app_host ?? null }));
  });
});
