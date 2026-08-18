export type FeedSort = "best" | "new" | "top";
export type FeedState = "ready" | "loading" | "empty" | "error";

export interface FeedItem {
  id: string;
  author: string;
  title: string;
  body: string;
  score: number;
  publishedAt: string;
  community: string;
  media?: "image" | "video" | "song";
  translation?: "original" | "translated";
  publishState?: "published" | "scheduled" | "draft";
}

export interface Page<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export function sortFeedItems(items: readonly FeedItem[], sort: FeedSort): FeedItem[] {
  return [...items].sort((left, right) => {
    if (sort === "new") return right.publishedAt.localeCompare(left.publishedAt);
    if (sort === "top") return right.score - left.score || right.publishedAt.localeCompare(left.publishedAt);
    return (right.score * 2 + (right.media === "video" ? 1 : 0)) - (left.score * 2 + (left.media === "video" ? 1 : 0));
  });
}

export function paginateFeed(items: readonly FeedItem[], cursor: string | null, pageSize: number): Page<FeedItem> {
  const parsedCursor = cursor === null ? 0 : Number.parseInt(cursor, 10);
  if (!Number.isInteger(parsedCursor) || parsedCursor < 0) return { items: [], nextCursor: null };
  const start = parsedCursor;
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const page = items.slice(start, start + safePageSize);
  const next = start + page.length;
  return { items: page, nextCursor: next < items.length ? String(next) : null };
}

export function filterFeedItems(items: readonly FeedItem[], community?: string): FeedItem[] {
  return community ? items.filter((item) => item.community === community) : [...items];
}

export function feedTranslationLabel(item: Pick<FeedItem, "translation">): "translated" | "original" {
  return item.translation === "translated" ? "translated" : "original";
}
