import type { CommunityPost } from "../page-shell/page-shell-model.ts";

export interface CommunityComment {
  readonly id: string;
  readonly parentId?: string | null;
  readonly authorName: string;
  readonly authorHandle?: string;
  readonly authorAvatarSrc?: string;
  readonly body: string;
  readonly publishedLabel: string;
  readonly score: number;
  readonly viewerVote?: "up" | "down" | null;
  readonly replyCount?: number;
}

export interface CommunityThread {
  readonly post: CommunityPost;
  readonly communityName?: string;
  readonly communityHref?: string;
  readonly comments: readonly CommunityComment[];
  readonly commentsStatus: "ready" | "unavailable" | "locked";
}

export function childComments(
  comments: readonly CommunityComment[],
  parentId: string | null = null,
): CommunityComment[] {
  return comments.filter(comment => (comment.parentId ?? null) === parentId);
}
