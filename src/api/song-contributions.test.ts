import { expect, test, vi } from "vitest";
import type { GetPersonasResponse, GetUsersMeResponse } from "@pirate/api-client";
import { createSessionApiClient } from "./client.ts";
import { createSongContributionApi, songContributionRequest, type SongContributionScope } from "./song-contributions.ts";
import { contributionFixtures as f } from "./song-contributions.fixture.ts";
import { createSongContributionCatalog } from "./song-contribution-catalog.ts";

const unverified = { state: "unverified" } as const;
const me = { id: f.scope.accountId, object: "user", verification_state: "unverified", created: 1, verification_capabilities: { unique_human: unverified, age_over_18: unverified, minimum_age: unverified, nationality: unverified, gender: unverified, wallet_score: unverified } } as const satisfies GetUsersMeResponse;
const base = `/api/communities/${f.scope.communityId}/posts/${f.scope.postId}`;
const contribution = `${base}/megapot-contributions/${f.receipt.contribution_id}`;
const signal = () => new AbortController().signal;
const catalogPersona = {
  object: "persona", persona_id: f.scope.personaId, status: "active",
  profile: { object: "persona_profile", persona_id: f.scope.personaId, revision: 1, display_name: "Fixture profile", avatar_ref: null, cover_ref: null, bio: null, preferred_locale: "en", primary_public_handle: null },
  wallet_set: { evm: { chain_account_kind: "evm", address: f.receipt.instruction.from, hd_wallet_index: 0, assigned_at: f.receipt.created_at } },
  community_binding: { community_id: f.scope.communityId, binding_source: "persona_creation" }, created_at: f.receipt.created_at, retired_at: null,
} as const satisfies GetPersonasResponse["personas"][number];

test("the genuine catalog reads one account around personas and keeps only active wallet profiles", async () => {
  const requested: string[] = [], active = signal();
  const personas: GetPersonasResponse = { personas: [catalogPersona, { ...catalogPersona, status: "retired" }, { ...catalogPersona, wallet_set: { evm: null } }] };
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname; requested.push(path); expect(init?.signal).toBe(active);
    return Response.json(path === "/api/users/me" ? me : personas);
  });
  const catalog = await createSongContributionCatalog(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }))(active);
  expect(catalog).toEqual({ accountId: me.id, personas: [catalogPersona] });
  expect(requested).toEqual(["/api/users/me", "/api/personas", "/api/users/me"]);
});
test("a catalog read across replacement cookies cannot publish another account's profiles", async () => {
  let accountReads = 0;
  const fetchImpl = vi.fn(async (url: RequestInfo | URL) => Response.json(new URL(String(url)).pathname === "/api/users/me"
    ? { ...me, id: ++accountReads === 1 ? me.id : "replacement-account" } : { personas: [catalogPersona] }));
  await expect(createSongContributionCatalog(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }))(signal())).rejects.toThrow("account_changed");
});
test("an aborted catalog cannot publish a private profile list", async () => {
  const active = new AbortController();
  const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
    if (new URL(String(url)).pathname === "/api/personas") { active.abort(); return Response.json({ personas: [catalogPersona] }); }
    return Response.json(me);
  });
  await expect(createSongContributionCatalog(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }))(active.signal)).rejects.toThrow();
});
type Respond = (url: URL, init?: RequestInit) => Response | Promise<Response>;
function harness(respond?: Respond) {
  let current: SongContributionScope | null = f.scope, csrf: string | undefined = "csrf-fixture";
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (respond) return respond(url, init);
    if (url.pathname === "/api/users/me") return Response.json(me);
    if (url.pathname === `${base}/megapot-funding-context`) return Response.json(f.context);
    if (url.pathname === `${base}/megapot-contributions`) return Response.json(f.receipt);
    if (url.pathname === contribution) return Response.json(f.current);
    if (url.pathname.startsWith(`${base}/megapot-contribution-commands/`)) return Response.json(f.receipt);
    if (url.pathname === `${contribution}/submission-claims`) return Response.json(f.claim);
    if (url.pathname === `${contribution}/observations`) return Response.json(f.observation);
    if (url.pathname === `${contribution}/recoveries`) return Response.json(f.recovery);
    if (url.pathname === `${contribution}/cancellation-preparations`) return Response.json(f.cancellation);
    throw new Error(`Unexpected fixture request ${url.pathname}`);
  });
  return {
    api: createSongContributionApi({ scope: f.scope, currentScope: () => current, csrf: () => csrf, client: createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }) }),
    fetchImpl, noCsrf: () => { csrf = undefined; }, scope: (value: SongContributionScope | null) => { current = value; },
  };
}
const errorResponse = (status: number, code: string, details?: object) => Response.json({ error: { code, message: "Unavailable", retryable: false, details } }, { status });
const missing = () => errorResponse(404, "not_found", { object: "contribution_error", version: 2, code: "not_found", request_id: "fixture-missing", retry_after_seconds: null, current_state_href: null, refusal_receipt: null });

