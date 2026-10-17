import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { createCommentThreadController } from "./comment-thread-controller.ts";
import type { CommentThreadItem } from "./post-engagement-model.ts";
import type { CommentThreadPage, CommentThreadReader } from "./comment-thread-api.ts";
import { navigationFixture } from "../../notifications/navigation-fixtures.ts";
import type { CommentNavigationReader } from "../../notifications/comment-navigation-api.ts";
import { clearSession } from "../../../api/session.ts";

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function continuation(id: string, parentId: string | null, next: string | null): CommentThreadPage {
  const source = navigationFixture(1).windows[parentId === null ? 0 : 1]!.items[0]!;
  if ("kind" in source) throw new Error("Expected published fixture");
  return { items: [{ ...source,
    comment_id: id, parent_comment_id: parentId, body: `Current ${id}` }], next_cursor: next };
}
function targetedThread(readComments: CommentThreadReader, readTarget: CommentNavigationReader = async () => navigationFixture(1)) {
  return createRoot(dispose => {
    disposers.push(dispose);
    const [comments, setComments] = createSignal<readonly CommentThreadItem[]>([]);
    return { comments, dispose, controller: createCommentThreadController({ postId: "post", comments, setComments,
      target: navigationFixture(1), readTarget, readComments }) };
  });
}

test.each(["redacted", "hidden", "age"] as const)("retained continuation %s earns a fresh projection through its original cursor", async mode => {
  const first = continuation("retained", null, "root-next");
  const source = first.items[0]!;
  if ("kind" in source) throw new Error("Expected published fixture");
  const identified = { ...source, body: "Obsolete private body", author_persona: {
    persona_id: "obsolete-persona", display_name: "Obsolete identity", avatar_ref: "obsolete-avatar",
    primary_public_handle: "obsolete-handle", object: "persona" as const,
  } };
  let projection: CommentThreadPage = { ...first, items: [identified] };
  const guard = deferred<ReturnType<typeof navigationFixture>>();
  const reread = deferred<CommentThreadPage>();
  const readTarget = vi.fn(async () => navigationFixture(1));
  const readComments = vi.fn<CommentThreadReader>(async input => input.cursor === "continuation-0" ? projection : continuation(input.cursor === "root-current" ? "later" : "final", null, input.cursor === "root-current" ? "root-final" : null));
  const model = targetedThread(readComments, readTarget);
  await vi.waitFor(() => expect(model.comments()).toHaveLength(40));
  await model.controller.load();
  expect(model.comments().find(item => item.id === "retained")).toMatchObject({ body: "Obsolete private body", authorPersonaId: "obsolete-persona" });
  // Revalidate only pages actually retained, with the same parent and cursor;
  // the resolver's target authorization never authorizes cached siblings.
  readTarget.mockImplementationOnce(() => guard.promise);
  readComments.mockImplementationOnce(() => reread.promise);
  const pending = model.controller.load();
  await vi.waitFor(() => expect(model.comments()).toEqual([]));
  const obsoleteAbsent = () => {
    const serialized = JSON.stringify(model.comments());
    for (const obsolete of ["Obsolete private body", "obsolete-persona", "obsolete-avatar", "obsolete-handle", "Obsolete identity"])
      expect(serialized).not.toContain(obsolete);
  };
  obsoleteAbsent();
  guard.resolve(navigationFixture(1));
  await vi.waitFor(() => expect(readComments).toHaveBeenCalledTimes(2));
  expect(readComments.mock.lastCall?.[0]).toMatchObject({ postId: "post", cursor: "continuation-0" });
  expect(readComments.mock.lastCall?.[0].parentId).toBeUndefined();
  obsoleteAbsent();
  projection = { items: mode === "hidden" ? [] : mode === "age" ? [{ kind: "age_locked", content_rating: "adult_18", next_action: { kind: "verify_minimum_age", minimum_age: 18 } }] : [{ ...source, body: "Current redacted body", author_persona: null }], next_cursor: "root-current" };
  reread.resolve(projection);
  await pending;
  obsoleteAbsent();
  if (mode === "redacted") expect(model.comments().find(item => item.id === "retained")).toMatchObject({ body: "Current redacted body", authorProfile: null });
  else expect(model.comments().some(item => item.id === "retained")).toBe(false);
  if (mode === "age") expect(model.comments().some(item => item.state === "age_locked")).toBe(true);
  expect(model.controller.pages().root?.cursor).toBe("root-final");
  await model.controller.load();
  obsoleteAbsent();
  expect(model.controller.pages().root?.cursor).toBeNull();
  expect(model.comments().some(item => item.body === "Obsolete private body")).toBe(false);
  expect(readComments.mock.calls.map(([input]) => input.cursor)).toEqual([
    "continuation-0", "continuation-0", "root-current", "continuation-0", "root-current", "root-final",
  ]);
});

