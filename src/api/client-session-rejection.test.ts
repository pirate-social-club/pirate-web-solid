// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createGeneratedApiClient, createSessionApiClient, readCsrfCookie } from "./client.ts";
import { browserIdentitySession } from "./browser-identity-session.ts";
import { SESSION_REJECTED_EVENT } from "./browser-session-events.ts";
import { SessionAuthorityChangedError } from "./browser-auth-coordination.ts";
import type { ApiFetch } from "./proxy.ts";
import { clearSession, invalidateSession, onSessionCleared, onSessionRefreshed, refreshSession, resolveAccountSession, resolveSession } from "./session.ts";
import { contributionFixtures } from "./song-contributions.fixture.ts";
import { contributionJournalKey, createBrowserContributionJournalStore, createSongContributionJournal } from "./song-contribution-journal.ts";

const cleanups: Array<() => void> = [];
beforeEach(() => {
  clearSession(); refreshSession();
  document.cookie = "__Host-pirate_csrf=fixture-csrf; Secure; SameSite=Lax; Path=/";
  expect(readCsrfCookie()).toBe("fixture-csrf");
  vi.stubGlobal("navigator", { locks: { request: <T>(_name: string, _options: LockOptions, run: () => Promise<T>) => run() } });
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  clearSession();
  document.cookie = "__Host-pirate_csrf=; Secure; Path=/; Max-Age=0";
  vi.unstubAllGlobals();
});

const user = { id: "account-current", object: "user", verification_state: "unverified", created: 1788495833,
  verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }])) };
async function establishSession() {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(user)));
  await expect(resolveAccountSession()).resolves.toMatchObject({ userId: user.id });
}
function observeRejection() {
  const rejected = vi.fn();
  window.addEventListener(SESSION_REJECTED_EVENT, rejected);
  cleanups.push(() => window.removeEventListener(SESSION_REJECTED_EVENT, rejected));
  return rejected;
}
function transport(fetchImpl: ApiFetch, credentials: "same-origin" | "omit" = "same-origin") {
  return createGeneratedApiClient((_origin, options) => ({
    read: (signal?: AbortSignal) => options.fetchImpl!("https://pirate.sc/users/me", { credentials, signal }),
    readRequest: (request: Request) => options.fetchImpl!(request),
    write: () => options.fetchImpl!("https://pirate.sc/posts", { method: "POST", credentials }),
  }), { origin: "https://pirate.sc", fetchImpl }, { credentials });
}
function refusal(status = 401) {
  return Response.json({ error: { code: status === 401 ? "auth_error" : "internal_error", message: "fixture refusal", retryable: status >= 500 } }, { status });
}
function network(statuses: number[] = [401, 200]) {
  const renew = vi.fn(async (_signal?: AbortSignal) => Response.json({ status: "renewed", user_id: user.id, expires_at: "2026-10-29T13:00:00.000Z" }));
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/api/auth/session/renew") {
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("same-origin");
      expect(new Headers(init?.headers).get("x-csrf-token")).toBe("fixture-csrf");
      return renew(init?.signal ?? undefined);
    }
    return new Response(null, { status: statuses.shift() ?? 401 });
  });
  return { renew, fetchImpl };
}

function exchangeReply(id: string) {
  return {
    user: { ...user, id },
    profile: { id: "profile", object: "profile", created: 1, global_handle: {
      id: "handle", object: "global_handle", platform_handle_id: "platform-handle", owner_persona_id: "persona",
      generation: 1, state_hash: "fixture-state", cleanup_rename_available: true, label: "fixture-handle", tier: "generated",
      status: "active", issuance_source: "generated_signup", issued_at: 1,
    } },
    onboarding: { generated_handle_assigned: true, cleanup_rename_available: true, unique_human_verification_status: "not_started",
      namespace_verification_status: "not_started", community_creation_ready: false, missing_requirements: [],
      reddit_verification_status: "not_started", reddit_import_status: "not_started" },
    wallet_attachments: [],
  };
}

