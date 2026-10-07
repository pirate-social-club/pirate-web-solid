import { render } from "@solidjs/web";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, test } from "vitest";
import { ApiClientError } from "@pirate/api-client";

import type {
  SpacesRouteAttachmentApi,
  SpacesRouteAttachmentResult,
  SpacesRouteAttachmentState,
} from "./spaces-route-attachment-api";
import { CommunityAddressSettings } from "./community-address-settings";
import { createFakeNamespaceSettingsPort } from "./fake-owner-settings-port";
import { SpacesRouteAttachmentPanel } from "./spaces-route-attachment-panel";

const unexpected = async (): Promise<never> => { throw new Error("Not reached"); };

const nodes: HTMLElement[] = [];
afterEach(() => {
  for (const node of nodes.splice(0)) node.remove();
  sessionStorage.clear();
});

async function settle() { for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0)); }

const SIGNATURE = "c".repeat(128);
const state = (root: string, change: Partial<SpacesRouteAttachmentState> = {}): SpacesRouteAttachmentState => ({
  status: "awaiting_signature", attachment_intent_id: `sroute_${root}`, generation: 1, purpose: "first_attachment",
  canonical_root: root, public_origin: "https://web.example", canonical_href: `https://web.example/c/@${root}`,
  challenge_message: `["pirate-spaces-community-route-owner-v1","${root}"]`, expires_at: "2030-01-01T00:15:00.000Z",
  route_binding_id: null, replayed: false, ...change,
});
const pending: SpacesRouteAttachmentResult = { status: "verification_pending", retry_after_seconds: 30 };

type Reply<T> = T | Error | Promise<T>;
interface Script {
  start?: readonly Reply<SpacesRouteAttachmentResult>[];
  current?: readonly Reply<SpacesRouteAttachmentResult | null>[];
  prove?: readonly Reply<SpacesRouteAttachmentResult>[];
  commit?: readonly Reply<SpacesRouteAttachmentResult>[];
  resolves?: readonly Reply<boolean>[];
}
interface Call {
  method: keyof SpacesRouteAttachmentApi;
  input: { communityId?: string; canonicalRoot?: string; idempotencyKey?: string;
    attachmentIntentId?: string; signatureHex?: string; generation?: number };
}

/** A scripted server: each call records its input and returns the next queued reply. */
function fakeApi(script: Script) {
  const calls: Call[] = [];
  const queue = <T,>(method: Call["method"], replies: readonly Reply<T>[] = []) => {
    const remaining = [...replies];
    return async (input: Call["input"]): Promise<T> => {
      calls.push({ method, input });
      const next = remaining.length > 1 ? remaining.shift() : remaining[0];
      if (remaining.length === 0 || next === undefined) throw new Error(`Unexpected ${method}`);
      if (next instanceof Error) throw next;
      return next;
    };
  };
  const api: SpacesRouteAttachmentApi = {
    start: queue("start", script.start), current: queue("current", script.current),
    prove: queue("prove", script.prove), commit: queue("commit", script.commit),
    resolves: queue("resolves", script.resolves),
  };
  return { api, calls };
}