test.each(["root-first", "reply-first"] as const)("targeted continuations serialize %s and preserve both completed pages and cursors", async order => {
  const first = deferred<CommentThreadPage>();
  const readComments = vi.fn<CommentThreadReader>()
    .mockImplementationOnce(() => first.promise)
    .mockImplementation(async input => continuation(input.parentId ? "reply-extra" : "root-extra", input.parentId ?? null, input.parentId ? "reply-next" : "root-next"));
  const readTarget = vi.fn(async () => navigationFixture(1));
  const model = targetedThread(readComments, readTarget);
  await vi.waitFor(() => expect(model.comments()).toHaveLength(40));
  const firstParent = order === "root-first" ? undefined : "branch-0";
  const secondParent = order === "root-first" ? "branch-0" : undefined;
  const pending = model.controller.load(firstParent);
  const queued = model.controller.load(secondParent);
  const duplicate = model.controller.load(secondParent);
  await vi.waitFor(() => expect(readComments).toHaveBeenCalledTimes(1));
  expect(readTarget).toHaveBeenCalledTimes(1);
  first.resolve(continuation(firstParent ? "reply-extra" : "root-extra", firstParent ?? null, firstParent ? "reply-next" : "root-next"));
  await Promise.all([pending, queued, duplicate]);
  expect(model.comments().map(item => item.id)).toEqual(expect.arrayContaining(["root-extra", "reply-extra"]));
  expect(model.controller.pages().root?.cursor).toBe("root-next");
  expect(model.controller.pages()["parent:branch-0"]?.cursor).toBe("reply-next");
  expect(readTarget).toHaveBeenCalledTimes(2);
  // Exactly first page, its scoped reread, then the queued parent's page.
  expect(readComments.mock.calls.map(([input]) => [input.parentId, input.cursor])).toEqual([
    [firstParent, firstParent ? "continuation-1" : "continuation-0"],
    [firstParent, firstParent ? "continuation-1" : "continuation-0"],
    [secondParent, secondParent ? "continuation-1" : "continuation-0"],
  ]);
});

test.each((["clear", "session", "reset", "dispose"] as const).flatMap(action => (["guard", "page"] as const).map(stage => ({ action, stage }))))("$action cancels $stage and queued targeted loads without stale revival", async ({ action, stage }) => {
  const pendingGuard = deferred<ReturnType<typeof navigationFixture>>();
  const pendingPage = deferred<CommentThreadPage>();
  const readComments = vi.fn<CommentThreadReader>().mockResolvedValue({ items: [], next_cursor: null });
  if (stage === "page") readComments.mockImplementationOnce(() => pendingPage.promise);
  const readTarget = vi.fn<CommentNavigationReader>(async () => navigationFixture(1));
  if (stage === "guard") readTarget.mockImplementationOnce(() => pendingGuard.promise);
  const model = targetedThread(readComments, readTarget);
  await vi.waitFor(() => expect(model.comments()).toHaveLength(40));
  const first = model.controller.load();
  const queued = model.controller.load("branch-0");
  await vi.waitFor(() => expect(stage === "page" ? readComments : readTarget).toHaveBeenCalledTimes(1));
  const signal = stage === "page" ? readComments.mock.calls[0]![0].signal! : readTarget.mock.calls[0]![1];
  if (action === "clear") model.controller.clear();
  else if (action === "session") clearSession();
  else if (action === "reset") await model.controller.reset();
  else model.dispose();
  expect(signal.aborted).toBe(true);
  if (action !== "dispose") await vi.waitFor(() => expect(model.comments()).toEqual([]));
  const afterCancellation = JSON.stringify(model.comments());
  pendingGuard.resolve(navigationFixture(1));
  pendingPage.resolve(continuation("stale-private", null, "stale-cursor"));
  await Promise.all([first, queued]);
  expect(JSON.stringify(model.comments())).toBe(afterCancellation);
  expect(model.comments().some(item => item.id === "stale-private")).toBe(false);
  expect(readTarget).toHaveBeenCalledTimes(1);
  expect(readComments).toHaveBeenCalledTimes((stage === "page" ? 1 : 0) + (action === "reset" ? 1 : 0));
  if (action !== "dispose") { expect(model.controller.target()).toBeUndefined(); expect(model.comments()).toEqual([]); }
  if (action === "reset") expect(readComments.mock.lastCall?.[0].cursor).toBeUndefined();
});

