import { render as solidRender } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createSessionApiClient } from "../../api/client.ts";
import { clearSession, refreshSession, type AuthenticatedSession } from "../../api/session.ts";
import { ActivityCompletion } from "./activity-completion.tsx";
import { ActivityLeaderboard } from "./activity-leaderboard.tsx";
import { completionFixture, presentationFixture, progressFixture } from "./activity-contract-fixtures.ts";
import type { ActivityCompletionData, ActivityPresentationData, ActivityProgressData, CompletionTarget } from "./activity-private-api.ts";

const cleanups: (() => void)[] = [];
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const member: AuthenticatedSession = { status: "authenticated", userId: "account-one", personas: ["public-profile", "second-profile", "third-profile"].map((id, index) => ({ personaId: id, displayName: ["Community profile", "Second profile", "Third profile"][index]!, avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "community", bindingSource: "activity_participation" } })) };
const target: CompletionTarget = { communityId: "community", postId: "song", personaId: "public-profile", attempt: { kind: "study", session_id: "study-session" } };
const emptyBoard = { object: "activity_streak_leaderboard", scope: { kind: "song", community_id: "community", post_id: "song" }, day_semantics: "account_pinned_iana_timezone_v1", entries: [], viewer_standing: null };
function mount(ui: () => ReturnType<typeof ActivityCompletion>) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const stop = solidRender(ui, host); const dispose = () => { stop(); host.remove(); }; cleanups.push(dispose);
  return { host, dispose };
}
const button = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find(value => value.textContent?.includes(text))!;
function transportFor(progress: ActivityProgressData = progressFixture) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    return Response.json(path.endsWith("/progress") ? progress : path.endsWith("/presentation-persona") ? presentationFixture : path.endsWith("/qualification-policies") ? { policies: [] } : emptyBoard);
  });
}

