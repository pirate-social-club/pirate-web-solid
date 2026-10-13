// @vitest-environment-options {"jsdom":{"url":"https://app.pirate.test"}}
import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import type { OwnerStudyFinancialApi } from "./guest-study-financial-api";
import type { GuestStudyAccountingApi } from "./guest-study-accounting-api";
import { createPageGuestAuthorityStore } from "./guest-authority-selection";
import { OwnerStudyRecoveryControls } from "./owner-study-recovery-controls";
import { serializedOwnerLocks } from "./owner-study-test-fixtures";
const cleanups: (() => void)[] = [];
function mount(ui: () => JSX.Element) { const node = document.createElement("div"); document.body.appendChild(node);
  let dispose = () => {}; createRoot(rootDispose => { dispose = rootDispose; solidRender(ui, node); }); cleanups.push(() => { dispose(); node.remove(); }); return node; }
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.unstubAllGlobals(); });
const participation = { participation_id: "original-participation", pool_leg_id: "original-leg", original_drawing_id: "7", admission_state: "admitted",
  purchase_state: "confirmed", purchase_safety_deadline_at: "2026-10-13T00:00:00.000Z", reconciliation_state: "resolved", purchase_deadline_passed: true,
  allocation_id: "allocation-original", credit_id: "credit-original", amount_atomic: "5" } as const;
const credit: Awaited<ReturnType<OwnerStudyFinancialApi["getCredit"]>> = { object: "owner_reward_credit_v1", credit_id: "credit-original", identity_version: "owner_v1",
  owner_id: "owner-original", community_id: "community-1", pool_leg_id: "original-leg", original_drawing_id: "7", chain_id: 84532,
  token_address: `0x${"1".repeat(40)}`, token_decimals: 6, amount_atomic: "5", available_atomic: "5", reserved_atomic: "0", paid_atomic: "0",
  source_kind: "megapot_allocation", state: "credited", created_at: "2026-10-13T00:00:00.000Z", updated_at: "2026-10-13T00:00:00.000Z", settled_at: null,
  claim: { status: "unclaimed", payout_status: null }, send: null, recipient: { kind: "guest_owner", selection: null, binding: null } };
function button(node: HTMLElement, text: string) { const b = [...node.querySelectorAll("button")].find(v => v.textContent?.trim() === text); if (b === undefined) throw new Error(`Missing action ${text}`); return b; }
const actor = { status: "authenticated", userId: "current-canonical-B", personas: [] } as const;
const unused = async (): Promise<never> => { throw new Error("Unexpected effect"); };
function finance(): OwnerStudyFinancialApi { return { getRewardPreview: unused, startSession: unused, getSession: unused, findStartOperation: unused, submitAnswer: unused,
  listParticipations: vi.fn<OwnerStudyFinancialApi["listParticipations"]>(async () => ({ object: "owner_participation_list_v1", items: [participation], next_cursor: null })), getParticipation: unused,
  listCredits: vi.fn<OwnerStudyFinancialApi["listCredits"]>(async () => ({ object: "owner_reward_credit_list_v1", items: [credit], next_cursor: null })), getCredit: vi.fn(async () => credit) }; }

