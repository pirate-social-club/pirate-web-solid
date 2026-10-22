import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createRoot, createSignal, flush } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { userEvent } from "@testing-library/user-event";
import { contributionControllerFixture } from "../../../test/fixtures/song-contribution-controller.ts";
import { contributionFixtures as f } from "../../api/song-contributions.fixture.ts";
import { createSongContributionJournal } from "../../api/song-contribution-journal.ts";
import { rewardCreationKey } from "../../api/reward-creation.ts";
import { establishSessionAuthority, forgetSessionAuthority } from "../../api/browser-session-events.ts";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../shell/application-session.tsx";
import { SongContributionDialog, type SongContributionAuthorization, type SongContributionDependencies } from "./song-contribution-dialog.tsx";
import { ContributionCreationRefused, contributionCreationRequestHash } from "../../api/song-contribution-refusal.ts";

// SAFETY: vitest.app selects the DOM renderer; the app config resolves its server overload.
const renderDom = render as (view: () => JSX.Element, host: HTMLElement) => void;
const cleanups: Array<() => void> = [];
beforeEach(() => { establishSessionAuthority(); });
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.replaceChildren(); forgetSessionAuthority(); });

function mount(options: { previous?: boolean; fixture?: ReturnType<typeof contributionControllerFixture> } = {}) {
  const h = options.fixture ?? contributionControllerFixture();
  if (options.previous) h.values.set(rewardCreationKey(f.scope), "opaque unresolved V1 fixture");
  const authorization: SongContributionAuthorization = {
    sendCode: vi.fn(async () => {}), loginWithCode: vi.fn(async () => {}),
    estimateTransfer: async () => h.wallet.estimate(f.receipt), estimateCancellation: async () => h.wallet.estimate(f.receipt),
    sendTransfer: async (_transfer, fee, before) => h.wallet.send(f.receipt, fee, before),
    sendCancellation: async (_transfer, fee, before) => h.wallet.send(f.receipt, fee, before), dispose: h.wallet.dispose,
  };
  const dependencies: SongContributionDependencies = {
    catalog: vi.fn<SongContributionDependencies["catalog"]>(async () => ({ accountId: f.scope.accountId, personas: [{
      object: "persona", persona_id: f.scope.personaId, status: "active",
      profile: { object: "persona_profile", persona_id: f.scope.personaId, revision: 1, display_name: "Fixture profile", avatar_ref: null, cover_ref: null, bio: null, preferred_locale: "en", primary_public_handle: null },
      wallet_set: { evm: { chain_account_kind: "evm", address: f.receipt.instruction.from, hd_wallet_index: 0, assigned_at: "2026-10-18T13:00:00.000Z" } },
      community_binding: { community_id: f.scope.communityId, binding_source: "persona_creation" }, created_at: "2026-10-18T13:00:00.000Z", retired_at: null,
    }] })),
    api: () => h.api, journal: createSongContributionJournal, store: () => h.store,
    authorization: vi.fn(async () => authorization), previous: scope => h.store.read(rewardCreationKey(scope)) !== null, nowMs: h.nowMs,
  };
  const [session, setSession] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: f.scope.accountId });
  const host = document.createElement("div"); document.body.appendChild(host); let dispose = () => {};
  createRoot(done => { dispose = done; cleanups.push(done); renderDom(() => <ApplicationSessionProvider state={session}><SongContributionDialog communityId={f.scope.communityId} postId={f.scope.postId} songTitle="Fixture song" onClose={() => {}} dependencies={dependencies} /></ApplicationSessionProvider>, host); });
  return { h, dependencies, authorization, setSession, dispose };
}
const button = (label: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.trim() === label);
  if (!found) throw new Error(`missing fixture button: ${label}`); return found;
};
const input = (id: string) => {
  const found = document.getElementById(id); if (!(found instanceof HTMLInputElement)) throw new Error(`missing fixture input: ${id}`); return found;
};
const waitAmount = () => vi.waitFor(() => expect(document.getElementById("song-contribution-amount")).not.toBeNull());
async function reserve() {
  await waitAmount(); const user = userEvent.setup(); await user.type(input("song-contribution-amount"), "2");
  await user.click(button("Review contribution")); await vi.waitFor(() => expect(document.body.textContent).toContain("Study: meet the 70%"));
  expect(document.body.textContent).toContain("unspent budget is refunded to the original funding wallets in proportion to confirmed contributions");
  await user.click(button("Continue to payment")); await vi.waitFor(() => expect(button("Review payment")).toBeDefined()); return user;
}