test("private zero progress and selected persona load through real generated GETs without a public rank", async () => {
  const zero: ActivityProgressData = { ...progressFixture, standing: null, activity_counts: [{ activity: "study", qualification_count: 0 }, { activity: "karaoke", qualification_count: 0 }], streak: { current: 0, best: 0, total_days: 0, started_day: null, last_day: null }, week: { ...progressFixture.week, days: progressFixture.week.days.map(day => ({ ...day, earned: false })) } };
  const transport = transportFor(zero); const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const { host } = mount(() => <ActivityLeaderboard communityId="community" postId="song" dependencies={{ client, privateClient: client, resolveSession: async () => member }} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Not currently ranked"));
  expect(host.textContent).toContain("0 days"); expect(host.textContent).toContain("All recorded qualifications");
  expect(button(host, "Community profile")).toBeDefined(); expect(host.textContent).toContain("No active streaks yet");
  expect(host.querySelectorAll("[data-streak-day]")).toHaveLength(7);
  expect(transport.mock.calls.every(([, init]) => init?.credentials === "same-origin")).toBe(true);
});

test.each([
  { timezone: "America/New_York", today: "2026-03-08", dates: ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"] },
  { timezone: "Pacific/Kiritimati", today: "2027-01-01", dates: ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"] },
])("server week marks survive DST/year boundaries in $timezone despite an unrelated browser clock", async ({ timezone, today, dates }) => {
  vi.spyOn(Date, "now").mockReturnValue(0);
  const fixture = { ...progressFixture, timezone, today, week: { start_day: dates[0]!, end_day: dates[6]!, days: dates.map((day, index) => ({ day, earned: index === 2 })) } };
  const transport = transportFor(fixture); const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const { host } = mount(() => <ActivityLeaderboard communityId="community" postId="song" dependencies={{ client, privateClient: client, resolveSession: async () => member }} />);
  await vi.waitFor(() => expect(host.querySelectorAll("[data-streak-day]")).toHaveLength(7));
  expect([...host.querySelectorAll("[data-streak-day]")].map(day => day.getAttribute("data-streak-day"))).toEqual(dates);
  expect([...host.querySelectorAll('[data-earned="true"]')].map(day => day.getAttribute("data-streak-day"))).toEqual([dates[2]]);
  expect(host.querySelector('[aria-current="date"]')?.getAttribute("datetime")).toBe(today); expect(host.textContent).toContain(timezone);
});

const decisions: readonly { decision: ActivityCompletionData["decision"]; text: string }[] = [
  { decision: completionFixture.decision, text: "This attempt qualified." },
  { decision: { status: "not_qualified", reason: "producer_not_qualified", decided_at: "2026-10-16T12:00:00Z" }, text: "This attempt did not qualify." },
  { decision: { status: "refused", reason: "activity_incomplete" }, text: "Qualification was refused." },
  { decision: { status: "pending" }, text: "Qualification is pending." },
  { decision: { status: "unknown", reason: "historical_decision_unavailable" }, text: "historical qualification decision is unavailable" },
];
test.each(decisions)("current completion renders $decision.status from the generated GET, independent of a frozen producer receipt", async ({ decision, text }) => {
  const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ ...completionFixture, decision }));
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const { host } = mount(() => <ActivityCompletion {...target} ownerAccountId={member.userId} dependencies={{ client, resolveSession: async () => member }} />);
  await vi.waitFor(() => expect(host.textContent).toContain(text)); expect(transport).toHaveBeenCalledOnce();
  if (decision.status !== "qualified") expect(host.querySelector("[data-earned-day-event]")).toBeNull();
});
test("missing completion and unknown historical decision remain distinct, and pending can be checked again", async () => {
  let missing = true; let decision: ActivityCompletionData["decision"] = { status: "pending" };
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: async () => missing
    ? Response.json({ error: { code: "not_found", message: "private server detail", retryable: false } }, { status: 404 }) : Response.json({ ...completionFixture, decision }) });
  const { host } = mount(() => <ActivityCompletion {...target} ownerAccountId={member.userId} dependencies={{ client, resolveSession: async () => member }} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Completion could not be found")); expect(host.textContent).not.toContain("private server detail");
  missing = false; button(host, "Check again").click(); await vi.waitFor(() => expect(host.textContent).toContain("Qualification is pending"));
  decision = { status: "unknown", reason: "historical_decision_unavailable" }; button(host, "Check again").click();
  await vi.waitFor(() => expect(host.textContent).toContain("No decision has been inferred"));
});
test("stable earned signal is shown once per account/tab across replay and remount, and unavailable storage suppresses a new cue", async () => {
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: async () => Response.json(completionFixture) });
  const ui = () => <ActivityCompletion {...target} ownerAccountId={member.userId} dependencies={{ client, resolveSession: async () => member }} />;
  const first = mount(ui); await vi.waitFor(() => expect(first.host.querySelector("[data-earned-day-event]")).not.toBeNull());
  button(first.host, "Check again").click(); await vi.waitFor(() => expect(first.host.textContent).toContain("This attempt qualified"));
  expect(first.host.querySelector("[data-earned-day-event]")).toBeNull(); first.dispose();
  const second = mount(ui); await vi.waitFor(() => expect(second.host.textContent).toContain("This attempt qualified")); expect(second.host.querySelector("[data-earned-day-event]")).toBeNull();
  const other = { ...member, userId: "account-two" };
  const third = mount(() => <ActivityCompletion {...target} ownerAccountId={other.userId} dependencies={{ client, resolveSession: async () => other }} />);
  await vi.waitFor(() => expect(third.host.querySelector("[data-earned-day-event]")).not.toBeNull());
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  const last = mount(() => <ActivityCompletion {...target} ownerAccountId="account-three" dependencies={{ client, resolveSession: async () => ({ ...member, userId: "account-three" }) }} />);
  await vi.waitFor(() => expect(last.host.textContent).toContain("This attempt qualified")); expect(last.host.querySelector("[data-earned-day-event]")).toBeNull();
});

