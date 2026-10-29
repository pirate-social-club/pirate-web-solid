import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "playwright/test";
import { createServer, type ViteDevServer } from "vite";

// Fictional cookie sessions on loopback exercise the actual generated client,
// shared session store, native cookies/WebLocks/channels and a fresh profile.
// No provider, real account, existing browser profile or remote service is used.
let server: ViteDevServer, origin: string;
let accessValid = true, renewalStatus = 200, renewals = 0, writes = 0;
let activeMutations = 0, maxMutations = 0, serial = 0;
let holdRenewal: (() => Promise<void>) | undefined;
let holdAccount: (() => Promise<void>) | undefined;
let loseLogoutAcknowledgement = false;
const sessions = new Map<string, { account: string; revoked: boolean }>();
const sessionPath = "/src/api/session.ts", clientPath = "/src/api/client.ts";
function cookie(header: string | undefined, name: string) {
  return header?.split(";").map(pair => pair.trim()).find(pair => pair.startsWith(`${name}=`))?.slice(name.length + 1);
}
function tuple(id: string) {
  return [`__Host-pirate_session=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`,
    `__Host-pirate_renewal=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    "__Host-pirate_csrf=fixture-csrf; Secure; SameSite=Lax; Path=/; Max-Age=2592000"];
}
const capabilities = Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }]));
function user(id: string) { return { id, object: "user", verification_state: "unverified", created: 1, verification_capabilities: capabilities }; }
function gate() {
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  return { wait: async () => { started(); await pending; }, ready, release };
}

test.beforeAll(async () => {
  server = await createServer({ configFile: false, appType: "custom", root: join(import.meta.dirname, ".."),
    server: { host: "127.0.0.1", port: 0 }, optimizeDeps: { noDiscovery: true } });
  server.middlewares.use(async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__session-fixture") {
      response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Local session fixture</title>"); return;
    }
    if (url.pathname === "/__fixture/login") {
      const id = `fictional-${++serial}`;
      sessions.set(id, { account: url.searchParams.get("account") ?? "account-a", revoked: false });
      response.setHeader("Set-Cookie", tuple(id)); response.end("fixture seeded"); return;
    }
    if (!url.pathname.startsWith("/api/")) { next(); return; }
    response.setHeader("Content-Type", "application/json"); response.setHeader("Cache-Control", "private, no-store");
    const fail = (status = 401) => {
      response.statusCode = status;
      response.end(JSON.stringify({ error: { code: status === 401 ? "auth_error" : "internal_error", message: "fixture refusal", retryable: status >= 500 } }));
    };
    const id = cookie(request.headers.cookie, "__Host-pirate_session");
    const active = id === undefined ? undefined : sessions.get(id);
    if (url.pathname === "/api/users/me" || url.pathname === "/api/personas") {
      if (!accessValid || !active || active.revoked) { fail(); return; }
      const account = active.account;
      if (url.pathname === "/api/users/me") await holdAccount?.();
      response.end(JSON.stringify(url.pathname === "/api/users/me" ? user(account) : { personas: [] })); return;
    }
    if (url.pathname === "/api/posts") { writes++; fail(); return; }
    if (!url.pathname.startsWith("/api/auth/")) { fail(); return; }
    activeMutations++; maxMutations = Math.max(maxMutations, activeMutations);
    try {
      if (request.headers.origin !== origin || request.headers["x-csrf-token"] !== "fixture-csrf") { fail(500); return; }
      const renewalId = cookie(request.headers.cookie, "__Host-pirate_renewal");
      const session = renewalId === undefined ? undefined : sessions.get(renewalId);
      if (url.pathname === "/api/auth/session/renew") {
        renewals++; await holdRenewal?.();
        if (renewalStatus !== 200) { fail(renewalStatus); return; }
        if (!session || session.revoked || !renewalId) { fail(); return; }
        accessValid = true;
        response.setHeader("Set-Cookie", tuple(renewalId));
        response.end(JSON.stringify({ status: "renewed", user_id: session.account, expires_at: "2026-10-29T13:00:00.000Z" })); return;
      }
      if (url.pathname === "/api/auth/session/logout") {
        if (session) session.revoked = true;
        if (loseLogoutAcknowledgement) {
          loseLogoutAcknowledgement = false;
          // Headers and partial JSON arrive, then the response is lost. This
          // avoids Chromium transparently retrying a connection lost pre-header.
          response.writeHead(200); response.write('{"status":'); response.flushHeaders();
          setTimeout(() => response.destroy(), 10); return;
        }
        response.setHeader("Set-Cookie", tuple("").map(value => value.replace(/Max-Age=\d+/u, "Max-Age=0")));
        response.end(JSON.stringify({ status: "ok" })); return;
      }
      if (url.pathname === "/api/auth/session/exchange") {
        const replacement = `fictional-${++serial}`;
        sessions.set(replacement, { account: "account-b", revoked: false }); accessValid = true;
        response.setHeader("Set-Cookie", tuple(replacement)); response.end(JSON.stringify({ status: "fixture-exchanged" })); return;
      }
      fail();
    } finally { activeMutations--; }
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("fixture_origin_unavailable");
  origin = `http://127.0.0.1:${address.port}`;
});
test.beforeEach(() => {
  accessValid = true; renewalStatus = 200; renewals = 0; writes = 0;
  activeMutations = 0; maxMutations = 0; sessions.clear(); holdRenewal = undefined; holdAccount = undefined;
  loseLogoutAcknowledgement = false;
});
test.afterAll(async () => { await server?.close(); });
async function open(page: Page) {
  await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(`${origin}/__session-fixture`);
}
async function seed(page: Page) {
  await page.evaluate(() => fetch("/__fixture/login", { method: "POST", credentials: "same-origin" }).then(response => response.text()));
}
async function resolve(page: Page) {
  return page.evaluate(async path => {
    const module: typeof import("../src/api/session") = await import(path);
    return module.resolveSession();
  }, sessionPath);
}
async function logout(page: Page) {
  await page.evaluate(async path => {
    const module: typeof import("../src/api/client") = await import(path);
    return module.createSessionApiClient().post_authSessionLogout(undefined, module.sessionRequestOptions(module.readCsrfCookie()!));
  }, clientPath);
}

