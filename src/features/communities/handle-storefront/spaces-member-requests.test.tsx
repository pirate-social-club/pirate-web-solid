import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { ApiClientError, type GetUsersMeSpacesHandleRequestsResponse } from "@pirate/api-client";
import type { SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import { spacesMemberAttemptKey } from "./spaces-member-attempt.ts";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import { safeReturnPath } from "../../auth/sign-in-return.ts";
import { SpacesMemberRequests } from "./spaces-member-requests.tsx";

type Item = GetUsersMeSpacesHandleRequestsResponse["items"][number];
const hash = "a".repeat(64), at = "2026-10-20T00:00:00.000Z";
function retained(root: string, id: string, state: "issuance_pending" | "issued" | "issuance_failed" = "issuance_pending", grantStatus: "active" | "revoked" | "tombstoned" = "active"): Item {
  const common = { offering_id: `offering-${id}`, offering_hash: hash, sale_namespace_activation_id: `activation-${id}`,
    sale_namespace_activation_generation: 1, owner_persona_id: `persona-${id}`, fulfillment: { kind: "spaces_native_v1" },
    handle: { family: "spaces", namespace_root: root, handle_label: "original-name" } } as const;
  const grant = { ...common, grant_id: `grant-${id}`, grant_generation: 1, community_id: `community-${id}`, claim_id: `claim-${id}`,
    display_identifier: `original-name@${root}`, status: grantStatus, issued_at: at, revoked_at: null, tombstoned_at: null } as const;
  return { kind: "claim", action: { action_id: `action-${id}`, endpoint_template: "/handle-claims", idempotency_key: `key-${id}`, request_hash: hash, committed_at: at },
    context: { community_id: `community-${id}`, offering_id: common.offering_id, offering_revision: 1, offering_hash: hash,
      sale_namespace_activation_id: common.sale_namespace_activation_id, sale_namespace_activation_generation: 1, owner_persona_id: common.owner_persona_id,
      network: "regtest", namespace_root: root },
    claim: { ...common, claim_id: `claim-${id}`, quote_id: `quote-${id}`, reservation_id: `reservation-${id}`, reservation_hash: hash,
      recipient: { kind: "persona_taproot_v1", network: "regtest", script_pubkey_hex: `5120${hash}` },
      display_identifier: `original-name@${root}`, payment: { kind: "not_required_v1", pricing_revision: 1, pricing_hash: hash, atomic_amount: "0", status: "not_applicable" },
      state, delayed: false, safe_reason: null, grant: state === "issued" ? grant : null, created_at: at, updated_at: at } };
}
const page = (items: readonly Item[] = []): GetUsersMeSpacesHandleRequestsResponse => ({ object: "spaces_member_request_readback_v1",
  coverage: "retained_committed_actions_with_stored_scope", scope_incomplete_actions: "omitted_when_scope_unprovable",
  unlocated_request_outcome: "unknown", new_submission_admission: "not_established_by_readback", items, next_cursor: null });
const disposers: Array<() => void> = [];
function mount(ui: () => JSX.Element) {
  const element = document.createElement("div"); document.body.appendChild(element);
  let setAccount: (value: ApplicationSessionState) => void = () => {};
  let setPending: (value: boolean) => void = () => {};
  createRoot(dispose => {
    const [account, changeAccount] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-a" });
    const [pending, changePending] = createSignal(false);
    setAccount = changeAccount; setPending = changePending;
    solidRender(() => <ApplicationSessionProvider state={account} pending={pending}>{ui()}</ApplicationSessionProvider>, element);
    disposers.push(() => { dispose(); element.remove(); });
  });
  return { element, setAccount, setPending };
}
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); localStorage.clear(); document.head.replaceChildren(); });

test("the real private page keeps empty results unknown, with a safe check and no new claim action", async () => {
  const get = vi.fn(async () => page());
  const { element } = mount(() => <SpacesMemberRequests client={{ get_usersMeSpacesHandleRequests: get }} />);
  await vi.waitFor(() => expect(element.textContent).toContain("The earlier outcome is unknown"));
  const check = [...element.querySelectorAll("button")].find(button => button.textContent === "Check requests");
  check?.click();
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  expect(element.textContent).toContain("does not mean a name is available");
  expect(element.textContent).not.toContain("Retry original request");
  expect(element.querySelector('a[href="/settings"]')).not.toBeNull();
});

