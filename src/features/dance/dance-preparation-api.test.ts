import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiClientError, type PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client.ts";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events.ts";
import { createDancePreparationApi, type DanceCreateCommand, type DancePreparationOptions, type DanceCaptureContext } from "./dance-preparation-api.ts";
import { dancePreparationFixture as context } from "./dance-preparation.fixture.ts";

type Client = NonNullable<Parameters<typeof createDancePreparationApi>[0]>;
const scope = { accountId: "fictional-dancer", communityId: context.session.community_id, postId: context.session.song_post_id };
const user: Awaited<ReturnType<PirateApiClient["get_usersMe"]>> = {
  object: "user", id: scope.accountId, verification_state: "unverified", created: 0,
  verification_capabilities: { unique_human: { state: "unverified" }, age_over_18: { state: "unverified" }, minimum_age: { state: "unverified" }, nationality: { state: "unverified" }, gender: { state: "unverified" }, wallet_score: { state: "unverified" } },
};
const command: DanceCreateCommand = {
  version: "dance-moderated-intake-v1", operation: "create", idempotency_key: "original-create-key",
  community_id: scope.communityId, song_post_id: scope.postId, persona_id: context.persona_id,
  choreography_id: context.session.choreography_id, choreography_revision: context.session.choreography_revision,
  expected_policy_hash: context.session.policy_hash,
};
const consent = {
  version: "dance-moderated-intake-v1", operation: "consent", idempotency_key: "original-consent-key",
  community_id: scope.communityId, session_id: context.session.session_id, terms_hash: context.session.terms_hash,
  consent_version: context.session.consent_version, consent_hash: context.session.consent_hash, retention_hash: context.session.retention_hash,
} as const;
const options: DancePreparationOptions = {
  version: "dance-moderated-capture-options-v1", community_id: scope.communityId, song_post_id: scope.postId,
  ready: true, unavailable_code: null, next_cursor: null,
  policy: { policy_hash: context.session.policy_hash, consent_version: context.session.consent_version,
    consent_hash: context.session.consent_hash, retention_hash: context.session.retention_hash,
    publication_disclosure_version: context.captured_policy.publication_disclosure_version, disclosure: context.disclosure },
  choreographies: [],
};
const signal = () => new AbortController().signal;
function harness() {
  let csrf: string | undefined = "csrf-fixture";
  const client = {
    get_usersMe: vi.fn<Client["get_usersMe"]>(async () => user),
    get_communitiesCommunityIdMeCapabilities: vi.fn<Client["get_communitiesCommunityIdMeCapabilities"]>(async () => ({ community_id: scope.communityId, role: "owner", role_assignment_id: "owner-assignment", capabilities: ["moderation.view", "moderation.act"] })),
    post_communitiesCommunityIdActivityPersonasPrepare: vi.fn<Client["post_communitiesCommunityIdActivityPersonasPrepare"]>(async () => ({ object: "activity_persona_preparation", community_id: scope.communityId, persona_id: context.persona_id, persona_status: "active", activity_presentation: null })),
    get_communitiesCommunityIdPostsPostIdDanceModeratedOptions: vi.fn<Client["get_communitiesCommunityIdPostsPostIdDanceModeratedOptions"]>(async () => options),
    get_communitiesCommunityIdPostsPostIdDanceModeratedChoreographiesChoreographyIdRevisionsRevisionLatestReview: vi.fn<Client["get_communitiesCommunityIdPostsPostIdDanceModeratedChoreographiesChoreographyIdRevisionsRevisionLatestReview"]>(async () => ({ object: "latest_moderated_dance_review", latest_submitted: null, active_session_id: context.session.session_id })),
    post_communitiesCommunityIdDanceModeratedSessions: vi.fn<Client["post_communitiesCommunityIdDanceModeratedSessions"]>(async () => ({ version: "dance-moderated-intake-receipt-v1", receipt_id: "original-create-receipt", operation: "create", session: context.session })),
    post_communitiesCommunityIdDanceModeratedSessionsSessionIdConsent: vi.fn<Client["post_communitiesCommunityIdDanceModeratedSessionsSessionIdConsent"]>(async () => ({ version: "dance-moderated-intake-receipt-v1", receipt_id: "original-consent-receipt", operation: "consent", session: { ...context.session, state: "consented" } })),
    get_communitiesCommunityIdDanceModeratedSessionsSessionId: vi.fn<Client["get_communitiesCommunityIdDanceModeratedSessionsSessionId"]>(async () => context.session),
    get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext: vi.fn<Client["get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext"]>(async () => context),
  } satisfies Client;
  return { client, api: createDancePreparationApi(client, () => csrf), setCsrf: (value: string | undefined) => { csrf = value; } };
}
beforeEach(() => { establishSessionAuthority(); });
afterEach(() => { forgetSessionAuthority(); vi.restoreAllMocks(); });

