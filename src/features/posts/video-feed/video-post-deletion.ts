import type { DeletePostsPostIdVideoResponse } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client.ts";

export type DeleteVideoPost = (postId: string) => Promise<DeletePostsPostIdVideoResponse>;
export type VideoDeletionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const deleteVideoPost: DeleteVideoPost = async postId => {
  const csrf = readCsrfCookie();
  if (!csrf) throw new Error("csrf_unavailable");
  return createSessionApiClient().delete_postsPostIdVideo({ path: { postId } }, sessionRequestOptions(csrf));
};

export type VideoDeletionOutcome =
  | Readonly<{ kind: "deleted" }>
  | Readonly<{ kind: "unconfirmed" | "storage_failed" | "superseded" }>;

/** Only a confirmed user's immutable account/Post intent is retained. No
 * credential, media locator or private recording is ever stored here. DELETE
 * itself is monotonic, so recovery reuses the same target without a new key. */
export async function removeVideoPost(input: {
  readonly accountId: string;
  readonly postId: string;
  readonly storage: () => VideoDeletionStorage;
  readonly remove: DeleteVideoPost;
  readonly isCurrent: () => boolean;
}): Promise<VideoDeletionOutcome> {
  if (!input.isCurrent()) return { kind: "superseded" };
  const key = `pirate.video-post-deletion.v1:${encodeURIComponent(input.accountId)}:${encodeURIComponent(input.postId)}`;
  const intent = JSON.stringify({ version: 1, accountId: input.accountId, postId: input.postId });
  let storage: VideoDeletionStorage;
  try {
    storage = input.storage();
    const previous = storage.getItem(key);
    if (previous !== null && previous !== intent) return { kind: "storage_failed" };
    storage.setItem(key, intent);
    if (storage.getItem(key) !== intent) return { kind: "storage_failed" };
  } catch {
    return { kind: "storage_failed" };
  }
  if (!input.isCurrent()) return { kind: "superseded" };
  try {
    const receipt = await input.remove(input.postId);
    if (!input.isCurrent()) return { kind: "superseded" };
    if (receipt.object !== "video_post_deletion" || receipt.post_id !== input.postId
      || receipt.status !== "deleted" || !receipt.community_id) return { kind: "unconfirmed" };
    // The server acknowledgment is definitive even if local cleanup fails.
    // A retained intent can only repeat this same harmless monotonic target.
    try { if (storage.getItem(key) === intent) storage.removeItem(key); } catch { /* Retain recoverable metadata. */ }
    return { kind: "deleted" };
  } catch {
    return { kind: input.isCurrent() ? "unconfirmed" : "superseded" };
  }
}
