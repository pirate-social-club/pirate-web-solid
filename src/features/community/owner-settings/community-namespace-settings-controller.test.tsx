import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CommunityNamespaceSettingsApiError, createCommunityNamespaceSettingsApi } from "./community-namespace-settings-api";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";

const disposers: Array<() => void> = [];
function render(ui: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => { dispose = rootDispose; solidRender(ui, container); });
  const cleanup = () => { dispose(); container.remove(); };
  disposers.push(cleanup);
  return { container, cleanup };
}
beforeEach(() => { vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); });
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const session = {
  attachment_intent_id: "attachment-1", community_id: "community-1", expires_at: "2099-09-11T00:00:00.000Z",
  replayed: false, root_import_session_id: "session-1", root_label: "midnight", revision: 3,
  status: "awaiting_owner_update", publication_check_pending: false,
  publish_plan: {
    added_records: [
      { type: "TXT", txt: ["pirate-verification=session-1"] },
      { type: "DS", keyTag: 10875, algorithm: 13, digestType: 2, digest: "ba5d84ad6e3e7ec452a569ee2e6c447ba2b9b533de65c58e59f2f0b7f0773045" },
    ],
    preserved_records: [{ type: "NS", ns: "ns1.midnight" }],
    preserved_unknown_record_types: [],
    removed_conflicts: [{ type: "NS", ns: "old-ns.example." }],
    replacement_records: [
      { type: "NS", ns: "ns1.midnight" },
      { type: "TXT", txt: ["pirate-verification=session-1"] },
      { type: "DS", keyTag: 10875, algorithm: 13, digestType: 2, digest: "ba5d84ad6e3e7ec452a569ee2e6c447ba2b9b533de65c58e59f2f0b7f0773045" },
    ],
  },
  publish_plan_sha256: "plan-hash", readiness_result_sha256: null, retry_after_seconds: 2,
};
type DiscoveryFixture = {
  community_id: string;
  attachment: null | { canonical_route: { root_label_display: string }; status: string };
  session: typeof session | null;
};
function makeApi(read: () => Promise<DiscoveryFixture>, poll = vi.fn(async () => ({ ...session, publication_check_pending: true })), get = vi.fn(async () => ({...session,publication_check_pending:true}))) {
  return createCommunityNamespaceSettingsApi({
    // SAFETY: These fakes implement exactly the generated methods exercised here.
    client: { get_communitiesCommunityIdHnsRootImports: read,
      get_communitiesCommunityIdHnsRootImportsSessionId: get,
      post_communitiesCommunityIdHnsRootImportsSessionIdPoll: poll } as never,
    communityId: "community-1", communityPath: "/c/community-1", readCsrfToken: () => "csrf-1",
    locator: { read: () => null, write: () => {}, clear: () => {} },
  });
}

test.each([2, 90])("automatic progress respects a %i second hint and stops on disposal", async (retrySeconds) => {
  const post = vi.fn();
  const get = vi.fn(async () => ({ ...session, publication_check_pending: true, retry_after_seconds: retrySeconds }));
  const api = makeApi(async () => ({ community_id: "community-1", attachment: null, session: {...session,publication_check_pending:true,retry_after_seconds:retrySeconds} }), post, get);
  vi.useFakeTimers();
  const {container,cleanup}=render(()=><CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("Checking published records");
   expect(container.textContent).toContain("Review changes to existing records");
   expect(container.textContent).toContain("Records kept live (1)");
   expect(container.textContent).toContain("Records added by this update (2)");
   expect(container.textContent).toContain("Existing records being replaced (1)");
  expect(container.textContent).not.toContain("Retry after");
  expect(container.textContent).not.toContain("Check status");
  await vi.advanceTimersByTimeAsync(retrySeconds*1000-1);expect(get).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);expect(get).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(Math.max(retrySeconds,4)*1000);expect(get).toHaveBeenCalledTimes(2);
  expect(post).not.toHaveBeenCalled();cleanup();
  await vi.advanceTimersByTimeAsync(retrySeconds*5000);expect(get).toHaveBeenCalledTimes(2);
});

