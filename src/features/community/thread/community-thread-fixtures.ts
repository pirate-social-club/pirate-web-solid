import { communityReviewPage } from "../community-threads-adapter.ts";
import type { CommunityThread } from "./community-thread-model.ts";

const rootPost = communityReviewPage.community.posts[0]!;

export const communityThreadReviewPage: CommunityThread = {
  post: rootPost,
  communityName: communityReviewPage.community.name,
  communityHref: "/c/tameimpala/threads",
  commentsStatus: "ready",
  comments: [
    {
      id: "review-comment-1",
      authorName: "Deckhand",
      authorHandle: "deckhand",
      body: "The live-session notes are especially good here. I would love to see a pinned listening guide next.",
      publishedLabel: "2h",
      score: 12,
      replyCount: 1,
    },
    {
      id: "review-comment-1-1",
      parentId: "review-comment-1",
      authorName: "Synthhead",
      authorHandle: "synthhead",
      body: "Seconded. A track-by-track version would be a great community project.",
      publishedLabel: "1h",
      score: 5,
    },
    {
      id: "review-comment-2",
      authorName: "Currents Club",
      authorHandle: "currents.club",
      body: "This is the kind of conversation that makes a community feel like a place, not just a feed.",
      publishedLabel: "45m",
      score: 8,
    },
  ],
};