test("owner entry authority is read for the exact community between fresh account checks", async () => {
  const { api, client } = harness(), abort = signal();
  expect(await api.owner(scope, abort)).toBe(true);
  expect(client.get_communitiesCommunityIdMeCapabilities).toHaveBeenCalledWith({ path: { communityId: scope.communityId } }, { signal: abort });
  expect(client.get_usersMe).toHaveBeenCalledTimes(2);
});
test("only a declared redacted NotFound means this account is not the owner", async () => {
  const { api, client } = harness();
  client.get_communitiesCommunityIdMeCapabilities.mockRejectedValueOnce(new ApiClientError({ name: "NotFound", status: 404, code: "not_found", retryable: false }, { error: { code: "not_found", message: "Unavailable", retryable: false } }));
  expect(await api.owner(scope, signal())).toBe(false); expect(client.get_usersMe).toHaveBeenCalledTimes(2);
});
test("a failed ownership read cannot become permission to record", async () => {
  const { api, client } = harness(); client.get_communitiesCommunityIdMeCapabilities.mockRejectedValueOnce(new Error("offline"));
  await expect(api.owner(scope, signal())).rejects.toThrow("offline");
});
test("foreign community ownership cannot authorize the target", async () => {
  const { api, client } = harness(); client.get_communitiesCommunityIdMeCapabilities.mockResolvedValueOnce({ community_id: "elsewhere", role: "owner", role_assignment_id: "assignment", capabilities: ["moderation.view"] });
  await expect(api.owner(scope, signal())).rejects.toThrow("target_changed");
});
test("a nonowner read is also fenced against account replacement", async () => {
  const { api, client } = harness();
  client.get_communitiesCommunityIdMeCapabilities.mockRejectedValueOnce(new ApiClientError({ name: "NotFound", status: 404, code: "not_found", retryable: false }, { error: { code: "not_found", message: "Unavailable", retryable: false } }));
  client.get_usersMe.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, id: "replacement" });
  await expect(api.owner(scope, signal())).rejects.toThrow("account_changed");
});

