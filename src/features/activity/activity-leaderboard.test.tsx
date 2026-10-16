import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { ApiClientError } from "@pirate/api-client";
import * as sessionEvents from "../../api/session.ts";
import { clearSession, refreshSession, type AuthenticatedSession, type SessionResolution } from "../../api/session.ts";
import { ActivityLeaderboard, type ActivityLeaderboardDependencies } from "./activity-leaderboard.tsx";
import { privateFixtureClient, progressFixture, presentationFixture } from "./activity-contract-fixtures.ts";
import type { ActivityClient, ActivityLeaderboardData, ActivityScope } from "./activity-api.ts";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const entry: ActivityLeaderboardData["entries"][number] = { rank: 27, current: 3, best: 8, total_days: 12, started_day: "2026-10-14", last_day: "2026-10-16", persona: { object: "persona", persona_id: "public-profile", display_name: "Community singer", avatar_ref: null, primary_public_handle: null }, is_viewer: true };
const board: ActivityLeaderboardData = { object: "activity_streak_leaderboard", scope: { kind: "song", community_id: "community", post_id: "song" }, day_semantics: "account_pinned_iana_timezone_v1", entries: [{ ...entry, rank: 1, is_viewer: false, persona: { ...entry.persona, display_name: "Public leader" } }], viewer_standing: entry };
const member: AuthenticatedSession = { status: "authenticated", userId: "private-account", personas: [
  { personaId: "public-profile", displayName: "Community singer", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "community", bindingSource: "activity_participation" } },
  { personaId: "second-profile", displayName: "Second profile", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "community", bindingSource: "activity_participation" } },
  { personaId: "sibling", displayName: "Other community secret", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "elsewhere", bindingSource: "activity_participation" } },
] };
function render(dependencies: ActivityLeaderboardDependencies, scope: () => ActivityScope = () => ({ communityId: "community", postId: "song" })) {
  const host = document.createElement("div"); document.body.appendChild(host);
  createRoot(stop => { solidRender(() => <ActivityLeaderboard {...scope()} dependencies={{ ...dependencies, privateClient: dependencies.privateClient ?? (dependencies.client ? privateFixtureClient() : undefined) }} />, host); cleanups.push(() => { stop(); host.remove(); }); });
  return host;
}
function client(read: () => Promise<ActivityLeaderboardData> = async () => board) {
  return { get_rewardsQualificationPolicies: vi.fn<ActivityClient["get_rewardsQualificationPolicies"]>(async () => ({ policies: [] })), get_communitiesCommunityIdPostsPostIdRewardsLeaderboard: vi.fn(read), get_communitiesCommunityIdRewardsLeaderboard: vi.fn(read), put_communitiesCommunityIdRewardsPresentationPersona: vi.fn<ActivityClient["put_communitiesCommunityIdRewardsPresentationPersona"]>(async () => ({ object: "activity_presentation" as const, community_id: "community", persona_id: "second-profile", updated_at: "2026-10-16T00:00:00Z" })) };
}
function button(host: HTMLElement | Document, text: string) { return [...host.querySelectorAll("button")].find(item => item.textContent?.includes(text))!; }

test("minimal slice waits for session, then renders server ranks and separate private counts without exposing private identifiers", async () => {
  let resolve!: (value: SessionResolution) => void;
  const session = new Promise<SessionResolution>(done => { resolve = done; }); const api = client();
  const host = render({ resolveSession: () => session, client: api });
  expect(host.textContent).toContain("Loading streaks"); expect(api.get_communitiesCommunityIdPostsPostIdRewardsLeaderboard).not.toHaveBeenCalled();
  resolve(member); await vi.waitFor(() => expect(host.textContent).toContain("Public leader"));
  const privateView = host.querySelector("[data-private-activity-standing]")!;
  expect(privateView.textContent).toContain("27"); expect(privateView.textContent).toContain("12");
  expect(host.querySelector("ol")?.textContent).not.toContain("Community singer");
  expect(host.innerHTML).not.toContain("private-account"); expect(host.textContent).not.toContain("Other community secret");
  expect(host.querySelectorAll("[data-streak-day]")).toHaveLength(7);
});

test("anonymous projection never renders a returned viewer standing or viewer marker", async () => {
  const host = render({ resolveSession: async () => "anonymous", client: client(async () => ({ ...board, entries: [entry] })) });
  await vi.waitFor(() => expect(host.textContent).toContain("Community singer"));
  expect(host.querySelector("[data-private-activity-standing]")).toBeNull(); expect(host.textContent).not.toContain("(You)"); expect(host.textContent).not.toContain("27Rank");
  expect(host.textContent).toContain("Sign in to see your private standing");
});

