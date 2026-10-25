import type { DeletePostsPostIdVideoResponse } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client.ts";

export type DeleteVideoPost = (postId: string) => Promise<DeletePostsPostIdVideoResponse>;

export const deleteVideoPost: DeleteVideoPost = async postId => {
  const csrf = readCsrfCookie();
  if (!csrf) throw new Error("csrf_unavailable");
  return createSessionApiClient().delete_postsPostIdVideo({ path: { postId } }, sessionRequestOptions(csrf));
};

export type VideoDeletionOutcome =
  | Readonly<{ kind: "deleted" }>
  | Readonly<{ kind: "unconfirmed" | "superseded" }>;

/** DELETE is monotonic for the immutable Post target. An uncertain response
 * can be retried on that same target without browser storage or a new key. */
export async function removeVideoPost(input: {
  readonly postId: string;
  readonly remove: DeleteVideoPost;
  readonly isCurrent: () => boolean;
}): Promise<VideoDeletionOutcome> {
  if (!input.isCurrent()) return { kind: "superseded" };
  try {
    const receipt = await input.remove(input.postId);
    if (!input.isCurrent()) return { kind: "superseded" };
    if (receipt.object !== "video_post_deletion" || receipt.post_id !== input.postId
      || receipt.status !== "deleted" || !receipt.community_id) return { kind: "unconfirmed" };
    return { kind: "deleted" };
  } catch {
    return { kind: input.isCurrent() ? "unconfirmed" : "superseded" };
  }
}