test("sign-out fences late private progress and completion reads while public standings remain available", async () => {
  let finishProgress!: (value: Response) => void; let finishCompletion!: (value: Response) => void;
  const signals: AbortSignal[] = [];
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/progress")) { if (init?.signal) signals.push(init.signal); return new Promise<Response>(resolve => { finishProgress = resolve; }); }
    if (path.endsWith("/completion")) { if (init?.signal) signals.push(init.signal); return new Promise<Response>(resolve => { finishCompletion = resolve; }); }
    return Response.json(path.endsWith("presentation-persona") ? presentationFixture : path.endsWith("qualification-policies") ? { policies: [] } : emptyBoard);
  });
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const progress = mount(() => <ActivityLeaderboard communityId="community" postId="song" dependencies={{ client, privateClient: client, resolveSession: async () => member }} />);
  const completion = mount(() => <ActivityCompletion {...target} ownerAccountId={member.userId} dependencies={{ client, resolveSession: async () => member }} />);
  await vi.waitFor(() => expect(signals).toHaveLength(2)); clearSession();
  await vi.waitFor(() => expect(completion.host.textContent).toContain("Sign in to check this attempt"));
  finishProgress(Response.json(progressFixture)); finishCompletion(Response.json(completionFixture)); await new Promise(resolve => setTimeout(resolve, 0));
  expect(signals.every(signal => signal.aborted)).toBe(true); expect(progress.host.querySelector("[data-private-activity-progress]")).toBeNull();
  expect(progress.host.textContent).toContain("No active streaks yet"); expect(completion.host.querySelector("[data-earned-day-event]")).toBeNull();
});
test("account changes clear already displayed private dates and prevent another account reading a retained attempt", async () => {
  let session = member;
  const completionClient = createSessionApiClient({ origin: location.origin, fetchImpl: async () => Response.json(completionFixture) });
  const pane = mount(() => <ActivityCompletion {...target} ownerAccountId={member.userId} dependencies={{ client: completionClient, resolveSession: async () => session }} />);
  await vi.waitFor(() => expect(pane.host.textContent).toContain("2026-10-16")); session = { ...member, userId: "different-account" }; refreshSession();
  await vi.waitFor(() => expect(pane.host.textContent).toContain("different signed-in account")); expect(pane.host.textContent).not.toContain("2026-10-16");
});

