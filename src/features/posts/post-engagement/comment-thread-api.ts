import type { GetPostsPostIdCommentsResponse } from "@pirate/api-client";
import { createSessionApiClient, type ApiClientFactoryOptions } from "../../../api/client.ts";
import { publicProfileLabel } from "../../identity/public-profile-label.ts";
export type CommentThreadPage = GetPostsPostIdCommentsResponse;
export type CommentThreadReader = (input: {
  postId: string;
  parentId?: string;
  cursor?: string;
  signal?: AbortSignal;
}) => Promise<CommentThreadPage>;
/** Browser client construction is deferred until the user opens a thread. */
export function createCommentThreadReader(
  options: ApiClientFactoryOptions = {},
): CommentThreadReader {
  return (input) =>
    createSessionApiClient(options).get_postsPostIdComments({
      path: { postId: input.postId },
      query: {
        ...(input.parentId === undefined ? {} : { parent_comment_id: input.parentId }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      },
    }, { signal: input.signal });
}

/** One published-comment projection for persisted threads and profile activity. */
export function projectPublishedComment(
  item: Exclude<CommentThreadPage["items"][number], { readonly kind: "age_locked" }>,
): import("./post-engagement-model.ts").CommentThreadItem {
  return {
    id: item.comment_id,
    parentId: item.parent_comment_id,
    body: item.body,
    depth: item.depth,
    replyCount: item.reply_count,
    state: "published",
    submissionId: null,
    caseRef: null,
    href: null,
    authorAvatarRef: item.author_persona?.avatar_ref,
    createdAt: item.created_at,
    authorLabel: publicProfileLabel(item.author_persona),
    authorProfile: item.author_persona ?? null,
    authorPersonaId: item.author_persona?.persona_id,
  };
}