test("after binding Account reads original participations/held credits with no persona or Guest proof prerequisite", async () => {
  const api = finance(); const node = mount(() => <OwnerStudyRecoveryControls finance={api} originalAccountId="original-A" store={createPageGuestAuthorityStore()}
    locks={serializedOwnerLocks()} resolveAccount={async () => actor} accounting={{ prepareAttachment: unused, confirmAttachment: unused, getAttachment: unused, selectCreditRecipient: unused, claimCredit: unused }} />);
  button(node, "Read Account rewards").click(); await vi.waitFor(() => expect(node.textContent).toContain("original drawing 7"));
  expect(api.listParticipations).toHaveBeenCalledOnce(); expect(api.listCredits).toHaveBeenCalledOnce();
  expect(node.textContent).toContain("Original attachment target: original-A"); expect(node.textContent).toContain("held");
  const calls = vi.mocked(api.listParticipations).mock.calls;
  expect(calls[0]?.[0]).toEqual({ query: { limit: "100" } });
  button(node, "Select or retry original recipient").click(); await Promise.resolve();
  // No implicit persona is selected, and no Guest fallback exists in this component.
  expect(node.textContent).toContain("Choose the payout persona");
});
test("unknown claim reload retries persisted original revision/key before considering a changed selection", async () => {
  const store = createPageGuestAuthorityStore();
  await store.update(j => { j.ownerCreditCommands = [{ accountId: actor.userId, creditId: credit.credit_id, kind: "owner_claim", state: "submitted",
    body: { idempotency_key: "original-claim", selection_revision: 1 } }]; });
  const newer = { ...credit, recipient: { kind: "guest_owner" as const, selection: { revision: 2, persona_id: "later-persona", selected_at: "2026-10-13T01:00:00.000Z" }, binding: null } };
  const api = finance(); api.getCredit = vi.fn(async () => newer); api.listCredits = vi.fn<OwnerStudyFinancialApi["listCredits"]>(async () => ({ object: "owner_reward_credit_list_v1", items: [newer], next_cursor: null }));
  const claims = vi.fn<GuestStudyAccountingApi["claimCredit"]>(async input => {
    expect((await store.read()).ownerCreditCommands?.[0]?.body.idempotency_key).toBe("original-claim");
    expect(input).toEqual({ path: { creditId: "credit-original" }, body: { idempotency_key: "original-claim", selection_revision: 1 } }); throw new Error("Original COMMIT unresolved");
  });
  const node = mount(() => <OwnerStudyRecoveryControls finance={api} store={store} locks={serializedOwnerLocks()} resolveAccount={async () => actor}
    accounting={{ prepareAttachment: unused, confirmAttachment: unused, getAttachment: unused, selectCreditRecipient: unused, claimCredit: claims }} />);
  button(node, "Read Account rewards").click(); await vi.waitFor(() => expect(node.textContent).toContain("from original drawing 7"));
  button(node, "Claim or retry original credit").click(); await vi.waitFor(() => expect(claims).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(node.textContent).toContain("unresolved")); expect((await store.read()).ownerCreditCommands?.[0]?.state).toBe("submitted");
});

test("A to B pagination resets cursors, visible rewards and choices without deleting A commands", async () => {
  const store = createPageGuestAuthorityStore();
  await store.update(j => { j.ownerCreditCommands = [{ accountId: "account-A", creditId: credit.credit_id, kind: "owner_claim", state: "submitted", body: { idempotency_key: "A-key", selection_revision: 1 } }]; });
  let account = { ...actor, userId: "account-A" };
  const api = finance();
  api.listCredits = vi.fn<OwnerStudyFinancialApi["listCredits"]>(async () => ({ object: "owner_reward_credit_list_v1", items: account.userId === "account-A" ? [credit] : [], next_cursor: account.userId === "account-A" ? "A-cursor" : null }));
  api.listParticipations = vi.fn<OwnerStudyFinancialApi["listParticipations"]>(async () => ({ object: "owner_participation_list_v1", items: account.userId === "account-A" ? [participation] : [], next_cursor: null }));
  const node = mount(() => <OwnerStudyRecoveryControls finance={api} store={store} locks={serializedOwnerLocks()} resolveAccount={async () => account}
    accounting={{ prepareAttachment: unused, confirmAttachment: unused, getAttachment: unused, selectCreditRecipient: unused, claimCredit: unused }} />);
  button(node, "Read Account rewards").click(); await vi.waitFor(() => expect(node.textContent).toContain("from original drawing 7"));
  account = { ...actor, userId: "account-B" }; button(node, "Read more original rewards").click();
  await vi.waitFor(() => expect(api.listCredits).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(node.textContent).not.toContain("from original drawing 7"));
  expect(vi.mocked(api.listCredits).mock.calls[1]?.[0]).toEqual({ query: { limit: "100" } });
  expect((await store.read()).ownerCreditCommands?.[0]?.body.idempotency_key).toBe("A-key");
});
test("a foreign asset response cannot clear the original command or enter Very", async () => {
  const store = createPageGuestAuthorityStore(), api = finance();
  const claims = vi.fn<GuestStudyAccountingApi["claimCredit"]>(async () => ({ outcome: "verification_missing", credit: { ...credit, token_decimals: 18 } }));
  const node = mount(() => <OwnerStudyRecoveryControls finance={api} store={store} locks={serializedOwnerLocks()} resolveAccount={async () => actor}
    accounting={{ prepareAttachment: unused, confirmAttachment: unused, getAttachment: unused, selectCreditRecipient: unused, claimCredit: claims }} />);
  // Account-source claim uses null selection revision, without a default persona.
  const accountCredit = { ...credit, recipient: { kind: "account_owner" as const, original_persona_id: "original-persona", selection: null, binding: { persona_id: "original-persona", bound_at: credit.created_at, selection_revision: null } } };
  api.getCredit = vi.fn(async () => accountCredit);
  button(node, "Read Account rewards").click(); await vi.waitFor(() => expect(node.textContent).toContain("from original drawing 7"));
  button(node, "Claim or retry original credit").click(); await vi.waitFor(() => expect(claims).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(node.textContent).toContain("unresolved"));
  expect((await store.read()).ownerCreditCommands?.[0]?.state).toBe("submitted");
});
test("paid original credit says sent rather than held", async () => {
  const api = finance(); api.listCredits = vi.fn<OwnerStudyFinancialApi["listCredits"]>(async () => ({ object: "owner_reward_credit_list_v1", items: [{ ...credit, claim: { status: "accepted", payout_status: "confirmed" } }], next_cursor: null }));
  const node = mount(() => <OwnerStudyRecoveryControls finance={api} store={createPageGuestAuthorityStore()} locks={serializedOwnerLocks()} resolveAccount={async () => actor}
    accounting={{ prepareAttachment: unused, confirmAttachment: unused, getAttachment: unused, selectCreditRecipient: unused, claimCredit: unused }} />);
  button(node, "Read Account rewards").click(); await vi.waitFor(() => expect(node.textContent).toContain("Sent to your wallet"));
  expect(node.textContent).not.toContain("Held and owed");
});

