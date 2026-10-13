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
function mount(api: SpacesOwnerProofApi, accountId = "account-1") {
  const node = document.createElement("div"); document.body.appendChild(node);
  const dispose = render(() => <SpacesOwnerProofPanel api={api} communityId="community-1" accountId={accountId} />, node);
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

  test("return to the page reads fresh status before showing command controls", async () => {
    const { api, set } = fixture(fresh(), ["yahoo"]); const node = mount(api); await ready(node);
    set(fresh("root_changed")); window.dispatchEvent(new Event("pageshow"));
    await vi.waitFor(() => expect(node.textContent).toContain("The root changed"));
    expect(button(node, "Check operator address")).toBeUndefined();
    expect(api.start).not.toHaveBeenCalled();
  });
});

describe("Spaces lifecycle effects", () => {
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

  test("a late post-write read cannot replace a different root's projection", async () => {
    const { api } = fixture(); const late = deferred<SpacesOwnerProgress>();
    const { actor } = actorFixture(api); await actorReady(actor);
    api.read.mockResolvedValueOnce(progress()).mockReturnValueOnce(late.promise)
      .mockResolvedValueOnce({ ...progress(), canonical_root: "other" });
    actor.send({ type: "START", root: "yahoo", scope });
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    actor.send({ type: "SELECT", root: "other", scope }); await actorReady(actor);
    late.resolve(progress({ status: "awaiting_signature", challenge })); await new Promise(resolve => setTimeout(resolve, 0));
    expect(actor.getSnapshot().context.progress?.canonical_root).toBe("other");
    expect(actor.getSnapshot().context.progress?.ceremony).toBeNull();
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
