import { render } from "@solidjs/web";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createSessionApiClient } from "../../api/client.ts";
import { clearSession, type AuthenticatedSession } from "../../api/session.ts";
import { completionFixture, progressFixture } from "../activity/activity-contract-fixtures.ts";
import type { ActivityCompletionData } from "../activity/activity-private-api.ts";
import { StudyCompletionFlow } from "./study-completion-flow.tsx";

const cleanups: (() => void)[] = [];
const member: AuthenticatedSession = { status: "authenticated", userId: "account-one", personas: [{ personaId: "public-profile", displayName: "Community profile", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "community", bindingSource: "activity_participation" } }] };
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.restoreAllMocks(); });
function mount(completion: ActivityCompletionData = completionFixture, options: { progress?: typeof progressFixture; delay?: Promise<void>; account?: AuthenticatedSession; freshAccount?: AuthenticatedSession } = {}) {
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    await options.delay;
    return Response.json(String(input).endsWith("/completion") ? completion : options.progress ?? progressFixture);
  });
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const onExit = vi.fn();
  const host = document.createElement("div"); document.body.appendChild(host);
  const dispose = render(() => <StudyCompletionFlow
    communityId="community" postId="song" personaId="public-profile" ownerAccountId="account-one"
    attempt={{ kind: "study", session_id: "study-session" }}
    result={{ kind: "complete", correctCount: 6, totalCount: 7, scorePercent: 86 }}
    dependencies={{ completionClient: client, progressClient: client, resolveSession: async () => options.account ?? member, resolveFreshSession: async () => options.freshAccount ?? options.account ?? member }}
    onExit={onExit} onStudyAgain={() => {}}
  />, host);
  cleanups.push(() => { dispose(); host.remove(); });
  return { host, transport, onExit };
}
function next(host: HTMLElement) { [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === "Continue")!.click(); }

test("completion shows the designed score first, then the exact attempt's earned streak", async () => {
  const { host, transport, onExit } = mount();
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.textContent).toContain("86%"); expect(host.textContent).toContain("6/7");
  expect(host.textContent).not.toContain("Qualification"); expect(host.textContent).not.toContain("Song streaks");
  expect(host.textContent).not.toContain("day streak");
  next(host);
  await vi.waitFor(() => expect(host.textContent).toContain("day streak"));
  expect(host.querySelector("h2")?.textContent).toBe("3");
  expect(host.querySelector('[aria-label="Current week"]')).not.toBeNull();
  expect(host.textContent).not.toContain("86%"); expect(host.textContent).not.toContain("Study again");
  expect(onExit).not.toHaveBeenCalled();
  next(host); expect(onExit).toHaveBeenCalledOnce();
});

const nonEarnedDecisions: readonly ActivityCompletionData["decision"][] = [
  { status: "pending" },
  { status: "not_qualified", reason: "producer_not_qualified", decided_at: "2026-10-16T12:00:00Z" },
  ...(completionFixture.decision.status === "qualified" ? [
    { ...completionFixture.decision, earned_day: { status: "unavailable" as const } },
    { ...completionFixture.decision, earned_day: { status: "recorded" as const, signal_id: "existing-day", song_day_newly_earned: false, community_day_newly_earned: true } },
  ] : []),
];
test.each(nonEarnedDecisions)("$status never invents a newly earned song streak", async decision => {
  const { host, transport, onExit } = mount({ ...completionFixture, decision });
  await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
  await new Promise(resolve => setTimeout(resolve, 0));
  next(host); expect(onExit).toHaveBeenCalledOnce(); expect(host.textContent).not.toContain("day streak");
});

test("a delayed optional read never blocks Continue", async () => {
  let resolve!: () => void; const delay = new Promise<void>(done => { resolve = done; });
  const { host, onExit } = mount(completionFixture, { delay });
  next(host); expect(onExit).toHaveBeenCalledOnce(); resolve();
});

test("logout fences delayed private results and an account mismatch makes no private call", async () => {
  let resolve!: () => void; const delay = new Promise<void>(done => { resolve = done; });
  const first = mount(completionFixture, { delay });
  await vi.waitFor(() => expect(first.transport).toHaveBeenCalledOnce());
  clearSession(); resolve();
  await new Promise(done => setTimeout(done, 0));
  next(first.host); expect(first.onExit).toHaveBeenCalledOnce(); expect(first.host.textContent).not.toContain("day streak");
  const second = mount(completionFixture, { account: { ...member, userId: "different-account" } });
  await new Promise(done => setTimeout(done, 0));
  expect(second.transport).not.toHaveBeenCalled();
});

test("mismatched completion and stale calendar cannot manufacture today's streak", async () => {
  for (const mismatch of ["attempt", "day"] as const) {
    const { host, transport, onExit } = mount(mismatch === "attempt" ? { ...completionFixture, attempt: { kind: "study", session_id: "different-session" } } : completionFixture,
      { progress: { ...progressFixture, today: "2026-10-17" } });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(mismatch === "attempt" ? 1 : 2));
    await new Promise(done => setTimeout(done, 0));
    next(host); expect(onExit).toHaveBeenCalledOnce(); expect(host.textContent).not.toContain("day streak");
  }
});

test("an account change between completion and progress cannot mix two accounts' facts", async () => {
  const { host, transport, onExit } = mount(completionFixture, { freshAccount: { ...member, userId: "different-account" } });
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  await new Promise(done => setTimeout(done, 0));
  next(host); expect(onExit).toHaveBeenCalledOnce(); expect(host.textContent).not.toContain("day streak");
});

test("pagehide clears private streak facts before a document enters the back-forward cache", async () => {
  const { host, transport, onExit } = mount();
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  await new Promise(done => setTimeout(done, 0));
  next(host); await vi.waitFor(() => expect(host.textContent).toContain("day streak"));
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
  await vi.waitFor(() => expect(host.textContent).not.toContain("day streak"));
  expect(host.textContent).toContain("86%");
  next(host); expect(onExit).toHaveBeenCalledOnce();
});

test("an earned-day celebration is consumed only when shown and is not replayed after remount", async () => {
  const first = mount();
  await vi.waitFor(() => expect(first.transport).toHaveBeenCalledTimes(2));
  await new Promise(done => setTimeout(done, 0));
  expect(sessionStorage.length).toBe(0);
  next(first.host); await vi.waitFor(() => expect(first.host.textContent).toContain("day streak"));
  const second = mount();
  await vi.waitFor(() => expect(second.transport).toHaveBeenCalledTimes(2));
  await new Promise(done => setTimeout(done, 0));
  next(second.host); expect(second.onExit).toHaveBeenCalledOnce(); expect(second.host.textContent).not.toContain("day streak");
});
