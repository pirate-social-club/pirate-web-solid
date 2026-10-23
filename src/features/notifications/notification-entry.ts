import { danceResultPath } from "../dance/dance-result-api.ts";
import type { NotificationItem } from "./notifications-api.ts";

export function notificationHref(item: NotificationItem): string {
  return item.kind === "dance_review_result" ? danceResultPath(item.target.community_id, item.target.review_id) : `/comments/${encodeURIComponent(item.target.comment_id)}`;
}
export function notificationLabel(item: NotificationItem): string {
  if (item.kind !== "dance_review_result") return item.kind === "reply_published" ? "A reply was published" : "A comment was published";
  return item.outcome === "passed" ? "Your dance passed review" : item.outcome === "not_passed" ? "Your dance was not passed" : "Your dance was not reviewed";
}
