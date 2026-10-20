import { render } from "@solidjs/web";
import { createRoot, createSignal, flush } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import type { SpacesTaprootWalletSession } from "../../../api/spaces-taproot-wallet-session.ts";
import { SpacesWalletSetup, type SpacesWalletSetupScope } from "./spaces-wallet-setup.tsx";

const scope: SpacesWalletSetupScope = {
  accountId: "account-original", selectedPersonaId: "selected-persona", recipientPersonaId: "original-recipient",
  communityId: "community-original", activationId: "activation-original", activationGeneration: 3,
  namespaceRoot: "first-root", offeringId: "offering-original", offeringRevision: 2, offeringHash: "a".repeat(64), sessionGeneration: 1,
};
const active = { kind: "active", assignment_id: "assignment-original", network: "mainnet",
  provider_wallet_id: "wallet-original", address: "bc1p-test", output_script_hex: "5120" } as const;
const disposers: Array<() => void> = [];
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("deferred not initialized"); };
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(initial: SpacesWalletSetupScope | undefined = scope) {
  const session = {
    sendCode: vi.fn<SpacesTaprootWalletSession["sendCode"]>(async () => undefined),
    loginWithCode: vi.fn<SpacesTaprootWalletSession["loginWithCode"]>(async () => undefined),
    status: vi.fn<SpacesTaprootWalletSession["status"]>(async () => active),
    setup: vi.fn<SpacesTaprootWalletSession["setup"]>(async () => active), dispose: vi.fn(),
  };
  const createSession = vi.fn(async () => session), message = vi.fn(), ready = vi.fn(), busy = vi.fn();
  const container = document.createElement("div"); document.body.appendChild(container);
  let changeScope: (value: SpacesWalletSetupScope | undefined) => void = () => { throw new Error("scope not initialized"); };
  let dispose = () => {};
  createRoot(stop => {
    dispose = stop;
    const [value, setValue] = createSignal<SpacesWalletSetupScope | undefined>(initial, { ownedWrite: true });
    changeScope = next => { setValue(next); flush(); };
    render(() => <SpacesWalletSetup scope={value} readCsrf={() => "csrf-test"} createSession={createSession}
      onMessage={message} onReady={ready} onBusyChange={busy} />, container);
  });
  flush();
  const unmount = () => { dispose(); container.remove(); };
  disposers.push(unmount);
  const fill = (id: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(`#${id}`);
    if (input === null) throw new Error("input missing");
    input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); flush();
  };
  const button = (text: string) => {
    const value = [...container.querySelectorAll("button")].find(item => item.textContent === text);
    if (value === undefined) throw new Error("button missing");
    return value;
  };
  const begin = async () => {
    fill("spaces-wallet-email", "member@example.test"); button("Send code").click();
    await vi.waitFor(() => expect(session.sendCode).toHaveBeenCalledTimes(1));
  };
  const authorize = async () => {
    await begin(); await vi.waitFor(() => expect(button("Confirm wallet").disabled).toBe(false));
    fill("spaces-wallet-code", "123456"); button("Confirm wallet").click();
  };
  return { session, createSession, message, ready, busy, container, changeScope, unmount, fill, button, begin, authorize };
}
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); });

test("setup uses the retained original recipient and only a confirmed active response closes it", async () => {
  const f = fixture(); await f.authorize();
  await vi.waitFor(() => expect(f.ready).toHaveBeenCalledTimes(1));
  expect(f.session.loginWithCode).toHaveBeenCalledWith("member@example.test", "123456");
  expect(f.session.setup).toHaveBeenCalledWith("original-recipient", "csrf-test");
  expect(f.session.dispose).toHaveBeenCalled();
});

test("unavailable scope rejects a forged send-code click before creating authorization", () => {
  const f = fixture(undefined); f.changeScope(undefined);
  f.fill("spaces-wallet-email", "member@example.test");
  const button = f.button("Send code"); button.disabled = false; button.click();
  expect(f.createSession).not.toHaveBeenCalled(); expect(f.session.sendCode).not.toHaveBeenCalled();
});

test("scope invalidation while creating authorization disposes the late session before sending code", async () => {
  const f = fixture(), pending = deferred<typeof f.session>();
  f.createSession.mockReturnValueOnce(pending.promise);
  f.fill("spaces-wallet-email", "member@example.test"); f.button("Send code").click();
  await vi.waitFor(() => expect(f.createSession).toHaveBeenCalledTimes(1));
  f.changeScope(undefined); pending.resolve(f.session);
  await vi.waitFor(() => expect(f.session.dispose).toHaveBeenCalled());
  expect(f.session.sendCode).not.toHaveBeenCalled(); expect(f.message).not.toHaveBeenCalled();
});

test("scope invalidation while sending code prevents a late code-entry state", async () => {
  const f = fixture(), pending = deferred<void>(); f.session.sendCode.mockReturnValueOnce(pending.promise);
  await f.begin(); f.changeScope({ ...scope, namespaceRoot: "second-root" }); pending.resolve(undefined);
  await vi.waitFor(() => expect(f.session.dispose).toHaveBeenCalled());
  expect(f.container.querySelector("#spaces-wallet-code")).toBeNull();
  expect(f.session.loginWithCode).not.toHaveBeenCalled(); expect(f.message).not.toHaveBeenCalled();
});

test.each([
  { accountId: "account-other" }, { selectedPersonaId: "profile-other" }, { recipientPersonaId: "recipient-other" },
  { communityId: "community-other" }, { activationId: "activation-other" }, { activationGeneration: 4 },
  { namespaceRoot: "second-root" }, { offeringId: "offering-other" }, { offeringRevision: 3 },
  { offeringHash: "b".repeat(64) }, { sessionGeneration: 2 },
])("a changed wallet context %j stops after delayed email login", async change => {
  const f = fixture(), pending = deferred<void>(); f.session.loginWithCode.mockReturnValueOnce(pending.promise);
  await f.authorize(); await vi.waitFor(() => expect(f.session.loginWithCode).toHaveBeenCalledTimes(1));
  f.changeScope({ ...scope, ...change }); pending.resolve(undefined);
  await vi.waitFor(() => expect(f.session.dispose).toHaveBeenCalled());
  expect(f.session.setup).not.toHaveBeenCalled(); expect(f.ready).not.toHaveBeenCalled();
});

test("a stale setup result cannot announce success for another account", async () => {
  const f = fixture(), pending = deferred<typeof active>(); f.session.setup.mockReturnValueOnce(pending.promise);
  await f.authorize(); await vi.waitFor(() => expect(f.session.setup).toHaveBeenCalledTimes(1));
  f.message.mockClear(); f.changeScope({ ...scope, accountId: "account-other" }); pending.resolve(active);
  await vi.waitFor(() => expect(f.session.dispose).toHaveBeenCalled());
  expect(f.ready).not.toHaveBeenCalled(); expect(f.message).not.toHaveBeenCalled();
});

test("unmount while creating authorization disposes the late session without any further effect", async () => {
  const f = fixture(), pending = deferred<typeof f.session>(); f.createSession.mockReturnValueOnce(pending.promise);
  f.fill("spaces-wallet-email", "member@example.test"); f.button("Send code").click();
  await vi.waitFor(() => expect(f.createSession).toHaveBeenCalledTimes(1));
  f.unmount(); pending.resolve(f.session);
  await vi.waitFor(() => expect(f.session.dispose).toHaveBeenCalled());
  expect(f.session.sendCode).not.toHaveBeenCalled(); expect(f.ready).not.toHaveBeenCalled();
});
