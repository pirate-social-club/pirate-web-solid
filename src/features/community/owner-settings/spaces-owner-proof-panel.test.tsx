import { render } from "@solidjs/web";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiClientError } from "@pirate/api-client";
import { createActor } from "xstate";
import { createSignal } from "solid-js";

import { SpacesOwnerProofPanel } from "./spaces-owner-proof-panel";
import type { SpacesOwnerProgress, SpacesOwnerProofApi } from "./spaces-owner-proof-api";
import { createSpacesCommandKeys, createSpacesOwnerProofMachine, type SpacesProofScope } from "./spaces-owner-proof-machine";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); sessionStorage.clear(); });
const scope: SpacesProofScope = { accountId: "account-1", communityId: "community-1", revision: 0 };
const challenge = { contract: "pirate-spaces-ownership-start-v1" as const, ceremony_id: "ceremony-1", generation: 1,
  network: "mainnet" as const, canonical_root: "yahoo", root_outpoint: "root:1", root_key_hex: "a".repeat(64),
  challenge_message: "Sign this message", challenge_digest_hex: "b".repeat(64), expires_at: "2030-01-01T20:00:00Z", replayed: false };
const verified = { contract: "pirate-spaces-ownership-result-v1" as const, ceremony_id: "ceremony-1", generation: 1,
  status: "verified" as const, namespace_authority_reference: "authority-1", namespace_authority_generation: 3,
  evidence_digest_hex: "a".repeat(64), observed_at: "2026-10-13T19:00:00Z", fresh_until: "2030-01-01T20:00:00Z", replayed: false };
const candidate = { operator_assignment_id: "assignment-1", generation: 2, network: "mainnet" as const,
  canonical_root: "yahoo", delegation_address: "bcs1poperator", replayed: false };
function progress(ceremony: SpacesOwnerProgress["ceremony"] = null,
  assignment: SpacesOwnerProgress["operator_assignment"] = null): SpacesOwnerProgress {
  return { contract: "pirate-spaces-ownership-progress-v1", network: "mainnet", canonical_root: "yahoo",
    read_at: "2026-10-13T19:00:00Z", ceremony, operator_assignment: assignment };
}
const pending = () => progress({ status: "verification_pending", challenge, pending_poll_key: "saved-poll-key" });
const fresh = (proof_status: "fresh" | "expired" | "root_changed" | "unavailable" | "superseded" = "fresh") =>
  progress({ status: "verified", challenge, result: verified, proof_status });