test("empty standing stays unknown instead of inventing zero or qualification", async () => {
  const host = render({ resolveSession: async () => member, client: client(async () => ({ ...board, entries: [], viewer_standing: null })) });
  await vi.waitFor(() => expect(host.textContent).toContain("No active streaks yet"));
  expect(host.textContent).toContain("Qualifying days"); expect(host.textContent).not.toContain("0 days");
});

test("errors retry and session-resolution failures never trigger a private or anonymous read", async () => {
  let fail = true; const api = client();
  const host = render({ resolveSession: async () => { if (fail) throw new Error("private error body"); return "anonymous"; }, client: api });
  await vi.waitFor(() => expect(host.textContent).toContain("Couldn't check your session"));
  expect(api.get_communitiesCommunityIdPostsPostIdRewardsLeaderboard).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("private error body");
  fail = false; button(host, "Try again").click(); await vi.waitFor(() => expect(host.textContent).toContain("Public leader"));
});

test("session changes clear standing and fence an old in-flight read even if transport ignores abort", async () => {
  let resolve!: (value: ActivityLeaderboardData) => void;
  const old = new Promise<ActivityLeaderboardData>(done => { resolve = done; }); let reads = 0; let viewer: SessionResolution = member;
  const api = client(async () => ++reads === 1 ? old : { ...board, entries: [], viewer_standing: null });
  const host = render({ resolveSession: async () => viewer, client: api });
  await vi.waitFor(() => expect(reads).toBe(1)); viewer = "anonymous"; clearSession();
  await vi.waitFor(() => expect(host.textContent).not.toContain("Your standing"));
  await vi.waitFor(() => expect(host.textContent).toContain("No active streaks")); resolve(board);
  await new Promise(done => setTimeout(done, 0)); expect(host.textContent).not.toContain("Public leader");
  expect(host.querySelector("[data-private-activity-standing]")).toBeNull();
});

test("community navigation aborts the song read and excludes the previous scope", async () => {
  let resolve!: (value: ActivityLeaderboardData) => void; const pending = new Promise<ActivityLeaderboardData>(done => { resolve = done; });
  const api = client(async () => pending);
  api.get_communitiesCommunityIdRewardsLeaderboard.mockImplementation(async () => ({ ...board, scope: { kind: "community", community_id: "community" }, entries: [], viewer_standing: null }));
  const [scope, setScope] = createSignal<ActivityScope>({ communityId: "community", postId: "song" });
  const host = render({ resolveSession: async () => member, client: api }, scope);
  await vi.waitFor(() => expect(api.get_communitiesCommunityIdPostsPostIdRewardsLeaderboard).toHaveBeenCalledOnce()); setScope({ communityId: "community" });
  await vi.waitFor(() => expect(host.textContent).toContain("No active streaks")); resolve(board);
  await new Promise(done => setTimeout(done, 0)); expect(host.textContent).not.toContain("Public leader");
});

test("presentation picker lists only bound active profiles, writes with CSRF and reloads after confirmation", async () => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-pirate_csrf=csrf-value");
  const api = client(); const host = render({ resolveSession: async () => member, client: api });
  await vi.waitFor(() => expect(host.textContent).toContain("Presenting as"));
  button(host, "Community singer").click();
  await vi.waitFor(() => expect(document.body.textContent).toContain("Second profile"));
  expect(document.body.textContent).not.toContain("Other community secret");
  document.querySelector<HTMLInputElement>("input[value=second-profile]")!.click();
  await vi.waitFor(() => expect(api.put_communitiesCommunityIdRewardsPresentationPersona).toHaveBeenCalledOnce());
  const [input, options] = api.put_communitiesCommunityIdRewardsPresentationPersona.mock.calls[0]!;
  expect(input.body.persona_id).toBe("second-profile"); expect(input.body.idempotency_key).toMatch(/^activity-presentation:/);
  expect(options?.credentials).toBe("same-origin");
  if (!(options?.headers instanceof Headers)) throw new Error("Expected CSRF headers");
  expect(options.headers.get("x-csrf-token")).toBe("csrf-value");
  await vi.waitFor(() => expect(api.get_communitiesCommunityIdPostsPostIdRewardsLeaderboard).toHaveBeenCalledTimes(2));
});

