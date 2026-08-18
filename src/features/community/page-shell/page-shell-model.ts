export type GateMode = "all" | "any" | "unknown";

export type CommunitySort = "best" | "new" | "top";

export interface CommunityGate {
  label: string;
  status: "met" | "unmet" | "unknown";
}

export interface CommunityPost {
  id: string;
  title: string;
  body: string;
  score: number;
  publishedAt: string;
}

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
  name: string;
  handle: string;
  description: string;
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