test("anonymous re-read clears visible old Account and disables old credit commands", async () => {
  const api = finance(); let authenticated = true;
  const claims = vi.fn<GuestStudyAccountingApi["claimCredit"]>();
  const node = mount(() => <OwnerStudyRecoveryControls finance={api} store={createPageGuestAuthorityStore()} locks={serializedOwnerLocks()}
    resolveAccount={async () => authenticated ? actor : "anonymous"}
    accounting={{ prepareAttachment: unused, confirmAttachment: unused, getAttachment: unused, selectCreditRecipient: unused, claimCredit: claims }} />);
  button(node, "Read Account rewards").click(); await vi.waitFor(() => expect(node.textContent).toContain("from original drawing 7"));
  authenticated = false; button(node, "Read Account rewards").click();
  await vi.waitFor(() => expect(node.textContent).toContain("Recovery status is unknown"));
  expect(node.textContent).not.toContain("from original drawing 7"); expect(claims).not.toHaveBeenCalled();
});

test("B cannot mint a replacement command for an unresolved original A credit", async () => {
  const store = createPageGuestAuthorityStore();
  await store.update(j => { j.ownerCreditCommands = [{ accountId: "account-A", creditId: credit.credit_id, kind: "owner_claim", state: "submitted", body: { idempotency_key: "A-original", selection_revision: 1 } }]; });
  const api = finance(), before = await store.read();
  const claims = vi.fn<GuestStudyAccountingApi["claimCredit"]>();
  const node = mount(() => <OwnerStudyRecoveryControls finance={api} store={store} locks={serializedOwnerLocks()} resolveAccount={async () => actor}
    accounting={{ prepareAttachment: unused, confirmAttachment: unused, getAttachment: unused, selectCreditRecipient: unused, claimCredit: claims }} />);
  button(node, "Read Account rewards").click(); await vi.waitFor(() => expect(node.textContent).toContain("from original drawing 7"));
  button(node, "Claim or retry original credit").click(); await vi.waitFor(() => expect(node.textContent).toContain("Original selection or claim is unresolved"));
  expect(claims).not.toHaveBeenCalled(); expect(await store.read()).toEqual(before);
});

test("missing storage and WebLocks preserve Account liability reads but cannot submit a financial command", async () => {
  vi.stubGlobal("indexedDB", undefined);
  const withoutLocks = Object.create(navigator);
  Object.defineProperty(withoutLocks, "locks", { value: undefined });
  vi.stubGlobal("navigator", withoutLocks);
  const api = finance(), claims = vi.fn<GuestStudyAccountingApi["claimCredit"]>();
  const node = mount(() => <OwnerStudyRecoveryControls finance={api} resolveAccount={async () => actor}
    accounting={{ prepareAttachment: unused, confirmAttachment: unused, getAttachment: unused, selectCreditRecipient: unused, claimCredit: claims }} />);
  button(node, "Read Account rewards").click(); await vi.waitFor(() => expect(node.textContent).toContain("from original drawing 7"));
  expect(api.listParticipations).toHaveBeenCalledOnce(); expect(api.listCredits).toHaveBeenCalledOnce();
  button(node, "Claim or retry original credit").click(); await vi.waitFor(() => expect(node.textContent).toContain("Original selection or claim is unresolved"));
  expect(claims).not.toHaveBeenCalled(); expect(api.getCredit).not.toHaveBeenCalled();
});