test("refresh removes rendered private standing before the replacement session resolves", async () => {
  let again = false; const api = client();
  const host = render({ client: api, resolveSession: async () => again ? new Promise<SessionResolution>(() => {}) : member });
  await vi.waitFor(() => expect(host.textContent).toContain("Your standing")); again = true; refreshSession();
  await vi.waitFor(() => expect(host.textContent).not.toContain("Your standing")); expect(host.textContent).not.toContain("Public leader");
});

test("server qualification terms remain independent from a leaderboard and retry without losing standing", async () => {
  const api = client(); let fail = true;
  api.get_rewardsQualificationPolicies.mockImplementation(async () => {
    if (fail) throw new Error("unavailable");
    return { policies: [{ activity: "study", policy: { kind: "study_session_first_pass_v2", qualification_policy_version_id: "published-policy", required_correct_bps: 7000 } }] };
  });
  const host = render({ client: api, resolveSession: async () => member });
  await vi.waitFor(() => expect(host.textContent).toContain("Qualification requirements are unavailable"));
  expect(host.textContent).toContain("Your standing"); fail = false; button(host, "Retry requirements").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Study: 70% correct on the first pass"));
  expect(host.textContent).toContain("do not confirm qualification for your latest attempt");
});

test("failed presentation retries keep their idempotency key, and a late previous-account result cannot refresh standings", async () => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-pirate_csrf=csrf-value");
  const api = client(); let finish!: (result: Awaited<ReturnType<ActivityClient["put_communitiesCommunityIdRewardsPresentationPersona"]>>) => void;
  api.put_communitiesCommunityIdRewardsPresentationPersona.mockRejectedValueOnce(new Error("unknown outcome"));
  api.put_communitiesCommunityIdRewardsPresentationPersona.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let session: SessionResolution = member;
  const host = render({ client: api, resolveSession: async () => session });
  const choose = async () => {
    button(host, "Community singer").click();
    await vi.waitFor(() => expect(document.querySelector("input[value=second-profile]")).not.toBeNull());
    document.querySelector<HTMLInputElement>("input[value=second-profile]")!.click();
  };
  await vi.waitFor(() => expect(host.textContent).toContain("Presenting as")); await choose();
  await vi.waitFor(() => expect(host.textContent).toContain("Couldn't confirm the profile change"));
  await choose(); await vi.waitFor(() => expect(api.put_communitiesCommunityIdRewardsPresentationPersona).toHaveBeenCalledTimes(2));
  const calls = api.put_communitiesCommunityIdRewardsPresentationPersona.mock.calls;
  expect(calls[0]?.[0].body.idempotency_key).toBe(calls[1]?.[0].body.idempotency_key);
  session = "anonymous"; clearSession();
  await vi.waitFor(() => expect(host.textContent).toContain("Sign in to see your private standing"));
  const reads = api.get_communitiesCommunityIdPostsPostIdRewardsLeaderboard.mock.calls.length;
  finish({ object: "activity_presentation", community_id: "community", persona_id: "second-profile", updated_at: "2026-10-16T00:00:00Z" });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(api.get_communitiesCommunityIdPostsPostIdRewardsLeaderboard).toHaveBeenCalledTimes(reads);
  expect(host.textContent).not.toContain("Saving presenting profile"); expect(host.querySelector("[data-private-activity-standing]")).toBeNull();
});

test("community summary expands the shared leaderboard and preserves server competition ranks", async () => {
  const api = client(async () => ({ ...board, scope: { kind: "community", community_id: "community" }, entries: [1, 2, 2, 4].map((rank, index) => ({ ...entry, rank, persona: { ...entry.persona, persona_id: `public-${index}`, display_name: `Community profile ${index}` } })) }));
  const host = document.createElement("div"); document.body.appendChild(host);
  const stop = solidRender(() => <ActivityLeaderboard compact communityId="community" dependencies={{ client: api, privateClient: privateFixtureClient(), resolveSession: async () => member }} />, host); cleanups.push(() => { stop(); host.remove(); });
  await vi.waitFor(() => expect(host.textContent).toContain("Your streak: 3 days"));
  expect(host.querySelector("ol")).toBeNull(); button(host, "Leaderboard").click();
  await vi.waitFor(() => expect(host.querySelector("ol")).not.toBeNull());
  expect([...host.querySelectorAll("ol li > span:first-child")].map(item => item.textContent)).toEqual(["1", "2", "2", "4"]);
  expect(button(host, "Hide leaderboard").getAttribute("aria-expanded")).toBe("true");
});