test("the exact Karaoke session and attempt render their current completion", async () => {
  const attempt = { kind: "karaoke", session_id: "karaoke-session", attempt_id: "attempt-1" } as const;
  const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ ...completionFixture, attempt }));
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const { host } = mount(() => <ActivityCompletion {...target} attempt={attempt} ownerAccountId={member.userId} dependencies={{ client, resolveSession: async () => member }} />);
  await vi.waitFor(() => expect(host.textContent).toContain("This attempt qualified"));
  expect(String(transport.mock.calls[0]?.[0])).toContain("/karaoke/sessions/karaoke-session/attempts/attempt-1/completion");
});
test("community progress loads independently of an empty community leaderboard", async () => {
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    return Response.json(path.endsWith("/progress") ? { ...progressFixture, scope: { kind: "community", community_id: "community" }, standing: null }
      : path.endsWith("/presentation-persona") ? presentationFixture : path.endsWith("qualification-policies") ? { policies: [] } : { ...emptyBoard, scope: { kind: "community", community_id: "community" } });
  });
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const { host } = mount(() => <ActivityLeaderboard communityId="community" dependencies={{ client, privateClient: client, resolveSession: async () => member }} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Not currently ranked")); expect(host.textContent).toContain("12");
  expect(transport.mock.calls.some(([input]) => String(input).endsWith("/api/communities/community/rewards/progress"))).toBe(true);
});
test("a GET selecting an unknown PUT's persona does not acknowledge that command or allow a conflicting choice", async () => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-pirate_csrf=csrf-value");
  let selection = "public-profile"; let writes = 0;
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "PUT") {
      writes++; if (writes === 1) throw new Error("unknown outcome");
      return Response.json({ object: "activity_presentation", community_id: "community", persona_id: "second-profile", updated_at: "2026-10-16T12:00:00Z" });
    }
    return Response.json(path.endsWith("/progress") ? { ...progressFixture, standing: null } : path.endsWith("/presentation-persona")
      ? { ...presentationFixture, selection: { status: "selected", presentation: { object: "activity_presentation", community_id: "community", persona_id: selection, updated_at: "2026-10-16T12:00:00Z" } } }
      : path.endsWith("/qualification-policies") ? { policies: [] } : emptyBoard);
  });
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const { host } = mount(() => <ActivityLeaderboard communityId="community" postId="song" dependencies={{ client, privateClient: client, resolveSession: async () => member }} />);
  const choose = async (trigger: string, id: string) => {
    button(host, trigger).click(); await vi.waitFor(() => expect(document.querySelector(`input[value=${id}]`)).not.toBeNull());
    document.querySelector<HTMLInputElement>(`input[value=${id}]`)!.click();
  };
  await vi.waitFor(() => expect(button(host, "Community profile")).toBeDefined()); await choose("Community profile", "second-profile");
  await vi.waitFor(() => expect(host.textContent).toContain("Couldn't confirm the profile change")); selection = "second-profile"; refreshSession();
  await vi.waitFor(() => expect(button(host, "Second profile")).toBeDefined()); expect(button(host, "Retry profile change")).toBeDefined();
  await choose("Second profile", "third-profile"); await vi.waitFor(() => expect(host.textContent).toContain("Confirm the previous profile change")); expect(writes).toBe(1);
  selection = "third-profile"; // A later current GET can differ from the acknowledged command receipt.
  button(host, "Retry profile change").click(); await vi.waitFor(() => expect(host.textContent).toContain("Presenting profile saved"));
  expect(button(host, "Third profile")).toBeDefined();
  const commands = transport.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => String(init?.body));
  expect(commands).toHaveLength(2); expect(commands[1]).toBe(commands[0]);
});
test.each(["unavailable", "unset"] as const)("the sole eligible profile can explicitly repair %s presentation without a standing", async status => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-pirate_csrf=csrf-value");
  const soleMember = { ...member, personas: [member.personas[0]!] };
  let presentationReads = 0; let finishPresentation!: (value: Response) => void;
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === "PUT") return Response.json({ object: "activity_presentation", community_id: "community", persona_id: "public-profile", updated_at: "2026-10-16T12:00:00Z" });
    if (path.endsWith("/presentation-persona")) return ++presentationReads === 1
      ? Response.json({ ...presentationFixture, selection: { status } }) : new Promise<Response>(resolve => { finishPresentation = resolve; });
    return Response.json(path.endsWith("/progress") ? { ...progressFixture, standing: null } : path.endsWith("/qualification-policies") ? { policies: [] } : emptyBoard);
  });
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const { host } = mount(() => <ActivityLeaderboard communityId="community" postId="song" dependencies={{ client, privateClient: client, resolveSession: async () => soleMember }} />);
  const action = "Use Community profile as presenting profile";
  await vi.waitFor(() => expect(button(host, action)).toBeDefined());
  expect(host.textContent).toContain("Not currently ranked"); expect(transport.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  button(host, action).click(); await vi.waitFor(() => expect(presentationReads).toBe(2));
  const command = transport.mock.calls.find(([, init]) => init?.method === "PUT")!;
  expect(new URL(String(command[0])).pathname).toBe("/api/communities/community/rewards/presentation-persona");
  expect(command[1]?.credentials).toBe("same-origin"); expect(new Headers(command[1]?.headers).get("X-CSRF-Token")).toBe("csrf-value");
  expect(JSON.parse(String(command[1]?.body))).toEqual({ persona_id: "public-profile", idempotency_key: expect.stringMatching(/^activity-presentation:/) });
  expect(host.textContent).toContain("Loading presenting profile"); expect(host.textContent).not.toContain("Presenting profile saved");
  finishPresentation(Response.json(presentationFixture)); await vi.waitFor(() => expect(host.textContent).toContain("Presenting profile saved"));
  expect(button(host, action)).toBeUndefined();
  expect(transport.mock.calls.filter(([input]) => String(input).endsWith("/progress"))).toHaveLength(2);
  expect(transport.mock.calls.filter(([input]) => String(input).endsWith("/leaderboard"))).toHaveLength(2);
});
test("a new sole candidate cannot replace an uncertain command for a disappeared profile, and replay retains the same key", async () => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-pirate_csrf=csrf-value");
  let session = { ...member, personas: member.personas.slice(0, 2) };
  let selection: ActivityPresentationData["selection"] = presentationFixture.selection; let writes = 0;
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "PUT") {
      if (++writes === 1) throw new Error("unknown outcome");
      return Response.json({ object: "activity_presentation", community_id: "community", persona_id: "second-profile", updated_at: "2026-10-16T12:00:00Z" });
    }
    return Response.json(path.endsWith("/progress") ? { ...progressFixture, standing: null } : path.endsWith("/presentation-persona")
      ? { ...presentationFixture, selection } : path.endsWith("/qualification-policies") ? { policies: [] } : emptyBoard);
  });
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport });
  const { host } = mount(() => <ActivityLeaderboard communityId="community" postId="song" dependencies={{ client, privateClient: client, resolveSession: async () => session }} />);
  await vi.waitFor(() => expect(button(host, "Community profile")).toBeDefined()); button(host, "Community profile").click();
  await vi.waitFor(() => expect(document.querySelector('input[value="second-profile"]')).not.toBeNull()); document.querySelector<HTMLInputElement>('input[value="second-profile"]')!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("Couldn't confirm the profile change"));
  session = { ...member, personas: [member.personas[0]!] }; selection = { status: "unavailable" }; refreshSession();
  const action = "Use Community profile as presenting profile";
  await vi.waitFor(() => expect(button(host, action)).toBeDefined()); button(host, action).click();
  await vi.waitFor(() => expect(host.textContent).toContain("Confirm the previous profile change")); expect(writes).toBe(1);
  expect(button(host, "Retry profile change")).toBeDefined(); button(host, "Retry profile change").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Presenting profile saved"));
  const commands = transport.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => String(init?.body));
  expect(commands).toHaveLength(2); expect(commands[0]).toContain('"persona_id":"second-profile"'); expect(commands[1]).toBe(commands[0]);
  expect(button(host, "Retry profile change")).toBeUndefined(); expect(button(host, action)).toBeDefined();
});
test("scope navigation ignores a late completion for the previous exact attempt", async () => {
  let finish!: (value: Response) => void; let calls = 0;
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: async () => ++calls === 1 ? new Promise<Response>(resolve => { finish = resolve; }) : Response.json({ ...completionFixture, attempt: { kind: "study", session_id: "second-session" }, decision: { status: "unknown", reason: "historical_decision_unavailable" } }) });
  const [attempt, setAttempt] = createSignal(target.attempt);
  const { host } = mount(() => <ActivityCompletion {...target} attempt={attempt()} ownerAccountId={member.userId} dependencies={{ client, resolveSession: async () => member }} />);
  await vi.waitFor(() => expect(calls).toBe(1)); setAttempt({ kind: "study", session_id: "second-session" });
  await vi.waitFor(() => expect(host.textContent).toContain("historical qualification decision is unavailable")); finish(Response.json(completionFixture)); await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.textContent).not.toContain("This attempt qualified"); expect(host.querySelector("[data-earned-day-event]")).toBeNull();
});
