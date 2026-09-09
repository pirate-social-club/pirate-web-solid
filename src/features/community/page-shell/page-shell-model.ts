export type GateMode = "all" | "any" | "unknown";

export type CommunitySort = "best" | "new" | "top";

export type CommunityPostKind = "text" | "song";

export interface CommunityGate {
  label: string;
  status: "met" | "unmet" | "unknown";
}

export interface CommunityPost {
  id: string;
  title: string;
  body: string;
  score: number;
  /**
   * Both sides of the vote, kept because the net score cannot be taken apart
   * again. Five up and three down and two up and zero down are the same score,
   * so a consumer that needs the sides has to be given them rather than
   * reconstruct them. Absent for callers that only ever had a net score.
   */
  upvoteCount?: number;
  downvoteCount?: number;
  publishedAt: string;
  authorHandle?: string;
  authorAvatarSrc?: string | null;
  kind?: CommunityPostKind;
  mediaSrc?: string | null;
  mediaTitle?: string;
  mediaArtist?: string;
  mediaDuration?: string;
  mediaProgress?: number;
  commentCount?: number;
  rewardLabels?: readonly string[];
  learnAvailable?: boolean;
  karaokeAvailable?: boolean;
}

/**
 * What the shell renders in the feed region. A pending read is the absence of
 * this value, not a member of it, so the boundary that awaits it decides the
 * pending shape and the shell never has to invent one.
 */
export type CommunityFeed =
  | { readonly kind: "ready"; readonly posts: readonly CommunityPost[] }
  | { readonly kind: "error" };

export interface CommunityRule {
  title: string;
  body: string;
  position: number;
}

export interface CommunityReferenceLink {
  label: string;
  href: string;
  position: number;
}

export interface CommunityData {
  id?: string;
  name: string;
  handle: string;
  description: string;
  avatarSrc?: string | null;
  bannerSrc?: string | null;
  members: number;
  followers: number;
  posts: readonly CommunityPost[];
  gates?: readonly CommunityGate[];
  gateMode?: GateMode;
  rules?: readonly CommunityRule[];
  referenceLinks?: readonly CommunityReferenceLink[];
}

export interface CommunityStoryState {
  initialFollowing: boolean;
  initialJoined: boolean;
  showCreatePost: boolean;
  hasSidebarMetadata: boolean;
}

export const overviewStoryState: CommunityStoryState = {
  initialFollowing: false,
  initialJoined: false,
  showCreatePost: false,
  hasSidebarMetadata: true,
};

export const communityWithPostsStoryState: CommunityStoryState = {
  initialFollowing: false,
  initialJoined: true,
  showCreatePost: true,
  hasSidebarMetadata: false,
};

export function gateSummary(gates: readonly CommunityGate[], mode: GateMode): string {
  if (gates.length === 0) return "No entry requirements";
  if (mode === "all") return `Meet all ${gates.length} requirements`;
  if (mode === "any") return `Meet any ${gates.length} requirements`;
  return "Entry requirements are being checked";
}

export function sortCommunityPosts(posts: readonly CommunityPost[], sort: CommunitySort): CommunityPost[] {
  return [...posts].sort((left, right) => {
    if (sort === "new") return right.publishedAt.localeCompare(left.publishedAt);
    if (sort === "top") return right.score - left.score || right.publishedAt.localeCompare(left.publishedAt);
    return right.score * 2 - left.score * 2;
  });
}

export function safeCommunityHref(href: string): string | null {
  const trimmed = href.trim();
  if ((trimmed.startsWith("/") && !trimmed.startsWith("//")) || trimmed.startsWith("https://")) return trimmed;
  return null;
}

export function orderedCommunityRules(rules: readonly CommunityRule[]): CommunityRule[] {
  return [...rules].sort((left, right) => left.position - right.position);
}

export function orderedReferenceLinks(links: readonly CommunityReferenceLink[]): CommunityReferenceLink[] {
  return [...links].sort((left, right) => left.position - right.position);
}

export function visibleCommunityTab(width: "mobile" | "desktop", requested: "feed" | "about"): "feed" | "about" {
  return width === "mobile" && requested === "about" ? "about" : requested;
}