test("two original roots and private grant states remain reachable without persona or offering discovery", async () => {
  const get = vi.fn(async () => page([retained("first-root", "pending"), retained("second-root", "issued", "issued"),
    retained("revoked-root", "revoked", "issued", "revoked"), retained("removed-root", "removed", "issued", "tombstoned"), retained("failed-root", "failed", "issuance_failed")]));
  const { element } = mount(() => <SpacesMemberRequests client={{ get_usersMeSpacesHandleRequests: get }} />);
  await vi.waitFor(() => expect(element.textContent).toContain("Name revoked here"));
  expect(element.textContent).toContain("Registration pending");
  expect(element.textContent).toContain("Only you can see this requested name");
  expect(element.textContent).toContain("original-name@second-root is registered");
  expect(element.textContent).toContain("Name removed here");
  expect(element.textContent).toContain("Registration needs attention");
  expect(element.querySelector('a[href="/c/community-pending/name-order/claim-pending"]')).not.toBeNull();
  expect(element.querySelector('a[href="/c/community-issued/name-order/claim-issued"]')).not.toBeNull();
  expect(get).toHaveBeenCalledTimes(1);
});

test("pending session revalidation clears private cards and rejects a late response from the previous account", async () => {
  let complete: (value: GetUsersMeSpacesHandleRequestsResponse) => void = () => {};
  const delayed = new Promise<GetUsersMeSpacesHandleRequestsResponse>(resolve => { complete = resolve; });
  const get = vi.fn(async () => page([retained("first-root", "first")]));
  const { element, setPending, setAccount } = mount(() => <SpacesMemberRequests client={{ get_usersMeSpacesHandleRequests: get }} />);
  await vi.waitFor(() => expect(element.textContent).toContain("@first-root"));
  get.mockImplementationOnce(() => delayed);
  [...element.querySelectorAll("button")].find(button => button.textContent === "Check requests")?.click();
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  setPending(true);
  await vi.waitFor(() => expect(element.textContent).not.toContain("@first-root"));
  expect(element.querySelector("[data-spaces-member-request]")).toBeNull();
  setAccount({ status: "authenticated", userId: "account-b" });
  get.mockResolvedValue(page([retained("second-root", "second")])); setPending(false);
  await vi.waitFor(() => expect(element.textContent).toContain("@second-root"));
  complete(page([retained("first-root", "late")]));
  await Promise.resolve();
  expect(element.textContent).not.toContain("@first-root");
  setAccount("anonymous");
  await vi.waitFor(() => expect(element.textContent).not.toContain("@second-root"));
  const href = element.querySelector<HTMLAnchorElement>('a[href^="/auth/sign-in"]')?.getAttribute("href");
  expect(href).toBe("/auth/sign-in?return_to=%2Fspaces-name-requests");
  expect(safeReturnPath(new URL(href ?? "", "https://pirate.sc").searchParams.get("return_to"), "https://pirate.sc")).toBe("/spaces-name-requests");
});

test("a partial quote refusal remains honest about its missing original scope", async () => {
  const partial: Item = { kind: "quote_refusal", action: { action_id: "partial", endpoint_template: "/handle-quotes", idempotency_key: "partial-key", request_hash: hash, committed_at: at },
    offering_id: "original-offering", owner_persona_id: "original-persona", result_kind: "eligibility_required", reason: "evidence_required", immutable_context: "not_recorded" };
  const get = vi.fn(async () => page([partial]));
  const { element } = mount(() => <SpacesMemberRequests client={{ get_usersMeSpacesHandleRequests: get }} />);
  await vi.waitFor(() => expect(element.textContent).toContain("were not retained by the service"));
  expect(element.textContent).toContain("original-offering");
  expect(element.querySelector('a[href*="name-order"]')).toBeNull();
});

