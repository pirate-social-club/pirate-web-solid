import { createRoot } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";
import { ApiClientError } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client.ts";
import { createNotificationsApi, type NotificationPage, type NotificationsApi } from "./notifications-api.ts";
import { createNotificationsController } from "./notifications-controller.ts";
import { NotificationsInbox } from "./notifications-inbox.tsx";
import type { JSX } from "@solidjs/web";

// SAFETY: this suite runs under the DOM renderer selected by vitest.app;
// TypeScript resolves @solidjs/web's server overload in the standalone config.
const renderDom = render as (view: () => JSX.Element, host: HTMLElement) => void;

const id = "00000000-0000-4000-8000-000000000001";
const page = (read_at: string | null = null): NotificationPage => ({ object: "notification_page", items: [{ notification_id: id, kind: "reply_published", occurred_at: "2026-10-16T12:00:00Z", read_at, target: { kind: "comment_thread", community_id: "community", post_id: "post", comment_id: "reply" } }], next_cursor: null, unread_count: read_at === null ? 1 : 0 });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.replaceChildren(); });

test("generated transport uses /api, host cookies, bounded schema and explicit CSRF read command", async () => {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => Response.json(init?.method === "POST" ? { notification_id: id, read_at: "2026-10-16T13:00:00Z" } : page()));
  const api = createNotificationsApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }), () => "csrf-value");
  const signal = new AbortController().signal;
  await api.list(undefined, signal);
  expect(String(fetchImpl.mock.calls[0]![0])).toBe("https://pirate.sc/api/me/notifications");
  expect(fetchImpl.mock.calls[0]![1]?.credentials).toBe("same-origin");
  expect(fetchImpl.mock.calls[0]![1]?.method).toBe("GET");
  await api.markRead(id, signal);
  expect(String(fetchImpl.mock.calls[1]![0])).toBe(`https://pirate.sc/api/me/notifications/${id}/read`);
  expect(new Headers(fetchImpl.mock.calls[1]![1]?.headers).get("x-csrf-token")).toBe("csrf-value");
  expect(new Headers(fetchImpl.mock.calls[1]![1]?.headers).has("authorization")).toBe(false);
  const oversized = createNotificationsApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl: async () => Response.json({ ...page(), items: Array.from({ length: 21 }, () => page().items[0]) }) }));
  await expect(oversized.list(undefined, signal)).rejects.toThrow();
  const noCsrf = createNotificationsApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }), () => undefined);
  await expect(noCsrf.markRead(id, signal)).rejects.toThrow("csrf");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("controller discards late recipient data and aborts on session replacement and disposal", async () => {
  const old = deferred<NotificationPage>(); let signal: AbortSignal | undefined;
  const api: NotificationsApi = { list: vi.fn((_cursor, active) => { signal = active; return old.promise; }), markRead: vi.fn() };
  const publish = vi.fn(); const controller = createNotificationsController(api, publish);
  const loading = controller.session("account-a:generation-1");
  expect(controller.state().phase).toBe("loading");
  await controller.session(undefined);
  expect(signal?.aborted).toBe(true);
  old.resolve(page()); await loading;
  expect(controller.state().phase).toBe("anonymous"); expect(controller.state().items).toEqual([]);
  controller.dispose(); const count = publish.mock.calls.length;
  await controller.session("account-b:generation-2"); expect(publish).toHaveBeenCalledTimes(count);
});