test("new independent tab, reload and real browser restart recover from expired access without a provider snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pirate-persistent-login-"));
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(directory, { headless: true });
    let page = context.pages()[0] ?? await context.newPage(); await open(page); await seed(page);
    expect(await resolve(page)).toMatchObject({ userId: "account-a" });
    accessValid = false;
    await context.clearCookies({ name: "__Host-pirate_session" });
    const independent = await context.newPage(); await open(independent);
    expect(await resolve(independent)).toMatchObject({ userId: "account-a" });
    expect(await independent.evaluate(() => sessionStorage.length)).toBe(0);
    accessValid = false; await independent.reload();
    expect(await resolve(independent)).toMatchObject({ userId: "account-a" });
    accessValid = false; await context.clearCookies({ name: "__Host-pirate_session" });
    await context.close(); context = undefined;
    context = await chromium.launchPersistentContext(directory, { headless: true });
    page = context.pages()[0] ?? await context.newPage(); await open(page);
    expect(await resolve(page)).toMatchObject({ userId: "account-a" });
    expect(renewals).toBe(3);
    const visible = await page.evaluate(() => ({ cookie: document.cookie, local: Object.values(localStorage), tab: Object.values(sessionStorage) }));
    expect(visible.cookie).toBe("__Host-pirate_csrf=fixture-csrf");
    expect(visible.local.join("") + visible.tab.join("")).not.toContain("fictional-");
    const cookies = await context.cookies();
    expect(cookies.filter(value => value.httpOnly).map(value => value.name).sort()).toEqual(["__Host-pirate_renewal", "__Host-pirate_session"]);
    expect(cookies.every(value => value.secure && value.path === "/" && !value.domain.startsWith("."))).toBe(true);
  } finally { await context?.close(); await rm(directory, { recursive: true, force: true }); }
});

test("concurrent reads coalesce, logout waits for renewal then revokes every tab", async ({ context, page }) => {
  await open(page); await seed(page); expect(await resolve(page)).toMatchObject({ userId: "account-a" });
  const other = await context.newPage(); await open(other); await resolve(other);
  accessValid = false; const renewal = gate(); holdRenewal = renewal.wait;
  const reading = page.evaluate(async path => {
    const module: typeof import("../src/api/client") = await import(path);
    const client = module.createSessionApiClient();
    return Promise.allSettled([client.get_usersMe(undefined), client.get_personas(undefined)]);
  }, clientPath);
  await renewal.ready;
  const signingOut = logout(other); await new Promise(resolve => setTimeout(resolve, 50));
  expect(activeMutations).toBe(1);
  renewal.release(); await signingOut; await reading;
  await expect.poll(() => resolve(page)).toBe("anonymous");
  expect(await resolve(other)).toBe("anonymous");
  expect(renewals).toBe(1); expect(maxMutations).toBe(1);
  expect([...sessions.values()].every(value => value.revoked)).toBe(true);
});

test("cross-tab account replacement rejects a delayed private reply and preserves the original command locator", async ({ context, page }) => {
  await open(page); await seed(page); await resolve(page);
  await page.evaluate(() => sessionStorage.setItem("fixture:pending-command", "account-a:original-command-id"));
  const other = await context.newPage(); await open(other); await resolve(other);
  const account = gate(); holdAccount = account.wait;
  const old = page.evaluate(async path => {
    const module: typeof import("../src/api/client") = await import(path);
    try { await module.createSessionApiClient().get_usersMe(undefined); return "escaped"; }
    catch (error) { return error instanceof Error ? error.message : "unknown"; }
  }, clientPath);
  await account.ready;
  await other.evaluate(async path => {
    const module: typeof import("../src/api/client") = await import(path);
    const transport = module.createGeneratedApiClient((_origin, options) => ({
      exchange: () => options.fetchImpl!(new URL("/auth/session/exchange", location.origin), {
        method: "POST", credentials: "same-origin", headers: { "x-csrf-token": "fixture-csrf" },
      }),
    }), {}, { credentials: "same-origin" });
    await transport.exchange();
  }, clientPath);
  account.release(); holdAccount = undefined;
  expect(await old).toBe("session_changed");
  await expect.poll(() => resolve(page)).toMatchObject({ userId: "account-b" });
  expect(await page.evaluate(() => sessionStorage.getItem("fixture:pending-command"))).toBe("account-a:original-command-id");
});