test("session loss before dequeue prevents every queued target or page read", async () => {
  const readComments = vi.fn<CommentThreadReader>(), readTarget = vi.fn<CommentNavigationReader>();
  const model = targetedThread(readComments, readTarget);
  await vi.waitFor(() => expect(model.comments()).toHaveLength(40));
  const first = model.controller.load(), queued = model.controller.load("branch-0");
  clearSession();
  await Promise.all([first, queued]);
  expect(model.comments()).toEqual([]); expect(model.controller.target()).toBeUndefined();
  expect(readTarget).not.toHaveBeenCalled(); expect(readComments).not.toHaveBeenCalled();
});

test("opaque cursor bytes never act as a target-page marker", async () => {
  const target = navigationFixture(1);
  const value = { ...target, windows: target.windows.map(window => window.parent_comment_id === null ? { ...window, next_cursor: "target" } : window) };
  const readComments = vi.fn<CommentThreadReader>(async input => continuation(input.cursor === "target" ? "retained" : "later", null, input.cursor === "target" ? "next" : null));
  const model = targetedThread(readComments, async () => value);
  // Refresh supplies the current branch whose cursor is the literal "target".
  await model.controller.refresh(new AbortController().signal);
  await model.controller.load(); await model.controller.load();
  expect(readComments.mock.calls.map(([input]) => input.cursor)).toEqual(["target", "target", "next"]);
  expect(model.comments().map(item => item.id)).toEqual(expect.arrayContaining(["retained", "later"]));
  expect(model.controller.pages().root?.cursor).toBeNull();
});

test("age refresh replaces locked pages while retaining local drafts and refusing a late disposed read", async () => {
  let verified = false;
  const locked: CommentThreadPage = {
    items: [
      {
        kind: "age_locked",
        content_rating: "adult_18",
        next_action: { kind: "verify_minimum_age", minimum_age: 18 },
      },
    ],
    next_cursor: null,
  };
  const published: CommentThreadPage = {
    items: [
      {
        comment_id: "comment-a",
        parent_comment_id: null,
        body: "Authorized comment",
        depth: 0,
        reply_count: 0,
        status: "published",
        content_rating: "adult_18",
        created_at: "2026-09-14T00:00:00Z",
        author_persona: null,
      },
    ],
    next_cursor: null,
  };
  let dispose = () => {};
  const { controller, comments, draft } = createRoot((cleanup) => {
    dispose = cleanup;
    const [comments, setComments] = createSignal<readonly CommentThreadItem[]>([]);
    const [draft] = createSignal("Unsubmitted reply");
    return {
      comments,
      draft,
      controller: createCommentThreadController({
        postId: "post-a",
        comments,
        setComments,
        readComments: async () => (verified ? published : locked),
      }),
    };
  });
  try {
    await controller.load();
    expect(comments()[0]?.state).toBe("age_locked");
    verified = true;
    await controller.refresh(new AbortController().signal);
    expect(comments().map((item) => item.body)).toEqual(["Authorized comment"]);
    expect(draft()).toBe("Unsubmitted reply");
    dispose();
    verified = false;
    await controller.refresh(new AbortController().signal);
    expect(comments().map((item) => item.body)).toEqual(["Authorized comment"]);
  } finally {
    dispose();
  }
});
