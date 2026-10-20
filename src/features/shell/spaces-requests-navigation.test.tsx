import { render, type JSX } from "@solidjs/web";
import { createRoot, createSignal, sharedConfig } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { ApiClientError, type GetUsersMeSpacesHandleRequestsResponse } from "@pirate/api-client";
import { ApplicationSessionProvider, type ApplicationSessionState } from "./application-session.tsx";
import { SpacesRequestsNavigation, type SpacesRequestsNavigationProps } from "./spaces-requests-navigation.tsx";
import { spacesMemberAttemptKey } from "../communities/handle-storefront/spaces-member-attempt.ts";

type Page = GetUsersMeSpacesHandleRequestsResponse;
const item: Page["items"][number] = { kind: "quote_refusal", action: { action_id: "earlier-action", endpoint_template: "/handle-quotes", idempotency_key: "original-key", request_hash: "a".repeat(64), committed_at: "2026-10-20T00:00:00Z" }, offering_id: "earlier-offering", owner_persona_id: "earlier-persona", result_kind: "eligibility_required", reason: "evidence_required", immutable_context: "not_recorded" };
const page = (items: Page["items"] = []): Page => ({ object: "spaces_member_request_readback_v1", coverage: "retained_committed_actions_with_stored_scope", scope_incomplete_actions: "omitted_when_scope_unprovable", unlocated_request_outcome: "unknown", new_submission_admission: "not_established_by_readback", items, next_cursor: null });
const disposers: Array<() => void> = [];
function mount(props: Omit<SpacesRequestsNavigationProps, "navigate"> = {}) {
  const element = document.createElement("div"); document.body.appendChild(element);
  let setAccount: (value: ApplicationSessionState) => void = () => {};
  let setPending: (value: boolean) => void = () => {};
  const navigate = vi.fn();
  createRoot(dispose => {
    const [account, changeAccount] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-a" });
    const [pending, changePending] = createSignal(false);
    setAccount = changeAccount; setPending = changePending;
    render((): JSX.Element => <ApplicationSessionProvider state={account} pending={pending}><SpacesRequestsNavigation navigate={navigate} {...props} /></ApplicationSessionProvider>, element);
    disposers.push(() => { dispose(); element.remove(); });
  });
  return { element, navigate, setAccount, setPending, button: () => element.querySelector("button") };
}
function localAttempt(accountId = "account-a") {
  localStorage.setItem(spacesMemberAttemptKey(accountId, "community-original", "activation-original"), JSON.stringify({ version: 1, accountId, communityId: "community-original", personaId: "persona-original", desiredLabel: "earlier-name", phase: "confirmation", keys: { confirmation: "original-confirm", quote: "original-quote", reservation: "original-reservation", claim: "original-claim" }, original: { offering_id: "original-offering", offering_revision: 1, offering_hash: "a".repeat(64), sale_namespace_activation_id: "activation-original", sale_namespace_activation_generation: 1, namespace_root: "original-root" } }));
}
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); localStorage.clear(); delete document.documentElement.dataset.spacesNameRequests; vi.restoreAllMocks(); });

