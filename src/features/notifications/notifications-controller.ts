import { ApiClientError } from "@pirate/api-client";
import type { NotificationItem, NotificationsApi } from "./notifications-api.ts";
import { captureSessionAuthority } from "../../api/browser-session-events.ts";

export interface NotificationsState {
  readonly phase: "idle" | "loading" | "anonymous" | "ready" | "error";
  readonly items: readonly NotificationItem[];
  readonly unread: number | undefined;
  readonly cursor: string | null;
  readonly more: "idle" | "loading" | "error";
  readonly reading: string | undefined;
  readonly readIssue: string | undefined;
}
const empty = (phase: NotificationsState["phase"]): NotificationsState => ({ phase, items: [], unread: undefined, cursor: null, more: "idle", reading: undefined, readIssue: undefined });

/** Page-local recipient state. Session generations are caller-owned, never persisted. */
export function createNotificationsController(api: NotificationsApi, publish: (state: NotificationsState) => void) {
  let state = empty("idle"), generation = 0, owner: string | undefined, disposed = false;
  const requests = new Set<AbortController>();
  function emit(value: NotificationsState) { state = value; if (!disposed) publish(value); }
  function cancel() { generation++; for (const request of requests) request.abort(); requests.clear(); }
  function current(revision: number, request: AbortController) { return !disposed && owner !== undefined && generation === revision && !request.signal.aborted; }
  function denied(error: unknown) { return error instanceof ApiClientError && error.status === 401; }
  async function load(more = false) {
    if (disposed || owner === undefined || state.phase === "loading" || state.more === "loading") return;
    if (more && (!state.cursor || state.phase !== "ready")) return;
    const revision = generation, request = new AbortController(); requests.add(request);
    const authority = captureSessionAuthority();
    const cursor = more ? state.cursor ?? undefined : undefined;
    emit(more ? { ...state, more: "loading" } : empty("loading"));
    try {
      const page = await api.list(cursor, request.signal);
      if (!current(revision, request)) return;
      if (captureSessionAuthority() !== authority) { cancel(); emit(empty("error")); return; }
      if (page.items.length > 20 || (cursor !== undefined && page.next_cursor === cursor)) throw new Error("notifications_page_invalid");
      const items = new Map((more ? state.items : []).map(item => [item.notification_id, item]));
      for (const item of page.items) items.set(item.notification_id, item);
      emit({ ...state, phase: "ready", items: [...items.values()], unread: page.unread_count, cursor: page.next_cursor, more: "idle" });
    } catch (error) {
      if (!current(revision, request)) return;
      if (denied(error)) { owner = undefined; cancel(); emit(empty("anonymous")); }
      else emit(more ? { ...state, more: "error" } : empty("error"));
    } finally { requests.delete(request); }
  }
  return {
    state: () => state,
    pending() { cancel(); owner = undefined; emit(empty("idle")); },
    async session(identity: string | undefined) {
      cancel(); owner = identity; emit(empty(identity === undefined ? "anonymous" : "idle"));
      if (identity !== undefined) await load();
    },
    /** A refresh discards private previews before checking current access again. */
    refresh: () => { cancel(); emit(empty("idle")); return load(); },
    more: () => load(true),
    async markRead(id: string) {
      if (disposed || owner === undefined || state.phase !== "ready" || state.reading !== undefined || !state.items.some(item => item.notification_id === id && item.read_at === null)) return;
      const revision = generation, request = new AbortController(); requests.add(request);
      const authority = captureSessionAuthority();
      emit({ ...state, reading: id, readIssue: undefined });
      try {
        const result = await api.markRead(id, request.signal);
        if (!current(revision, request)) return;
        if (captureSessionAuthority() !== authority) { cancel(); emit(empty("error")); return; }
        if (result.notification_id !== id) throw new Error("notifications_read_identity_mismatch");
        // Only the server's acknowledged read timestamp is accepted. Re-read
        // the authoritative count/list rather than subtracting an invented count.
        emit({ ...state, items: state.items.map(item => item.notification_id === id ? { ...item, read_at: result.read_at } : item), reading: undefined });
        cancel(); emit(empty("idle")); await load();
      } catch (error) {
        if (!current(revision, request)) return;
        if (denied(error)) { owner = undefined; cancel(); emit(empty("anonymous")); }
        else if (error instanceof ApiClientError && error.status === 404) { cancel(); emit(empty("idle")); await load(); }
        else emit({ ...state, reading: undefined, readIssue: id });
      } finally { requests.delete(request); }
    },
    dispose() { cancel(); owner = undefined; disposed = true; state = empty("idle"); },
  };
}
