import { onSessionRefreshed } from "../../../api/session.ts";
import { createMemo, createSignal, onCleanup, type Accessor, type Setter } from "solid-js";
import { projectPublishedComment, createCommentThreadReader, type CommentThreadReader, type CommentThreadPage } from "./comment-thread-api.ts";
import type { CommentThreadItem } from "./post-engagement-model.ts";
import { ApiClientError } from "@pirate/api-client";
import { captureSessionAuthority } from "../../../api/browser-session-events.ts";
import { createCommentNavigationReader, validateCommentNavigation, type CommentNavigation, type CommentNavigationReader } from "../../notifications/comment-navigation-api.ts";

/** Owns lazy persisted pages; local pending submissions remain in the same thread. */
export function createCommentThreadController(options: {
  readonly postId: string;
  readonly readComments?: CommentThreadReader;
  readonly comments: Accessor<readonly CommentThreadItem[]>;
  readonly setComments: Setter<readonly CommentThreadItem[]>;
  readonly target?: CommentNavigation;
  readonly readTarget?: CommentNavigationReader;
  readonly onTargetRefused?: (kind: "age" | "missing" | "unavailable") => void;
}) {
  const readComments = options.readComments ?? createCommentThreadReader();
  const [threadPages, setThreadPages] = createSignal<
    Record<string, { cursor: string | null; state: "loading" | "ready" | "error" }>
  >({});
  let disposed = false;
  let generation = 0;
  let request = new AbortController();
  const [target, setTarget] = createSignal<CommentNavigation>();
  const [targetIssue, setTargetIssue] = createSignal<"age" | "missing" | "unavailable" | undefined>();
  let focused = false;
  let targeted = options.target !== undefined;
  let targetedQueue: Promise<void> = Promise.resolve();
  const queuedParents = new Map<string, Promise<void>>();
  const retainedPages = new Map<string, { seeded?: true; parentId?: string; cursor?: string; items: readonly CommentThreadItem[]; nextCursor: string | null }>();
  onCleanup(() => {
    disposed = true;
    request.abort(); generation++;
  });
  const project = (page: CommentThreadPage, parentId?: string, cursor?: string): CommentThreadItem[] => {
    const key = parentId === undefined ? "root" : `parent:${parentId}`;
    return page.items.map((item, index) =>
        "kind" in item
          ? {
              id: `locked:${key}:${cursor ?? "first"}:${index}`,
              parentId: parentId ?? null,
              body: "",
              depth: parentId
                ? (options.comments().find((c) => c.id === parentId)?.depth ?? 0) + 1
                : 0,
              replyCount: 0,
              state: "age_locked",
              submissionId: null,
              caseRef: null,
              href: null,
            }
          : projectPublishedComment(item),
      );
  };
  function clear() {
    generation++; request.abort(); request = new AbortController();
    targetedQueue = Promise.resolve(); queuedParents.clear();
    retainedPages.clear(); options.setComments([]); setThreadPages({}); setTarget(undefined); focused = false;
  }
  function seed(value: CommentNavigation) {
    validateCommentNavigation(value, value.target_comment_id);
    if (value.post_id !== options.postId || (options.target && (value.community_id !== options.target.community_id || value.post_path !== options.target.post_path || value.target_comment_id !== options.target.target_comment_id))) throw new Error("target_post_mismatch");
    const loaded: CommentThreadItem[] = [];
    const pages: ReturnType<typeof threadPages> = {};
    retainedPages.clear();
    for (const window of value.windows) {
      const parentId = window.parent_comment_id ?? undefined, key = parentId === undefined ? "root" : `parent:${parentId}`;
      const items = window.items.map((item, index) => "kind" in item ? {
        id: `locked:target:${key}:${index}`, parentId: parentId ?? null, body: "", depth: value.windows.indexOf(window), replyCount: 0,
        state: "age_locked" as const, submissionId: null, caseRef: null, href: null,
      } : projectPublishedComment(item));
      loaded.push(...items); pages[key] = { cursor: window.next_cursor, state: "ready" };
      retainedPages.set(JSON.stringify(["target", parentId ?? null]), { seeded: true, parentId, items, nextCursor: window.next_cursor });
    }
    options.setComments(loaded); setThreadPages(pages); setTarget(value); setTargetIssue(undefined);
  }
  if (options.target) {
    const initialTarget = options.target, revision = generation, authority = captureSessionAuthority();
    // Seed after component construction; Solid disallows writing parent-owned
    // signals during an owned construction scope.
    queueMicrotask(() => { if (!disposed && generation === revision && authority === captureSessionAuthority()) seed(initialTarget); });
  }
  const loadPage = async (parentId?: string): Promise<void> => {
    if (disposed) return;
    const revision = generation;
    const authority = captureSessionAuthority();
    const signal = request.signal;
    const key = parentId === undefined ? "root" : `parent:${parentId}`;
    const prior = threadPages()[key];
    if (prior?.state === "loading" || (prior?.state === "ready" && prior.cursor === null)) return;
    let cursor = prior?.cursor ?? undefined;
    const current = () => {
      if (disposed || signal.aborted || revision !== generation) return false;
      if (captureSessionAuthority() !== authority) { clear(); setTargetIssue("unavailable"); options.onTargetRefused?.("unavailable"); return false; }
      return true;
    };
    const retain = (page: CommentThreadPage, parentId?: string, cursor?: string) => {
      if (page.items.length > 20 || page.items.some(item => !("kind" in item) && item.parent_comment_id !== (parentId ?? null))) throw new Error("thread_page_identity_mismatch");
      const pageKey = parentId === undefined ? "root" : `parent:${parentId}`;
      const loaded = project(page, parentId, cursor);
      retainedPages.set(JSON.stringify(["page", parentId ?? null, cursor ?? null]), { parentId, cursor, items: loaded, nextCursor: page.next_cursor });
      options.setComments(items => {
        const byId = new Map(items.map(item => [item.id, item]));
        for (const item of loaded) byId.set(item.id, item);
        return [...byId.values()];
      });
      setThreadPages(pages => ({ ...pages, [pageKey]: { cursor: page.next_cursor, state: "ready" } }));
    };
    setThreadPages((pages) => ({ ...pages, [key]: { cursor: cursor ?? null, state: "loading" } }));
    try {
      if (target()) {
        const previousTarget = target()!;
        const continuations = [...retainedPages].filter(([, page]) => !page.seeded)
          .map(([, page]) => ({ parentId: page.parentId, cursor: page.cursor }));
        // The prior private preview is not retained while current branch
        // authorization is pending. Ordinary sibling paging is no authority.
        retainedPages.clear(); options.setComments([]);
        const value = await (options.readTarget ?? createCommentNavigationReader())(previousTarget.target_comment_id, signal);
        if (!current()) return;
        if (value.kind === "age_locked") { clear(); setTargetIssue("age"); options.onTargetRefused?.("age"); return; }
        seed(value);
        let nextCursor = value.windows.find(window => window.parent_comment_id === (parentId ?? null))?.next_cursor;
        // Target authorization is not sibling authorization. Reread only the
        // explicitly retained pages, through their original scoped cursors;
        // cached bodies/identities never return while these reads are pending.
        for (const page of continuations) {
          const renewed = await readComments({ postId: options.postId, ...page, signal });
          if (!current()) return;
          retain(renewed, page.parentId, page.cursor);
          if (page.parentId === parentId) nextCursor = renewed.next_cursor;
        }
        if (nextCursor === null) return;
        cursor = nextCursor ?? undefined;
        setThreadPages(pages => ({ ...pages, [key]: { cursor: cursor ?? null, state: "loading" } }));
      }
      const page = await readComments({
        postId: options.postId,
        signal,
        ...(parentId === undefined ? {} : { parentId }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      if (!current()) return;
      retain(page, parentId, cursor);
    } catch (error) {
      if (!disposed && revision === generation && targeted) {
        const issue = error instanceof ApiClientError && error.status === 404 ? "missing" : "unavailable";
        clear(); setTargetIssue(issue); options.onTargetRefused?.(issue); return;
      }
      if (!disposed && revision === generation)
        setThreadPages((pages) => ({
          ...pages,
          [key]: { cursor: cursor ?? null, state: "error" },
        }));
    }
  };
  const loadComments = (parentId?: string): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (!targeted) return loadPage(parentId);
    const key = parentId === undefined ? "root" : `parent:${parentId}`;
    const existing = queuedParents.get(key);
    if (existing) return existing;
    const revision = generation, authority = captureSessionAuthority();
    // Each targeted load may reseed the branch. Serialize across parents and
    // coalesce duplicate clicks, taking page/cursor snapshots only on dequeue.
    const pending = targetedQueue.then(async () => {
      if (disposed || revision !== generation || !target()) return;
      if (captureSessionAuthority() !== authority) { clear(); setTargetIssue("unavailable"); options.onTargetRefused?.("unavailable"); return; }
      await loadPage(parentId);
    }).finally(() => { if (queuedParents.get(key) === pending) queuedParents.delete(key); });
    queuedParents.set(key, pending);
    targetedQueue = pending.catch(() => {});
    return pending;
  };
  const refresh = async (signal: AbortSignal) => {
    if (disposed || signal.aborted) return;
    if (targeted && options.target) {
      clear();
      const revision = generation, authority = captureSessionAuthority();
      const activeSignal = AbortSignal.any([signal, request.signal]);
      try {
        const value = await (options.readTarget ?? createCommentNavigationReader())(options.target.target_comment_id, activeSignal);
        if (disposed || activeSignal.aborted || revision !== generation) return;
        if (captureSessionAuthority() !== authority) { clear(); setTargetIssue("unavailable"); options.onTargetRefused?.("unavailable"); return; }
        if (value.kind === "age_locked") { setTargetIssue("age"); options.onTargetRefused?.("age"); return; }
        seed(value);
      } catch (error) { if (!disposed && !signal.aborted && revision === generation) {
        const issue = error instanceof ApiClientError && error.status === 404 ? "missing" : "unavailable";
        clear(); setTargetIssue(issue); options.onTargetRefused?.(issue);
      } }
      return;
    }
    request.abort(); request = new AbortController();
    const activeSignal = AbortSignal.any([signal, request.signal]);
    const revision = ++generation, authority = captureSessionAuthority();
    const previous = [...retainedPages];
    const next = new Map<string, { parentId?: string; cursor?: string; items: readonly CommentThreadItem[]; nextCursor: string | null }>();
    for (const [key, page] of previous) {
      const loaded = await readComments({ postId: options.postId, parentId: page.parentId, cursor: page.cursor, signal: activeSignal });
      if (disposed || activeSignal.aborted || revision !== generation) return;
      if (captureSessionAuthority() !== authority) { clear(); return; }
      next.set(key, { ...page, items: project(loaded, page.parentId, page.cursor), nextCursor: loaded.next_cursor });
    }
    const priorIds = new Set(previous.flatMap(([, page]) => page.items.map(item => item.id)));
    const renewed = new Map([...next.values()].flatMap(page => page.items.map(item => [item.id, item] as const)));
    options.setComments(current => [...renewed.values(), ...current.filter(item => !priorIds.has(item.id) && !renewed.has(item.id))]);
    for (const [key, page] of next) retainedPages.set(key, page);
    setThreadPages(current => {
      const updated = { ...current };
      for (const page of next.values()) updated[page.parentId === undefined ? "root" : `parent:${page.parentId}`] = { cursor: page.nextCursor, state: "ready" };
      return updated;
    });
  };
  onCleanup(onSessionRefreshed(() => {
    const wasOpen = threadPages().root !== undefined;
    clear();
    if (targeted) setTargetIssue("unavailable");
    else if (wasOpen && !disposed) void loadComments();
  }));
  const displayedComments = createMemo(() => {
    const items = options.comments();
    const ordered: CommentThreadItem[] = [];
    const visit = (parent: string | null, depth: number) => {
      if (depth > 8) return;
      for (const item of items)
        if (item.parentId === parent) {
          ordered.push(item);
          visit(item.id, depth + 1);
        }
    };
    visit(null, 0);
    return ordered;
  });
  return { pages: threadPages, load: loadComments, refresh, ordered: displayedComments, target, targetIssue,
    earlier: (parentId: string | null) => target()?.windows.find(window => window.parent_comment_id === parentId)?.earlier_items_omitted === true,
    async reset() {
      targeted = false; clear(); setTargetIssue(undefined);
      const revision = generation;
      // Let the cleared reactive page state settle before the first-page read.
      await Promise.resolve();
      if (!disposed && revision === generation) await loadComments();
    },
    clear,
    focus(element: HTMLElement, id: string) {
      const revision = generation;
      const authority = captureSessionAuthority();
      queueMicrotask(() => {
        if (disposed || revision !== generation || captureSessionAuthority() !== authority || focused || target()?.target_comment_id !== id || !element.isConnected || !options.comments().some(item => item.id === id && item.state === "published")) return;
        focused = true; element.focus({ preventScroll: true }); element.scrollIntoView?.({ block: "center" });
      });
    },
  };
}
