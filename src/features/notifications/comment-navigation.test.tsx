import { createRoot, createSignal } from "solid-js";
import { render as solidRender } from "@solidjs/web";
import { createRouter, memoryHistory, useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";
import { createSessionApiClient } from "../../api/client.ts";
import { clearSession } from "../../api/session.ts";
import * as sessionApi from "../../api/session.ts";
import { safeReturnPath, signInReturnPath } from "../auth/sign-in-return.ts";
import { createCommentThreadController } from "../posts/post-engagement/comment-thread-controller.ts";
import type { CommentThreadItem } from "../posts/post-engagement/post-engagement-model.ts";
import { PublicPostRouteView } from "../posts/public-post/public-post-route-view.tsx";
import { resolvePublicPostPreflight } from "../posts/public-post/public-post-preflight.ts";
import { createMemoryPendingEngagementStorage } from "../posts/post-engagement/post-engagement-pending.ts";
import { createCommentNavigationReader, validateCommentNavigation } from "./comment-navigation-api.ts";
import { commentSelector } from "./comment-selector.ts";
import { loadTargetedPost, type TargetedPostClient } from "./targeted-post.ts";
import { TargetedPostEntry } from "./targeted-post-entry.tsx";
import { useTargetedPersona } from "./targeted-persona-context.ts";
import { navigationFixture, postFixture } from "./navigation-fixtures.ts";
import { CommentEntryRoute } from "./comment-entry.tsx";

// SAFETY: vitest.app selects the DOM renderer; this exact call signature is
// the renderer's browser export, while tsc selects its server overload.
const render = solidRender as (view: () => JSX.Element, host: HTMLElement) => void;
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.replaceChildren(); document.head.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const mount = (view: () => JSX.Element) => { const host = document.createElement("div"); document.body.appendChild(host); createRoot(dispose => { cleanups.push(dispose); render(view, host); }); return host; };
const client = (kind: "text" | "song" | "video", navigation = navigationFixture(2, kind === "video" ? "/post/post" : "/posts/thread")): TargetedPostClient => ({ get_publicPostsBySlug: vi.fn(async () => postFixture(kind)), get_publicPostsByIdPostIdCanonicalRoute: vi.fn(async () => postFixture(kind)), get_commentsCommentIdLocation: vi.fn(async () => navigation) });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function mountAlias() {
  const replace = vi.fn();
  vi.stubGlobal("location", { origin: "https://pirate.sc", search: "", replace });
  let navigate!: ReturnType<typeof useNavigate>, mounts = 0;
  function AliasRoute() { mounts++; navigate = useNavigate(); return <CommentEntryRoute />; }
  const Router = createRouter({ history: memoryHistory("/comments/branch-2"), routes: [{ path: "/comments/:id", component: AliasRoute }] });
  const host = mount(() => <Router>{props => props.children}</Router>);
  return { host, replace, navigate: (path: string) => navigate(path, { scroll: false }), mounts: () => mounts };
}
const aliasInvalidQueries = ["?comment=branch-2&comment=branch-2", "?comment=%ZZ", "?comment=foreign"];
test.each(aliasInvalidQueries)("installed router query change %s cancels a pending alias target without redirecting", async search => {
  vi.spyOn(sessionApi, "resolveSession").mockResolvedValue({ status: "authenticated", userId: "account", personas: [] });
  const response = deferred<Response>();
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => response.promise);
  vi.stubGlobal("fetch", fetchImpl);
  const route = mountAlias();
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
  const signal = fetchImpl.mock.calls[0]![1]?.signal;
  expect(signal?.aborted).toBe(false);
  route.navigate(`/comments/branch-2${search}`);
  await vi.waitFor(() => expect(route.host.querySelector("[data-comment-entry]")?.getAttribute("data-comment-entry")).toBe("invalid"));
  expect(route.mounts()).toBe(1);
  expect(signal?.aborted).toBe(true);
  response.resolve(Response.json(navigationFixture(2)));
  await vi.waitFor(() => expect(fetchImpl.mock.results[0]?.type).toBe("return"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(route.replace).not.toHaveBeenCalled();
  expect(route.host.textContent).toContain("This comment is not available");
  expect(fetchImpl).toHaveBeenCalledOnce();
});
test.each(aliasInvalidQueries)("installed router query change %s owns the pending session continuation", async search => {
  const session = deferred<sessionApi.SessionResolution>();
  const resolveSession = vi.spyOn(sessionApi, "resolveSession").mockReturnValue(session.promise);
  const fetchImpl = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetchImpl);
  const route = mountAlias();
  await vi.waitFor(() => expect(resolveSession).toHaveBeenCalledOnce());
  route.navigate(`/comments/branch-2${search}`);
  await vi.waitFor(() => expect(route.host.textContent).toContain("This comment is not available"));
  expect(route.mounts()).toBe(1);
  session.resolve({ status: "authenticated", userId: "account", personas: [] });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fetchImpl).not.toHaveBeenCalled(); expect(route.replace).not.toHaveBeenCalled();
});
test.each(["old-first", "current-first"] as const)("valid query-only alias navigation uses only its current response: %s", async order => {
  vi.spyOn(sessionApi, "resolveSession").mockResolvedValue({ status: "authenticated", userId: "account", personas: [] });
  const old = deferred<Response>(), current = deferred<Response>();
  const fetchImpl = vi.fn<typeof fetch>().mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
  vi.stubGlobal("fetch", fetchImpl);
  const route = mountAlias();
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
  route.navigate("/comments/branch-2?comment=branch%2D2&tracking=current");
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  expect(route.mounts()).toBe(1); expect(fetchImpl.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  if (order === "old-first") {
    old.resolve(Response.json(navigationFixture(2, "/posts/stale")));
    await new Promise(resolve => setTimeout(resolve, 0)); expect(route.replace).not.toHaveBeenCalled();
  }
  current.resolve(Response.json(navigationFixture(2, "/posts/current")));
  await vi.waitFor(() => expect(route.replace).toHaveBeenCalledExactlyOnceWith("/posts/current?comment=branch-2"));
  old.resolve(Response.json(navigationFixture(2, "/posts/stale")));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(route.replace).toHaveBeenCalledTimes(1);
});

test.each(["?comment=", "?comment=a&comment=b", "?comment=%ZZ", "?comment=%C3%28", "?comment=%00", `?comment=${"x".repeat(513)}`])("refuses selector %s", search => { expect(commentSelector(search).kind).toBe("invalid"); expect(safeReturnPath(`/posts/thread${search}`, "https://pirate.sc")).toBeUndefined(); });
test("keeps exactly one encoded selector through safe sign-in return", () => {
  const path = safeReturnPath("/posts/thread?comment=reply%20one&tracking=discard", "https://pirate.sc");
  expect(path).toBe("/posts/thread?comment=reply%20one");
  expect(signInReturnPath(`https://pirate.sc/auth/sign-in?return_to=${encodeURIComponent(path!)}`)).toBe(path);
});
test("generated resolver GET validates strict bounds without writes", async () => {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => Response.json(navigationFixture(8)));
  const read = createCommentNavigationReader(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }));
  const value = await read("branch-8", new AbortController().signal);
  expect(value.kind).toBe("available");
  expect(String(fetchImpl.mock.calls[0]?.[0])).toBe("https://pirate.sc/api/comments/branch-8/location");
  expect(fetchImpl.mock.calls).toHaveLength(1);
  const invalid = navigationFixture(8); const oversized = { ...invalid, windows: [...invalid.windows, invalid.windows[0]!] };
  const bounded = createCommentNavigationReader(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl: async () => Response.json(oversized) }));
  await expect(bounded("branch-8", new AbortController().signal)).rejects.toThrow();
});
test("rejects duplicate ancestry, foreign parent/depth, missing target and unsafe destination", () => {
  const value = navigationFixture();
  for (const invalid of [
    { ...value, ancestor_comment_ids: ["branch-0", "branch-0"] },
    { ...value, windows: value.windows.map((window, index) => index === 1 ? { ...window, parent_comment_id: "foreign" } : window) },
    { ...value, windows: value.windows.map((window, index) => index === 2 ? { ...window, items: window.items.slice(1) } : window) },
    { ...value, post_path: "//foreign.test/thread" },
    { ...value, post_path: "/post/another-post" },
  ]) expect(() => validateCommentNavigation(invalid, value.target_comment_id)).toThrow();
});
test.each(["text", "song", "video"] as const)("loads %s target with exact post identity", async kind => {
  const api = client(kind); const path = kind === "video" ? "/post/post" : "/posts/thread";
  const result = await loadTargetedPost(`${path}?comment=branch-2`, "en", "https://pirate.sc", api, new AbortController().signal);
  expect(result.kind).toBe("content"); if (result.kind === "content") { expect(result.navigation?.target_comment_id).toBe("branch-2"); if (kind === "video") expect(result.canonicalUrl).toBeNull(); }
});
test("literal video alias establishes recorded identity; alias404 never falls through to ID", async () => {
  const api = client("video");
  const result = await loadTargetedPost("/posts/historical-alias?comment=branch-2", "en", "https://pirate.sc", api, new AbortController().signal);
  expect(result.kind).toBe("content"); expect(api.get_publicPostsByIdPostIdCanonicalRoute).not.toHaveBeenCalled();
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => Response.json({ error: { code: "not_found", message: "Unavailable", retryable: false } }, { status: 404 }));
  const missing = createSessionApiClient({ origin: "https://pirate.sc", fetchImpl });
  expect((await loadTargetedPost("/posts/post?comment=branch-2", "en", "https://pirate.sc", missing, new AbortController().signal)).kind).toBe("not-found");
  expect(fetchImpl).toHaveBeenCalledTimes(1); expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("/by-slug?");
});
test("wrong-post selector refuses rather than navigating to a foreign thread; redirects preserve target", async () => {
  const api = client("song", { ...navigationFixture(), post_id: "foreign" });
  expect((await loadTargetedPost("/posts/thread?comment=branch-2", "en", "https://pirate.sc", api, new AbortController().signal)).kind).toBe("not-found");
  const redirected = await loadTargetedPost("/post/post?comment=branch-2&tracking=x", "en", "https://pirate.sc", client("song"), new AbortController().signal);
  expect(redirected).toMatchObject({ kind: "redirect", location: "https://pirate.sc/posts/thread?comment=branch-2" });
});
test("private text/song authenticated paths stay separate from null public metadata", async () => {
  const api = client("song"), response = { ...postFixture("song"), route: null };
  api.get_publicPostsByIdPostIdCanonicalRoute = async () => response;
  api.get_publicPostsBySlug = async () => response;
  expect(await loadTargetedPost("/post/post?comment=branch-2", "en", undefined, api, new AbortController().signal)).toMatchObject({ kind: "redirect", location: "/posts/thread?comment=branch-2" });
  const state = await loadTargetedPost("/posts/thread?comment=branch-2", "en", undefined, api, new AbortController().signal);
  expect(state).toMatchObject({ kind: "content", canonicalPath: null, canonicalUrl: null });
});
test("SSR targeted preflight serializes only selector ownership and never probes existence", async () => {
  const fetchImpl = vi.fn();
  const result = await resolvePublicPostPreflight(new Request("https://pirate.sc/post/post?comment=branch-2"), "https://api-next-staging.pirate.sc", "https://pirate.sc", fetchImpl);
  expect(result).toMatchObject({ requestPath: "/post/post?comment=branch-2", state: { kind: "target-entry" } });
  expect(JSON.stringify(result)).not.toContain("windows"); expect(fetchImpl).not.toHaveBeenCalled();
});
test("depth-eight seed renders 180 rows without ordinary paging; continuation revalidates and clears age/access loss", async () => {
  const navigation = navigationFixture(8); let revoked = false;
  const readTarget = vi.fn(async () => { if (revoked) throw new Error("current_access_lost"); return navigation; });
  const readComments = vi.fn(async () => ({ items: [], next_cursor: null }));
  const model = createRoot(dispose => { cleanups.push(dispose); const [comments, setComments] = createSignal<readonly CommentThreadItem[]>([]); return { comments, thread: createCommentThreadController({ postId: "post", comments, setComments, target: navigation, readTarget, readComments }) }; });
  await vi.waitFor(() => expect(model.comments()).toHaveLength(180));
  expect(model.comments()).toHaveLength(180); expect(readComments).not.toHaveBeenCalled(); expect(model.thread.earlier(null)).toBe(true);
  await model.thread.load("branch-4"); expect(readTarget).toHaveBeenCalledTimes(1); expect(readComments).toHaveBeenCalledWith(expect.objectContaining({ cursor: "continuation-5", parentId: "branch-4" }));
  revoked = true; await model.thread.load(); expect(model.comments()).toEqual([]); expect(model.thread.target()).toBeUndefined();
  await model.thread.reset(); expect(readComments).toHaveBeenLastCalledWith(expect.objectContaining({ postId: "post" }));
});
test.each(["text", "song", "video"] as const)("rendered %s expands supplied windows and focuses actual target once despite vote failure", async kind => {
  const navigation = navigationFixture(8, kind === "video" ? "/post/post" : "/posts/thread");
  const readComments = vi.fn(async () => ({ items: [], next_cursor: null }));
  const state = { kind: "content" as const, status: 200 as const, activity: "detail" as const, response: postFixture(kind), canonicalPath: null, canonicalUrl: null, navigation };
  const host = mount(() => <PublicPostRouteView state={state} engagement={{ resolveSession: async () => ({ status: "authenticated", userId: "account", personas: [] }), readViewerVote: async () => { throw new Error("vote_unavailable"); }, readComments, pendingStorage: createMemoryPendingEngagementStorage(), readTarget: async () => navigation }} />);
  await vi.waitFor(() => expect(host.querySelector('[data-comment-id="branch-8"]')?.textContent).toContain("Authorized branch 8"));
  await vi.waitFor(() => expect(document.activeElement?.getAttribute("data-inline-comment")).toBe("branch-8"));
  expect(host.querySelectorAll("[data-comment-id]")).toHaveLength(180); expect(readComments).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Earlier comments are omitted"); expect(host.textContent).toContain("View all comments");
  if (kind === "video") expect(host.textContent).toContain("Playback is being prepared");
  clearSession(); await vi.waitFor(() => expect(host.querySelector('[data-comment-id="branch-8"]')).toBeNull());
});
test("anonymous targeted hydration does no existence read and keeps a safe sign-in return", async () => {
  const api = client("video");
  const host = mount(() => <TargetedPostEntry entry={{ kind: "target-entry", status: 200, requestPath: "/post/post?comment=branch-2", locale: "en" }} client={api} session={async () => "anonymous"}>{() => <p>Private content</p>}</TargetedPostEntry>);
  await vi.waitFor(() => expect(host.textContent).toContain("Sign in"));
  expect(api.get_commentsCommentIdLocation).not.toHaveBeenCalled(); expect(api.get_publicPostsByIdPostIdCanonicalRoute).not.toHaveBeenCalled();
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/auth/sign-in?return_to=%2Fpost%2Fpost%3Fcomment%3Dbranch-2");
});
test("target-only bare age and wrapped post age stay distinct and expose no windows", async () => {
  const locked = { kind: "age_locked" as const, content_rating: "adult_18" as const, next_action: { kind: "verify_minimum_age" as const, minimum_age: 18 as const } };
  const api = client("video");
  const target = await loadTargetedPost("/post/post?comment=branch-2", "en", undefined, { ...api, get_commentsCommentIdLocation: async () => locked }, new AbortController().signal);
  expect(target).toEqual({ kind: "target-age-locked", status: 200 });
  const post = await loadTargetedPost("/post/post?comment=branch-2", "en", undefined, { ...api, get_publicPostsByIdPostIdCanonicalRoute: async () => ({ kind: "age_locked", locked }) }, new AbortController().signal);
  expect(post).toEqual({ kind: "age-locked", status: 200, activity: "detail", locked });
});
test("a cancelled targeted response never hydrates private rows into another session", async () => {
  let complete!: (value: ReturnType<typeof navigationFixture>) => void;
  const pending = new Promise<ReturnType<typeof navigationFixture>>(done => { complete = done; });
  const api = { ...client("video"), get_commentsCommentIdLocation: vi.fn(() => pending) };
  let anonymous = false;
  const host = mount(() => <TargetedPostEntry entry={{ kind: "target-entry", status: 200, requestPath: "/post/post?comment=branch-2", locale: "en" }} client={api} session={async () => anonymous ? "anonymous" : { status: "authenticated", userId: "account", personas: [] }}>{() => <p>Private target rendered</p>}</TargetedPostEntry>);
  await vi.waitFor(() => expect(api.get_commentsCommentIdLocation).toHaveBeenCalledOnce());
  anonymous = true; clearSession(); complete(navigationFixture(2, "/post/post"));
  await vi.waitFor(() => expect(host.textContent).toContain("Sign in")); expect(host.textContent).not.toContain("Private target rendered");
});
test("rendered unavailable video playback still hosts the authorized inline target", async () => {
  const navigation = navigationFixture(0, "/post/post");
  const host = mount(() => <PublicPostRouteView state={{ kind: "content", status: 200, activity: "detail", response: postFixture("video", "unavailable"), canonicalPath: null, canonicalUrl: null, navigation }} engagement={{ resolveSession: async () => ({ status: "authenticated", userId: "account", personas: [] }), readViewerVote: async () => { throw new Error("unrelated_vote_failure"); }, pendingStorage: createMemoryPendingEngagementStorage() }} />);
  await vi.waitFor(() => expect(host.querySelector('[data-comment-id="branch-0"]')?.textContent).toContain("Authorized branch 0"));
  expect(host.textContent).toContain("Playback is unavailable");
});
test("a current target refusal discards independently loaded private post detail", async () => {
  function RefuseTarget() {
    const context = useTargetedPersona();
    return <><p>Private destination body</p><button onClick={() => context?.refuse("missing")}>Revalidate</button></>;
  }
  const host = mount(() => <TargetedPostEntry entry={{ kind: "target-entry", status: 200, requestPath: "/post/post?comment=branch-2", locale: "en" }} client={client("video")} session={async () => ({ status: "authenticated", userId: "account", personas: [] })}>{() => <RefuseTarget />}</TargetedPostEntry>);
  await vi.waitFor(() => expect(host.textContent).toContain("Private destination body"));
  host.querySelector<HTMLButtonElement>("button")!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("This comment is not available"));
  expect(host.textContent).not.toContain("Private destination body");
});
test("changing the operation persona clears private detail before reloading", async () => {
  let next!: (value: ReturnType<typeof navigationFixture>) => void;
  const api = client("video");
  api.get_commentsCommentIdLocation = vi.fn().mockResolvedValueOnce(navigationFixture(2, "/post/post")).mockImplementationOnce(() => new Promise(done => { next = done; }));
  function ChoosePersona() { const context = useTargetedPersona(); return <><p>Private destination body</p><button onClick={() => context?.select("other-persona")}>Change profile</button></>; }
  const host = mount(() => <TargetedPostEntry entry={{ kind: "target-entry", status: 200, requestPath: "/post/post?comment=branch-2", locale: "en" }} client={api} session={async () => ({ status: "authenticated", userId: "account", personas: [] })}>{() => <ChoosePersona />}</TargetedPostEntry>);
  await vi.waitFor(() => expect(host.textContent).toContain("Private destination body"));
  host.querySelector<HTMLButtonElement>("button")!.click();
  await vi.waitFor(() => expect(api.get_commentsCommentIdLocation).toHaveBeenCalledTimes(2));
  expect(host.textContent).not.toContain("Private destination body");
  next(navigationFixture(2, "/post/post"));
  await vi.waitFor(() => expect(host.textContent).toContain("Private destination body"));
});
test("Back/Forward restoration clears the old private document and revalidates its session", async () => {
  let anonymous = false;
  const session = vi.fn(async () => anonymous ? "anonymous" as const : { status: "authenticated" as const, userId: "account", personas: [] });
  const host = mount(() => <TargetedPostEntry entry={{ kind: "target-entry", status: 200, requestPath: "/post/post?comment=branch-2", locale: "en" }} client={client("video")} session={session}>{() => <p>Private cached detail</p>}</TargetedPostEntry>);
  await vi.waitFor(() => expect(host.textContent).toContain("Private cached detail"));
  window.dispatchEvent(new Event("pagehide"));
  await vi.waitFor(() => expect(host.textContent).not.toContain("Private cached detail"));
  anonymous = true;
  const restored = new Event("pageshow"); Object.defineProperty(restored, "persisted", { value: true }); window.dispatchEvent(restored);
  await vi.waitFor(() => expect(host.textContent).toContain("Sign in")); expect(session).toHaveBeenCalledTimes(2);
});
test("targeted video does not request playback access until the viewer explicitly plays", async () => {
  const fetchImpl = vi.fn(async () => Response.json({ error: { code: "not_found", message: "Unavailable", retryable: false } }, { status: 404 }));
  vi.stubGlobal("fetch", fetchImpl);
  const navigation = navigationFixture(0, "/post/post");
  const host = mount(() => <PublicPostRouteView state={{ kind: "content", status: 200, activity: "detail", response: postFixture("video", "ready"), canonicalPath: null, canonicalUrl: null, navigation }} engagement={{ resolveSession: async () => ({ status: "authenticated", userId: "account", personas: [] }), readViewerVote: async () => null, pendingStorage: createMemoryPendingEngagementStorage() }} />);
  await vi.waitFor(() => expect(host.querySelector('[data-comment-id="branch-0"]')).not.toBeNull());
  expect([...host.querySelectorAll("button")].some(button => button.textContent === "Play video")).toBe(true);
  expect(fetchImpl).not.toHaveBeenCalled();
});
test("focus is once per authorized target generation and cannot survive a reset", async () => {
  const model = createRoot(dispose => {
    cleanups.push(dispose);
    const [comments, setComments] = createSignal<readonly CommentThreadItem[]>([]);
    return { comments, thread: createCommentThreadController({ postId: "post", comments, setComments, target: navigationFixture(0), readComments: async () => ({ items: [], next_cursor: null }) }) };
  });
  await vi.waitFor(() => expect(model.comments()).toHaveLength(20));
  const element = document.createElement("div"); element.tabIndex = -1; document.body.appendChild(element);
  const focus = vi.spyOn(element, "focus");
  model.thread.focus(element, "branch-0"); model.thread.focus(element, "branch-0");
  await vi.waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
  model.thread.clear(); model.thread.focus(element, "branch-0");
  await Promise.resolve(); expect(focus).toHaveBeenCalledTimes(1);
});
