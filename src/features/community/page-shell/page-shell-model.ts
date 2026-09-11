export type CommunitySort = "best" | "new" | "top";

export type CommunityPostKind = "text" | "song";

export type CommunityMembershipMode = "open" | "gated" | "request";

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
  commentCount?: number;
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
  /** How people join, stated once in the About card. New communities are gated. */
  membershipMode?: CommunityMembershipMode;
  rules?: readonly CommunityRule[];
  referenceLinks?: readonly CommunityReferenceLink[];
}

export function membershipLine(mode: CommunityMembershipMode | undefined): string | null {
  if (mode === "gated") return "Members verify with a palm scan.";
  if (mode === "request") return "Membership is by request.";
  return null;
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