function fixture(initial = progress(), savedRoots: string[] = []) {
  let current = initial;
  const api = {
    roots: vi.fn<SpacesOwnerProofApi["roots"]>(async () => ({ items: savedRoots.map(canonical_root => ({ canonical_root })), next_cursor: null })),
    read: vi.fn<SpacesOwnerProofApi["read"]>(async ({ root }) => ({ ...current, canonical_root: root })),
    start: vi.fn<SpacesOwnerProofApi["start"]>(async () => { current = progress({ status: "awaiting_signature", challenge }); return challenge; }),
    poll: vi.fn<SpacesOwnerProofApi["poll"]>(async ({ idempotencyKey }) => {
      current = progress({ status: "verification_pending", challenge, pending_poll_key: idempotencyKey });
      return { contract: "pirate-spaces-ownership-result-v1", ceremony_id: "ceremony-1", generation: 1,
        status: "verification_pending", retry_after_seconds: 30, replayed: false };
    }),
    resume: vi.fn<SpacesOwnerProofApi["resume"]>(async () => { current = fresh(); return verified; }),
    assignment: vi.fn<SpacesOwnerProofApi["assignment"]>(async () => {
      current = { ...fresh(), operator_assignment: { ...candidate, status: "prepared", current: false } };
      return { candidate };
    }),
    confirmAssignment: vi.fn<SpacesOwnerProofApi["confirmAssignment"]>(async () => {
      current = { ...fresh(), operator_assignment: { ...candidate, status: "confirmed", current: true } };
      return candidate;
    }),
  };
  return { api, set: (value: SpacesOwnerProgress) => { current = value; } };
}
function mount(api: SpacesOwnerProofApi, accountId = "account-1", onBusyChange?: (busy: boolean) => void) {
  const node = document.createElement("div"); document.body.appendChild(node);
  const dispose = render(() => <SpacesOwnerProofPanel api={api} communityId="community-1" accountId={accountId} onBusyChange={onBusyChange} />, node);
  cleanups.push(() => { dispose(); node.remove(); });
  return node;
}
const button = (node: HTMLElement, label: string) => [...node.querySelectorAll("button")].find(value => value.textContent === label)!;
const ready = async (node: HTMLElement) => vi.waitFor(() => expect(node.textContent).not.toContain("Checking status…"));
function actorFixture(api: SpacesOwnerProofApi, options: { authorize?: Parameters<typeof createSpacesOwnerProofMachine>[0]["authorize"]; keys?: ReturnType<typeof createSpacesCommandKeys> } = {}) {
  let live = scope;
  const machine = createSpacesOwnerProofMachine({ api,
    authorize: options.authorize ?? (async at => at.accountId ?? undefined),
    isCurrent: at => JSON.stringify(at) === JSON.stringify(live),
    commandKey: options.keys ?? createSpacesCommandKeys(sessionStorage),
  });
  const actor = createActor(machine, { input: { scope } }).start();
  cleanups.push(() => actor.stop());
  return { actor, change: (next: SpacesProofScope) => { live = next; actor.send({ type: "SCOPE", scope: next }); }, invalidate: (next: SpacesProofScope) => { live = next; } };
}
const actorReady = async (actor: ReturnType<typeof actorFixture>["actor"]) => vi.waitFor(() => expect(actor.getSnapshot().matches("ready")).toBe(true));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("Spaces owner proof recovery", () => {
  test("offers sign-in when starting proof returns 401", async () => {
    const { api } = fixture();
    api.start.mockRejectedValue(new ApiClientError({ code: "auth_error", name: "AuthError", retryable: false, status: 401 },
      { error: { code: "auth_error", message: "Authentication required", retryable: false } }));
    const node = mount(api); await ready(node);
    const user = userEvent.setup();
    await user.type(node.querySelector<HTMLInputElement>("#spaces-owner-root")!, "@yahoo");
    await user.click(button(node, "Get ownership message"));
    await vi.waitFor(() => expect(node.querySelector("[data-owner-settings-sign-in]")).not.toBeNull());
    expect(node.textContent).toContain("Sign in required");
  });

  test("shows the prepared address and requires owner confirmation before delegation", async () => {
    const { api, set } = fixture();
    api.poll.mockImplementation(async () => { set(fresh()); return verified; });
    const node = mount(api); await ready(node);
    const user = userEvent.setup();
    await user.type(node.querySelector<HTMLInputElement>("#spaces-owner-root")!, "@yahoo");
    await user.click(button(node, "Get ownership message")); await ready(node);
    await user.type(node.querySelector<HTMLTextAreaElement>("#spaces-owner-signature")!, "c".repeat(128));
    await user.click(button(node, "Check signature")); await ready(node);
    expect(node.querySelector("[data-spaces-delegation-address]")).toBeNull();
    await user.click(button(node, "Check operator address")); await ready(node);
    expect(node.querySelector("[data-spaces-delegation-address]")?.textContent).toBe(candidate.delegation_address);
    // Prepared assignments are not current until confirmed; they must still be confirmable.
    await user.click(button(node, "Confirm this operator address")); await ready(node);
    expect(api.confirmAssignment.mock.calls[0]?.[0]).toMatchObject({ assignmentId: "assignment-1", generation: 2,
      authorityReference: "authority-1", authorityGeneration: 3 });
    expect(node.textContent).toContain("Delegate from your Spaces wallet");
    expect(node.textContent).not.toContain("Names are open");
  });

  test("shows the digest, submits only the signature, and resumes pending proof with the original key", async () => {
    const { api } = fixture(); const node = mount(api); await ready(node);
    const user = userEvent.setup();
    await user.type(node.querySelector<HTMLInputElement>("#spaces-owner-root")!, "@yahoo");
    await user.click(button(node, "Get ownership message")); await ready(node);
    expect(node.querySelector("[data-spaces-challenge-digest]")?.textContent).toContain("b".repeat(64));
    expect(node.textContent).toContain("sends no Bitcoin transaction");
    await user.type(node.querySelector<HTMLTextAreaElement>("#spaces-owner-signature")!, "c".repeat(128));
    await user.click(button(node, "Check signature")); await ready(node);
    expect(api.poll.mock.calls[0]?.[0]).toMatchObject({ ceremonyId: "ceremony-1", signatureHex: "c".repeat(128) });
    expect(node.textContent).toContain("Check this proof again");
    expect(node.querySelector("#spaces-owner-signature")).toBeNull();
    await user.click(button(node, "Check saved proof")); await ready(node);
    expect(api.resume.mock.calls[0]?.[0].idempotencyKey).toBe(api.poll.mock.calls[0]?.[0].idempotencyKey);
    expect(api.poll).toHaveBeenCalledTimes(1);
    expect(Object.values(sessionStorage).join(" ")).not.toContain("c".repeat(128));
  });

  test("reload discovers pending proof without a signature and uses the server's saved key", async () => {
    const { api } = fixture(pending(), ["yahoo"]);
    const node = mount(api); await ready(node);
    expect(node.querySelector("[data-spaces-challenge]")?.textContent).toBe(challenge.challenge_message);
    expect(node.querySelector("#spaces-owner-signature")).toBeNull();
    await userEvent.setup().click(button(node, "Check saved proof")); await ready(node);
    expect(api.resume.mock.calls[0]?.[0]).toEqual({ communityId: "community-1", ceremonyId: "ceremony-1", idempotencyKey: "saved-poll-key" });
    expect(api.start).not.toHaveBeenCalled(); expect(api.poll).not.toHaveBeenCalled();
  });

  test("pending continuation keeps the first poll's command identity", async () => {
    const { api } = fixture(); const node = mount(api); await ready(node);
    const user = userEvent.setup();
    await user.type(node.querySelector<HTMLInputElement>("#spaces-owner-root")!, "yahoo");
    await user.click(button(node, "Get ownership message")); await ready(node);
    await user.type(node.querySelector<HTMLTextAreaElement>("#spaces-owner-signature")!, "c".repeat(128));
    await user.click(button(node, "Check signature")); await ready(node);
    // Both the former signature control and the recovery control promise to continue this proof.
    await user.click(button(node, "Check saved proof") ?? button(node, "Check signature")); await ready(node);
    const first = api.poll.mock.calls[0]?.[0];
    const continuation = api.resume.mock.calls[0]?.[0] ?? api.poll.mock.calls[1]?.[0];
    expect(continuation?.ceremonyId).toBe(first?.ceremonyId);
    expect(continuation?.idempotencyKey).toBe(first?.idempotencyKey);
  });

  test("reload recovers a confirmed address even with expired proof without another confirmation", async () => {
    const initial = { ...fresh("expired"), operator_assignment: { ...candidate, status: "confirmed" as const, current: true } };
    const { api } = fixture(initial, ["yahoo"]); const node = mount(api); await ready(node);
    expect(node.textContent).toContain("Address confirmed");
    expect(node.querySelector("[data-spaces-delegation-address]")?.textContent).toBe(candidate.delegation_address);
    expect(button(node, "Confirm this operator address")).toBeUndefined();
    expect(api.confirmAssignment).not.toHaveBeenCalled();
  });

  test("discovers paged roots and requires explicit selection when several are saved", async () => {
    const { api } = fixture();
    api.roots.mockResolvedValueOnce({ items: [{ canonical_root: "yahoo" }], next_cursor: "next" })
      .mockResolvedValueOnce({ items: [{ canonical_root: "other" }], next_cursor: null });
    const node = mount(api); await ready(node);
    expect(api.read).not.toHaveBeenCalled(); expect(node.textContent).toContain("Choose a saved root");
    expect(api.roots.mock.calls[1]?.[0].cursor).toBe("next");
    await userEvent.setup().click(button(node, "@other")); await ready(node);
    expect(api.read.mock.calls[0]?.[0].root).toBe("other");
    await userEvent.setup().click(button(node, "Choose another root")); await ready(node);
    expect(node.querySelector<HTMLInputElement>("#spaces-owner-root")?.disabled).toBe(false);
    expect(button(node, "@yahoo")).toBeDefined(); expect(button(node, "@other")).toBeDefined();
    await userEvent.setup().click(button(node, "@yahoo")); await ready(node);
    expect(api.read.mock.calls.at(-1)?.[0].root).toBe("yahoo");
  });

  test("a rejected start with no saved effect leaves visible failure feedback", async () => {
    const { api } = fixture(); api.start.mockRejectedValue(new ApiClientError(
      { code: "provider_unavailable", name: "ProviderUnavailable", retryable: true, status: 502 },
      { error: { code: "provider_unavailable", message: "Provider unavailable", retryable: true } }));
    const node = mount(api); await ready(node); const user = userEvent.setup();
    await user.type(node.querySelector<HTMLInputElement>("#spaces-owner-root")!, "yahoo");
    await user.click(button(node, "Get ownership message")); await ready(node);
    expect(node.textContent).toContain("Couldn't start. Try again.");
    expect(button(node, "Choose another root").disabled).toBe(false);
    expect(api.start).toHaveBeenCalledTimes(1); expect(api.read).toHaveBeenCalledTimes(2);
  });

  test("Choose another root stays disabled through dispatch and uncertain readback", async () => {
    const { api, set } = fixture(); const write = deferred<typeof challenge>(); const readback = deferred<SpacesOwnerProgress>();
    api.start.mockReturnValue(write.promise);
    api.read.mockResolvedValueOnce(progress()).mockReturnValueOnce(readback.promise);
    const busy = vi.fn(); const node = mount(api, "account-1", busy); await ready(node); const user = userEvent.setup();
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    await user.type(node.querySelector<HTMLInputElement>("#spaces-owner-root")!, "yahoo");
    await user.click(button(node, "Get ownership message"));
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledTimes(1));
    expect(button(node, "Choose another root").disabled).toBe(true);
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(true));
    await user.click(button(node, "Choose another root"));
    expect(api.start.mock.calls[0]?.[1]?.aborted).toBe(false);
    write.resolve(challenge);
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    expect(button(node, "Choose another root").disabled).toBe(true);
    readback.resolve({ ...progress(), canonical_root: "wrong" });
    await vi.waitFor(() => expect(node.textContent).toContain("result is unknown"));
    expect(button(node, "Choose another root").disabled).toBe(true); expect(busy).toHaveBeenLastCalledWith(true);
    set(progress({ status: "awaiting_signature", challenge }));
    await user.click(button(node, "Refresh status")); await ready(node);
    expect(button(node, "Choose another root").disabled).toBe(false);
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    await user.click(button(node, "Choose another root")); await ready(node);
    expect(node.querySelector<HTMLInputElement>("#spaces-owner-root")?.disabled).toBe(false);
  });

  test.each(["expired", "root_changed", "superseded"] as const)("%s proof requires new evidence", async status => {
    const { api } = fixture(fresh(status), ["yahoo"]); const node = mount(api); await ready(node);
    expect(button(node, "Get ownership message")).toBeDefined();
    expect(button(node, "Check operator address")).toBeUndefined();
    expect(button(node, "Confirm this operator address")).toBeUndefined();
  });

  test("an unavailable observation is read-only and is not reported as a root change", async () => {
    const { api } = fixture(fresh("unavailable"), ["yahoo"]); const node = mount(api); await ready(node);
    expect(node.textContent).toContain("The chain could not be checked");
    expect(node.textContent).not.toContain("The root changed");
    expect(button(node, "Get ownership message")).toBeUndefined();
    expect(button(node, "Check operator address")).toBeUndefined();
  });

  test("an unanswered start is reconciled by readback, without another start", async () => {
    const { api, set } = fixture();
    api.start.mockImplementation(async () => { set(progress({ status: "awaiting_signature", challenge })); throw new Error("socket lost"); });
    const node = mount(api); await ready(node);
    const user = userEvent.setup();
    await user.type(node.querySelector<HTMLInputElement>("#spaces-owner-root")!, "yahoo");
    await user.click(button(node, "Get ownership message")); await ready(node);
    expect(node.querySelector("[data-spaces-challenge]")).not.toBeNull();
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(api.read).toHaveBeenCalledTimes(2);
  });

  test("account and community changes hide private state and reject late responses", async () => {
    const { api } = fixture(pending(), ["yahoo"]);
    const late = deferred<SpacesOwnerProgress>(); api.read.mockReturnValueOnce(late.promise);
    const [session, setSession] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-1" });
    const [community, setCommunity] = createSignal("community-1");
    const node = document.createElement("div"); document.body.appendChild(node);
    const dispose = render(() => <ApplicationSessionProvider state={session}><SpacesOwnerProofPanel api={api} communityId={community()} /></ApplicationSessionProvider>, node);
    cleanups.push(() => { dispose(); node.remove(); });
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(1));
    api.roots.mockResolvedValue({ items: [], next_cursor: null });
    setSession({ status: "authenticated", userId: "account-2" }); setCommunity("community-2");
    await ready(node); late.resolve(pending()); await new Promise(resolve => setTimeout(resolve, 0));
    expect(node.querySelector("[data-spaces-challenge]")).toBeNull();
    expect(api.read.mock.calls[0]?.[1]?.aborted).toBe(true);
    expect(api.resume).not.toHaveBeenCalled();
    setSession("anonymous");
    await vi.waitFor(() => expect(node.querySelector("[data-owner-settings-sign-in]")).not.toBeNull());
    setSession({ status: "authenticated", userId: "account-2" });
    await ready(node);
    expect(node.querySelector("[data-spaces-challenge]")).toBeNull();
  });

  test("unmount aborts entry read and does not render a late private response", async () => {
    const { api } = fixture(pending(), ["yahoo"]); const late = deferred<SpacesOwnerProgress>();
    api.read.mockReturnValue(late.promise);
    const node = document.createElement("div"); document.body.appendChild(node);
    const dispose = render(() => <SpacesOwnerProofPanel api={api} communityId="community-1" />, node);
    cleanups.push(() => node.remove());
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(1));
    dispose(); late.resolve(pending()); await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.read.mock.calls[0]?.[1]?.aborted).toBe(true);
    expect(node.querySelector("[data-spaces-challenge]")).toBeNull();
  });

  test("same-account sign-in return rediscovers the saved pending proof", async () => {
    const { api } = fixture(pending(), ["yahoo"]);
    const [session, setSession] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-1" });
    const node = document.createElement("div"); document.body.appendChild(node);
    const dispose = render(() => <ApplicationSessionProvider state={session}><SpacesOwnerProofPanel api={api} communityId="community-1" /></ApplicationSessionProvider>, node);
    cleanups.push(() => { dispose(); node.remove(); }); await ready(node);
    setSession("anonymous");
    await vi.waitFor(() => expect(node.querySelector("[data-owner-settings-sign-in]")).not.toBeNull());
    expect(node.querySelector("[data-spaces-challenge]")).toBeNull();
    setSession({ status: "authenticated", userId: "account-1" });
    await vi.waitFor(() => expect(node.querySelector("[data-spaces-challenge]")?.textContent).toBe(challenge.challenge_message));
    await userEvent.setup().click(button(node, "Check saved proof")); await ready(node);
    expect(api.resume.mock.calls[0]?.[0].idempotencyKey).toBe("saved-poll-key");
    expect(api.start).not.toHaveBeenCalled();
  });

  test("sign-in after an uncertain write reads its original root before unlocking the real panel", async () => {
    const { api } = fixture(progress(), ["yahoo", "other"]); const late = deferred<SpacesOwnerProgress>();
    api.read.mockResolvedValueOnce(progress()).mockResolvedValueOnce(progress()).mockRejectedValueOnce(new ApiClientError(
      { code: "auth_error", name: "AuthError", retryable: false, status: 401 },
      { error: { code: "auth_error", message: "Sign in required", retryable: false } })).mockReturnValueOnce(late.promise);
    const [session, setSession] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-1" });
    const busy = vi.fn(); const node = document.createElement("div"); document.body.appendChild(node);
    const dispose = render(() => <ApplicationSessionProvider state={session}>
      <SpacesOwnerProofPanel api={api} communityId="community-1" onBusyChange={busy} />
    </ApplicationSessionProvider>, node);
    cleanups.push(() => { dispose(); node.remove(); }); await ready(node); const user = userEvent.setup();
    await user.click(button(node, "@yahoo")); await ready(node);
    await user.click(button(node, "Get ownership message"));
    await vi.waitFor(() => expect(node.querySelector("[data-owner-settings-sign-in]")).not.toBeNull());
    expect(node.querySelector("[data-spaces-challenge]")).toBeNull();
    setSession("anonymous"); await new Promise(resolve => setTimeout(resolve, 0));
    setSession({ status: "authenticated", userId: "account-1" });
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(4));
    expect(api.read.mock.calls.at(-1)?.[0].root).toBe("yahoo"); expect(api.roots).toHaveBeenCalledTimes(1);
    expect(button(node, "Choose another root").disabled).toBe(true);
    await vi.waitFor(() => expect(busy).toHaveBeenLastCalledWith(true));
    late.resolve(progress({ status: "awaiting_signature", challenge })); await ready(node);
    expect(node.querySelector("[data-spaces-challenge]")?.textContent).toBe(challenge.challenge_message);
    expect(button(node, "Choose another root").disabled).toBe(false);
    await user.click(button(node, "Choose another root")); await ready(node);
    expect(button(node, "@other")).toBeDefined(); expect(api.start).toHaveBeenCalledTimes(1);
  });

  test("return to the page reads fresh status before showing command controls", async () => {
    const { api, set } = fixture(fresh(), ["yahoo"]); const node = mount(api); await ready(node);
    set(fresh("root_changed")); window.dispatchEvent(new Event("pageshow"));
    await vi.waitFor(() => expect(node.textContent).toContain("The root changed"));
    expect(button(node, "Check operator address")).toBeUndefined();
    expect(api.start).not.toHaveBeenCalled();
  });
});

