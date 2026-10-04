import { ApiClientError } from "@pirate/api-client";
import { createRoot } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";
import { refreshSession, type AuthenticatedSession } from "../../../api/session";
import { TelegramLinkingPage } from "./telegram-linking-page";
import { TelegramConnectionsPage } from "./telegram-connections-page";
import type { TelegramLinkingApi, TelegramLinkTransaction } from "./telegram-linking-api";

const id = "a".repeat(43), state = "b".repeat(43);
const transaction: TelegramLinkTransaction = {
  id, state: "verified", expires_at: "2026-10-04T12:00:00Z", community_id: "music", community_name: "Music",
  bot_id: "123", bot_username: "community_bot", post_id: "song", telegram_user_id: "456",
  confirmation_display: { name: "Learner", username: "learner_fixture" },
};
const persona = (personaId: string, communityId: string | null) => ({
  personaId, displayName: personaId, avatarRef: null, primaryPublicHandle: null,
  communityBinding: communityId === null ? null : { communityId, bindingSource: "first_membership" as const },
});
const session: AuthenticatedSession = { status: "authenticated", userId: "account", personas: [persona("eligible", "music"), persona("other-community", "elsewhere")] };
function fixture(): TelegramLinkingApi {
  return {
    start: vi.fn(async () => ({ transaction: { ...transaction, state: "pending" as const }, authorization_url: "https://oauth.telegram.org/auth?client_id=123" })),
    verify: vi.fn(async () => transaction), get: vi.fn(async () => transaction),
    confirm: vi.fn(async () => ({ community_id: "music", bot_id: "123", persona_id: "eligible", revision: 1, telegram_user_id: "456" })),
    list: vi.fn(async () => ({ telegram_user_ids: ["456"], grants: [{ community_id: "music", bot_id: "123", persona_id: "eligible", revision: 1, telegram_user_id: "456" }] })),
    revoke: vi.fn(async () => ({ revoked: true as const })), unlink: vi.fn(async () => ({ unlinked: true as const })),
  };
}
const disposers: Array<() => void> = [];
function mount(view: () => ReturnType<typeof TelegramLinkingPage>) {
  const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(dispose); render(view, container); });
  return container;
}
function button(container: HTMLElement, label: string) {
  const target = [...container.querySelectorAll("button")].find(item => item.textContent === label);
  if (target === undefined) throw Error(`Missing fixture button: ${label}`);
  return target;
}
function callbackUrl() { history.replaceState(null, "", `/telegram/link/callback?code=private-code&state=${state}`); }
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); history.replaceState(null, "", "/"); });