test("the real flat request matches the pure application golden packet without an activity choice", () => {
  const request = songContributionRequest(f.context, f.createRequest.funding_amount_atomic, f.createRequest.idempotency_key);
  expect(request).toEqual(f.createRequest);
  expect(request.context_leg_snapshot_id).toBe("");
  expect(request).not.toHaveProperty("context_ref"); expect(request).not.toHaveProperty("expected_terms");
  expect(request).not.toHaveProperty("activity"); expect(request).not.toHaveProperty("eligible_activities");
});

test("all eight genuine operations use their exact paths, host cookies, cancellation and explicit CSRF", async () => {
  const h = harness(), active = signal();
  expect(await h.api.context(active)).toEqual(f.context);
  expect(await h.api.create(f.createRequest, active)).toEqual(f.receipt);
  expect(await h.api.state(f.receipt.contribution_id, active)).toEqual(f.current);
  expect(await h.api.command("CreateSongMegapotContributionV2", f.createRequest.idempotency_key, active)).toEqual(f.receipt);
  expect(await h.api.claim(f.receipt.contribution_id, f.claimRequest, active)).toEqual(f.claim);
  expect(await h.api.observe(f.receipt.contribution_id, f.observationRequest, active)).toEqual(f.observation);
  expect(await h.api.recover(f.receipt.contribution_id, f.recoveryRequest, active)).toEqual(f.recovery);
  expect(await h.api.cancellation(f.receipt.contribution_id, f.cancellationRequest, active)).toEqual(f.cancellation);
  expect(h.fetchImpl).toHaveBeenCalledTimes(24);
  const operations = h.fetchImpl.mock.calls.filter(([input]) => !String(input).endsWith("/users/me"));
  expect(operations.map(([input]) => new URL(String(input)).pathname)).toEqual([
    `${base}/megapot-funding-context`, `${base}/megapot-contributions`, contribution,
    `${base}/megapot-contribution-commands/CreateSongMegapotContributionV2/${f.createRequest.idempotency_key}`,
    `${contribution}/submission-claims`, `${contribution}/observations`, `${contribution}/recoveries`, `${contribution}/cancellation-preparations`,
  ]);
  expect(new URL(String(operations[0]![0])).searchParams.get("persona_id")).toBe(f.scope.personaId);
  const writes = operations.filter(([, init]) => init?.method === "POST");
  expect(writes.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([f.createRequest, f.claimRequest, f.observationRequest, f.recoveryRequest, f.cancellationRequest]);
  expect(writes.every(([, init]) => new Headers(init?.headers).get("x-csrf-token") === "csrf-fixture")).toBe(true);
  expect(h.fetchImpl.mock.calls.every(([, init]) => init?.credentials === "same-origin" && init.signal === active && !new Headers(init.headers).has("authorization"))).toBe(true);
});

test("a replayed claim remains recovery-only and command lookup cannot manufacture fresh delivery", async () => {
  const h = harness(url => Response.json(url.pathname === "/api/users/me" ? me : url.pathname.endsWith("/submission-claims") ? f.claimReplay : f.claim.receipt));
  expect(await h.api.claim(f.receipt.contribution_id, f.claimRequest, signal())).toEqual(f.claimReplay);
  const command = await h.api.command("ClaimSongMegapotContributionSubmissionV2", f.claimRequest.idempotency_key, signal(), f.receipt.contribution_id);
  expect(command).toEqual(f.claim.receipt); expect(command).not.toHaveProperty("delivery");
});

test("an uncertain create is sent once; only an explicit original-command read follows", async () => {
  let writes = 0;
  const h = harness((url, init) => {
    if (url.pathname === "/api/users/me") return Response.json(me);
    if (init?.method === "POST") { writes++; throw new Error("lost acknowledgement"); }
    return Response.json(f.receipt);
  });
  await expect(h.api.create(f.createRequest, signal())).rejects.toThrow("lost acknowledgement");
  expect(writes).toBe(1);
  expect(await h.api.command("CreateSongMegapotContributionV2", f.createRequest.idempotency_key, signal())).toEqual(f.receipt);
  expect(writes).toBe(1);
});

test("only a declared bounded command miss becomes null", async () => {
  const h = harness(url => url.pathname === "/api/users/me" ? Response.json(me) : missing());
  expect(await h.api.command("CreateSongMegapotContributionV2", f.createRequest.idempotency_key, signal())).toBeNull();
  expect(h.fetchImpl).toHaveBeenCalledTimes(3);
});

test.each([
  ["bare404", () => errorResponse(404, "not_found")],
  ["server failure", () => errorResponse(500, "internal_error")],
  ["bad JSON", () => new Response("not JSON", { status: 404 })],
] as const)("%s cannot release an unknown command", async (_label, response) => {
  const h = harness(url => url.pathname === "/api/users/me" ? Response.json(me) : response());
  await expect(h.api.command("CreateSongMegapotContributionV2", f.createRequest.idempotency_key, signal())).rejects.toThrow();
});

test("a missing command under a changed cookie is not proof about the original account", async () => {
  let reads = 0;
  const h = harness(url => url.pathname === "/api/users/me" ? Response.json(++reads === 1 ? me : { ...me, id: "other-account" }) : missing());
  await expect(h.api.command("CreateSongMegapotContributionV2", f.createRequest.idempotency_key, signal())).rejects.toThrow("contribution_account_changed");
});

test("missing CSRF, changed scope and aborted work perform no network write", async () => {
  const noCsrf = harness(); noCsrf.noCsrf(); await expect(noCsrf.api.create(f.createRequest, signal())).rejects.toThrow("csrf"); expect(noCsrf.fetchImpl).not.toHaveBeenCalled();
  const moved = harness(); moved.scope({ ...f.scope, personaId: "other-persona" }); await expect(moved.api.create(f.createRequest, signal())).rejects.toThrow("scope_changed"); expect(moved.fetchImpl).not.toHaveBeenCalled();
  const aborted = harness(), stop = new AbortController(); stop.abort(); await expect(aborted.api.context(stop.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(aborted.fetchImpl).not.toHaveBeenCalled();
});

test("a changed account before or after a write never returns a usable receipt", async () => {
  for (const changedBefore of [true, false]) {
    let reads = 0;
    const h = harness(url => url.pathname === "/api/users/me" ? Response.json({ ...me, id: changedBefore || ++reads > 1 ? "other-account" : me.id }) : Response.json(f.receipt));
    await expect(h.api.create(f.createRequest, signal())).rejects.toThrow("contribution_account_changed");
    expect(h.fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(changedBefore ? 0 : 1);
  }
});

test("caller mutation during identity resolution cannot change the persisted wire request", async () => {
  let resolve!: (value: Response) => void;
  const first = new Promise<Response>(done => { resolve = done; }); let reads = 0;
  const h = harness(url => url.pathname === "/api/users/me" ? ++reads === 1 ? first : Response.json(me) : Response.json(f.receipt));
  const request = { ...f.createRequest, funding_amount_atomic: String(f.createRequest.funding_amount_atomic) }, result = h.api.create(request, signal());
  request.funding_amount_atomic = "999999";
  resolve(Response.json(me)); await result;
  expect(JSON.parse(String(h.fetchImpl.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body))).toEqual(f.createRequest);
});

test.each([
  ["context actor", "context", { ...f.context, actor: { ...f.context.actor, account_id: "other" } }],
  ["receipt amount", "create", { ...f.receipt, instruction: { ...f.receipt.instruction, amount_atomic: "1" } }],
  ["receipt context", "create", { ...f.receipt, accepted_context_hash: "f".repeat(64) }],
  ["state target", "state", { ...f.current, contribution_id: "other" }],
  ["embedded contribution", "state", { ...f.current, command_receipt: { ...f.receipt, contribution_id: "foreign-contribution" } }],
  ["embedded funding effect", "state", { ...f.current, command_receipt: { ...f.receipt, funding_effect_id: "foreign-effect" } }],
  ["embedded community", "state", { ...f.current, command_receipt: { ...f.receipt, target: { ...f.receipt.target, community_id: "foreign-community" } } }],
  ["embedded post", "state", { ...f.current, command_receipt: { ...f.receipt, target: { ...f.receipt.target, post_id: "foreign-post" } } }],
  ["embedded canonical song", "state", { ...f.current, command_receipt: { ...f.receipt, target: { ...f.receipt.target, canonical_song_id: "foreign-canonical" } } }],
  ["embedded audio revision", "state", { ...f.current, command_receipt: { ...f.receipt, target: { ...f.receipt.target, audio_revision: f.receipt.target.audio_revision + 1 } } }],
  ["embedded offer", "state", { ...f.current, command_receipt: { ...f.receipt, target: { ...f.receipt.target, offer_id: "foreign-offer" } } }],
  ["embedded pool leg", "state", { ...f.current, command_receipt: { ...f.receipt, target: { ...f.receipt.target, pool_leg_id: "foreign-leg" } } }],
  ["claim holder", "claim", { ...f.claim, receipt: { ...f.claim.receipt, holder_client_instance_id: "other_client_instance_one" } }],
  ["observation locator", "observe", { ...f.observation, accepted_candidate_hash: `0x${"ff".repeat(32)}` }],
  ["cancellation recipient", "cancellation", { ...f.cancellation, recipient: `0x${"ff".repeat(20)}` }],
] as const)("a contradictory %s is refused after genuine closed decoding", async (_name, operation, response) => {
  const h = harness(url => Response.json(url.pathname === "/api/users/me" ? me : response));
  const active = signal();
  const result = operation === "context" ? h.api.context(active) : operation === "create" ? h.api.create(f.createRequest, active) : operation === "state" ? h.api.state(f.receipt.contribution_id, active) : operation === "claim" ? h.api.claim(f.receipt.contribution_id, f.claimRequest, active) : operation === "observe" ? h.api.observe(f.receipt.contribution_id, f.observationRequest, active) : h.api.cancellation(f.receipt.contribution_id, f.cancellationRequest, active);
  await expect(result).rejects.toThrow("mismatch");
});

test("a command for another operation is not accepted as the original create", async () => {
  const h = harness(url => Response.json(url.pathname === "/api/users/me" ? me : f.recovery));
  await expect(h.api.command("CreateSongMegapotContributionV2", f.createRequest.idempotency_key, signal())).rejects.toThrow("command_mismatch");
});
