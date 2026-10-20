import type { GetMeNotificationsResponse, PirateApiClient, PostMeNotificationsNotificationIdReadResponse } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client.ts";

export type NotificationPage = GetMeNotificationsResponse;
export type NotificationItem = NotificationPage["items"][number];
export interface NotificationsApi {
  list(cursor: string | undefined, signal: AbortSignal): Promise<NotificationPage>;
  markRead(id: string, signal: AbortSignal): Promise<PostMeNotificationsNotificationIdReadResponse>;
}
export function createNotificationsApi(
  client?: Pick<PirateApiClient, "get_meNotifications" | "post_meNotificationsNotificationIdRead">,
  csrf: () => string | undefined = readCsrfCookie,
): NotificationsApi {
  return {
    list: (cursor, signal) => (client ?? createSessionApiClient()).get_meNotifications({ query: cursor === undefined ? {} : { cursor } }, { signal }),
    markRead(id, signal) {
      const token = csrf();
      if (!token) return Promise.reject(new Error("notifications_csrf_unavailable"));
      return (client ?? createSessionApiClient()).post_meNotificationsNotificationIdRead({ path: { notificationId: id } }, sessionRequestOptions(token, { signal }));
    },
  };
}