test("an authorization refusal stays explicit and never falls back to anonymous standing", async () => {
  const api = client(async () => { throw new ApiClientError({ status: 401, code: "auth_error", name: "AuthError", retryable: false }, { error: { code: "auth_error", message: "private refusal", retryable: false } }); });
  const host = render({ client: api, resolveSession: async () => member });
  await vi.waitFor(() => expect(host.textContent).toContain("Streaks aren't available with this session"));
  expect(api.get_communitiesCommunityIdPostsPostIdRewardsLeaderboard).toHaveBeenCalledOnce();
  expect(host.textContent).not.toContain("private refusal"); expect(host.textContent).not.toContain("No active streaks");
});

test("a stalled read reaches a retryable timeout and its late result cannot replace the error", async () => {
  vi.useFakeTimers(); let finish!: (value: ActivityLeaderboardData) => void;
  const api = client(() => new Promise(resolve => { finish = resolve; }));
  const host = render({ client: api, resolveSession: async () => member });
  await vi.advanceTimersByTimeAsync(1); expect(api.get_communitiesCommunityIdPostsPostIdRewardsLeaderboard).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(15_000);
  expect(host.textContent).toContain("Couldn't load streaks");
  finish(board); await vi.advanceTimersByTimeAsync(1);
  // Current private progress is an independent successful read in client 0.120.
  expect(host.textContent).toContain("Your standing"); expect(host.textContent).toContain("Try again");
});

test("a clear notification alone reloads public standings with omitted credentials while the mounted viewer loses all private standing", async () => {
  // Suppress the store's companion refresh subscription to exercise the clear
  // notification alone, with a deliberately stale injected session resolver.
  vi.spyOn(sessionEvents, "onSessionRefreshed").mockImplementation(() => () => {});
  let signedOut = false;
  const transport = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(String(input));
    return Response.json(url.pathname.endsWith("/qualification-policies") ? { policies: [] } : {
      ...board, entries: board.entries.map(row => ({ ...row, persona: { ...row.persona, display_name: signedOut ? "Public after sign-out" : "Public leader" } })),
    });
  });
  vi.stubGlobal("fetch", transport);
  const session = vi.fn(async () => member);
  const host = render({ resolveSession: session });
  await vi.waitFor(() => expect(host.textContent).toContain("Your standing"));
  signedOut = true; clearSession();
  await vi.waitFor(() => expect(host.textContent).toContain("Public after sign-out"));
  expect(host.querySelector("[data-private-activity-standing]")).toBeNull();
  expect(host.textContent).not.toContain("Loading streaks"); expect(host.textContent).not.toContain("Presenting as");
  expect(host.textContent).toContain("Sign in to see your private standing");
  const reads = transport.mock.calls.filter(([input]) => String(input).endsWith("/leaderboard"));
  expect(reads).toHaveLength(2);
  expect(reads[0]?.[1]?.credentials).toBe("same-origin"); expect(reads[1]?.[1]?.credentials).toBe("omit");
  expect(session).toHaveBeenCalledOnce();
});