async function mount(api: SpacesRouteAttachmentApi, accountId = "account-1", communityId = "community-1") {
  const node = document.createElement("div");
  document.body.appendChild(node);
  nodes.push(node);
  render(() => <SpacesRouteAttachmentPanel api={api} communityId={communityId} accountId={accountId} />, node);
  await settle();
  const user = userEvent.setup();
  const button = (label: string) => [...node.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  const press = async (label: string) => { await user.click(button(label)!); await settle(); };
  const typeRoot = (value: string) => user.type(node.querySelector<HTMLInputElement>("#spaces-route-root")!, value);
  const typeSignature = (value = SIGNATURE) => user.type(node.querySelector<HTMLTextAreaElement>("#spaces-route-signature")!, value);
  return { node, button, press, typeRoot, typeSignature };
}

describe("Spaces community address", () => {
  for (const root of ["yahoo", "csca"]) {
    test(`connects @${root} with one signature and no key entry`, async () => {
      const { api, calls } = fakeApi({
        current: [null], start: [state(root)], prove: [state(root, { status: "proved" })],
        commit: [state(root, { status: "committed", route_binding_id: "srbind_1" })], resolves: [true],
      });
      const view = await mount(api);
      await view.typeRoot(`@${root}`);
      await view.press("Connect address");
      expect(view.node.querySelector("[data-spaces-route-message]")?.textContent).toBe(state(root).challenge_message);
      expect(view.node.querySelector("[data-spaces-route-href]")?.textContent).toBe(`https://web.example/c/@${root}`);
      // The only things the owner can enter are the address and the signature.
      expect([...view.node.querySelectorAll("input,textarea")].map((field) => field.id)).toEqual(["spaces-route-signature"]);
      expect(view.node.querySelector("input[type=password]")).toBeNull();
      await view.typeSignature();
      await view.press("Connect address");
      expect(view.node.querySelector("[data-spaces-route-connected] a")?.getAttribute("href")).toBe(`/c/@${root}`);
      expect(calls.map((call) => call.method)).toEqual(["current", "start", "prove", "commit", "resolves"]);
      expect(calls[1]!.input).toMatchObject({ communityId: "community-1", canonicalRoot: root });
      expect(calls[2]!.input).toEqual({ communityId: "community-1", attachmentIntentId: `sroute_${root}`, signatureHex: SIGNATURE });
      expect(calls[3]!.input).toEqual({ communityId: "community-1", attachmentIntentId: `sroute_${root}`, generation: 1 });
      expect(sessionStorage.length).toBe(0);
      expect(view.node.textContent).not.toMatch(/generation|anchor|readiness|reconcil/iu);
    });
  }

  test("resumes after an interruption at start and reuses the saved key", async () => {
    const first = fakeApi({ current: [null], start: [state("yahoo")] });
    const before = await mount(first.api);
    await before.typeRoot("yahoo");
    await before.press("Connect address");
    const key = first.calls[1]!.input.idempotencyKey;
    before.node.remove();
    // Reopened: the server's open attempt is shown without a new start.
    const second = fakeApi({ current: [state("yahoo", { replayed: true })], prove: [pending] });
    const after = await mount(second.api);
    expect(after.node.querySelector("[data-spaces-route-message]")).not.toBeNull();
    expect(second.calls.map((call) => call.method)).toEqual(["current"]);
    expect(sessionStorage.getItem("spaces-route-attachment:account-1:community-1:yahoo")).toBe(key);
    // A temporary verification failure keeps the attempt and its signature.
    await after.typeSignature();
    await after.press("Connect address");
    expect(after.node.textContent).toContain("We couldn't check this address right now");
    expect(after.node.querySelector<HTMLTextAreaElement>("#spaces-route-signature")?.value).toBe(SIGNATURE);
  });

  test("resumes after prove and reconciles a lost finish without a new signature", async () => {
    const proved = state("yahoo", { status: "proved", replayed: true });
    const { api, calls } = fakeApi({
      current: [proved],
      commit: [new Error("connection lost"), state("yahoo", { status: "committed", route_binding_id: "srbind_1", replayed: true })],
      resolves: [true],
    });
    const view = await mount(api);
    expect(view.node.querySelector("#spaces-route-signature")).toBeNull();
    await view.press("Continue");
    expect(view.node.textContent).toContain("We couldn't finish");
    await view.press("Continue");
    expect(view.node.querySelector("[data-spaces-route-connected]")).not.toBeNull();
    expect(calls.map((call) => call.method)).toEqual(["current", "commit", "commit", "resolves"]);
  });

  for (const [status, words] of [
    ["expired", "The time to sign ran out"],
    ["configuration_changed", "This request is out of date"],
    ["root_changed", "The owner of this address changed"],
    ["signature_rejected", "doesn't match the wallet"],
  ] as const) {
    test(`ends a ${status} attempt and asks for a new message`, async () => {
      const { api, calls } = fakeApi({
        current: [null],
        start: [state("yahoo"), state("yahoo", { attachment_intent_id: "sroute_next", generation: 2 })],
        prove: [state("yahoo", { status })],
      });
      const view = await mount(api);
      await view.typeRoot("yahoo");
      await view.press("Connect address");
      const firstKey = calls[1]!.input.idempotencyKey;
      await view.typeSignature();
      await view.press("Connect address");
      expect(view.node.textContent).toContain(words);
      expect(view.node.querySelector("#spaces-route-signature")).toBeNull();
      expect(sessionStorage.length).toBe(0);
      // Starting again is explicit and never reuses the old key or signature.
      await view.press("Connect address");
      expect(calls.at(-1)!.method).toBe("start");
      expect(calls.at(-1)!.input.idempotencyKey).not.toBe(firstKey);
      expect(view.node.querySelector<HTMLTextAreaElement>("#spaces-route-signature")?.value).toBe("");
      expect(calls.filter((call) => call.method === "prove")).toHaveLength(1);
    });
  }

  test("a saved key for an attempt that ended gets a new key, not a replay", async () => {
    sessionStorage.setItem("spaces-route-attachment:account-1:community-1:yahoo", "stale-key");
    const { api, calls } = fakeApi({
      current: [state("yahoo", { status: "expired", replayed: true })],
      start: [state("yahoo", { status: "expired", replayed: true }), state("yahoo", { generation: 2 })],
    });
    const view = await mount(api);
    expect(view.node.textContent).not.toContain("ran out");
    await view.press("Connect address");
    const keys = calls.filter((call) => call.method === "start").map((call) => call.input.idempotencyKey);
    expect(keys[0]).toBe("stale-key");
    expect(keys[1]).not.toBe("stale-key");
    expect(view.node.querySelector("[data-spaces-route-message]")).not.toBeNull();
  });

  test("restores the same address when it has stopped working", async () => {
    const committed = state("yahoo", { status: "committed", route_binding_id: "srbind_1", replayed: true });
    const restore = state("yahoo", { purpose: "revalidation", generation: 2, attachment_intent_id: "sroute_restore" });
    const { api, calls } = fakeApi({
      current: [committed], resolves: [false, true], start: [restore],
      prove: [{ ...restore, status: "proved" }], commit: [{ ...restore, status: "committed", route_binding_id: "srbind_1" }],
    });
    const view = await mount(api);
    expect(view.node.querySelector("[data-spaces-route-stopped]")?.textContent).toContain("The community itself is still open");
    // The address to restore is the community's own; it cannot be changed here.
    expect(view.node.querySelector<HTMLInputElement>("#spaces-route-root")?.disabled).toBe(true);
    expect(view.button("Connect address")).toBeUndefined();
    await view.press("Restore address");
    expect(calls.at(-1)!.input).toMatchObject({ canonicalRoot: "yahoo" });
    await view.typeSignature();
    await view.press("Restore address");
    expect(view.node.querySelector("[data-spaces-route-connected]")).not.toBeNull();
    expect(calls.find((call) => call.method === "commit")!.input).toMatchObject({ attachmentIntentId: "sroute_restore", generation: 2 });
  });

  test("a past success is not shown as a working address without checking now", async () => {
    const { api } = fakeApi({
      current: [state("yahoo", { status: "committed", route_binding_id: "srbind_1", replayed: true })],
      resolves: [new Error("lookup failed")],
    });
    const view = await mount(api);
    expect(view.node.querySelector("[data-spaces-route-connected]")).toBeNull();
    expect(view.button("Restore address")).not.toBeUndefined();
  });

  test("keeps accounts, communities and roots apart", async () => {
    const mine = fakeApi({ current: [null], start: [state("yahoo")] });
    const first = await mount(mine.api, "account-1", "community-1");
    await first.typeRoot("yahoo");
    await first.press("Connect address");
    const others = fakeApi({ current: [null], start: [state("csca")] });
    const second = await mount(others.api, "account-2", "community-2");
    await second.typeRoot("csca");
    await second.press("Connect address");
    expect(Object.keys(sessionStorage).sort()).toEqual([
      "spaces-route-attachment:account-1:community-1:yahoo",
      "spaces-route-attachment:account-2:community-2:csca",
    ]);
    expect(mine.calls[1]!.input.idempotencyKey).not.toBe(others.calls[1]!.input.idempotencyKey);
    expect(first.node.querySelector("[data-spaces-route-href]")?.textContent).toContain("@yahoo");
    expect(second.node.querySelector("[data-spaces-route-href]")?.textContent).toContain("@csca");
  });

  test("explains a taken address and offers sign-in when the session ended", async () => {
    const conflict = new ApiClientError(
      { code: "conflict", name: "Conflict", retryable: false, status: 409 },
      { error: { code: "conflict", message: "Conflict", retryable: false } },
    );
    const unauthorized = new ApiClientError(
      { code: "auth_error", name: "AuthError", retryable: false, status: 401 },
      { error: { code: "auth_error", message: "Authentication required", retryable: false } },
    );
    const taken = fakeApi({ current: [null], start: [conflict] });
    const view = await mount(taken.api);
    await view.typeRoot("yahoo");
    await view.press("Connect address");
    expect(view.node.textContent).toContain("can't be connected here");
    const signedOut = fakeApi({ current: [unauthorized] });
    const other = await mount(signedOut.api);
    expect(other.node.querySelector("[data-owner-settings-sign-in]")).not.toBeNull();
  });

  test("continues the server's open request when this browser no longer holds its key", async () => {
    const conflict = new ApiClientError(
      { code: "conflict", name: "Conflict", retryable: false, status: 409 },
      { error: { code: "conflict", message: "Conflict", retryable: false } },
    );
    // The server keeps one open request per community until it runs out and
    // refuses a second start with a new key, exactly as the API does.
    const { api, calls } = fakeApi({ current: [null, state("yahoo", { replayed: true })], start: [conflict] });
    const view = await mount(api);
    await view.typeRoot("yahoo");
    await view.press("Connect address");
    expect(calls.map((call) => call.method)).toEqual(["current", "start", "current"]);
    expect(view.node.querySelector("[data-spaces-route-message]")).not.toBeNull();
    expect(view.node.textContent).toContain("Continuing the request you already started.");
    // There is no local way to abandon an open request; it ends on the server.
    expect(view.button("Start over")).toBeUndefined();
    expect(view.node.querySelector("[data-spaces-route-deadline]")?.textContent).toContain("To use a different address");
    expect(sessionStorage.length).toBe(0);
  });

  test("drops late replies when the account or community changes in place", async () => {
    const deferred = <T,>() => {
      let settle!: (value: T) => void;
      const promise = new Promise<T>((resolve) => { settle = resolve; });
      return { promise, settle };
    };
    const lateStart = deferred<SpacesRouteAttachmentResult>();
    const lateProve = deferred<SpacesRouteAttachmentResult>();
    const lateWorking = deferred<boolean>();
    const { api, calls } = fakeApi({
      current: [null, null, state("csca", { replayed: true }), state("yahoo", { status: "committed", route_binding_id: "srbind_1" }), null],
      start: [lateStart.promise], prove: [lateProve.promise], resolves: [lateWorking.promise],
    });
    const [communityId, setCommunityId] = createSignal("community-1");
    const [accountId, setAccountId] = createSignal("account-1");
    const node = document.createElement("div");
    document.body.appendChild(node);
    nodes.push(node);
    render(() => <SpacesRouteAttachmentPanel api={api} communityId={communityId()} accountId={accountId()} />, node);
    await settle();
    const user = userEvent.setup();
    const button = (label: string) => [...node.querySelectorAll("button")].find((candidate) => candidate.textContent === label);

    // A start for community 1 is still in flight when the view moves to community 2.
    await user.type(node.querySelector<HTMLInputElement>("#spaces-route-root")!, "yahoo");
    await user.click(button("Connect address")!);
    setCommunityId("community-2");
    await settle();
    lateStart.settle(state("yahoo"));
    await settle();
    expect(node.querySelector("[data-spaces-route-message]")).toBeNull();
    expect(node.querySelector<HTMLInputElement>("#spaces-route-root")?.value).toBe("");
    expect(button("Connect address")?.disabled).toBe(false);

    // A prove for account 1 is in flight when another account signs in.
    setCommunityId("community-3");
    await settle();
    expect(node.querySelector("[data-spaces-route-href]")?.textContent).toContain("@csca");
    await user.type(node.querySelector<HTMLTextAreaElement>("#spaces-route-signature")!, SIGNATURE);
    await user.click(button("Connect address")!);
    setAccountId("account-2");
    await settle();
    // Account 2's own state loads: a connected address whose check is pending.
    lateProve.settle(state("csca", { status: "signature_rejected" }));
    await settle();
    expect(node.textContent).not.toContain("doesn't match the wallet");
    expect(node.textContent).not.toContain("@csca");

    // The address check for account 2 resolves after the view moved again.
    setCommunityId("community-4");
    await settle();
    lateWorking.settle(true);
    await settle();
    expect(node.querySelector("[data-spaces-route-connected]")).toBeNull();
    expect(node.querySelector<HTMLInputElement>("#spaces-route-root")?.value).toBe("");
    expect(calls.filter((call) => call.method === "current").map((call) => call.input.communityId)).toEqual([
      "community-1", "community-2", "community-3", "community-3", "community-4",
    ]);
  });

  for (const change of ["community", "account"] as const) {
    test(`sends and stores nothing for the old ${change} when it changes during session repair`, async () => {
      // Each repair is held open by the test, then released after the switch.
      const repairs: { accountId: string | undefined; signal: AbortSignal; release: (ready: boolean) => void }[] = [];
      const sessionRepair = (accountId: string | undefined, signal: AbortSignal) =>
        new Promise<boolean>((resolve) => { repairs.push({ accountId, signal, release: resolve }); });
      const open = state("yahoo", { replayed: true });
      const proved = state("yahoo", { status: "proved", replayed: true });
      const { api, calls } = fakeApi({
        // Scope 1 idle, scope 2 awaiting a signature, scope 3 accepted, scope 4 idle.
        current: [null, open, proved, null], start: [state("yahoo")], prove: [proved],
        commit: [state("yahoo", { status: "committed", route_binding_id: "srbind_1" })], resolves: [true],
      });
      const [communityId, setCommunityId] = createSignal("community-1");
      const [accountId, setAccountId] = createSignal("account-1");
      const node = document.createElement("div");
      document.body.appendChild(node);
      nodes.push(node);
      render(() => <SpacesRouteAttachmentPanel api={api} communityId={communityId()} accountId={accountId()}
        sessionRepair={sessionRepair} />, node);
      const user = userEvent.setup();
      const button = (label: string) => [...node.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
      let step = 1;
      const move = async () => {
        step += 1;
        if (change === "community") setCommunityId(`community-${step}`);
        else setAccountId(`account-${step}`);
        await settle();
      };
      const releaseLatest = async () => { repairs.at(-1)!.release(true); await settle(); };
      const sent = (method: string) => calls.filter((call) => call.method === method);

      // Start: repair for the first scope is pending when the scope changes.
      await settle();
      await releaseLatest();
      await user.type(node.querySelector<HTMLInputElement>("#spaces-route-root")!, "yahoo");
      await user.click(button("Connect address")!);
      await settle();
      const startRepair = repairs.at(-1)!;
      await move();
      expect(startRepair.signal.aborted).toBe(true);
      startRepair.release(true);
      await settle();
      expect(sent("start")).toHaveLength(0);
      expect(sessionStorage.length).toBe(0);

      // Prove: the new scope shows an open request; its repair is pending at the next change.
      await releaseLatest();
      await user.type(node.querySelector<HTMLTextAreaElement>("#spaces-route-signature")!, SIGNATURE);
      await user.click(button("Connect address")!);
      await settle();
      const proveRepair = repairs.at(-1)!;
      await move();
      proveRepair.release(true);
      await settle();
      expect(sent("prove")).toHaveLength(0);

      // Commit: the next scope shows an accepted signature waiting to finish.
      await releaseLatest();
      await user.click(button("Continue")!);
      await settle();
      const commitRepair = repairs.at(-1)!;
      await move();
      commitRepair.release(true);
      await settle();
      expect(sent("commit")).toHaveLength(0);
      expect(sent("resolves")).toHaveLength(0);
      expect(sessionStorage.length).toBe(0);

      // Every repair ran for the account that asked, and the final scope is clean.
      await releaseLatest();
      expect(node.querySelector("[data-spaces-route-message]")).toBeNull();
      expect(node.querySelector("[data-owner-settings-sign-in]")).toBeNull();
      const expectedAccounts = change === "account"
        ? ["account-1", "account-1", "account-2", "account-2", "account-3", "account-3", "account-4"]
        : Array.from({ length: 7 }, () => "account-1");
      expect(repairs.map((repair) => repair.accountId)).toEqual(expectedAccounts);
      expect(repairs.slice(0, -1).every((repair) => repair.signal.aborted)).toBe(true);
    });
  }

  test("asks the owner to sign in when session repair cannot restore the session", async () => {
    const { api, calls } = fakeApi({ current: [null] });
    const node = document.createElement("div");
    document.body.appendChild(node);
    nodes.push(node);
    render(() => <SpacesRouteAttachmentPanel api={api} communityId="community-1" accountId="account-1"
      sessionRepair={async () => false} />, node);
    await settle();
    expect(node.querySelector("[data-owner-settings-sign-in]")).not.toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("reading its state never locks the shared address choice", async () => {
    let finishRead!: (value: SpacesRouteAttachmentResult | null) => void;
    const slowRead = new Promise<SpacesRouteAttachmentResult | null>((resolve) => { finishRead = resolve; });
    const { api } = fakeApi({ current: [slowRead] });
    const busyReports: boolean[] = [];
    const node = document.createElement("div");
    document.body.appendChild(node);
    nodes.push(node);
    render(() => <SpacesRouteAttachmentPanel api={api} communityId="community-1" accountId="account-1"
      onBusyChange={(busy) => busyReports.push(busy)} />, node);
    await settle();
    // The panel's own button waits for the read, but nothing is reported upward.
    expect([...node.querySelectorAll("button")].find((b) => b.textContent === "Connect address")?.disabled).toBe(true);
    expect(busyReports).toEqual([]);
    finishRead(null);
    await settle();
    expect([...node.querySelectorAll("button")].find((b) => b.textContent === "Connect address")?.disabled).toBe(false);
    expect(busyReports).toEqual([]);
  });

  test("appears under the Spaces choice of the shared address settings", async () => {
    const { api } = fakeApi({ current: [state("yahoo", { replayed: true })] });
    const node = document.createElement("div");
    document.body.appendChild(node);
    nodes.push(node);
    const untouched = { start: unexpected, poll: unexpected, assignment: unexpected, confirmAssignment: unexpected };
    render(() => <CommunityAddressSettings communityId="community-1" communityPath="/c/community-1"
      namespaceApi={createFakeNamespaceSettingsPort()} spacesApi={untouched} spacesRouteApi={api} />, node);
    await settle();
    expect(node.querySelector("[data-spaces-route-attachment]")).toBeNull();
    const user = userEvent.setup();
    await user.click([...node.querySelectorAll("button")].find((candidate) => candidate.textContent === "Spaces")!);
    await settle();
    expect(node.querySelector("[data-spaces-route-message]")).not.toBeNull();
    // The sale-ownership ceremony stays a separate panel beneath it.
    expect(node.querySelector("[data-spaces-owner-proof]")).not.toBeNull();
  });

  test("rejects malformed input before calling the server", async () => {
    const { api, calls } = fakeApi({ current: [null], start: [state("yahoo")] });
    const view = await mount(api);
    await view.typeRoot("not a root!");
    await view.press("Connect address");
    expect(view.node.textContent).toContain("Enter an address such as @yahoo.");
    expect(calls.map((call) => call.method)).toEqual(["current"]);
  });
});