test("records survive acknowledgement, pending reads and failures without a second POST",async()=>{
  let acknowledged=false;
  const post=vi.fn(async()=>{acknowledged=true;return {...session,publication_check_pending:true};});
  const get=vi.fn(async()=>({...session,revision:4,publication_check_pending:acknowledged}));
  const api=makeApi(async()=>({community_id:"community-1",attachment:null,session}),post,get);
  vi.useFakeTimers();
  const {container}=render(()=><CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.advanceTimersByTimeAsync(0);
  const button=[...container.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="I published all records manually")!;
  const text=container.textContent;
  const records=container.querySelector("input,textarea");
  button.click();await vi.advanceTimersByTimeAsync(0);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({body:expect.objectContaining({expected_revision:4})})]));
  expect(container.textContent).toBe(text?.replace("Your records are ready to publish", "Checking published records"));expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).not.toBe("true");
  expect(container.querySelector("input,textarea")).toBe(records);
  await vi.advanceTimersByTimeAsync(2000);expect(post).toHaveBeenCalledTimes(1);
  get.mockRejectedValueOnce(new Error("offline"));
  await vi.advanceTimersByTimeAsync(4000);
  expect(container.textContent).toContain("Could not refresh verification status");
  expect(button.disabled).toBe(true);expect(button.textContent).toBe("I published all records manually");
  const calls=get.mock.calls.length;await vi.advanceTimersByTimeAsync(60000);expect(get).toHaveBeenCalledTimes(calls);
  const retry=[...container.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Retry status")!;
  retry.click();await vi.advanceTimersByTimeAsync(0);expect(get).toHaveBeenCalledTimes(calls+1);expect(post).toHaveBeenCalledTimes(1);
});