describe("Spaces lifecycle effects", () => {
  test.each([false, true])("failed resume keeps feedback unless its readback changes (changed=%s)", async changed => {
    const { api, set } = fixture(pending(), ["yahoo"]); const { actor } = actorFixture(api); await actorReady(actor);
    api.resume.mockImplementation(async () => { if (changed) set(fresh()); throw new Error("response lost"); });
    actor.send({ type: "RESUME" }); await actorReady(actor);
    expect(actor.getSnapshot().context.unresolved).toBeUndefined();
    expect(actor.getSnapshot().context.notice).toBe(changed ? "" : "Couldn't check the proof. Try again.");
    if (!changed) {
      expect(actor.getSnapshot().context.progress?.ceremony).toMatchObject({ status: "verification_pending", pending_poll_key: "saved-poll-key" });
      actor.send({ type: "RESUME" }); await actorReady(actor);
      expect(api.resume.mock.calls.map(([input]) => input.idempotencyKey)).toEqual(["saved-poll-key", "saved-poll-key"]);
    }
  });

  test.each([false, true])("failed assignment compares against the older candidate (changed=%s)", async changed => {
    const initial = { ...fresh(), operator_assignment: { ...candidate, status: "prepared" as const, current: false } };
    const { api, set } = fixture(initial, ["yahoo"]); const { actor } = actorFixture(api); await actorReady(actor);
    api.assignment.mockImplementation(async () => {
      if (changed) set({ ...initial, operator_assignment: { ...initial.operator_assignment, generation: 3 } });
      throw new Error("response lost");
    });
    actor.send({ type: "ASSIGN" }); await actorReady(actor);
    expect(actor.getSnapshot().context.unresolved).toBeUndefined();
    expect(actor.getSnapshot().context.notice).toBe(changed ? "" : "Couldn't check the operator address. Try again.");
    expect(actor.getSnapshot().context.progress?.operator_assignment?.generation).toBe(changed ? 3 : 2);
  });

  test("same-account sign-in reconciles the original root before rediscovery or selection", async () => {
    const { api } = fixture(progress(), ["yahoo", "other"]); const late = deferred<SpacesOwnerProgress>();
    const rejection = new ApiClientError({ code: "auth_error", name: "AuthError", retryable: false, status: 401 },
      { error: { code: "auth_error", message: "Sign in required", retryable: false } });
    api.read.mockResolvedValueOnce(progress()).mockRejectedValueOnce(rejection).mockReturnValueOnce(late.promise);
    const harness = actorFixture(api); await actorReady(harness.actor);
    harness.actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(harness.actor.getSnapshot().matches("signInRequired")).toBe(true));
    const suspended = harness.actor.getSnapshot().context;
    expect(suspended.progress).toBeUndefined(); expect(suspended.prepared).toBeUndefined(); expect(suspended.command).toBeUndefined();
    expect(suspended.root).toBeUndefined(); expect(suspended.roots).toEqual([]);
    expect(suspended.suspended).toMatchObject({ accountId: "account-1", communityId: "community-1", root: "yahoo", command: { type: "start" } });
    expect(JSON.stringify(suspended.suspended)).not.toContain("challenge_message");
    harness.change({ ...scope, accountId: null, revision: 1 });
    expect(harness.actor.getSnapshot().context.suspended).toBeDefined();
    const returned = { ...scope, revision: 2 }; harness.change(returned);
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(3));
    expect(api.read.mock.calls.at(-1)?.[0].root).toBe("yahoo"); expect(api.roots).toHaveBeenCalledTimes(1);
    harness.actor.send({ type: "CHOOSE", scope: returned }); harness.actor.send({ type: "SELECT", root: "other", scope: returned });
    expect(harness.actor.getSnapshot().context.root).toBe("yahoo"); expect(api.start).toHaveBeenCalledTimes(1);
    late.resolve(progress({ status: "awaiting_signature", challenge })); await actorReady(harness.actor);
    expect(harness.actor.getSnapshot().context.suspended).toBeUndefined(); expect(harness.actor.getSnapshot().context.unresolved).toBeUndefined();
    expect(harness.actor.getSnapshot().context.notice).toBe(""); expect(api.roots).toHaveBeenCalledTimes(2);
    harness.actor.send({ type: "CHOOSE", scope: returned });
    expect(harness.actor.getSnapshot().context.roots).toEqual(["yahoo", "other"]);
  });

  test("same-account REFRESH after 401 reconciles without replaying the command", async () => {
    const { api } = fixture(); const rejection = new ApiClientError(
      { code: "auth_error", name: "AuthError", retryable: false, status: 401 },
      { error: { code: "auth_error", message: "Sign in required", retryable: false } });
    api.start.mockRejectedValueOnce(rejection);
    const { actor } = actorFixture(api); await actorReady(actor); actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("signInRequired")).toBe(true));
    actor.send({ type: "CHOOSE", scope }); actor.send({ type: "SELECT", root: "other", scope });
    expect(actor.getSnapshot().matches("signInRequired")).toBe(true);
    actor.send({ type: "REFRESH" }); await actorReady(actor);
    expect(api.start).toHaveBeenCalledTimes(1); expect(api.read).toHaveBeenCalledTimes(2);
    expect(actor.getSnapshot().context.notice).toBe("Couldn't start. Try again.");
    expect(actor.getSnapshot().context.suspended).toBeUndefined();
  });

  test.each(["account", "community"] as const)("a different %s discards suspended intent without reading its root", async change => {
    const { api } = fixture(); api.read.mockResolvedValueOnce(progress()).mockRejectedValueOnce(new ApiClientError(
      { code: "auth_error", name: "AuthError", retryable: false, status: 401 },
      { error: { code: "auth_error", message: "Sign in required", retryable: false } }));
    const harness = actorFixture(api); await actorReady(harness.actor); harness.actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(harness.actor.getSnapshot().matches("signInRequired")).toBe(true));
    harness.change({ ...scope, accountId: null, revision: 1 });
    harness.change({ ...scope, revision: 2, ...(change === "account" ? { accountId: "account-2" } : { communityId: "community-2" }) });
    await actorReady(harness.actor);
    expect(harness.actor.getSnapshot().context.suspended).toBeUndefined(); expect(harness.actor.getSnapshot().context.root).toBeUndefined();
    expect(api.read).toHaveBeenCalledTimes(2); expect(api.start).toHaveBeenCalledTimes(1);
  });

  test.each(["stop", "account", "community", "root"] as const)("%s during command read prevents dispatch", async change => {
    const { api } = fixture(); const harness = actorFixture(api); await actorReady(harness.actor);
    const late = deferred<SpacesOwnerProgress>(); api.read.mockReturnValueOnce(late.promise);
    harness.actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(1));
    if (change === "stop") harness.actor.stop();
    else if (change === "root") harness.actor.send({ type: "SELECT", root: "other", scope: { ...scope, revision: 1 } });
    else harness.change({ ...scope, ...(change === "account" ? { accountId: "account-2" } : { communityId: "community-2" }) });
    late.resolve(progress()); await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.start).not.toHaveBeenCalled(); expect(api.poll).not.toHaveBeenCalled();
  });

  test("live invocation reads, dispatches once and adopts readback, while a concurrent click is ignored", async () => {
    const { api } = fixture(); const { actor } = actorFixture(api); await actorReady(actor);
    const late = deferred<SpacesOwnerProgress>(); api.read.mockReturnValueOnce(late.promise);
    actor.send({ type: "START", root: "yahoo", scope }); actor.send({ type: "START", root: "yahoo", scope });
    late.resolve(progress()); await actorReady(actor);
    expect(api.start).toHaveBeenCalledTimes(1); expect(api.read).toHaveBeenCalledTimes(2);
    expect(actor.getSnapshot().context.progress?.ceremony?.challenge).toEqual(challenge);
  });

  test("invalidated scope between await and queued scope event prevents dispatch", async () => {
    const { api } = fixture(); const harness = actorFixture(api); await actorReady(harness.actor);
    const late = deferred<SpacesOwnerProgress>(); api.read.mockReturnValueOnce(late.promise);
    harness.actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(1));
    harness.invalidate({ ...scope, revision: 1 }); late.resolve(progress());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.start).not.toHaveBeenCalled();
  });

  test("stop during session resolution makes no read or write", async () => {
    const { api } = fixture(); const late = deferred<string>();
    const { actor } = actorFixture(api, { authorize: () => late.promise });
    actor.stop(); late.resolve("account-1"); await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.roots).not.toHaveBeenCalled(); expect(api.start).not.toHaveBeenCalled();
  });

  test("stop during the session check after command read prevents dispatch", async () => {
    const { api } = fixture(); const late = deferred<string>(); let checks = 0;
    const { actor } = actorFixture(api, { authorize: async () => ++checks === 3 ? late.promise : "account-1" });
    await actorReady(actor); actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(checks).toBe(3)); actor.stop(); late.resolve("account-1");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.start).not.toHaveBeenCalled(); expect(api.read).toHaveBeenCalledTimes(1);
  });

  test("stop between root discovery pages prevents the next read", async () => {
    const { api } = fixture(); const late = deferred<Awaited<ReturnType<SpacesOwnerProofApi["roots"]>>>();
    api.roots.mockReturnValueOnce(late.promise); const { actor } = actorFixture(api);
    await vi.waitFor(() => expect(api.roots).toHaveBeenCalledTimes(1));
    actor.stop(); late.resolve({ items: [{ canonical_root: "yahoo" }], next_cursor: "next" });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.roots).toHaveBeenCalledTimes(1); expect(api.read).not.toHaveBeenCalled();
  });

  test("unanswered poll recovers pending key; repeated pending resume never rotates it", async () => {
    const { api, set } = fixture(progress({ status: "awaiting_signature", challenge }), ["yahoo"]);
    api.poll.mockImplementation(async input => { set(progress({ status: "verification_pending", challenge, pending_poll_key: input.idempotencyKey })); throw new Error("lost response"); });
    api.resume.mockImplementation(async () => ({ contract: "pirate-spaces-ownership-result-v1", ceremony_id: "ceremony-1", generation: 1,
      status: "verification_pending", retry_after_seconds: 30, replayed: false }));
    const { actor } = actorFixture(api); await actorReady(actor);
    actor.send({ type: "POLL", signatureHex: "c".repeat(128) }); await actorReady(actor);
    actor.send({ type: "RESUME" }); await actorReady(actor); actor.send({ type: "RESUME" }); await actorReady(actor);
    const key = api.poll.mock.calls[0]?.[0].idempotencyKey;
    expect(api.resume.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([key, key]);
    expect(api.poll).toHaveBeenCalledTimes(1);
  });

  test("lost confirmation is recovered without confirming a second time", async () => {
    const { api, set } = fixture({ ...fresh(), operator_assignment: { ...candidate, status: "prepared", current: false } }, ["yahoo"]);
    api.confirmAssignment.mockImplementation(async () => {
      set({ ...fresh(), operator_assignment: { ...candidate, status: "confirmed", current: true } }); throw new Error("socket lost");
    });
    const { actor } = actorFixture(api); await actorReady(actor);
    actor.send({ type: "CONFIRM" }); await actorReady(actor); actor.send({ type: "CONFIRM" });
    expect(api.confirmAssignment).toHaveBeenCalledTimes(1);
    expect(actor.getSnapshot().context.progress?.operator_assignment?.status).toBe("confirmed");
  });

  test("changed assignment or expired proof readback prevents confirmation", async () => {
    const initial = { ...fresh(), operator_assignment: { ...candidate, status: "prepared" as const, current: false } };
    const { api, set } = fixture(initial, ["yahoo"]); const { actor } = actorFixture(api); await actorReady(actor);
    set({ ...initial, operator_assignment: { ...candidate, operator_assignment_id: "replacement", status: "prepared", current: false } });
    actor.send({ type: "CONFIRM" }); await actorReady(actor); expect(api.confirmAssignment).not.toHaveBeenCalled();
    set({ ...fresh("expired"), operator_assignment: initial.operator_assignment });
    actor.send({ type: "CONFIRM" }); await actorReady(actor); expect(api.confirmAssignment).not.toHaveBeenCalled();
  });

  test("failed reconciliation blocks writes until an explicit read succeeds", async () => {
    const { api } = fixture(); const { actor } = actorFixture(api); await actorReady(actor);
    api.start.mockRejectedValue(new Error("lost response"));
    api.read.mockResolvedValueOnce(progress()).mockRejectedValueOnce(new Error("read unavailable"));
    actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("unavailable")).toBe(true));
    actor.send({ type: "START", root: "yahoo", scope }); expect(api.start).toHaveBeenCalledTimes(1);
    actor.send({ type: "REFRESH" }); await actorReady(actor); expect(api.start).toHaveBeenCalledTimes(1);
  });

  test("stopped write cannot issue its post-write read or adopt the response", async () => {
    const { api } = fixture(); const late = deferred<typeof challenge>(); api.start.mockReturnValue(late.promise);
    const { actor } = actorFixture(api); await actorReady(actor);
    actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledTimes(1));
    actor.stop(); late.resolve(challenge); await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.read).toHaveBeenCalledTimes(1); expect(api.start.mock.calls[0]?.[1]?.aborted).toBe(true);
    expect(actor.getSnapshot().context.progress).toBeUndefined();
  });

  test("the request deadline reconciles an unanswered write without replaying it", async () => {
    const { api, set } = fixture(); const late = deferred<typeof challenge>();
    api.start.mockImplementation(async () => { set(progress({ status: "awaiting_signature", challenge })); return late.promise; });
    const { actor } = actorFixture(api); await actorReady(actor);
    vi.useFakeTimers();
    try {
      actor.send({ type: "START", root: "yahoo", scope }); await vi.advanceTimersByTimeAsync(0);
      expect(api.start).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(actor.getSnapshot().matches("ready")).toBe(true);
      expect(actor.getSnapshot().context.progress?.ceremony?.status).toBe("awaiting_signature");
      expect(api.start.mock.calls[0]?.[1]?.aborted).toBe(true);
      late.resolve(challenge); await vi.advanceTimersByTimeAsync(0);
      expect(api.start).toHaveBeenCalledTimes(1); expect(api.read).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });

  test("a late plain read cannot replace a different root's projection", async () => {
    const { api } = fixture(progress(), ["yahoo"]); const late = deferred<SpacesOwnerProgress>();
    const { actor } = actorFixture(api); await actorReady(actor);
    api.read.mockReturnValueOnce(late.promise)
      .mockResolvedValueOnce({ ...progress(), canonical_root: "other" });
    actor.send({ type: "REFRESH" });
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    actor.send({ type: "SELECT", root: "other", scope }); await actorReady(actor);
    late.resolve(progress({ status: "awaiting_signature", challenge })); await new Promise(resolve => setTimeout(resolve, 0));
    expect(actor.getSnapshot().context.progress?.canonical_root).toBe("other");
    expect(actor.getSnapshot().context.progress?.ceremony).toBeNull();
  });

  test.each(["CHOOSE", "SELECT"] as const)("%s during preparation cancels before any dispatch", async type => {
    const { api } = fixture(); const late = deferred<SpacesOwnerProgress>();
    const { actor } = actorFixture(api); await actorReady(actor);
    api.read.mockReturnValueOnce(late.promise);
    actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(1));
    expect(actor.getSnapshot().context.unresolved).toBeUndefined();
    actor.send({ type, root: "other", scope }); await actorReady(actor);
    late.resolve(progress()); await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.start).not.toHaveBeenCalled(); expect(api.read.mock.calls[0]?.[1]?.aborted).toBe(true);
    expect(actor.getSnapshot().context.root).toBe(type === "CHOOSE" ? undefined : "other");
  });

  test("root switches are refused during dispatch, readback and failed reconciliation, then unlocked by progress", async () => {
    const { api } = fixture(); const write = deferred<typeof challenge>(); const readback = deferred<SpacesOwnerProgress>();
    const { actor } = actorFixture(api); await actorReady(actor);
    api.start.mockReturnValue(write.promise);
    api.read.mockResolvedValueOnce(progress()).mockReturnValueOnce(readback.promise);
    actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledTimes(1));
    expect(actor.getSnapshot().context.unresolved?.type).toBe("start");
    const refuseSwitch = () => {
      actor.send({ type: "CHOOSE", scope }); actor.send({ type: "SELECT", root: "other", scope });
      actor.send({ type: "START", root: "other", scope });
      expect(actor.getSnapshot().context.root).toBe("yahoo"); expect(api.start).toHaveBeenCalledTimes(1);
      expect(api.read.mock.calls.every(([input]) => input.root === "yahoo")).toBe(true);
    };
    refuseSwitch(); expect(api.start.mock.calls[0]?.[1]?.aborted).toBe(false);
    write.resolve(challenge); await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    refuseSwitch(); expect(api.read.mock.calls[1]?.[1]?.aborted).toBe(false);
    // A scope-mismatched read is unsuccessful reconciliation and must retain the guard.
    readback.resolve({ ...progress(), canonical_root: "wrong" });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("unavailable")).toBe(true));
    refuseSwitch(); expect(actor.getSnapshot().context.notice).toContain("result is unknown");
    api.read.mockResolvedValueOnce(progress({ status: "awaiting_signature", challenge }));
    actor.send({ type: "REFRESH" }); await actorReady(actor);
    expect(actor.getSnapshot().context.unresolved).toBeUndefined();
    expect(actor.getSnapshot().context.notice).toBe("");
    actor.send({ type: "SELECT", root: "other", scope }); await actorReady(actor);
    expect(actor.getSnapshot().context.root).toBe("other");
    actor.send({ type: "START", root: "other", scope }); await actorReady(actor);
    expect(api.start).toHaveBeenCalledTimes(2);
  });

  test.each(["start", "poll", "resume", "assignment", "confirm"] as const)("%s dispatch locks root choice before the API observes it", async command => {
    const initial = command === "poll" ? progress({ status: "awaiting_signature", challenge })
      : command === "resume" ? pending() : command === "confirm"
        ? { ...fresh(), operator_assignment: { ...candidate, status: "prepared" as const, current: false } }
        : command === "assignment" ? fresh() : progress();
    const { api } = fixture(initial, ["yahoo"]); const { actor } = actorFixture(api); await actorReady(actor);
    let observedType: string | undefined; let observedRoot: string | undefined;
    const observeBoundary = () => {
      observedType = actor.getSnapshot().context.unresolved?.type;
      actor.send({ type: "CHOOSE", scope }); actor.send({ type: "SELECT", root: "other", scope });
      observedRoot = actor.getSnapshot().context.root;
    };
    if (command === "start") api.start.mockImplementation(async () => { observeBoundary(); return challenge; });
    else if (command === "poll") api.poll.mockImplementation(async () => { observeBoundary(); return verified; });
    else if (command === "resume") api.resume.mockImplementation(async () => { observeBoundary(); return verified; });
    else if (command === "assignment") api.assignment.mockImplementation(async () => { observeBoundary(); return { candidate }; });
    else api.confirmAssignment.mockImplementation(async () => { observeBoundary(); return candidate; });
    if (command === "start") actor.send({ type: "START", root: "yahoo", scope });
    else if (command === "poll") actor.send({ type: "POLL", signatureHex: "c".repeat(128) });
    else if (command === "resume") actor.send({ type: "RESUME" });
    else if (command === "assignment") actor.send({ type: "ASSIGN" });
    else actor.send({ type: "CONFIRM" });
    await actorReady(actor);
    expect(command === "confirm" ? api.confirmAssignment : api[command]).toHaveBeenCalledTimes(1);
    expect(observedType).toBe(command); expect(observedRoot).toBe("yahoo");
  });

  test("no-effect timeout keeps failure feedback after readback unlocks root choice", async () => {
    const { api } = fixture(); api.start.mockReturnValue(new Promise(() => {}));
    const { actor } = actorFixture(api); await actorReady(actor); vi.useFakeTimers();
    try {
      actor.send({ type: "START", root: "yahoo", scope }); await vi.advanceTimersByTimeAsync(0);
      expect(api.start).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(actor.getSnapshot().matches("ready")).toBe(true);
      expect(actor.getSnapshot().context.unresolved).toBeUndefined();
      expect(actor.getSnapshot().context.notice).toBe("Couldn't start. Try again.");
      actor.send({ type: "CHOOSE", scope }); expect(actor.getSnapshot().context.root).toBeUndefined();
      expect(api.start.mock.calls[0]?.[1]?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  test("plain scope-mismatched read failure permits root changes and retains saved choices after refresh", async () => {
    const { api } = fixture(progress(), ["yahoo", "other"]); const { actor } = actorFixture(api); await actorReady(actor);
    api.read.mockResolvedValueOnce({ ...progress(), canonical_root: "wrong" });
    actor.send({ type: "SELECT", root: "yahoo", scope });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("unavailable")).toBe(true));
    expect(actor.getSnapshot().context.unresolved).toBeUndefined();
    actor.send({ type: "SELECT", root: "other", scope }); await actorReady(actor);
    api.read.mockRejectedValueOnce(new Error("read unavailable")); actor.send({ type: "REFRESH" });
    await vi.waitFor(() => expect(actor.getSnapshot().matches("unavailable")).toBe(true));
    actor.send({ type: "REFRESH" }); await actorReady(actor); actor.send({ type: "CHOOSE", scope });
    expect(actor.getSnapshot().context.roots).toEqual(["yahoo", "other"]);
    expect(api.roots).toHaveBeenCalledTimes(1); expect(api.start).not.toHaveBeenCalled();
  });

  test.each(["account", "community"] as const)("%s loss still aborts a dispatched command and clears private state", async change => {
    const { api } = fixture(); const late = deferred<typeof challenge>(); api.start.mockReturnValue(late.promise);
    const harness = actorFixture(api); await actorReady(harness.actor);
    harness.actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledTimes(1));
    api.roots.mockReturnValue(new Promise(() => {}));
    harness.change({ ...scope, ...(change === "account" ? { accountId: "account-2" } : { communityId: "community-2" }) });
    expect(harness.actor.getSnapshot().context.unresolved).toBeUndefined();
    expect(harness.actor.getSnapshot().context.root).toBeUndefined(); expect(harness.actor.getSnapshot().context.roots).toEqual([]);
    expect(api.start.mock.calls[0]?.[1]?.aborted).toBe(true);
    late.resolve(challenge); await new Promise(resolve => setTimeout(resolve, 0));
    expect(api.read).toHaveBeenCalledTimes(1);
  });

  test("two tabs resume the same server key without creating a new poll", async () => {
    const { api } = fixture(pending(), ["yahoo"]); const first = actorFixture(api); const second = actorFixture(api);
    await actorReady(first.actor); await actorReady(second.actor);
    first.actor.send({ type: "RESUME" }); second.actor.send({ type: "RESUME" });
    await actorReady(first.actor); await actorReady(second.actor);
    expect(api.resume).toHaveBeenCalled();
    expect(api.resume.mock.calls.every(([input]) => input.idempotencyKey === "saved-poll-key")).toBe(true);
    expect(api.poll).not.toHaveBeenCalled(); expect(api.start).not.toHaveBeenCalled();
  });

  test("command keys survive reload and separate accounts, communities, roots and command generations", () => {
    const first = createSpacesCommandKeys(sessionStorage); const second = createSpacesCommandKeys(sessionStorage);
    const key = first("account-1", "community-1", "yahoo", "poll", "ceremony-1:1");
    expect(second("account-1", "community-1", "yahoo", "poll", "ceremony-1:1")).toBe(key);
    expect(second("account-2", "community-1", "yahoo", "poll", "ceremony-1:1")).not.toBe(key);
    expect(second("account-1", "community-2", "yahoo", "poll", "ceremony-1:1")).not.toBe(key);
    expect(second("account-1", "community-1", "other", "poll", "ceremony-1:1")).not.toBe(key);
    expect(second("account-1", "community-1", "yahoo", "poll", "ceremony-1:2")).not.toBe(key);
  });
});