test("the actual shared-pot dialog presents Amount then all activities without a funder selector", async () => {
  const { h } = mount(); await waitAmount(); expect(document.body.textContent).toContain("Base Sepolia (testnet)");
  expect(document.querySelector('[role="radio"]')).toBeNull(); expect(document.body.textContent).not.toContain("People earn by");
  await reserve(); expect(h.api.create).toHaveBeenCalledTimes(1); expect(h.walletInvocations()).toBe(0);
  expect(document.body.textContent).toContain("At most one share per account in each drawing");
  expect(document.body.textContent).toContain("You can enter without verification. Verification is required to claim winnings");
  expect(document.body.textContent).toContain("Dance: a community-owner review must pass");
});
test("authorization leads to Review/Pay and only explicit Pay invokes the simulated wallet", async () => {
  const { h, authorization } = mount(); const user = await reserve(); await user.click(button("Review payment"));
  await vi.waitFor(() => expect(document.body.textContent).toContain("Email for your wallet"));
  expect(document.querySelector('[role="alert"]')).toBeNull();
  const email = document.querySelector<HTMLInputElement>('input[inputmode="email"]'); if (!email) throw new Error("fixture email missing");
  await user.type(email, "operator@example.test"); await user.click(button("Send code"));
  await vi.waitFor(() => expect(button("Review transfer")).toBeDefined());
  const code = [...document.querySelectorAll<HTMLInputElement>("input")].find(node => node !== email); if (!code) throw new Error("fixture code missing");
  await user.type(code, "123456"); await user.click(button("Review transfer"));
  await vi.waitFor(() => expect(button("Pay 2 USDC")).toBeDefined()); expect(h.walletInvocations()).toBe(0);
  expect(authorization.loginWithCode).toHaveBeenCalledOnce(); expect(document.body.textContent).toContain("Payment fee");
  expect(document.body.textContent).toContain("unspent budget is refunded to the original funding wallets in proportion to confirmed contributions");
  await user.click(button("Pay 2 USDC")); await vi.waitFor(() => expect(document.body.textContent).toContain("Confirming payment"));
  expect(h.walletInvocations()).toBe(1); expect(h.api.observe).toHaveBeenCalledTimes(1);
});
test("a saved V1 journal blocks V2 without removing or reinterpreting it", async () => {
  const { h } = mount({ previous: true });
  await vi.waitFor(() => expect(document.body.textContent).toContain("A previous reward payment is saved"));
  expect(button("Check saved reward")).toBeDefined(); expect(h.api.context).not.toHaveBeenCalled(); expect(h.api.create).not.toHaveBeenCalled(); expect(document.getElementById("song-contribution-amount")).toBeNull();
  expect(h.values.get(rewardCreationKey(f.scope))).toBe("opaque unresolved V1 fixture");
});
test("an uncertain original creation reopens as recovery without posting a new command", async () => {
  const h = contributionControllerFixture(), controller = h.controller(); h.setCreation("before");
  await controller.reviewAmount("2000000"); await expect(controller.reserve()).rejects.toThrow(); const original = h.journal().read()?.commands[0]?.bodyJson;
  mount({ fixture: h }); await vi.waitFor(() => expect(document.body.textContent).toContain("Your original request is saved"));
  expect(h.api.create).toHaveBeenCalledTimes(1); expect(h.journal().read()?.commands[0]?.bodyJson).toBe(original); expect(h.walletInvocations()).toBe(0);
});

test("a refused original request offers a new amount review without wallet authorization or an automatic POST", async () => {
  const { h, dependencies } = mount(); await waitAmount();
  vi.mocked(h.api.create).mockImplementationOnce(async body => { throw new ContributionCreationRefused("context_stale", { command_id: "refused-command", request_hash: await contributionCreationRequestHash(f.scope, body), allocation: "none", instruction_issued: false }); });
  const user = userEvent.setup(); await user.type(input("song-contribution-amount"), "2"); await user.click(button("Review contribution"));
  await vi.waitFor(() => expect(button("Continue to payment")).toBeDefined()); await user.click(button("Continue to payment"));
  await vi.waitFor(() => expect(document.querySelector('[role="status"]')?.textContent).toContain("refused before a payment instruction was issued"));
  expect(button("Review contribution")).toBeDefined(); expect(h.api.create).toHaveBeenCalledTimes(1);
  expect(h.journal().read()).toBeNull(); expect(dependencies.authorization).not.toHaveBeenCalled(); expect(h.walletInvocations()).toBe(0);
});
test("account replacement clears private terms, input and wallet authority", async () => {
  const { setSession, h } = mount(); await reserve(); expect(document.body.textContent).toContain("At most one share per account");
  setSession({ status: "authenticated", userId: "different-account" }); flush();
  expect(document.body.textContent).not.toContain("Original contribution"); expect(document.body.textContent).not.toContain("Study: meet the 70%");
  expect(h.walletInvocations()).toBe(0);
});
test.each(["contribution_account_changed", "contribution_scope_changed"])("an account proof rejects %s before stale shell state can preserve private views", async reason => {
  const { h } = mount(); const user = await reserve();
  vi.mocked(h.api.state).mockRejectedValueOnce(new Error(reason)); await user.click(button("Review payment"));
  await vi.waitFor(() => expect(document.body.textContent).not.toContain("Fixture profile"));
  expect(h.journal().read()?.contributionId).toBe(f.receipt.contribution_id); expect(h.walletInvocations()).toBe(0);
});
test("pagehide clears private payment projections while retaining the durable journal", async () => {
  const { h } = mount(); await reserve(); window.dispatchEvent(new Event("pagehide")); flush();
  expect(document.body.textContent).not.toContain("Original contribution"); expect(h.journal().read()?.contributionId).toBe(f.receipt.contribution_id); expect(h.walletInvocations()).toBe(0);
});