test.each(["account-change", "server-401"] as const)("the original command is retained while %s blocks private presentation and continuation", async invalidation => {
  const key = spacesMemberAttemptKey("account-a", "community-original", "activation-original");
  localStorage.setItem(key, JSON.stringify({ version: 1, accountId: "account-a", communityId: "community-original", personaId: "persona-original",
    desiredLabel: "original-name", phase: "confirmation", keys: { confirmation: "original-confirm", quote: "original-quote", reservation: "original-reservation", claim: "original-claim" },
    original: { offering_id: "offering-original", offering_revision: 1, offering_hash: hash, sale_namespace_activation_id: "activation-original",
      sale_namespace_activation_generation: 1, namespace_root: "first-root" } }));
  type Confirmation = Awaited<ReturnType<SessionHandleSalesApiClient["post_handlePersonaLinkConfirmations"]>>;
  let finish: (value: Confirmation) => void = () => {};
  const delayed = new Promise<Confirmation>(resolve => { finish = resolve; });
  const mutationClient = {
    get_personas: vi.fn<SessionHandleSalesApiClient["get_personas"]>(),
    get_handleClaimsClaimId: vi.fn<SessionHandleSalesApiClient["get_handleClaimsClaimId"]>(),
    post_handlePersonaLinkConfirmations: vi.fn<SessionHandleSalesApiClient["post_handlePersonaLinkConfirmations"]>(() => delayed),
    post_handleQuotes: vi.fn<SessionHandleSalesApiClient["post_handleQuotes"]>(),
    post_handleReservations: vi.fn<SessionHandleSalesApiClient["post_handleReservations"]>(),
    post_handleClaims: vi.fn<SessionHandleSalesApiClient["post_handleClaims"]>(),
  };
  let refuseRead = () => {};
  const pendingRead = new Promise<GetUsersMeSpacesHandleRequestsResponse>((_resolve, reject) => { refuseRead = () => reject(new ApiClientError(
    { status: 401, code: "unauthorized", name: "Unauthorized", retryable: false }, { error: { code: "unauthorized", message: "Sign in required", retryable: false } })); });
  const get = vi.fn(async () => invalidation === "server-401" ? pendingRead : page());
  const { element, setAccount } = mount(() => <SpacesMemberRequests client={{ get_usersMeSpacesHandleRequests: get }} mutationClient={mutationClient} readCsrf={() => "csrf-test"} />);
  await vi.waitFor(() => expect(element.textContent).toContain("Retained request: original-name@first-root"));
  const originalButton = [...element.querySelectorAll("button")].find(button => button.textContent === "Retry original request");
  originalButton?.click();
  await vi.waitFor(() => expect(mutationClient.post_handlePersonaLinkConfirmations).toHaveBeenCalledTimes(1));
  expect(mutationClient.post_handlePersonaLinkConfirmations).toHaveBeenCalledWith({ body: {
    idempotency_key: "original-confirm", persona_id: "persona-original", offering_id: "offering-original", confirmed: true,
  } }, expect.objectContaining({ credentials: "same-origin", signal: expect.any(AbortSignal) }));
  if (invalidation === "server-401") refuseRead();
  else setAccount({ status: "authenticated", userId: "account-b" });
  await vi.waitFor(() => expect(element.textContent).not.toContain("@first-root"));
  if (invalidation === "server-401") {
    expect(element.textContent).toContain("Sign in to see your requests");
    expect(element.textContent).not.toContain("Retry original request");
    originalButton?.click();
  }
  finish({ confirmation_id: "confirmation-original", confirmation_hash: hash, persona_id: "persona-original", offering_id: "offering-original",
    target_community_id: "community-original", family: "spaces", namespace_root: "first-root", status: "available", public_linkage_generation: 1,
    persona_public_identity_digest: hash, confirmed_at: at, expires_at: at, replayed: true });
  await Promise.resolve(); await Promise.resolve();
  expect(mutationClient.post_handlePersonaLinkConfirmations).toHaveBeenCalledTimes(1);
  expect(mutationClient.post_handleQuotes).not.toHaveBeenCalled();
  expect(mutationClient.post_handleReservations).not.toHaveBeenCalled();
  expect(mutationClient.post_handleClaims).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toContain("account-a");
  expect(element.textContent).not.toContain("@first-root");
});
