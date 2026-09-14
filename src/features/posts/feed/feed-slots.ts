import type { FeedPage, PublicFeedItem } from "./public-feed-adapter.ts";

export type FeedSlot =
  | Readonly<{ kind: "post"; key: string; item: PublicFeedItem }>
  | Readonly<{ kind: "age_locked"; key: string }>;
/** Keys and lock positions are local render hints, never a purchase/read authority. */
export function feedSlots(page: FeedPage, pageKey: string): readonly FeedSlot[] {
  const locks = new Set(page.ageLockedPositions ?? []);
  const slots: FeedSlot[] = [];
  let itemIndex = 0;
  for (let position = 0; position < page.items.length + locks.size; position++) {
    const key = `${pageKey}:${position}`;
    if (locks.has(position)) slots.push({ kind: "age_locked", key });
    else {
      const item = page.items[itemIndex++];
      if (item) slots.push({ kind: "post", key, item });
    }
  }
  return slots;
}