test("callback works without a stored attempt and requires explicit exact-community persona selection", async () => {
  callbackUrl(); const api = fixture();
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={async () => session} />);
  await vi.waitFor(() => expect(container.textContent).toContain("learner_fixture"));
  expect(api.verify).toHaveBeenCalledWith({ state, code: "private-code" }, expect.any(AbortSignal));
  expect(location.search).toBe(`?transaction_id=${id}`);
  expect(container.innerHTML).not.toContain("private-code");
  expect(container.querySelectorAll("input[type=radio]")).toHaveLength(1);
  expect(container.querySelector("input:checked")).toBeNull();
  expect(container.textContent).not.toContain("other-community");
  expect(api.confirm).not.toHaveBeenCalled();
  const radio = container.querySelector<HTMLInputElement>("input")!;
  radio.click();
  await vi.waitFor(() => expect(container.textContent).toContain("Link this Telegram and persona"));
  button(container, "Link this Telegram and persona").click();
  await vi.waitFor(() => expect(container.textContent).toContain("Linked to eligible"));
  expect(api.confirm).toHaveBeenCalledWith(id, "eligible", expect.any(AbortSignal));
  expect(container.textContent).not.toContain("learner_fixture");
  expect(container.querySelector("a[href='https://t.me/community_bot']")).not.toBeNull();
  expect(container.textContent).toContain("practice only");
});
test("reloaded confirmation uses browser-bound transaction read and numeric identity only", async () => {
  history.replaceState(null, "", `/telegram/link/callback?transaction_id=${id}`);
  const api = fixture(); api.get = vi.fn(async () => ({ ...transaction, confirmation_display: undefined }));
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={async () => session} />);
  await vi.waitFor(() => expect(container.textContent).toContain("ID 456"));
  expect(api.get).toHaveBeenCalledWith(id, expect.any(AbortSignal)); expect(api.verify).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("learner_fixture");
});
test("no eligible persona offers the existing community Study preparation journey", async () => {
  callbackUrl(); const api = fixture();
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={async () => ({ ...session, personas: [persona("other-community", "elsewhere")] })} />);
  await vi.waitFor(() => expect(container.textContent).toContain("Set up your Study persona on Pirate"));
  expect(container.querySelector("a[href='/p/song/study']")).not.toBeNull();
  expect(container.querySelector("input[type=radio]")).toBeNull();
  expect(api.confirm).not.toHaveBeenCalled();
  expect(container.textContent).toContain("fresh link");
});
test.each(["anonymous", "other-account"])("%s after session refresh cancels in-flight verification", async changed => {
  callbackUrl(); const api = fixture(); const pending = Promise.withResolvers<TelegramLinkTransaction>();
  api.verify = vi.fn(() => pending.promise);
  let reads = 0;
  const resolve = async () => ++reads === 1 ? session : changed === "anonymous" ? "anonymous" as const : { ...session, userId: changed };
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={resolve} />);
  await vi.waitFor(() => expect(api.verify).toHaveBeenCalled()); refreshSession(); pending.resolve(transaction);
  await vi.waitFor(() => expect(container.textContent).toContain("Your Pirate session changed"));
  expect(container.textContent).not.toContain("learner_fixture"); expect(api.confirm).not.toHaveBeenCalled();
});
test("anonymous callbacks discard the code and ask for a fresh bot journey", async () => {
  callbackUrl(); const api = fixture();
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={async () => "anonymous"} />);
  await vi.waitFor(() => expect(container.textContent).toContain("fresh link"));
  expect(api.verify).not.toHaveBeenCalled(); expect(location.search).toBe("");
  expect(container.innerHTML).not.toContain(state); expect(container.innerHTML).not.toContain("private-code");
});
test("a temporarily unavailable callback retries from memory without exposing code or state", async () => {
  callbackUrl(); const api = fixture(); let calls = 0;
  api.verify = vi.fn(async () => {
    if (++calls === 1) throw new ApiClientError(
      { code: "provider_unavailable", name: "ProviderUnavailable", retryable: true, status: 502 },
      { error: { code: "provider_unavailable", message: "private-code", retryable: true } },
    );
    return transaction;
  });
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={async () => session} />);
  await vi.waitFor(() => expect(container.textContent).toContain("Try again"));
  expect(container.innerHTML).not.toContain("private-code"); expect(location.search).toBe("");
  button(container, "Try again").click();
  await vi.waitFor(() => expect(container.textContent).toContain("learner_fixture"));
  expect(api.verify).toHaveBeenCalledTimes(2); expect(api.confirm).not.toHaveBeenCalled();
});
test("an explicitly chosen unbound persona must be prepared and read back before linking", async () => {
  callbackUrl(); const api = fixture(); let reads = 0;
  const resolve = vi.fn(async () => ({ ...session, personas: [persona("eligible", ++reads === 1 ? null : "music")] }));
  const prepare = vi.fn(async () => ({ activity_presentation: null, community_id: "music", object: "activity_persona_preparation" as const, persona_id: "eligible", persona_status: "active" as const }));
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={resolve} preparePersona={prepare} />);
  await vi.waitFor(() => expect(container.querySelector("input")).not.toBeNull());
  container.querySelector<HTMLInputElement>("input")!.click();
  await vi.waitFor(() => expect(container.textContent).toContain("Use this persona in this community"));
  button(container, "Use this persona in this community").click();
  await vi.waitFor(() => expect(container.textContent).toContain("Link this Telegram and persona"));
  expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ communityId: "music", choice: { kind: "existing", personaId: "eligible" } }));
  expect(resolve).toHaveBeenCalledTimes(2); expect(api.confirm).not.toHaveBeenCalled();
  button(container, "Link this Telegram and persona").click();
  await vi.waitFor(() => expect(api.confirm).toHaveBeenCalledWith(id, "eligible", expect.any(AbortSignal)));
});
test("voice requirement and owner access appear before sign-in and login navigation", async () => {
  history.replaceState(null, "", `/telegram/link?navigation_reference=${id}`);
  const api = fixture(), navigate = vi.fn();
  const container = mount(() => <TelegramLinkingPage mode="start" api={api} resolveSession={async () => session} navigate={navigate} />);
  expect(container.textContent).toContain("requires voice answers"); expect(container.textContent).toContain("listen to your voice notes");
  await vi.waitFor(() => expect(container.textContent).toContain("Review this link"));
  button(container, "Review this link").click();
  await vi.waitFor(() => expect(container.textContent).toContain("Community: Music"));
  button(container, "Continue with Telegram").click();
  expect(navigate).toHaveBeenCalledWith("https://oauth.telegram.org/auth?client_id=123"); expect(api.confirm).not.toHaveBeenCalled();
});
test("pending-wallet preparation clears the provider display and offers safe setup recovery", async () => {
  callbackUrl(); const api = fixture();
  const prepare = vi.fn(async () => ({ activity_presentation: null, community_id: "music", object: "activity_persona_preparation" as const, persona_id: "eligible", persona_status: "pending_wallet" as const }));
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={async () => ({ ...session, personas: [persona("eligible", null)] })} preparePersona={prepare} />);
  await vi.waitFor(() => expect(container.querySelector("input")).not.toBeNull());
  container.querySelector<HTMLInputElement>("input")!.click();
  await vi.waitFor(() => expect(container.textContent).toContain("Use this persona in this community"));
  button(container, "Use this persona in this community").click();
  await vi.waitFor(() => expect(container.textContent).toContain("Finish persona and wallet setup on Pirate"));
  expect(container.querySelector("a[href='/p/song/study']")).not.toBeNull();
  expect(container.textContent).not.toContain("learner_fixture");
  expect(api.confirm).not.toHaveBeenCalled();
});
test("unlink requires a separate explicit review and revoke is scoped to one bot", async () => {
  const api = fixture();
  const container = mount(() => <TelegramConnectionsPage api={api} resolveSession={async () => session} />);
  await vi.waitFor(() => expect(container.textContent).toContain("Review unlinking"));
  button(container, "Review unlinking").click(); expect(api.unlink).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(container.textContent).toContain("Keep connected"));
  button(container, "Keep connected").click();
  button(container, "Revoke this bot’s Study access").click();
  await vi.waitFor(() => expect(api.revoke).toHaveBeenCalledWith("music", "123", expect.any(AbortSignal)));
  await vi.waitFor(() => expect(container.textContent).toContain("Review unlinking"));
  button(container, "Review unlinking").click();
  await vi.waitFor(() => expect(container.textContent).toContain("Unlink this Telegram account"));
  button(container, "Unlink this Telegram account").click();
  await vi.waitFor(() => expect(api.unlink).toHaveBeenCalledWith("456", expect.any(AbortSignal)));
});


