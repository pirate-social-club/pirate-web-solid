import type { PirateApiClient } from "@pirate/api-client";
import { createPublicApiClient } from "../../api/client";
import { createGuestStudyApi, type GuestStudyApi, type GuestStudyPreparedContent } from "./guest-study-api";

export interface GuestStudyPublicReader {
  load(postId: string, signal?: AbortSignal, knownCommunityId?: string): Promise<{
    communityId: string; prepared: GuestStudyPreparedContent;
  }>;
}

/** Public song scope and prepared content are both credential-free API reads. */
export function createGuestStudyPublicReader(
  api: Pick<GuestStudyApi, "getPreparedContent"> = createGuestStudyApi(),
  posts?: Pick<PirateApiClient, "get_postsPostId">,
): GuestStudyPublicReader {
  let postReader = posts;
  return {
    async load(postId, signal, knownCommunityId) {
      let communityId = knownCommunityId;
      if (communityId === undefined) {
        postReader ??= createPublicApiClient();
        const response = await postReader.get_postsPostId({ path: { postId } }, { signal });
        if ("kind" in response) throw new Error("This song is unavailable to the public Study reader.");
        communityId = response.post.community;
      }
      return { communityId, prepared: await api.getPreparedContent({ path: { communityId, postId } }, signal) };
    },
  };
}
