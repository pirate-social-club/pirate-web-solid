import { render } from "@solidjs/web";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { ApiClientError } from "@pirate/api-client";

import type {
  SpacesRouteAttachmentApi,
  SpacesRouteAttachmentResult,
  SpacesRouteAttachmentState,
} from "./spaces-route-attachment-api";
import { SpacesRouteAttachmentPanel } from "./spaces-route-attachment-panel";

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

type Reply<T> = T | Error;
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

  test("rejects malformed input before calling the server", async () => {
    const { api, calls } = fakeApi({ current: [null], start: [state("yahoo")] });
    const view = await mount(api);
    await view.typeRoot("not a root!");
    await view.press("Connect address");
    expect(view.node.textContent).toContain("Enter an address such as @yahoo.");
    expect(calls.map((call) => call.method)).toEqual(["current"]);
  });
});