test("funded context remains funded while serving Rewards is false", async () => {
  const { api } = harness();
  const result = await api.context(scope, context.session.session_id, signal());
  expect(result).toBe(context);
  expect(result.reward_mode).toBe("reward_eligible"); expect(result.rewards_enabled).toBe(false);
  expect(result.objectives).toHaveLength(1); expect(result.session.score_bps).toBeNull();
});
test("account replacement before a write prevents dispatch", async () => {
  const { api, client } = harness(); client.get_usersMe.mockResolvedValueOnce({ ...user, id: "another-account" });
  await expect(api.create(scope, command, signal())).rejects.toThrow("dance_preparation_account_changed");
  expect(client.post_communitiesCommunityIdDanceModeratedSessions).not.toHaveBeenCalled();
});
test("account replacement after dispatch refuses the response without inventing a refusal receipt", async () => {
  const { api, client } = harness(); client.get_usersMe.mockResolvedValueOnce(user).mockResolvedValueOnce({ ...user, id: "another-account" });
  await expect(api.create(scope, command, signal())).rejects.toThrow("dance_preparation_account_changed");
  expect(client.post_communitiesCommunityIdDanceModeratedSessions).toHaveBeenCalledTimes(1);
});
test("a new epoch for the same account fences a pending private reply", async () => {
  const { api, client } = harness(); let finish!: (value: DanceCaptureContext) => void;
  client.get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const pending = api.context(scope, context.session.session_id, signal());
  await vi.waitFor(() => expect(client.get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext).toHaveBeenCalledTimes(1));
  replaceSessionAuthority(); finish(context);
  await expect(pending).rejects.toThrow("dance_preparation_session_changed"); expect(client.get_usersMe).toHaveBeenCalledTimes(1);
});
test("aborted and unestablished sessions do not perform a private read", async () => {
  const { api, client } = harness(); const abort = new AbortController(); abort.abort();
  await expect(api.options(scope, undefined, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
  forgetSessionAuthority(); const noAuthority = createDancePreparationApi(client);
  await expect(noAuthority.options(scope, undefined, signal())).rejects.toThrow("dance_preparation_session_changed");
  expect(client.get_usersMe).not.toHaveBeenCalled(); expect(client.get_communitiesCommunityIdPostsPostIdDanceModeratedOptions).not.toHaveBeenCalled();
});
test("an unknown Create is not retried implicitly; explicit recovery reuses the original command", async () => {
  const { api, client } = harness(); client.post_communitiesCommunityIdDanceModeratedSessions.mockRejectedValueOnce(new Error("acknowledgement_lost"));
  await expect(api.create(scope, command, signal())).rejects.toThrow("acknowledgement_lost");
  expect(client.post_communitiesCommunityIdDanceModeratedSessions).toHaveBeenCalledTimes(1);
  await api.create(scope, command, signal());
  const calls = client.post_communitiesCommunityIdDanceModeratedSessions.mock.calls;
  expect(calls).toHaveLength(2); expect(calls[0]?.[0].body).toEqual(command); expect(calls[1]?.[0].body).toEqual(command);
  client.get_communitiesCommunityIdDanceModeratedSessionsSessionId.mockResolvedValueOnce({ ...context.session, state: "terminal" });
  expect((await api.session(scope, context.session.session_id, signal())).state).toBe("terminal");
});
test("request scope and command are snapshotted before the identity wait", async () => {
  const { api, client } = harness(); let finish!: (value: typeof user) => void;
  client.get_usersMe.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const mutableScope = { ...scope }, mutableBody = { ...command };
  const pending = api.create(mutableScope, mutableBody, signal());
  mutableScope.communityId = "another-community"; mutableScope.postId = "another-post";
  mutableBody.idempotency_key = "replacement-key"; mutableBody.expected_policy_hash = "f".repeat(64);
  finish(user); await pending;
  expect(client.post_communitiesCommunityIdDanceModeratedSessions.mock.calls[0]?.[0]).toEqual({ path: { communityId: scope.communityId }, body: command });
});
test.each(["community_id", "song_post_id", "session_id"] as const)("rejects private context with a foreign %s", async field => {
  const { api, client } = harness(); client.get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext.mockResolvedValueOnce({ ...context, session: { ...context.session, [field]: "foreign" } });
  await expect(api.context(scope, context.session.session_id, signal())).rejects.toThrow("dance_preparation_target_changed");
});
test.each(["terms_hash", "consent_version", "consent_hash", "retention_hash"] as const)("rejects a Consent receipt with substituted %s", async field => {
  const { api, client } = harness(); client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdConsent.mockResolvedValueOnce({ version: "dance-moderated-intake-receipt-v1", receipt_id: "receipt", operation: "consent", session: { ...context.session, [field]: "foreign" } });
  await expect(api.consent(scope, consent, signal())).rejects.toThrow("dance_preparation_target_changed");
});
test("persona preparation preserves pending-wallet private participation and checks the chosen identity", async () => {
  const { api, client } = harness(); client.post_communitiesCommunityIdActivityPersonasPrepare.mockResolvedValueOnce({ object: "activity_persona_preparation", community_id: scope.communityId, persona_id: context.persona_id, persona_status: "pending_wallet", activity_presentation: null });
  expect((await api.preparePersona(scope, { idempotency_key: "persona-key", choice: { kind: "existing", persona_id: context.persona_id } }, signal())).persona_status).toBe("pending_wallet");
  await expect(api.preparePersona(scope, { idempotency_key: "other-key", choice: { kind: "existing", persona_id: "foreign-persona" } }, signal())).rejects.toThrow("dance_preparation_target_changed");
});
test("ready-reference pagination and active-session recovery use the selected revision", async () => {
  const { api, client } = harness(); await api.options(scope, "a".repeat(64), signal());
  const current = await api.latest(scope, { choreographyId: context.session.choreography_id, revision: context.session.choreography_revision }, signal());
  expect(current.active_session_id).toBe(context.session.session_id);
  expect(client.get_communitiesCommunityIdPostsPostIdDanceModeratedOptions.mock.calls[0]?.[0].query).toEqual({ cursor: "a".repeat(64) });
  expect(client.get_communitiesCommunityIdPostsPostIdDanceModeratedChoreographiesChoreographyIdRevisionsRevisionLatestReview.mock.calls[0]?.[0].path).toEqual({ communityId: scope.communityId, postId: scope.postId, choreographyId: context.session.choreography_id, revision: String(context.session.choreography_revision) });
});


test.each(["persona", "create", "consent"] as const)("a missing CSRF token refuses %s before its POST", async operation => {
  const { api, client, setCsrf } = harness(); setCsrf(undefined);
  const result = operation === "persona" ? api.preparePersona(scope, { idempotency_key: "persona-key", choice: { kind: "create_new" } }, signal())
    : operation === "create" ? api.create(scope, command, signal()) : api.consent(scope, consent, signal());
  await expect(result).rejects.toThrow("dance_preparation_csrf_unavailable");
  expect(client.post_communitiesCommunityIdActivityPersonasPrepare).not.toHaveBeenCalled();
  expect(client.post_communitiesCommunityIdDanceModeratedSessions).not.toHaveBeenCalled();
  expect(client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdConsent).not.toHaveBeenCalled();
});
test.each(["read", "write"] as const)("epoch replacement in the identity continuation gap fences a %s", async operation => {
  const { api, client } = harness();
  client.get_usersMe.mockImplementationOnce(async () => {
    queueMicrotask(() => queueMicrotask(replaceSessionAuthority));
    return user;
  });
  const result = operation === "read" ? api.options(scope, undefined, signal()) : api.create(scope, command, signal());
  await expect(result).rejects.toThrow("dance_preparation_session_changed");
  expect(client.get_communitiesCommunityIdPostsPostIdDanceModeratedOptions).not.toHaveBeenCalled();
  expect(client.post_communitiesCommunityIdDanceModeratedSessions).not.toHaveBeenCalled();
});
test("all writes use fresh dispatch-time CSRF, same-origin credentials and the original signal", async () => {
  const { api, client, setCsrf } = harness(), active = signal();
  client.get_usersMe.mockImplementationOnce(async () => { setCsrf("rotated-csrf"); return user; });
  await api.preparePersona(scope, { idempotency_key: "persona-key", choice: { kind: "create_new" } }, active);
  await api.create(scope, command, active); await api.consent(scope, consent, active);
  const writes = [client.post_communitiesCommunityIdActivityPersonasPrepare.mock.calls[0], client.post_communitiesCommunityIdDanceModeratedSessions.mock.calls[0], client.post_communitiesCommunityIdDanceModeratedSessionsSessionIdConsent.mock.calls[0]];
  for (const call of writes) {
    expect(call?.[1]?.credentials).toBe("same-origin"); expect(call?.[1]?.signal).toBe(active);
    const headers = call?.[1]?.headers;
    if (!(headers instanceof Headers)) throw new Error("Expected request-scoped Headers");
    expect(headers.get("x-csrf-token")).toBe("rotated-csrf");
    expect(headers.has("authorization")).toBe(false);
  }
});
test("the real session client serializes the exact Create with cookie and CSRF transport", async () => {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    return Response.json(url.pathname.endsWith("/users/me") ? user : { version: "dance-moderated-intake-receipt-v1", receipt_id: "original-create-receipt", operation: "create", session: context.session });
  });
  const api = createDancePreparationApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }), () => "csrf-real-client-fixture");
  const active = signal(); await api.create(scope, command, active);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  const writes = fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST"); expect(writes).toHaveLength(1);
  expect(String(writes[0]?.[0])).toBe(`https://pirate.sc/api/communities/${scope.communityId}/dance/moderated-sessions`);
  expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual(command);
  expect(writes[0]?.[1]?.credentials).toBe("same-origin"); expect(writes[0]?.[1]?.signal).toBe(active);
  expect(new Headers(writes[0]?.[1]?.headers).get("x-csrf-token")).toBe("csrf-real-client-fixture");
});