test("header sign-in before starting an attempt keeps the original navigation reference", async () => {
  history.replaceState(null, "", `/telegram/link?navigation_reference=${id}`);
  const api = fixture(); let reads = 0;
  const container = mount(() => <TelegramLinkingPage mode="start" api={api} resolveSession={async () => ++reads === 1 ? "anonymous" : session} />);
  await vi.waitFor(() => expect(container.textContent).toContain("Sign in to Pirate first"));
  refreshSession();
  await vi.waitFor(() => expect(container.textContent).toContain("Review this link"));
  expect(api.start).not.toHaveBeenCalled();
  button(container, "Review this link").click();
  await vi.waitFor(() => expect(container.textContent).toContain("Continue with Telegram"));
  expect(api.start).toHaveBeenCalledWith(id, expect.any(AbortSignal));
});

test("same-account refresh preserves confirmation and explicit persona choice", async () => {
  callbackUrl(); const api = fixture();
  const checked = Promise.withResolvers<AuthenticatedSession>(); let reads = 0;
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={() => ++reads === 1 ? Promise.resolve(session) : checked.promise} />);
  await vi.waitFor(() => expect(container.querySelector("input")).not.toBeNull());
  container.querySelector<HTMLInputElement>("input")!.click();
  await vi.waitFor(() => expect(container.textContent).toContain("Link this Telegram and persona"));
  refreshSession();
  await vi.waitFor(() => expect(button(container, "Link this Telegram and persona").disabled).toBe(true));
  checked.resolve(session);
  await vi.waitFor(() => expect(button(container, "Link this Telegram and persona").disabled).toBe(false));
  expect(container.querySelector<HTMLInputElement>("input")!.checked).toBe(true);
  expect(api.verify).toHaveBeenCalledTimes(1);
  button(container, "Link this Telegram and persona").click();
  await vi.waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
});

test("in-flight verification waits for a same-account recheck without exchanging the code twice", async () => {
  callbackUrl(); const api = fixture();
  const verified = Promise.withResolvers<TelegramLinkTransaction>();
  const checked = Promise.withResolvers<AuthenticatedSession>(); let reads = 0;
  api.verify = vi.fn(() => verified.promise);
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={() => ++reads === 1 ? Promise.resolve(session) : checked.promise} />);
  await vi.waitFor(() => expect(api.verify).toHaveBeenCalledTimes(1));
  refreshSession(); verified.resolve(transaction);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(container.querySelector("input")).toBeNull();
  checked.resolve(session);
  await vi.waitFor(() => expect(container.textContent).toContain("learner_fixture"));
  expect(api.verify).toHaveBeenCalledTimes(1);
  expect(api.confirm).not.toHaveBeenCalled();
});