test.each(["delayed", "unknown"] as const)("a %s presentation survives same-account refresh and failed-read retry, blocks conflicts, and replays the identical command", async outcome => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-pirate_csrf=csrf-value");
  const session: AuthenticatedSession = { ...member, personas: [...member.personas, {
    personaId: "third-profile", displayName: "Third profile", avatarRef: null, primaryPublicHandle: null,
    communityBinding: { communityId: "community", bindingSource: "activity_participation" },
  }] };
  let reads = 0;
  const api = client(async () => {
    reads++;
    if (reads === 2) throw new Error("temporary read failure");
    return reads === 1 ? board : { ...board, viewer_standing: null };
  });
  let acknowledgedPersona: string | undefined;
  let finishOld: ((value: Awaited<ReturnType<ActivityClient["put_communitiesCommunityIdRewardsPresentationPersona"]>>) => void) | undefined;
  api.put_communitiesCommunityIdRewardsPresentationPersona.mockImplementation(async input => { acknowledgedPersona = input.body.persona_id; return {
    object: "activity_presentation", community_id: input.path.communityId, persona_id: input.body.persona_id, updated_at: "2026-10-16T00:00:00Z",
  }; });
  api.put_communitiesCommunityIdRewardsPresentationPersona.mockImplementationOnce(() => outcome === "unknown"
    ? Promise.reject(new Error("unknown write outcome"))
    : new Promise(resolve => { finishOld = resolve; }));
  const privateClient = { ...privateFixtureClient(), get_communitiesCommunityIdPostsPostIdRewardsProgress: async () => ({ ...progressFixture, standing: null }), get_communitiesCommunityIdRewardsPresentationPersona: async () => ({ ...presentationFixture, selection: acknowledgedPersona ? { status: "selected" as const, presentation: { object: "activity_presentation" as const, community_id: "community", persona_id: acknowledgedPersona, updated_at: "2026-10-16T00:00:00Z" } } : { status: "unset" as const } }) };
  const host = render({ client: api, privateClient, resolveSession: async () => session });
  const choose = async (trigger: string, personaId: string) => {
    button(host, trigger).click();
    await vi.waitFor(() => expect(document.querySelector(`input[value=${personaId}]`)).not.toBeNull());
    document.querySelector<HTMLInputElement>(`input[value=${personaId}]`)!.click();
  };
  await vi.waitFor(() => expect(host.textContent).toContain("Presenting as"));
  await choose("Choose profile", "second-profile");
  await vi.waitFor(() => expect(api.put_communitiesCommunityIdRewardsPresentationPersona).toHaveBeenCalledOnce());
  if (outcome === "unknown") await vi.waitFor(() => expect(host.textContent).toContain("Couldn't confirm the profile change"));
  refreshSession();
  await vi.waitFor(() => expect(host.textContent).toContain("Couldn't load streaks"));
  expect(api.put_communitiesCommunityIdRewardsPresentationPersona.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  button(host, "Try again").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Not currently ranked"));
  // No initial presentation is inferred from the pending command or null standing.
  await vi.waitFor(() => expect(button(host, "Choose profile")).toBeDefined());
  await choose("Choose profile", "third-profile");
  await vi.waitFor(() => expect(host.textContent).toContain("Confirm the previous profile change"));
  expect(api.put_communitiesCommunityIdRewardsPresentationPersona).toHaveBeenCalledOnce();
  button(host, "Retry profile change").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Presenting profile saved"));
  const calls = api.put_communitiesCommunityIdRewardsPresentationPersona.mock.calls;
  expect(calls).toHaveLength(2); expect(calls[1]?.[0]).toEqual(calls[0]?.[0]);
  expect(calls[1]?.[0].body.persona_id).toBe("second-profile");
  expect(button(host, "Second profile")).toBeDefined();
  const readsAfterAck = reads;
  finishOld?.({ object: "activity_presentation", community_id: "community", persona_id: "second-profile", updated_at: "2026-10-16T00:00:00Z" });
  await new Promise(resolve => setTimeout(resolve, 0)); expect(reads).toBe(readsAfterAck);
  // Only a matched write acknowledgement releases the conflicting choice.
  await choose("Second profile", "third-profile");
  await vi.waitFor(() => expect(api.put_communitiesCommunityIdRewardsPresentationPersona).toHaveBeenCalledTimes(3));
  expect(calls[2]?.[0].body.persona_id).toBe("third-profile");
  expect(calls[2]?.[0].body.idempotency_key).not.toBe(calls[0]?.[0].body.idempotency_key);
});

test.each(["account", "scope"] as const)("an uncertain presentation is forgotten on %s change instead of replayed for the new context", async change => {
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-pirate_csrf=csrf-value");
  let session = member;
  const [target, setTarget] = createSignal<ActivityScope>({ communityId: "community", postId: "song" });
  const api = client(async () => ({ ...board, scope: { kind: "song", community_id: "community", post_id: target().postId! } }));
  api.put_communitiesCommunityIdRewardsPresentationPersona.mockRejectedValueOnce(new Error("unknown outcome"));
  const host = render({ client: api, resolveSession: async () => session }, target);
  const choose = async () => {
    button(host, "Community singer").click();
    await vi.waitFor(() => expect(document.querySelector("input[value=second-profile]")).not.toBeNull());
    document.querySelector<HTMLInputElement>("input[value=second-profile]")!.click();
  };
  await vi.waitFor(() => expect(host.textContent).toContain("Presenting as")); await choose();
  await vi.waitFor(() => expect(host.textContent).toContain("Couldn't confirm the profile change"));
  if (change === "account") { session = { ...member, userId: "different-account" }; refreshSession(); }
  else setTarget({ communityId: "community", postId: "another-song" });
  await vi.waitFor(() => expect(host.textContent).not.toContain("Couldn't confirm the profile change"));
  await vi.waitFor(() => expect(host.textContent).toContain("Presenting as"));
  expect(button(host, "Retry profile change")).toBeUndefined();
  await choose(); await vi.waitFor(() => expect(api.put_communitiesCommunityIdRewardsPresentationPersona).toHaveBeenCalledTimes(2));
  const calls = api.put_communitiesCommunityIdRewardsPresentationPersona.mock.calls;
  expect(calls[1]?.[0].body.idempotency_key).not.toBe(calls[0]?.[0].body.idempotency_key);
});
