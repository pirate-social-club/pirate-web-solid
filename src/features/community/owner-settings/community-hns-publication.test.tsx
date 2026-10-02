import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createCommunityNamespaceSettingsApi } from "./community-namespace-settings-api";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";
import { publicationStorageKey, readPublication, type HnsPublicationBinding } from "./community-hns-publication";

const binding: HnsPublicationBinding = {
  community_id: "community-1", root_import_session_id: "session-1", root_label: "midnight", publish_plan_sha256: "a".repeat(64),
};
const txid = "b".repeat(64);
const session = {
  ...binding, attachment_intent_id: "attachment-1", expires_at: "2099-09-11T00:00:00.000Z",
  replayed: false, revision: 3, status: "awaiting_owner_update", publication_check_pending: false,
  publish_plan: {
    added_records: [{ type: "TXT", txt: ["pirate-verification=session-1"] }],
    preserved_records: [], preserved_unknown_record_types: [], removed_conflicts: [],
    replacement_records: [{ type: "TXT", txt: ["pirate-verification=session-1"] }],
  }, readiness_result_sha256: null, retry_after_seconds: 30,
};
const disposers: Array<() => void> = [];
const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
beforeEach(() => {
  localStorage.clear();
  const queues = new Map<string, Promise<void>>();
  Object.defineProperty(navigator, "locks", { configurable: true, value: {
    request: (key: string, _options: LockOptions, action: () => Promise<void>) => {
      const request = (queues.get(key) ?? Promise.resolve()).then(action);
      queues.set(key, request.catch(() => {}));
      return request;
    },
  } });
});
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else Reflect.deleteProperty(navigator, "locks");
  localStorage.clear(); document.body.replaceChildren();
});
function fixture() {
  let current = { ...session };
  const get = vi.fn(async () => current);
  const post = vi.fn(async () => { current = { ...current, revision: 4, publication_check_pending: true }; return current; });
  const sendUpdate = vi.fn(async (): Promise<{ hash: string } | undefined> => ({ hash: txid }));
  const connect = vi.fn(async () => ({ sendUpdate, signWithName: vi.fn() }));
  vi.stubGlobal("bob3", { connect });
  const mount = () => {
    const api = createCommunityNamespaceSettingsApi({
      communityId: binding.community_id, communityPath: "/c/community-1", readCsrfToken: () => "csrf-fixture",
      locator: { read: () => null, write: () => {}, clear: () => {} },
      // SAFETY: This isolated server implements only the generated endpoints exercised by the real adapter.
      client: { get_communitiesCommunityIdHnsRootImports: async () => ({ community_id: binding.community_id, attachment: null, session: current }),
        get_communitiesCommunityIdHnsRootImportsSessionId: get, post_communitiesCommunityIdHnsRootImportsSessionIdPoll: post } as never,
    });
    const container = document.createElement("div"); document.body.appendChild(container);
    let cleanup = () => {};
    createRoot((dispose) => { cleanup = dispose; solidRender(() => <CommunityNamespaceSettingsController api={api} communityId={binding.community_id} communityPath="/c/community-1" />, container); });
    const dispose = () => { cleanup(); container.remove(); }; disposers.push(dispose);
    const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
    const click = async (text: string) => { await vi.waitFor(() => expect(button(text)).toBeDefined()); button(text)!.click(); };
    return { container, dispose, button, click };
  };
  return { mount, connect, sendUpdate, get, post, setCurrent: (value: typeof session) => { current = value; } };
}

test.each(["dismissed", "locked", "unavailable"])("a %s connection can retry without leaving a publication intent", async (reason) => {
  const f = fixture(); f.connect.mockRejectedValueOnce(new Error(reason));
  const ui = f.mount(); await ui.click("with Bob Wallet");
  await vi.waitFor(() => expect(f.connect).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(ui.button("with Bob Wallet")?.disabled).toBe(false));
  expect(readPublication(binding)).toBeNull();
  expect(f.sendUpdate).not.toHaveBeenCalled();
  expect(f.post).not.toHaveBeenCalled();
  expect(ui.container.textContent).toContain("Could not connect to Bob");
  await ui.click("with Bob Wallet");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(1));
  expect(f.sendUpdate).toHaveBeenCalledTimes(1);
});

test("a pending connection has no intent and disposal before it finishes cannot send", async () => {
  const f = fixture(); let finish!: (wallet: Awaited<ReturnType<typeof f.connect>>) => void;
  f.connect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const ui = f.mount(); await ui.click("with Bob Wallet");
  await vi.waitFor(() => expect(f.connect).toHaveBeenCalledTimes(1));
  expect(readPublication(binding)).toBeNull();
  ui.dispose(); finish({ sendUpdate: f.sendUpdate, signWithName: vi.fn() });
  const after = f.mount(); await vi.waitFor(() => expect(after.button("with Bob Wallet")?.disabled).toBe(false));
  expect(readPublication(binding)).toBeNull(); expect(f.sendUpdate).not.toHaveBeenCalled();
});

