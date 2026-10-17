import type { GetCommentsCommentIdLocationResponse, PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client.ts";
import { validCommentId } from "./comment-selector.ts";

export type CommentNavigation = Extract<GetCommentsCommentIdLocationResponse, { readonly kind: "available" }>;
export type CommentNavigationReader = (id: string, signal: AbortSignal) => Promise<GetCommentsCommentIdLocationResponse>;

/** Cross-field checks complement the immutable generated schema validation. */
export function validateCommentNavigation(value: CommentNavigation, target: string): void {
  const chain = [...value.ancestor_comment_ids, target];
  if (!validCommentId(target) || value.target_comment_id !== target || chain.length > 9 || new Set(chain).size !== chain.length || value.windows.length !== chain.length) throw new Error("comment_navigation_branch_invalid");
  const match = /^\/(posts|post)\/([^/]+)$/u.exec(value.post_path);
  if (!match || new URL(value.post_path, "https://pirate.invalid").pathname !== value.post_path) throw new Error("comment_navigation_path_invalid");
  const segment = decodeURIComponent(match[2]!);
  if (!segment || /[%/\\?#\u0000-\u001f\u007f]/u.test(segment) || segment === "." || segment === ".." || (match[1] === "post" && value.post_path !== `/post/${encodeURIComponent(value.post_id)}`)) throw new Error("comment_navigation_path_invalid");
  const seen = new Set<string>();
  value.windows.forEach((window, depth) => {
    if (window.parent_comment_id !== (depth === 0 ? null : chain[depth - 1]) || window.branch_comment_id !== chain[depth] || window.items.length === 0 || window.items.length > 20) throw new Error("comment_navigation_window_invalid");
    const first = window.items[0]!;
    if ("kind" in first || first.comment_id !== chain[depth]) throw new Error("comment_navigation_member_missing");
    for (const item of window.items) {
      if ("kind" in item) continue;
      if (item.status !== "published" || item.parent_comment_id !== window.parent_comment_id || item.depth !== depth || seen.has(item.comment_id)) throw new Error("comment_navigation_identity_invalid");
      seen.add(item.comment_id);
    }
  });
}
export function createCommentNavigationReader(client?: Pick<PirateApiClient, "get_commentsCommentIdLocation">): CommentNavigationReader {
  return async (id, signal) => {
    if (!validCommentId(id)) throw new Error("invalid_comment_selector");
    const value = await (client ?? createSessionApiClient()).get_commentsCommentIdLocation({ path: { commentId: id } }, { signal });
    if (value.kind === "available") validateCommentNavigation(value, id);
    return value;
  };
}
