import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createCommunityNamespaceSettingsApi } from "./community-namespace-settings-api";
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
  publish_plan: { replacement_records: [{ type: "NS", ns: "ns1.midnight" }] },
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