test("a provider removed before connection leaves manual acknowledgement available", async () => {
  const f = fixture(); const ui = f.mount();
  await vi.waitFor(() => expect(ui.button("with Bob Wallet")).toBeDefined());
  vi.stubGlobal("bob3", undefined); await ui.click("with Bob Wallet");
  await vi.waitFor(() => expect(ui.button("I published all records manually")?.disabled).toBe(false));
  expect(readPublication(binding)).toBeNull();
  await ui.click("I published all records manually");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(1));
  expect(f.sendUpdate).not.toHaveBeenCalled();
});

test("lost acknowledgement keeps its receipt and retries the API without another wallet call", async () => {
  const f = fixture();
  let reject!: (error: Error) => void;
  f.post.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const ui = f.mount(); await ui.click("with Bob Wallet");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(1));
  expect(ui.button("Check publication status")?.disabled).toBe(true);
  expect(readPublication(binding)).toEqual({ ...binding, version: 1, txid });
  reject(new Error("lost acknowledgement"));
  await vi.waitFor(() => expect(ui.button("Check publication status")?.disabled).toBe(false));
  expect(ui.button("with Bob Wallet")).toBeUndefined();
  await ui.click("Check publication status");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(2));
  expect(f.sendUpdate).toHaveBeenCalledTimes(1);
});

test("reload reconciles an unacknowledged broadcast from persistent storage", async () => {
  const f = fixture(); f.post.mockRejectedValueOnce(new Error("offline"));
  const before = f.mount(); await before.click("with Bob Wallet");
  await vi.waitFor(() => expect(before.container.textContent).toContain("could not be completed"));
  before.dispose(); const after = f.mount();
  await after.click("Check publication status");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(2));
  expect(after.container.textContent).toContain(txid);
  expect(f.sendUpdate).toHaveBeenCalledTimes(1);
});

test("an acknowledgement accepted before its response was lost is discovered without another POST", async () => {
  const f = fixture(); f.post.mockImplementationOnce(async () => {
    f.setCurrent({ ...session, publication_check_pending: true }); throw new Error("response lost");
  });
  const before = f.mount(); await before.click("with Bob Wallet");
  await vi.waitFor(() => expect(before.container.textContent).toContain("could not be completed"));
  await before.click("Check publication status");
  await vi.waitFor(() => expect(before.container.textContent).toContain("Checking published records"));
  expect(f.post).toHaveBeenCalledTimes(1); expect(f.sendUpdate).toHaveBeenCalledTimes(1);
});

test.each(["rejected", "empty"])("ambiguous %s wallet completion survives reload and never invites a resend", async (outcome) => {
  const f = fixture();
  if (outcome === "rejected") f.sendUpdate.mockRejectedValueOnce(new Error("connection lost after send"));
  else f.sendUpdate.mockResolvedValueOnce(undefined);
  const before = f.mount(); await before.click("with Bob Wallet");
  await vi.waitFor(() => expect(before.container.textContent).toContain("Bob's completion could not be confirmed"));
  expect(f.post).not.toHaveBeenCalled(); expect(readPublication(binding)?.txid).toBeNull();
  before.dispose(); const after = f.mount(); await after.click("Check publication status");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(1)); expect(f.sendUpdate).toHaveBeenCalledTimes(1);
});

test("a reload while Bob is still pending cannot send a second transaction", async () => {
  const f = fixture(); let finish!: (value: { hash: string } | undefined) => void;
  f.sendUpdate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const before = f.mount(); await before.click("with Bob Wallet");
  await vi.waitFor(() => expect(f.sendUpdate).toHaveBeenCalledTimes(1));
  expect(readPublication(binding)).toEqual({ ...binding, version: 1, txid: null });
  expect(before.button("Use a different namespace")?.disabled).toBe(true);
  before.dispose(); const after = f.mount();
  await vi.waitFor(() => expect(after.button("Check publication status")).toBeDefined());
  expect(after.button("with Bob Wallet")).toBeUndefined(); finish({ hash: txid });
  await vi.waitFor(() => expect(readPublication(binding)?.txid).toBe(txid));
  expect(f.post).not.toHaveBeenCalled(); expect(f.sendUpdate).toHaveBeenCalledTimes(1);
});

test("two competing tabs share one publication fence", async () => {
  const f = fixture(); let finish!: (value: { hash: string } | undefined) => void;
  f.sendUpdate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = f.mount(); const second = f.mount();
  await vi.waitFor(() => expect(second.button("with Bob Wallet")).toBeDefined());
  await first.click("with Bob Wallet"); await second.click("with Bob Wallet");
  await vi.waitFor(() => expect(f.sendUpdate).toHaveBeenCalledTimes(1)); finish({ hash: txid });
  await vi.waitFor(() => expect(second.button("Check publication status")?.disabled).toBe(false));
  expect(f.sendUpdate).toHaveBeenCalledTimes(1);
});

