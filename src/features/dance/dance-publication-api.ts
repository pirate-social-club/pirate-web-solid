import type { GetCommunitiesCommunityIdDanceReviewsReviewIdPublicationResponse, GetMediaPostSubmissionsSubmissionIdResponse, PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client";
import type { DanceResultScope } from "./dance-result-api";

export type DancePublication = GetCommunitiesCommunityIdDanceReviewsReviewIdPublicationResponse;
export type DancePost = Extract<GetMediaPostSubmissionsSubmissionIdResponse, { track: "video" }>;
export interface DancePublicationView { readonly publication: DancePublication; readonly post: DancePost | null }
export interface DancePublicationApi { read(scope: DanceResultScope, signal: AbortSignal): Promise<DancePublicationView> }
type Client = Pick<PirateApiClient, "get_communitiesCommunityIdDanceReviewsReviewIdPublication" | "get_mediaPostSubmissionsSubmissionId" | "get_usersMe">;

export function createDancePublicationApi(client?: Client): DancePublicationApi {
  return { async read(scope, signal) {
    const api=client ?? createSessionApiClient();
    const publication=await api.get_communitiesCommunityIdDanceReviewsReviewIdPublication({path:{communityId:scope.communityId,reviewId:scope.reviewId}},{signal});
    if(publication.review_id!==scope.reviewId) throw new Error("dance_publication_target_changed");
    let post: DancePost | null=null;
    const link=publication.submission;
    if(link!==null) {
      if(publication.status!=="transferred" || link.href!==`/media-post-submissions/${encodeURIComponent(link.submission_id)}`) throw new Error("dance_publication_link_changed");
      const value=await api.get_mediaPostSubmissionsSubmissionId({path:{submissionId:link.submission_id}},{signal});
      if(value.submission_id!==link.submission_id || value.track!=="video" || value.intent!=="song_reference") throw new Error("dance_publication_input_changed");
      post=value;
    }
    const account=await api.get_usersMe(undefined,{signal});
    if(account.id!==scope.accountId) throw new Error("dance_publication_session_changed");
    return {publication,post};
  }};
}

export function dancePublicationMessage(status: DancePublication["status"], post: DancePost | null): string {
  if(post?.status==="published") return "Your video post was published.";
  if(post?.status==="processing") return "Your video post is processing.";
  if(post?.status==="manual_review") return "Your video post is waiting for review.";
  if(post!==null || status==="failed" || status==="cancelled") return "The video post could not be created. Your private result is unchanged.";
  if(status==="pending") return "Your separate video post is being prepared.";
  if(status==="transferred") return "Your recording was sent for publication.";
  return "No public video post has been created.";
}
