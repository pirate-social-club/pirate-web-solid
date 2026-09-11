import { createMemo, createSignal, onCleanup, type Accessor, type Setter } from "solid-js";
import { createCommentThreadReader, type CommentThreadReader } from "./comment-thread-api.ts";
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
  onCleanup(() => {
    disposed = true;
  });
  const loadComments = async (parentId?: string): Promise<void> => {
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
      if (disposed) return;
      const loaded: CommentThreadItem[] = page.items.map((item, index) =>
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
      if (!disposed)
        setThreadPages((pages) => ({
          ...pages,
          [key]: { cursor: cursor ?? null, state: "error" },
        }));
    }
  };
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
  return { pages: threadPages, load: loadComments, ordered: displayedComments };
}