test.each(["write", "read", "corrupt", "locks"])("%s failure blocks Bob before the irreversible operation", async (failure) => {
  const f = fixture();
  if (failure === "write") vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  if (failure === "read") vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
  if (failure === "corrupt") localStorage.setItem(publicationStorageKey(binding), "invalid");
  if (failure === "locks") Reflect.deleteProperty(navigator, "locks");
  const ui = f.mount();
  if (failure === "write" || failure === "locks") await ui.click("with Bob Wallet");
  await vi.waitFor(() => expect(ui.container.textContent).toContain("storage or locking could not be used"));
  expect(f.sendUpdate).not.toHaveBeenCalled(); expect(f.post).not.toHaveBeenCalled();
  await ui.click("I published all records manually");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(1));
  expect(f.sendUpdate).not.toHaveBeenCalled();
});

test("failure to save the wallet result retains the pre-send fence across reload", async () => {
  const f = fixture(); const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === publicationStorageKey(binding) && JSON.parse(value).txid !== null) throw new Error("quota after send");
    original.call(this, key, value);
  });
  const before = f.mount(); await before.click("with Bob Wallet");
  await vi.waitFor(() => expect(before.container.textContent).toContain("storage or locking could not be used"));
  expect(before.container.textContent).toContain(txid); expect(readPublication(binding)?.txid).toBeNull();
  before.dispose(); vi.restoreAllMocks(); const after = f.mount(); await after.click("Check publication status");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(1)); expect(f.sendUpdate).toHaveBeenCalledTimes(1);
});

test("a changed server plan after send is not acknowledged and does not reopen Bob", async () => {
  const f = fixture(); f.get.mockResolvedValue({ ...session, publish_plan_sha256: "c".repeat(64) });
  const ui = f.mount(); await ui.click("with Bob Wallet");
  await vi.waitFor(() => expect(ui.container.textContent).toContain("record plan has changed"));
  expect(ui.button("I published all records manually")?.disabled).toBe(true);
  ui.button("I published all records manually")!.click();
  await ui.click("Check publication status");
  await vi.waitFor(() => expect(f.get).toHaveBeenCalledTimes(2));
  expect(f.post).not.toHaveBeenCalled(); expect(f.sendUpdate).toHaveBeenCalledTimes(1);
  expect(readPublication(binding)?.publish_plan_sha256).toBe(binding.publish_plan_sha256);
});

test("a receipt from another import does not acknowledge the current import", async () => {
  const f = fixture();
  localStorage.setItem(publicationStorageKey(binding), JSON.stringify({ ...binding, root_import_session_id: "other-session", version: 1, txid }));
  const ui = f.mount(); await ui.click("Check publication status");
  await vi.waitFor(() => expect(f.get).toHaveBeenCalledTimes(1));
  expect(f.post).not.toHaveBeenCalled(); expect(f.sendUpdate).not.toHaveBeenCalled();
});

test("a new server session has its own receipt and preserves the previous session's fence", async () => {
  const f = fixture();
  localStorage.setItem(publicationStorageKey(binding), JSON.stringify({ ...binding, version: 1, txid }));
  f.setCurrent({ ...session, root_import_session_id: "session-2", publish_plan_sha256: "d".repeat(64) });
  const ui = f.mount(); await ui.click("with Bob Wallet");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(1));
  expect(readPublication(binding)).toEqual({ ...binding, version: 1, txid });
  expect(readPublication({ ...binding, root_import_session_id: "session-2" })?.publish_plan_sha256).toBe("d".repeat(64));
});

test("missing publication identity disables the wallet button", async () => {
  const f = fixture(); f.setCurrent({ ...session, publish_plan_sha256: "" });
  const ui = f.mount(); await vi.waitFor(() => expect(ui.button("with Bob Wallet")?.disabled).toBe(true));
  ui.button("with Bob Wallet")!.click(); expect(f.sendUpdate).not.toHaveBeenCalled();
});


test("a newer pre-acknowledgement read is resynchronized after the POST fails", async () => {
  const f = fixture();
  f.get.mockResolvedValue({ ...session, revision: 4 });
  f.post.mockRejectedValueOnce(new Error("acknowledgement failed after newer read"));
  const ui = f.mount(); await ui.click("with Bob Wallet");
  await vi.waitFor(() => expect(ui.container.textContent).toContain("could not be completed"));
  expect(f.post).toHaveBeenCalledTimes(1);
  await ui.click("Check publication status");
  // An old UI generation may refresh its bound session, but cannot write.
  await vi.waitFor(() => expect(f.get).toHaveBeenCalledTimes(2));
  expect(f.post).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(ui.button("Check publication status")?.disabled).toBe(false));
  await ui.click("Check publication status");
  await vi.waitFor(() => expect(f.post).toHaveBeenCalledTimes(2));
  expect(f.post.mock.calls[1]).toEqual(expect.arrayContaining([expect.objectContaining({ body: expect.objectContaining({ expected_revision: 4 }) })]));
  expect(f.sendUpdate).toHaveBeenCalledTimes(1);
});
