import type { GetPostsPostIdCommentsResponse } from "@pirate/api-client";
import { createSessionApiClient, type ApiClientFactoryOptions } from "../../../api/client.ts";
export type CommentThreadPage = GetPostsPostIdCommentsResponse;
export type CommentThreadReader = (input: {
  postId: string;
  parentId?: string;
  cursor?: string;
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
    });
}