test("preparation advances across server revisions by GET and displays records automatically",async()=>{
 const post=vi.fn();
 const get=vi.fn(async()=>session);
 const api=makeApi(async()=>({community_id:"community-1",attachment:null,session:{...session,status:"provisioning",revision:2,publication_check_pending:false}}),post,get);
 vi.useFakeTimers();
 const {container}=render(()=><CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
 await vi.advanceTimersByTimeAsync(0);
 expect(container.textContent).toContain("Prepare your records");
 expect(container.textContent).not.toContain("Checking records");
 expect([...container.querySelectorAll("button")].find(b=>b.textContent==="Start verification")?.disabled).toBe(true);
 await vi.advanceTimersByTimeAsync(2000);
 expect(container.textContent).toContain("Your records are ready to publish");expect(container.textContent).toContain("ns1.midnight");
 expect(post).not.toHaveBeenCalled();expect(get).toHaveBeenCalledTimes(1);
});

test("fresh controllers recover pending imports without a locator",async()=>{
 const discovery=vi.fn(async()=>({community_id:"community-1",attachment:null,session:{...session,publication_check_pending:true}}));
 for(let visit=0;visit<3;visit++){
  const api=makeApi(discovery);const {container,cleanup}=render(()=><CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.waitFor(()=>expect(container.textContent).toContain("Checking published records"));cleanup();
 }
 expect(discovery).toHaveBeenCalledTimes(3);
});

test.each([null,{canonical_route:{root_label_display:"midnight"},status:"suspended"}])("renders asserted attachment and absence %j",async attachment=>{
 const api=makeApi(async()=>({community_id:"community-1",attachment,session:null}));
 const {container}=render(()=><CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
 await vi.waitFor(()=>expect(container.textContent).toContain("No import found for your account."));
 expect(container.querySelector("[data-namespace-attachment]")!==null).toBe(attachment!==null);
});


test("unchanged reads back off, pause in a hidden tab and reset after progress", async () => {
  const post = vi.fn();
  const get = vi.fn(async () => ({ ...session, publication_check_pending: true }));
  const api = makeApi(async () => ({ community_id: "community-1", attachment: null, session: { ...session, publication_check_pending: true } }), post, get);
  vi.useFakeTimers();
  const { container } = render(() => <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.advanceTimersByTimeAsync(0);
  for (const [index, seconds] of [2, 4, 8, 16, 30, 30].entries()) {
    await vi.advanceTimersByTimeAsync(seconds * 1000 - 1);
    expect(get).toHaveBeenCalledTimes(index);
    await vi.advanceTimersByTimeAsync(1);
    expect(get).toHaveBeenCalledTimes(index + 1);
  }
  const primary = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "I published all records manually")!;
  expect(primary.disabled).toBe(true);
  expect(primary.getAttribute("aria-busy")).not.toBe("true");
  primary.click();
  expect(post).not.toHaveBeenCalled();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(300_000);
  expect(get).toHaveBeenCalledTimes(6);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  get.mockResolvedValueOnce({ ...session, revision: 4, publication_check_pending: true });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(get).toHaveBeenCalledTimes(7);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(get).toHaveBeenCalledTimes(8);
  expect(post).not.toHaveBeenCalled();
});

test("awaiting publication does not poll", async () => {
  const get = vi.fn();
  const post = vi.fn();
  vi.useFakeTimers();
  const api = makeApi(async () => ({ community_id: "community-1", attachment: null, session }), post, get);
  render(() => <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(get).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});


test("only the explicit acknowledgement spins its button, not background reads", async () => {
  let completePost!: (value: typeof session) => void;
  let completeRead!: (value: typeof session) => void;
  const post = vi.fn(() => new Promise<typeof session>(resolve => { completePost = resolve; }));
  const get = vi.fn(async () => session);
  const api = makeApi(async () => ({ community_id: "community-1", attachment: null, session }), post, get);
  vi.useFakeTimers();
  const { container } = render(() => <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.advanceTimersByTimeAsync(0);
  const primary = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "I published all records manually")!;
  primary.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(primary.getAttribute("aria-busy")).toBe("true");
  completePost({ ...session, publication_check_pending: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(primary.disabled).toBe(true);
  expect(primary.getAttribute("aria-busy")).not.toBe("true");
  get.mockImplementationOnce(() => new Promise<typeof session>(resolve => { completeRead = resolve; }));
  await vi.advanceTimersByTimeAsync(2_000);
  expect(get).toHaveBeenCalledTimes(2);
  expect(primary.getAttribute("aria-busy")).not.toBe("true");
  completeRead({ ...session, publication_check_pending: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(post).toHaveBeenCalledTimes(1);
});


test.each([
  "Refresh the page before changing the community address.",
  "The HNS verification session is missing.",
  "The HNS verification response did not match this community.",
])("preserves the namespace adapter error: %s", async (message) => {
  const api = {
    read: async () => ({ community_id: "community-1", family: "hns" as const, generation: 1, root_label: "midnight", next_action: { kind: "start_verification" as const, family: "hns" as const, root_label: "midnight" } }),
    execute: vi.fn(async () => { throw new CommunityNamespaceSettingsApiError(message); }),
  };
  const { container } = render(() => <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.waitFor(() => expect(container.textContent).toContain("Start verification"));
  [...container.querySelectorAll("button")].find(button => button.textContent === "Start verification")!.click();
  await vi.waitFor(() => expect(container.textContent).toContain(message));
  expect(api.execute).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain("That HNS address step could not be completed.");
});

test("deadline crossing regenerates in one click and retains recovery when CSRF is missing", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T05:00:00Z"));
  let csrf: string | undefined;
  let savedLocator: string | null = null;
  const start = vi.fn(async () => ({ ...session, root_import_session_id: "session-2", expires_at: "2026-09-08T07:00:00Z", revision: 2, status: "provisioning" }));
  const get = vi.fn(async () => ({ ...session, root_import_session_id: "session-2", expires_at: "2026-09-08T07:00:00Z" }));
  const api = createCommunityNamespaceSettingsApi({
    communityId: "community-1", communityPath: "/c/community-1", readCsrfToken: () => csrf,
    locator: { read: () => savedLocator, write: value => { savedLocator = value; }, clear: () => { savedLocator = null; } },
    // SAFETY: These fakes implement the generated discovery, start and read methods.
    client: {
      get_communitiesCommunityIdHnsRootImports: async () => ({ community_id: "community-1", attachment: null, session: { ...session, expires_at: "2026-09-08T06:00:00Z" } }),
      post_communitiesCommunityIdHnsRootImports: start,
      get_communitiesCommunityIdHnsRootImportsSessionId: get,
    } as never,
  });
  const { container } = render(() => <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.advanceTimersByTimeAsync(0);
  expect(container.querySelector("time")?.dateTime).toBe("2026-09-08T06:00:00Z");
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(get).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Verification expired");
  expect(container.textContent).toContain(".midnight");
  const regenerate = () => [...container.querySelectorAll("button")].find(button => button.textContent === "Get a new record list")!;
  regenerate().click();
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("Refresh the page before changing the community address.");
  expect(start).not.toHaveBeenCalled();
  expect(savedLocator).toBe("session-1");
  expect(regenerate().disabled).toBe(false);
  csrf = "restored-csrf";
  regenerate().click();
  await vi.advanceTimersByTimeAsync(0);
  expect(start).toHaveBeenCalledTimes(1);
  expect(start.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ body: expect.objectContaining({ root_label: "midnight" }) })]));
  expect(savedLocator).toBe("session-2");
  expect(container.textContent).toContain("Prepare your records");
  await vi.advanceTimersByTimeAsync(2_000);
  expect(container.textContent).toContain("Your records are ready to publish");
  expect(container.textContent).toContain("ns1.midnight");
  expect(start).toHaveBeenCalledTimes(1);
});


test.each(["provisioning", "observing", "ready", "awaiting_ownership"])("a suspended tab recovers an expired %s state without another mutation", async status => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T05:00:00Z"));
  const deadlineSession = { ...session, status, expires_at: "2026-09-08T06:00:00Z", provisioning_authorization: { expires_at: "2026-09-08T06:00:00Z", message: "proof" } };
  const get = vi.fn(async () => deadlineSession);
  const post = vi.fn();
  const api = makeApi(async () => ({ community_id: "community-1", attachment: null, session: deadlineSession }), post, get);
  const { container } = render(() => <CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" />);
  await vi.advanceTimersByTimeAsync(0);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(3_600_001);
  expect(get).not.toHaveBeenCalled();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("Verification expired");
  expect(post).not.toHaveBeenCalled();
});