describe("owned cookie recovery at the real client/store boundary", () => {
  test.each([200, 401])("renews once and handles the retry's %s response without provider authorization", async status => {
    await establishSession();
    const providerRenew = vi.fn(async () => true);
    browserIdentitySession.retain({ renew: providerRenew, clear() {} });
    const rejected = observeRejection(), cleared = vi.fn();
    cleanups.push(onSessionCleared(cleared));
    const f = network([401, status]);
    expect((await transport(f.fetchImpl).read()).status).toBe(status);
    expect(f.fetchImpl).toHaveBeenCalledTimes(3);
    expect(f.renew).toHaveBeenCalledOnce();
    expect(providerRenew).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    expect(cleared).not.toHaveBeenCalled();
  });

  test("fresh independent startup renews with cookies and no established epoch or wallet snapshot", async () => {
    clearSession();
    const f = network();
    expect((await transport(f.fetchImpl).read()).status).toBe(200);
    expect(f.renew).toHaveBeenCalledOnce();
    expect(sessionStorage.length).toBe(0);
  });

  test("a cookie-free anonymous visitor has no renewal or identity notifications", async () => {
    document.cookie = "__Host-pirate_csrf=; Secure; Path=/; Max-Age=0";
    const rejected = observeRejection(), refreshed = vi.fn();
    cleanups.push(onSessionRefreshed(refreshed));
    const fetchImpl = vi.fn(async () => refusal());
    await expect(resolveSession({ client: createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }) })).resolves.toBe("anonymous");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(rejected).not.toHaveBeenCalled(); expect(refreshed).not.toHaveBeenCalled();
  });

  test("concurrent refused reads coalesce renewal and invalidate an established account once", async () => {
    await establishSession();
    const rejected = observeRejection(), cleared = vi.fn();
    cleanups.push(onSessionCleared(cleared));
    const f = network(); f.renew.mockResolvedValue(refusal());
    const client = transport(f.fetchImpl);
    await Promise.allSettled([client.read(), client.read(), client.read()]);
    expect(f.renew).toHaveBeenCalledOnce(); expect(rejected).toHaveBeenCalledOnce();
    expect(cleared).not.toHaveBeenCalled();
    await expect(resolveAccountSession()).resolves.toBe("anonymous");
  });

  test.each(["network", "server"])("%s renewal failure remains an error and does not sign out", async kind => {
    await establishSession();
    const rejected = observeRejection(), cleared = vi.fn(); cleanups.push(onSessionCleared(cleared));
    const f = network();
    if (kind === "network") f.renew.mockRejectedValue(new TypeError("offline"));
    else f.renew.mockResolvedValue(refusal(500));
    await expect(transport(f.fetchImpl).read()).rejects.toThrow();
    expect(rejected).not.toHaveBeenCalled(); expect(cleared).not.toHaveBeenCalled();
    await expect(resolveAccountSession()).resolves.toMatchObject({ userId: user.id });
  });

  test.each(["argument", "Request"])("honours abort carried by %s after coalesced renewal without replay", async carrier => {
    await establishSession();
    const f = network(); let finish!: (response: Response) => void;
    f.renew.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const rejected = observeRejection(), controller = new AbortController(), client = transport(f.fetchImpl);
    const pending = carrier === "argument" ? client.read(controller.signal) : client.readRequest(new Request("https://pirate.sc/users/me", { credentials: "same-origin", signal: controller.signal }));
    await vi.waitFor(() => expect(f.renew).toHaveBeenCalledOnce());
    controller.abort(); finish(Response.json({ status: "renewed", user_id: user.id, expires_at: "2026-10-29T13:00:00.000Z" }));
    await pending;
    expect(f.fetchImpl).toHaveBeenCalledTimes(2); expect(rejected).not.toHaveBeenCalled();
  });

  test("old renewal cannot replay or reject a replacement identity", async () => {
    await establishSession();
    const f = network(); f.renew.mockImplementation(() => new Promise(() => {}));
    const pending = transport(f.fetchImpl).read();
    const stale = expect(pending).rejects.toBeInstanceOf(SessionAuthorityChangedError);
    await vi.waitFor(() => expect(f.renew).toHaveBeenCalledOnce());
    browserIdentitySession.retain({ renew: async () => true, clear() {} });
    await stale; expect(f.fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("late account response cannot escape to its caller after invalidation", async () => {
    await establishSession(); let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    refreshSession(); const pending = resolveAccountSession();
    const stale = expect(pending).rejects.toBeInstanceOf(SessionAuthorityChangedError);
    invalidateSession(); finish(Response.json({ ...user, id: "late-account" }));
    await stale; await expect(resolveAccountSession()).resolves.toBe("anonymous");
  });

  test("a delayed private JSON body cannot escape through the generated client after account replacement", async () => {
    await establishSession();
    let finish!: () => void;
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"id":"old-account",'));
        finish = () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(user).slice(1))); controller.close(); };
      },
    }), { headers: { "content-type": "application/json" } }));
    const pending = createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }).get_usersMe(undefined);
    const refused = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    browserIdentitySession.retain({ renew: async () => true, clear() {} });
    finish(); await refused;
  });

  test("a delayed successful exchange cannot finish after a newer genuine exchange response", async () => {
    let finish!: () => void;
    let cancelled = false;
    const json = JSON.stringify(exchangeReply("previous-account")), split = Math.floor(json.length / 2);
    const previousBody = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(json.slice(0, split)));
      finish = () => { if (!cancelled) { controller.enqueue(new TextEncoder().encode(json.slice(split))); controller.close(); } };
    }, cancel() { cancelled = true; } });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(previousBody, { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(Response.json(exchangeReply("replacement-account")));
    const client = createSessionApiClient({ origin: "https://pirate.sc", fetchImpl });
    const proof = { body: { proof: { type: "privy_access_token" as const, privy_access_token: "fictional-proof" } } };
    const previous = client.post_authSessionExchange(proof);
    const refused = expect(previous).rejects.toThrow();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    expect((await client.post_authSessionExchange(proof)).user.id).toBe("replacement-account");
    finish(); await refused;
  });

  test("a refused write never renews or replays and retains recoverable author identity", async () => {
    await establishSession(); const f = network(), cleared = vi.fn(); cleanups.push(onSessionCleared(cleared));
    await transport(f.fetchImpl).write();
    expect(f.fetchImpl).toHaveBeenCalledOnce(); expect(f.renew).not.toHaveBeenCalled(); expect(cleared).not.toHaveBeenCalled();
    clearSession(); expect(cleared).toHaveBeenCalledOnce();
  });

  test("public credential-free clients never renew or invalidate private state", async () => {
    await establishSession(); const f = network(), rejected = observeRejection();
    expect((await transport(f.fetchImpl, "omit").read()).status).toBe(401);
    expect(f.renew).not.toHaveBeenCalled(); expect(rejected).not.toHaveBeenCalled();
  });

  test("renewal and a refused write retain the actual pending money command without retargeting it", async () => {
    await establishSession();
    const scope = { ...contributionFixtures.scope, accountId: user.id };
    let currentScope = scope;
    const journal = createSongContributionJournal({ scope, currentScope: () => currentScope, store: createBrowserContributionJournalStore() });
    const key = contributionJournalKey(scope);
    cleanups.push(() => localStorage.removeItem(key));
    await journal.exclusive(async handle => {
      handle.initialize({ operation: "CreateSongMegapotContributionV2", body: contributionFixtures.createRequest }, contributionFixtures.claimRequest.client_instance_id);
    });
    const original = localStorage.getItem(key);
    const f = network();
    expect((await transport(f.fetchImpl).read()).status).toBe(200);
    await transport(f.fetchImpl).write();
    expect(f.renew).toHaveBeenCalledOnce();
    expect(localStorage.getItem(key)).toBe(original);
    expect(journal.read()?.commands[0]?.bodyJson).toBe(JSON.stringify(contributionFixtures.createRequest));
    currentScope = { ...scope, accountId: "replacement-account" };
    expect(() => journal.read()).toThrow("contribution_scope_changed");
    expect(localStorage.getItem(key)).toBe(original);
  });
});