test("confirmation cannot run before the refreshed account is known", async () => {
  callbackUrl(); const api = fixture();
  const checked = Promise.withResolvers<AuthenticatedSession>(); let reads = 0;
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={() => ++reads === 1 ? Promise.resolve(session) : checked.promise} />);
  await vi.waitFor(() => expect(container.querySelector("input")).not.toBeNull());
  container.querySelector<HTMLInputElement>("input")!.click();
  await vi.waitFor(() => expect(container.textContent).toContain("Link this Telegram and persona"));
  refreshSession();
  await vi.waitFor(() => expect(button(container, "Link this Telegram and persona").disabled).toBe(true));
  button(container, "Link this Telegram and persona").click();
  expect(api.confirm).not.toHaveBeenCalled();
  checked.resolve({ ...session, userId: "other-account" });
  await vi.waitFor(() => expect(container.textContent).toContain("Your Pirate session changed"));
  expect(container.textContent).not.toContain("learner_fixture");
});

test("an older refresh cannot replace a newer signed-out result", async () => {
  callbackUrl(); const api = fixture(); let reads = 0;
  const older = Promise.withResolvers<AuthenticatedSession>();
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={() => ++reads === 1 ? Promise.resolve(session) : reads === 2 ? older.promise : Promise.resolve("anonymous")} />);
  await vi.waitFor(() => expect(container.textContent).toContain("learner_fixture"));
  refreshSession(); refreshSession();
  await vi.waitFor(() => expect(container.textContent).toContain("Your Pirate session changed"));
  older.resolve(session);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(container.querySelector("input")).toBeNull();
  expect(api.confirm).not.toHaveBeenCalled();
});

test("same-account refresh does not override an API refusal of the original session binding", async () => {
  callbackUrl(); const api = fixture();
  const checked = Promise.withResolvers<AuthenticatedSession>(); let reads = 0;
  api.confirm = vi.fn(async () => { throw new ApiClientError(
    { code: "conflict", name: "Conflict", retryable: false, status: 409 },
    { error: { code: "conflict", message: "fixture session rotated", retryable: false } },
  ); });
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={() => ++reads === 1 ? Promise.resolve(session) : checked.promise} />);
  await vi.waitFor(() => expect(container.querySelector("input")).not.toBeNull());
  refreshSession();
  await vi.waitFor(() => expect(container.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(true));
  checked.resolve(session);
  await vi.waitFor(() => expect(container.querySelector<HTMLFieldSetElement>("fieldset")!.disabled).toBe(false));
  container.querySelector<HTMLInputElement>("input")!.click();
  await vi.waitFor(() => expect(container.textContent).toContain("Link this Telegram and persona"));
  button(container, "Link this Telegram and persona").click();
  await vi.waitFor(() => expect(container.querySelector("[role=alert]")).not.toBeNull());
  expect(container.textContent).not.toContain("Linked to eligible");
  expect(container.textContent).not.toContain("fixture session rotated");
  expect(api.confirm).toHaveBeenCalledTimes(1);
});


test("header sign-in wins over an older initial anonymous session read", async () => {
  history.replaceState(null, "", `/telegram/link?navigation_reference=${id}`);
  const api = fixture(); let reads = 0;
  const initial = Promise.withResolvers<"anonymous">();
  const resolve = vi.fn(() => ++reads === 1 ? initial.promise : Promise.resolve(session));
  const container = mount(() => <TelegramLinkingPage mode="start" api={api} resolveSession={resolve} />);
  await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
  refreshSession();
  await vi.waitFor(() => expect(container.textContent).toContain("Review this link"));
  initial.resolve("anonymous");
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(container.textContent).toContain("Review this link");
  expect(api.start).not.toHaveBeenCalled();
});

test("failed account revalidation discards confirmation without exposing the error", async () => {
  callbackUrl(); const api = fixture(); let reads = 0;
  const resolve = async () => {
    if (++reads === 1) return session;
    throw new Error("private session diagnostics");
  };
  const container = mount(() => <TelegramLinkingPage mode="callback" api={api} resolveSession={resolve} />);
  await vi.waitFor(() => expect(container.textContent).toContain("learner_fixture"));
  refreshSession();
  await vi.waitFor(() => expect(container.textContent).toContain("Your Pirate session could not be checked"));
  expect(container.textContent).not.toContain("learner_fixture");
  expect(container.textContent).not.toContain("private session diagnostics");
  expect(api.confirm).not.toHaveBeenCalled();
});