test("a disabled deployment with empty history has no recovery navigation", async () => {
  const get = vi.fn(async () => page());
  const view = mount({ enabled: false, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(view.button()).toBeNull();
});

test("explicit presentation enablement keeps empty recovery reachable without admitting a registration", async () => {
  const get = vi.fn(async () => page());
  const view = mount({ enabled: true, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(view.button()).not.toBeNull());
  view.button()?.click();
  expect(view.navigate).toHaveBeenCalledWith("/spaces-name-requests");
  expect(view.element.textContent).not.toContain("Create");
});

test("validated server history keeps recovery visible when new registration presentation is off", async () => {
  const get = vi.fn(async () => page([item]));
  const view = mount({ enabled: false, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(view.button()).not.toBeNull());
  expect(view.element.textContent).not.toContain("earlier-persona");
  expect(view.element.textContent).not.toContain("earlier-offering");
  expect(get).toHaveBeenCalledTimes(1);
});

test("a validated original local intent keeps recovery reachable during a service outage", async () => {
  localAttempt();
  const get = vi.fn(async () => { throw new Error("unavailable"); });
  const view = mount({ enabled: false, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(view.button()).not.toBeNull();
  expect(view.element.textContent).not.toContain("earlier-name");
  view.setAccount({ status: "authenticated", userId: "account-a" });
  await Promise.resolve();
  expect(view.button()).not.toBeNull();
});

test("private reads and local intent checks wait for the hydration completion callback", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(sharedConfig, "onHydrationEnd");
  const callbacks: Array<() => void> = [];
  Object.defineProperty(sharedConfig, "onHydrationEnd", { configurable: true, value: (callback: () => void) => callbacks.push(callback) });
  try {
    localAttempt();
    const get = vi.fn(async () => page());
    const view = mount({ enabled: false, client: { get_usersMeSpacesHandleRequests: get } });
    await vi.waitFor(() => expect(callbacks).toHaveLength(1));
    expect(get).not.toHaveBeenCalled();
    expect(view.button()).toBeNull();
    callbacks[0]?.();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(view.button()).not.toBeNull();
  } finally {
    if (descriptor) Object.defineProperty(sharedConfig, "onHydrationEnd", descriptor);
    else Reflect.deleteProperty(sharedConfig, "onHydrationEnd");
  }
});

test.each(["other-account", "malformed"])("%s local storage cannot reveal the entry", async kind => {
  localAttempt(kind === "other-account" ? "account-b" : "account-a");
  if (kind === "malformed") localStorage.setItem(spacesMemberAttemptKey("account-a", "community-original", "activation-original"), '{"version":1}');
  const get = vi.fn(async () => page());
  const view = mount({ enabled: false, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(view.button()).toBeNull();
});

test("a real401 clears both explicit enablement and retained local history until session resolution changes", async () => {
  localAttempt();
  let reject: (reason: unknown) => void = () => {};
  const result = new Promise<Page>((_resolve, refuse) => { reject = refuse; });
  const get = vi.fn(() => result);
  const view = mount({ enabled: true, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(view.button()).not.toBeNull());
  reject(new ApiClientError({ status: 401, code: "unauthorized", name: "Unauthorized", retryable: false }, { error: { code: "unauthorized", message: "Sign in required", retryable: false } }));
  await vi.waitFor(() => expect(view.button()).toBeNull());
  expect(get).toHaveBeenCalledTimes(1);
});

test("account switches and pending checks clear private history and reject late account-A results", async () => {
  let complete: (value: Page) => void = () => {};
  const delayed = new Promise<Page>(resolve => { complete = resolve; });
  const get = vi.fn<NonNullable<SpacesRequestsNavigationProps["client"]>["get_usersMeSpacesHandleRequests"]>().mockReturnValueOnce(delayed).mockResolvedValue(page());
  const view = mount({ enabled: false, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  const originalSignal = get.mock.calls[0]?.[1]?.signal;
  view.setPending(true);
  await vi.waitFor(() => expect(originalSignal?.aborted).toBe(true));
  expect(view.button()).toBeNull();
  view.setAccount({ status: "authenticated", userId: "account-b" }); view.setPending(false);
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  complete(page([item]));
  await Promise.resolve(); await Promise.resolve();
  expect(view.button()).toBeNull();
  view.setAccount("anonymous");
  expect(view.button()).toBeNull();
});

test("known history disappears during a same-account session recheck and logout", async () => {
  const get = vi.fn(async () => page([item]));
  const view = mount({ enabled: false, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(view.button()).not.toBeNull());
  view.setPending(true);
  await vi.waitFor(() => expect(view.button()).toBeNull());
  view.setPending(false);
  await vi.waitFor(() => expect(view.button()).not.toBeNull());
  view.setAccount("anonymous");
  await vi.waitFor(() => expect(view.button()).toBeNull());
});

test("the browser hydration flag accepts only the exact enabled value", async () => {
  document.documentElement.dataset.spacesNameRequests = "true";
  const get = vi.fn(async () => page());
  const view = mount({ client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(view.button()).toBeNull();
});

test("the first page is bounded and never follows a returned pagination cursor", async () => {
  const get = vi.fn<NonNullable<SpacesRequestsNavigationProps["client"]>["get_usersMeSpacesHandleRequests"]>(async () => ({ ...page([item]), next_cursor: "smr1.bmV4dA" }));
  const view = mount({ enabled: false, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(view.button()).not.toBeNull());
  expect(get.mock.calls[0]?.[0]?.query).toEqual({ limit: "20" });
  expect(get.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(get).toHaveBeenCalledTimes(1);
});

test("the read deadline aborts an unresponsive client and late history cannot reveal navigation", async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => nativeTimeout(25));
  let complete: (value: Page) => void = () => {};
  const delayed = new Promise<Page>(resolve => { complete = resolve; });
  const get = vi.fn<NonNullable<SpacesRequestsNavigationProps["client"]>["get_usersMeSpacesHandleRequests"]>(() => delayed);
  const view = mount({ enabled: false, client: { get_usersMeSpacesHandleRequests: get } });
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  expect(timeout).toHaveBeenCalledWith(4_000);
  await vi.waitFor(() => expect(get.mock.calls[0]?.[1]?.signal?.aborted).toBe(true));
  complete(page([item]));
  await Promise.resolve(); await Promise.resolve();
  expect(view.button()).toBeNull();
});