test("server unavailability keeps recovery retryable; expired writes never renew or replay", async ({ page }) => {
  await open(page); await seed(page); accessValid = false; renewalStatus = 500;
  const unavailable = await page.evaluate(async path => {
    const module: typeof import("../src/api/session") = await import(path);
    try { await module.resolveSession(); return "anonymous-success"; }
    catch { return "unavailable"; }
  }, sessionPath);
  expect(unavailable).toBe("unavailable");
  renewalStatus = 200; expect(await resolve(page)).toMatchObject({ userId: "account-a" });
  const before = renewals; accessValid = false;
  const result = await page.evaluate(async path => {
    sessionStorage.setItem("fixture:pending-command", "account-a:original-command-id");
    const module: typeof import("../src/api/client") = await import(path);
    const transport = module.createGeneratedApiClient((_origin, options) => ({
      write: () => options.fetchImpl!(new URL("/posts", location.origin), { method: "POST", credentials: "same-origin" }),
    }), {}, { credentials: "same-origin" });
    return { status: (await transport.write()).status, command: sessionStorage.getItem("fixture:pending-command") };
  }, clientPath);
  expect(result).toEqual({ status: 401, command: "account-a:original-command-id" });
  expect(writes).toBe(1); expect(renewals).toBe(before);
});

test("WebLocks and BroadcastChannel renew when localStorage is refused", async ({ context, page }) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("fixture storage refusal", "SecurityError"); } });
  });
  await open(page); await seed(page); accessValid = false;
  expect(await resolve(page)).toMatchObject({ userId: "account-a" });
  expect(renewals).toBe(1);
});

test("unavailable WebLocks reports unavailable recovery without sending a racing renewal", async ({ context, page }) => {
  await context.addInitScript(() => { Object.defineProperty(navigator, "locks", { value: undefined }); });
  await open(page); await seed(page); accessValid = false;
  const result = await page.evaluate(async path => {
    const module: typeof import("../src/api/session") = await import(path);
    try { await module.resolveSession(); return "anonymous-success"; }
    catch (error) { return error instanceof Error ? error.message : "unknown"; }
  }, sessionPath);
  expect(result).toBe("session_renewal_unavailable"); expect(renewals).toBe(0);
});

test("a lost logout acknowledgement preserves unknown work while server revocation wins and deliberate retry confirms logout", async ({ page }) => {
  await open(page); await seed(page); await resolve(page); loseLogoutAcknowledgement = true;
  const result = await page.evaluate(async ({ sessionPath, clientPath }) => {
    const session: typeof import("../src/api/session") = await import(sessionPath);
    const client: typeof import("../src/api/client") = await import(clientPath);
    let cleared = 0;
    const stop = session.onSessionCleared(() => cleared++);
    const options = client.sessionRequestOptions(client.readCsrfCookie()!);
    sessionStorage.setItem("fixture:pending-command", "account-a:original-command-id");
    let uncertain = false;
    try { await client.createSessionApiClient().post_authSessionLogout(undefined, options); }
    catch { uncertain = true; }
    const afterLostReply = { uncertain, cleared, account: await session.resolveAccountSession(), command: sessionStorage.getItem("fixture:pending-command") };
    await client.createSessionApiClient().post_authSessionLogout(undefined, options);
    stop(); return { afterLostReply, confirmedClears: cleared };
  }, { sessionPath, clientPath });
  expect(result).toEqual({ afterLostReply: { uncertain: true, cleared: 0, account: "anonymous", command: "account-a:original-command-id" }, confirmedClears: 1 });
  expect([...sessions.values()].every(value => value.revoked)).toBe(true);
});

test("native fetch abort releases the real renewal WebLock so explicit logout can proceed", async ({ context, page }) => {
  await open(page); await seed(page); await resolve(page);
  const other = await context.newPage(); await open(other); await resolve(other);
  accessValid = false;
  const renewal = gate(); holdRenewal = renewal.wait;
  const pending = page.evaluate(async path => {
    const module: typeof import("../src/api/client") = await import(path);
    try { await module.createSessionApiClient().get_usersMe(undefined); return "unexpected-success"; }
    catch (error) { return error instanceof Error ? error.name : "unknown"; }
  }, clientPath);
  await renewal.ready;
  try {
    expect(await pending).toBe("TimeoutError");
    const released = await Promise.race([
      logout(other).then(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000)),
    ]);
    expect(released).toBe(true);
  } finally { renewal.release(); holdRenewal = undefined; }
  await expect.poll(() => resolve(page)).toBe("anonymous");
  expect([...sessions.values()].every(value => value.revoked)).toBe(true);
});
