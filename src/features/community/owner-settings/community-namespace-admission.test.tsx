import { createPirateApiClient } from "@pirate/api-client";
import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { ApplicationSessionProvider } from "../../shell/application-session";
import { createCommunityNamespaceSettingsApi } from "./community-namespace-settings-api";
import { CommunityNamespaceSettingsController } from "./community-namespace-settings-controller";

let dispose = () => {};
afterEach(() => { dispose(); vi.useRealTimers(); sessionStorage.clear(); document.body.replaceChildren(); });

test("a wire rate limit retains the retry identity after an active session expires", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
  const expired = {
    attachment_intent_id: "attachment-1", community_id: "community-1",
    expires_at: "2026-09-08T15:00:01Z", replayed: false,
    root_import_session_id: "session-1", root_label: "dankmeme", revision: 4,
    status: "provisioning", publish_plan: null, publish_plan_sha256: null,
    readiness_result_sha256: null, retry_after_seconds: null,
  };
  let locator = "session-1";
  const wire = vi.fn(async () => Response.json({ error: {
    code: "rate_limited", message: "Daily record preparation limit reached", retryable: true,
    details: { reason: "hns_preparation_daily_limit", retry_after_seconds: 60 },
  } }, { status: 429, headers: { "Retry-After": "60" } }));
  // The rejection goes through the real generated endpoint decoder.
  const generated = createPirateApiClient("https://api.test", { fetchImpl: Object.assign(wire, { preconnect: () => {} }) });
  const start = vi.fn(generated.post_communitiesCommunityIdHnsRootImports);
  const api = createCommunityNamespaceSettingsApi({
    communityId: "community-1", communityPath: "/c/community-1", readCsrfToken: () => "csrf",
    locator: { read: () => locator, write: value => { locator = value; }, clear: () => { locator = ""; } },
    // SAFETY: Discovery fixtures are limited to the projection this controller consumes.
    client: {
      get_communitiesCommunityIdHnsRootImports: async () => ({ community_id: "community-1", attachment: null, session: expired }),
      get_communitiesCommunityIdHnsRootImportsSessionId: async () => expired,
      post_communitiesCommunityIdHnsRootImports: start,
    } as never,
  });
  const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(cleanup => { dispose = cleanup; solidRender(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "account-1" })}><CommunityNamespaceSettingsController api={api} communityId="community-1" communityPath="/c/community-1" /></ApplicationSessionProvider>, container); });
  await vi.advanceTimersByTimeAsync(1_001);
  const button = [...container.querySelectorAll("button")].find(node => node.textContent === "Get a new record list")!;
  button.click(); await vi.advanceTimersByTimeAsync(0);
  expect(wire).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("This account has prepared three record lists across its communities in 24 hours");
  expect(container.textContent).toContain(new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date("2026-09-08T15:01:00Z")));
  expect(container.textContent).not.toContain("changed in another request");
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).not.toBe("true");
  expect(locator).toBe("session-1");
  const otherName = [...container.querySelectorAll("button")].find(node => node.textContent === "Use a different namespace")!;
  expect(otherName.disabled).toBe(false);
  button.click(); await vi.advanceTimersByTimeAsync(59_999);
  expect(start).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(button.disabled).toBe(false);
  expect(start).toHaveBeenCalledTimes(1);
  // SAFETY: Success projection fixture; the API PostgreSQL test validates the real success response.
  start.mockResolvedValueOnce({ ...expired, status: "provisioning", root_import_session_id: "session-2", revision: 2, expires_at: "2099-01-01T00:00:00Z", retry_after_seconds: 2 } as never);
  button.click(); await vi.advanceTimersByTimeAsync(0);
  expect(start).toHaveBeenCalledTimes(2);
  expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
  expect(locator).toBe("session-2");
  expect(container.textContent).toContain("Prepare your records");
  expect(container.textContent).not.toContain("You have prepared three");
});

test("an account keeps its preparation deadline across a page reload", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
  sessionStorage.setItem("pirate:hns-preparation-retry:account-1", String(Date.now() + 60_000));
  const expired = {
    attachment_intent_id: "attachment-1", community_id: "community-2", expires_at: "2026-09-08T14:00:00Z",
    replayed: false, root_import_session_id: "session-1", root_label: "dankmeme", revision: 4,
    status: "expired", publish_plan: null, publish_plan_sha256: null, readiness_result_sha256: null,
    retry_after_seconds: null,
  };
  // SAFETY: The fixture supplies the complete controller projection used by this test.
  const api = { read: vi.fn(async () => ({ generation: 4, next_action: { kind: "expired" }, ...expired })), execute: vi.fn() } as never;
  const container = document.createElement("div"); document.body.appendChild(container);
  const [session, setSession] = createSignal({ status: "authenticated" as const, userId: "account-1" });
  createRoot(cleanup => { dispose = cleanup; solidRender(() => <ApplicationSessionProvider state={session}><CommunityNamespaceSettingsController api={api} communityId="community-2" communityPath="/c/community-2" /></ApplicationSessionProvider>, container); });
  await vi.advanceTimersByTimeAsync(0);
  const button = [...container.querySelectorAll("button")].find(node => node.textContent === "Get a new record list")!;
  expect(button.disabled).toBe(true);
  expect(container.textContent).toContain("across its communities");
  setSession({ status: "authenticated", userId: "account-2" });
  await vi.advanceTimersByTimeAsync(0);
  expect(button.disabled).toBe(false);
  setSession({ status: "authenticated", userId: "account-1" });
  await vi.advanceTimersByTimeAsync(0);
  expect(button.disabled).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(button.disabled).toBe(false);
  expect(sessionStorage.getItem("pirate:hns-preparation-retry:account-1")).toBeNull();
});
