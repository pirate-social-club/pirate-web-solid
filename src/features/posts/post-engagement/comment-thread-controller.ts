import { onSessionRefreshed } from "../../../api/session.ts";
import { createMemo, createSignal, onCleanup, type Accessor, type Setter } from "solid-js";
import { createCommentThreadReader, type CommentThreadReader, type CommentThreadPage } from "./comment-thread-api.ts";
import type { CommentThreadItem } from "./post-engagement-model.ts";

/** Owns lazy persisted pages; local pending submissions remain in the same thread. */
export function createCommentThreadController(options: {
  readonly postId: string;
  readonly readComments?: CommentThreadReader;
  readonly comments: Accessor<readonly CommentThreadItem[]>;
  readonly setComments: Setter<readonly CommentThreadItem[]>;
}) {
  const readComments = options.readComments ?? createCommentThreadReader();
  const [threadPages, setThreadPages] = createSignal<
    Record<string, { cursor: string | null; state: "loading" | "ready" | "error" }>
  >({});
  let disposed = false;
  let generation = 0;
  const retainedPages = new Map<string, { parentId?: string; cursor?: string; items: readonly CommentThreadItem[]; nextCursor: string | null }>();
  onCleanup(() => {
    disposed = true;
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
          : {
              id: item.comment_id,
              parentId: item.parent_comment_id,
              body: item.body,
              depth: item.depth,
              replyCount: item.reply_count,
              state: "published",
              submissionId: null,
              caseRef: null,
              href: null,
              authorLabel:
                item.author_persona?.primary_public_handle ??
                item.author_persona?.display_name ??
                "Public creator",
            },
      );
  };
  const loadComments = async (parentId?: string): Promise<void> => {
    const revision = generation;
    const key = parentId === undefined ? "root" : `parent:${parentId}`;
    const prior = threadPages()[key];
    if (prior?.state === "loading" || (prior?.state === "ready" && prior.cursor === null)) return;
    const cursor = prior?.cursor ?? undefined;
    setThreadPages((pages) => ({ ...pages, [key]: { cursor: cursor ?? null, state: "loading" } }));
    try {
      const page = await readComments({
        postId: options.postId,
        ...(parentId === undefined ? {} : { parentId }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      if (disposed || revision !== generation) return;
      const loaded = project(page, parentId, cursor);
      retainedPages.set(`${key}:${cursor ?? "first"}`, { parentId, cursor, items: loaded, nextCursor: page.next_cursor });
      options.setComments((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of loaded) if (!byId.has(item.id)) byId.set(item.id, item);
        return [...byId.values()];
      });
      setThreadPages((pages) => ({
        ...pages,
        [key]: { cursor: page.next_cursor, state: "ready" },
      }));
    } catch {
      if (!disposed && revision === generation)
        setThreadPages((pages) => ({
          ...pages,
          [key]: { cursor: cursor ?? null, state: "error" },
        }));
    }
  };
  const refresh = async (signal: AbortSignal) => {
    const revision = ++generation;
    const previous = [...retainedPages];
    const next = new Map<string, { parentId?: string; cursor?: string; items: readonly CommentThreadItem[]; nextCursor: string | null }>();
    for (const [key, page] of previous) {
      const loaded = await readComments({ postId: options.postId, parentId: page.parentId, cursor: page.cursor });
      if (disposed || signal.aborted || revision !== generation) return;
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
    generation += 1;
    retainedPages.clear();
    options.setComments([]);
    setThreadPages({});
    if (wasOpen && !disposed) void loadComments();
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
  return { pages: threadPages, load: loadComments, refresh, ordered: displayedComments };
}
