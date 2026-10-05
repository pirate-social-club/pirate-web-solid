import { ApiClientError, TELEGRAM_IDENTITY_LINK_CONFLICT_REASON } from "@pirate/api-client";
import { expect, test, vi } from "vitest";
import { createTelegramLinkingApi, telegramLinkFailure } from "./telegram-linking-api";
import { communityBotUrl, confirmedTransactionId, linkReference, takeTelegramCallback, telegramAuthorizationUrl } from "./telegram-linking-navigation";

const state = "a".repeat(43);
test("callback capture scrubs the address synchronously and never needs tab storage", () => {
  const replace = vi.fn();
  expect(takeTelegramCallback(`https://pirate.test/telegram/link/callback?code=one-time&state=${state}#secret`, replace)).toEqual({ code: "one-time", state });
  expect(replace).toHaveBeenCalledExactlyOnceWith("/telegram/link/callback");
});
test.each([
  "code=x", `code=x&state=${state}&state=${state}`, `code=x&code=y&state=${state}`,
  `code=x&state=${state}&error=denied`, `code=&state=${state}`, `code=x&state=bad`,
  `code=${"x".repeat(2049)}&state=${state}`,
])("malformed or ambiguous callbacks fail without retaining the address: %s", query => {
  const replace = vi.fn();
  expect(takeTelegramCallback(`https://pirate.test/telegram/link/callback?${query}`, replace)).toBeUndefined();
  expect(replace).toHaveBeenCalledWith("/telegram/link/callback");
});
test("navigation and transaction references are bounded and duplicates are refused", () => {
  expect(linkReference(`https://pirate.test/telegram/link?navigation_reference=${state}`)).toBe(state);
  expect(linkReference(`https://pirate.test/telegram/link?navigation_reference=${state}&navigation_reference=${state}`)).toBeUndefined();
  expect(confirmedTransactionId(`https://pirate.test/telegram/link/callback?transaction_id=${state}`)).toBe(state);
  expect(confirmedTransactionId(`https://pirate.test/telegram/link/callback?transaction_id=${state}&code=bad&state=${state}`)).toBeUndefined();
  expect(confirmedTransactionId(`https://pirate.test/telegram/link/callback?transaction_id=${state}&error=denied`)).toBeUndefined();
});
test("only independent Telegram login and a validated bot username are navigation targets", () => {
  expect(telegramAuthorizationUrl("https://oauth.telegram.org/auth?client_id=123")).toBe("https://oauth.telegram.org/auth?client_id=123");
  for (const url of ["https://owner.test/auth", "javascript:alert(1)", "https://oauth.telegram.org@owner.test/auth", "https://oauth.telegram.org/auth#secret", "https://oauth.telegram.org:8443/auth"]) expect(telegramAuthorizationUrl(url)).toBeUndefined();
  expect(communityBotUrl("community_bot")).toBe("https://t.me/community_bot");
  expect(communityBotUrl("other?start=code")).toBeUndefined();
});
test("only the specific proven-identity conflict gets unlink recovery", () => {
  const conflict = (reason?: string) => new ApiClientError(
    { code: "conflict", name: "Conflict", retryable: false, status: 409 },
    { error: { code: "conflict", message: "secret-value", retryable: false, details: reason === undefined ? undefined : { reason } } },
  );
  expect(telegramLinkFailure(conflict(TELEGRAM_IDENTITY_LINK_CONFLICT_REASON)).message).toContain("linked to another Pirate account");
  expect(telegramLinkFailure(conflict()).message).not.toContain("another Pirate account");
  expect(telegramLinkFailure(conflict("other")).message).not.toContain("secret-value");
  expect(telegramLinkFailure(Error("code=secret-value"))).toEqual(telegramLinkFailure(undefined));
});
test("callback verification uses generated same-origin transport with credentials and CSRF", async () => {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
    id: state, state: "verified", expires_at: "2026-10-04T12:00:00Z", community_id: "music", community_name: "Music",
    bot_id: "123", bot_username: "community_bot", post_id: "song", telegram_user_id: "456",
  }), { headers: { "content-type": "application/json" } }));
  const api = createTelegramLinkingApi({ origin: "https://pirate.test", fetchImpl, readCsrfToken: () => "csrf-fixture" });
  await api.verify({ state, code: "one-time" });
  const call = fetchImpl.mock.calls[0];
  expect(String(call?.[0])).toBe("https://pirate.test/api/telegram/link/callback/verify");
  expect(call?.[1]?.credentials).toBe("same-origin");
  expect(new Headers(call?.[1]?.headers).get("x-csrf-token")).toBe("csrf-fixture");
  expect(call?.[1]?.method).toBe("POST");
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({ state, code: "one-time" });
});
test("missing CSRF stops callback verification before network traffic", () => {
  const fetchImpl = vi.fn();
  const api = createTelegramLinkingApi({ origin: "https://pirate.test", fetchImpl, readCsrfToken: () => undefined });
  expect(() => api.verify({ state, code: "one-time" })).toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});