test("loading, empty, error/retry, cursor and unknown read outcome are explicit", async () => {
  let fail = true, read = false;
  const api: NotificationsApi = {
    list: vi.fn(async cursor => { if (fail) throw new Error("offline"); return cursor ? { ...page(), items: [], next_cursor: null } : { ...page(read ? "confirmed" : null), next_cursor: id }; }),
    markRead: vi.fn(async () => { if (!read) throw new Error("unknown outcome"); return { notification_id: id, read_at: "confirmed" }; }),
  };
  const controller = createNotificationsController(api, () => {});
  await controller.session("account"); expect(controller.state().phase).toBe("error");
  fail = false; await controller.refresh(); expect(controller.state().unread).toBe(1);
  await controller.markRead(id); expect(controller.state().items[0]?.read_at).toBeNull(); expect(controller.state().readIssue).toBe(id);
  expect(api.markRead).toHaveBeenCalledTimes(1);
  await controller.more(); expect(api.list).toHaveBeenLastCalledWith(id, expect.any(AbortSignal));
  read = true; await controller.markRead(id); expect(controller.state().unread).toBe(0);
  controller.dispose();
  const empty = createNotificationsController({ ...api, list: async () => ({ ...page(), items: [], next_cursor: null, unread_count: 0 }) }, () => {});
  await empty.session("account"); expect(empty.state().phase).toBe("ready"); expect(empty.state().items).toEqual([]);
  empty.dispose();
});

test("access loss clears all retained rows instead of retaining private previews", async () => {
  let denied = false;
  const api: NotificationsApi = { list: async () => { if (denied) throw new ApiClientError({ status: 401, code: "auth_error", name: "AuthError", retryable: false }, { error: { code: "auth_error", message: "Unavailable", retryable: false } }); return page(); }, markRead: vi.fn() };
  const controller = createNotificationsController(api, () => {});
  await controller.session("account"); denied = true; await controller.refresh();
  expect(controller.state().phase).toBe("anonymous"); expect(controller.state().items).toEqual([]); expect(controller.state().unread).toBeUndefined();
});

test("rendered inbox navigation never marks read; only the explicit button sends the command", async () => {
  let acknowledged = false;
  const api: NotificationsApi = { list: vi.fn(async () => page(acknowledged ? "confirmed" : null)), markRead: vi.fn(async () => { acknowledged = true; return { notification_id: id, read_at: "confirmed" }; }) };
  const host = document.createElement("div"); document.body.appendChild(host);
  createRoot(dispose => { cleanups.push(dispose); renderDom(() => <NotificationsInbox api={api} session={async () => ({ status: "authenticated", userId: "recipient", personas: [] })} />, host); });
  await vi.waitFor(() => expect(host.textContent).toContain("1 unread"));
  const link = host.querySelector<HTMLAnchorElement>('a[href="/comments/reply"]')!;
  link.addEventListener("click", event => event.preventDefault()); link.click();
  expect(api.markRead).not.toHaveBeenCalled();
  [...host.querySelectorAll("button")].find(button => button.textContent === "Mark read")!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("0 unread"));
  expect(api.markRead).toHaveBeenCalledTimes(1);
});


test.each([
  ["passed", "Your dance passed review"],
  ["not_passed", "Your dance was not passed"],
  ["review_expired", "Your dance was not reviewed"],
] as const)("a genuine %s Dance notification opens its private result without a read mutation", async (outcome, label) => {
  const mixed: NotificationPage = { ...page(), items: [...page().items, { notification_id: "00000000-0000-4000-8000-000000000002", kind: "dance_review_result", outcome, occurred_at: "2026-10-16T13:00:00Z", read_at: null, target: { kind: "private_dance_result", community_id: "community", review_id: "review" } }], unread_count: 2 };
  const fetchImpl = vi.fn(async () => Response.json(mixed));
  const api = createNotificationsApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }));
  const host = document.createElement("div"); document.body.appendChild(host);
  createRoot(dispose => { cleanups.push(dispose); renderDom(() => <NotificationsInbox api={api} session={async () => ({ status: "authenticated", userId: "participant", personas: [] })} />, host); });
  await vi.waitFor(() => expect(host.textContent).toContain(label));
  expect(host.querySelector('a[href="/comments/reply"]')?.textContent).toBe("A reply was published");
  const resultLink = host.querySelector<HTMLAnchorElement>('a[href="/dance/community/reviews/review"]')!;
  resultLink.addEventListener("click", event => event.preventDefault()); resultLink.click();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toMatch(/score|10000|private_dance_result/u);
});
