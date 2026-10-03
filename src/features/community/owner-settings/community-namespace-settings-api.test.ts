import { describe, expect, test, vi } from "vitest";
import type { PostCommunitiesCommunityIdCanonicalRouteOwnershipRecoveryPollResponse } from "@pirate/api-client";

import { createApiClient } from "../../../api/client";
import { createCommunityNamespaceSettingsApi, type HnsSessionLocator } from "./community-namespace-settings-api";

const common = {
  attachment_intent_id: "attachment-1",
  community_id: "community-1",
  expires_at: "2099-09-11T00:00:00.000Z",
  replayed: false,
  root_import_session_id: "session-1",
  root_label: "dankmemes",
};

const plan = {
  acknowledgement_required: true,
  added_records: [
    { type: "TXT", txt: ["pirate-verification=session-1"] },
  ],
  current_records: [
    { type: "NS", ns: "ns1.pirate" },
    { type: "TXT", txt: ["previous-owner-note"] },
  ],
  preserved_records: [
    { type: "NS", ns: "ns1.pirate" },
  ],
  preserved_unknown_record_types: ["SYNTH4"],
  removed_conflicts: [
    { type: "TXT", txt: ["previous-owner-note"] },
  ],
  replacement_records: [
    { type: "SYNTH4", address: "203.0.113.8" },
    { type: "TXT", txt: ["unrelated", " value"] },
    { type: "NS", ns: "ns1.pirate" },
    { type: "DS", keyTag: 1234, algorithm: 13, digestType: 2, digest: "abcd" },
  ],
  replacement_semantics: "complete_resource",
  version: "pirate-hns-root-import-publish-plan-v1",
} as const;

function locator(): HnsSessionLocator & { value: string | null } {
  return {
    value: null,
    clear() { this.value = null; },
    read() { return this.value; },
    write(value) { this.value = value; },
  };
}

describe("createCommunityNamespaceSettingsApi", () => {
  test.each([
    "challenge_mismatch",
    "dns_delegation_not_confirmed",
    "root_resource_unavailable",
    "zone_not_provisioned",
    "challenge_not_published",
    "provider_unavailable",
  ] as const)("projects the terminal failure reason %s", async (failureReason) => {
    // SAFETY: This fake implements the single generated discovery method used by read().
    const api = createCommunityNamespaceSettingsApi({
      client: {
        get_communitiesCommunityIdHnsRootImports: async () => ({
          community_id: common.community_id,
          attachment: null,
          session: {
            ...common,
            revision: 4,
            status: "failed",
            failure_reason: failureReason,
            publish_plan: null,
            publish_plan_sha256: null,
            readiness_result_sha256: null,
            retry_after_seconds: null,
          },
        }),
      } as never,
      communityId: common.community_id,
      communityPath: "/c/community-1",
      locator: locator(),
    });

    expect((await api.read()).next_action).toEqual({
      kind: "failed",
      reason_code: failureReason,
      retryable: true,
    });
  });

  test("keeps an older failed response usable when it has no reason", async () => {
    // SAFETY: This fake implements the single generated discovery method used by read().
    const api = createCommunityNamespaceSettingsApi({
      client: {
        get_communitiesCommunityIdHnsRootImports: async () => ({
          community_id: common.community_id,
          attachment: null,
          session: {
            ...common,
            revision: 4,
            status: "failed",
            publish_plan: null,
            publish_plan_sha256: null,
            readiness_result_sha256: null,
            retry_after_seconds: null,
          },
        }),
      } as never,
      communityId: common.community_id,
      communityPath: "/c/community-1",
      locator: locator(),
    });

    expect((await api.read()).next_action).toMatchObject({
      kind: "failed",
      reason_code: "root_import_failed",
    });
  });

  test("drives the real one-signature ceremony and preserves every wallet record", async () => {
    const sessionLocator = locator();
    const pollResponses = [
      { ...common, revision: 2, status: "provisioning", publish_plan: null, publish_plan_sha256: null, readiness_result_sha256: null, retry_after_seconds: 2 },
      { ...common, revision: 3, status: "awaiting_owner_update", publish_plan: plan, publish_plan_sha256: "plan-hash", readiness_result_sha256: null, retry_after_seconds: 2 },
      { ...common, revision: 4, status: "observing", publish_plan: plan, publish_plan_sha256: "plan-hash", readiness_result_sha256: null, retry_after_seconds: 2 },
      { ...common, revision: 5, status: "ready", publish_plan: plan, publish_plan_sha256: "plan-hash", readiness_result_sha256: "ready-hash", retry_after_seconds: null },
    ];
    let retained: typeof pollResponses[number] | undefined;
    const poll = vi.fn(async (_input: unknown, _options: unknown) => {
      retained = retained === undefined ? pollResponses[0] : pollResponses[2];
      return retained;
    });
    const get = vi.fn(async () => {
      if (retained?.status === "provisioning") retained = pollResponses[1];
      else if (retained?.status === "observing") retained = pollResponses[3];
      return retained;
    });
    const start = vi.fn(async (_input: unknown, _options: unknown) => ({
      ...common,
      revision: 1,
      status: "awaiting_ownership",
      provisioning_authorization: {
        expires_at: common.expires_at,
        kind: "hns_name_signature_v1",
        message: "Pirate HNS ownership proof\n[bound payload]",
        wallet_rpc_method: "signmessagewithname",
      },
      publish_plan: null,
      publish_plan_sha256: null,
      readiness_result_sha256: null,
      retry_after_seconds: 2,
    }));
    const activate = vi.fn(async (_input: unknown, _options: unknown) => ({
      ...common,
      revision: 6,
      status: "activated",
      app_host: "app.dankmemes",
      dns_zone_activation_id: "dns-1",
      dns_zone_activation_generation: 1,
      app_host_activation_id: "host-1",
      app_host_activation_generation: 1,
      sale_namespace_activation_id: "sale-1",
      sale_namespace_activation_generation: 1,
      sale_namespace_activation_sha256: "sale-hash",
      handle_issuance_enabled: true,
      replayed: false,
    }));
    // SAFETY: The fake implements exactly the generated methods exercised by this adapter test.
    const api = createCommunityNamespaceSettingsApi({
      client: {
        get_communitiesCommunityIdHnsRootImports: async () => ({ community_id: common.community_id, attachment: null, session: null }),
        post_communitiesCommunityIdHnsRootImports: start,
        get_communitiesCommunityIdHnsRootImportsSessionId: get,
        post_communitiesCommunityIdHnsRootImportsSessionIdPoll: poll,
        post_communitiesCommunityIdHnsRootImportsSessionIdActivate: activate,
      } as never,
      communityId: common.community_id,
      communityPath: "/c/community-1",
      locator: sessionLocator,
      readCsrfToken: () => "csrf-1",
    });

    let snapshot = await api.read();
    snapshot = await api.execute({ kind: "select_namespace", family: "hns", root_label: "DankMemes", expected_generation: snapshot.generation, idempotency_key: "select-1" });
    snapshot = await api.execute({ kind: "start_verification", expected_generation: snapshot.generation, idempotency_key: "start-1" });
    expect(snapshot.next_action).toMatchObject({ kind: "sign_ownership", message: "Pirate HNS ownership proof\n[bound payload]" });
    expect(sessionLocator.value).toBe("session-1");
    sessionLocator.value = null; // Navigation can remove the deep link while the adapter remains mounted.

    snapshot = await api.execute({ kind: "submit_name_signature", signature: "wallet-signature", expected_generation: snapshot.generation, idempotency_key: "signature-1" });
    snapshot = await api.execute({ kind: "poll", expected_generation: snapshot.generation, idempotency_key: "poll-1" });
    expect(snapshot.next_action).toEqual({
      added_records: [
        { record_type: "TXT", supported: true, value: "pirate-verification=session-1", wallet_record: { type: "TXT", txt: ["pirate-verification=session-1"] } },
      ],
      acknowledgement_required: true,
      kind: "publish_resource",
      preserved_records: [
        { record_type: "NS", supported: true, value: "ns1.pirate", wallet_record: { type: "NS", ns: "ns1.pirate" } },
      ],
      preserved_unknown_record_types: ["SYNTH4"],
      records: [
        { record_type: "SYNTH4", supported: true, value: '{"type":"SYNTH4","address":"203.0.113.8"}', wallet_record: plan.replacement_records[0] },
        { record_type: "TXT", supported: true, value: "unrelated value", wallet_record: plan.replacement_records[1] },
        { record_type: "NS", supported: true, value: "ns1.pirate", wallet_record: plan.replacement_records[2] },
        { record_type: "DS", supported: true, value: "1234 13 2 abcd", wallet_record: plan.replacement_records[3] },
      ],
      removed_records: [
        { record_type: "TXT", supported: true, value: "previous-owner-note", wallet_record: { type: "TXT", txt: ["previous-owner-note"] } },
      ],
      replacement_semantics: "complete_resource",
    });
    snapshot = await api.execute({ kind: "acknowledge_complete_resource", expected_generation: snapshot.generation, idempotency_key: "ack-1" });
    snapshot = await api.execute({ kind: "poll", expected_generation: snapshot.generation, idempotency_key: "poll-2" });
    expect(snapshot.next_action).toMatchObject({ kind: "ready_to_activate", publish_plan_sha256: "plan-hash", readiness_result_sha256: "ready-hash" });
    snapshot = await api.execute({ kind: "activate", expected_generation: snapshot.generation, idempotency_key: "activate-1", publish_plan_sha256: "plan-hash", readiness_result_sha256: "ready-hash", acknowledged_complete_resource_replacement: true });
    expect(snapshot.next_action).toEqual({
      canonical_route: "https://app.dankmemes/",
      canonical_route_label: "app.dankmemes",
      fallback_route: "/c/community-1",
      fallback_route_label: "pirate.sc/c/community-1",
      kind: "verified",
    });
    expect(start.mock.calls[0]?.[0]).toMatchObject({ body: { root_label: "dankmemes", idempotency_key: "start-1" } });
    expect(poll.mock.calls[0]?.[0]).toMatchObject({ body: { provisioning_name_signature: "wallet-signature" } });
    expect(activate).toHaveBeenCalledOnce();
  });

  test("resumes an opaque session locator and rejects a response for another community", async () => {
    const sessionLocator = locator();
    sessionLocator.value = "session-1";
    const read = vi.fn(async () => ({
      ...common,
      community_id: "community-other",
      revision: 2,
      status: "provisioning",
      publish_plan: null,
      publish_plan_sha256: null,
      readiness_result_sha256: null,
      retry_after_seconds: 2,
    }));
    // SAFETY: The fake implements exactly the generated read method exercised by this adapter test.
    const api = createCommunityNamespaceSettingsApi({
      client: { get_communitiesCommunityIdHnsRootImportsSessionId: read } as never,
      communityId: common.community_id,
      communityPath: "/c/community-1",
      locator: sessionLocator,
    });

    await expect(api.read()).rejects.toThrow("did not match this community");
    expect(read).toHaveBeenCalledWith(
      { path: { communityId: "community-1", sessionId: "session-1" } },
      { credentials: "same-origin" },
    );
  });

  test("discards an expired deep-link session and returns to namespace selection", async () => {
    const sessionLocator = locator();
    sessionLocator.value = "session-1";
    // SAFETY: This fake exposes exactly the generated session read used by the adapter.
    const api = createCommunityNamespaceSettingsApi({
      client: {
        get_communitiesCommunityIdHnsRootImportsSessionId: async () => ({
          ...common,
          revision: 4,
          status: "expired",
          publish_plan: plan,
          publish_plan_sha256: "plan-hash",
          readiness_result_sha256: null,
          retry_after_seconds: null,
        }),
      } as never,
      communityId: common.community_id,
      communityPath: "/c/community-1",
      locator: sessionLocator,
    });

    const snapshot = await api.read();
    expect(snapshot).toMatchObject({
      attachment: null,
      community_id: "community-1",
      generation: 1,
      next_action: { kind: "choose_namespace" },
      root_label: "",
    });
    expect(sessionLocator.value).toBeNull();
  });

  test("keeps unknown records visible but blocks the Bob wallet representation", async () => {
    const sessionLocator = locator();
    sessionLocator.value = "session-1";
    // SAFETY: The fake implements exactly the generated read method exercised by this adapter test.
    const api = createCommunityNamespaceSettingsApi({
      client: {
        get_communitiesCommunityIdHnsRootImportsSessionId: async () => ({
          ...common,
          revision: 3,
          status: "awaiting_owner_update",
          publish_plan: { ...plan, replacement_records: [{ type: "CAA", tag: "issue", value: "ca.example" }] },
          publish_plan_sha256: "plan-hash",
          readiness_result_sha256: null,
          retry_after_seconds: 2,
        }),
      } as never,
      communityId: common.community_id,
      communityPath: "/c/community-1",
      locator: sessionLocator,
    });

    const snapshot = await api.read();
    expect(snapshot.next_action).toEqual({
      added_records: [
        { record_type: "TXT", supported: true, value: "pirate-verification=session-1", wallet_record: { type: "TXT", txt: ["pirate-verification=session-1"] } },
      ],
      acknowledgement_required: true,
      kind: "publish_resource",
      preserved_records: [
        { record_type: "NS", supported: true, value: "ns1.pirate", wallet_record: { type: "NS", ns: "ns1.pirate" } },
      ],
      preserved_unknown_record_types: ["SYNTH4"],
      records: [{ record_type: "CAA", supported: false, value: '{"type":"CAA","tag":"issue","value":"ca.example"}' }],
      removed_records: [
        { record_type: "TXT", supported: true, value: "previous-owner-note", wallet_record: { type: "TXT", txt: ["previous-owner-note"] } },
      ],
      replacement_semantics: "complete_resource",
    });
  });
});


describe("community import discovery", () => {
  const pending = { ...common, revision: 3, status: "awaiting_owner_update", publish_plan: plan,
    publish_plan_sha256: "plan-hash", readiness_result_sha256: null, retry_after_seconds: 7,
    publication_check_pending: true };

  test("rediscovers without a locator and uses the discovered session for polling", async () => {
    const discovery = vi.fn(async () => ({ community_id: common.community_id, attachment: null, session: pending }));
    const poll = vi.fn(async () => pending);
    const sessionLocator = locator();
    const api = createCommunityNamespaceSettingsApi({
      // SAFETY: The fake returns the discovery and pending response shapes exercised here.
      client: { get_communitiesCommunityIdHnsRootImports: discovery,
        get_communitiesCommunityIdHnsRootImportsSessionId: poll } as never,
      communityId: common.community_id, communityPath: "/c/community-1", locator: sessionLocator,
      readCsrfToken: () => "csrf-1",
    });
    const snapshot = await api.read();
    expect(snapshot.next_action).toMatchObject({kind:"publish_resource",check_pending:true,retry_after_seconds:7});
    expect(sessionLocator.value).toBe("session-1");
    expect(discovery).toHaveBeenCalledWith({ path: { communityId: common.community_id } }, { credentials: "same-origin" });
    await api.execute({ kind: "poll", expected_generation: snapshot.generation, idempotency_key: "poll-recovered" });
    expect(poll).toHaveBeenCalledWith(expect.objectContaining({ path: { communityId: common.community_id, sessionId: "session-1" } }), expect.anything());
  });

  test("discards a discovered expired session while preserving the current attachment", async () => {
    const sessionLocator = locator();
    const attachment = { canonical_route: { root_label_display: "current-name" }, status: "active" };
    // SAFETY: This fake exposes exactly the generated discovery read used by the adapter.
    const api = createCommunityNamespaceSettingsApi({
      client: {
        get_communitiesCommunityIdHnsRootImports: async () => ({
          community_id: common.community_id,
          attachment,
          session: {
            ...pending,
            status: "expired",
            expires_at: "2026-09-08T06:00:00Z",
          },
        }),
      } as never,
      communityId: common.community_id,
      communityPath: "/c/community-1",
      locator: sessionLocator,
    });

    const snapshot = await api.read();
    expect(snapshot.next_action).toEqual({ kind: "choose_namespace" });
    expect(snapshot.attachment).toEqual({ root_label: "current-name", status: "active" });
    expect(sessionLocator.value).toBeNull();
  });

  test.each([null, { canonical_route: { root_label_display: "midnight" }, status: "active" }])(
    "reports account-scoped absence independently of attachment %j", async (attachment) => {
      const api = createCommunityNamespaceSettingsApi({
        // SAFETY: Only the generated discovery fields consumed by this adapter are returned.
        client: { get_communitiesCommunityIdHnsRootImports: async () => ({ community_id: common.community_id, attachment, session: null }) } as never,
        communityId: common.community_id, communityPath: "/c/community-1", locator: locator(),
      });
      const snapshot = await api.read();
      expect(snapshot.next_action).toEqual({ kind: "choose_namespace", no_account_import: true });
      expect(snapshot.attachment).toEqual(attachment === null ? null : { root_label: "midnight", status: "active" });
    },
  );

  test.each([
    { community_id: "another-community", session: null },
    { community_id: common.community_id, session: { ...pending, community_id: "another-community" } },
  ])("rejects mismatched discovery without retaining its locator", async (response) => {
    const sessionLocator = locator();
    const api = createCommunityNamespaceSettingsApi({
      // SAFETY: Deliberately mismatched generated responses exercise the tenant check.
      client: { get_communitiesCommunityIdHnsRootImports: async () => ({ ...response, attachment: null }) } as never,
      communityId: common.community_id, communityPath: "/c/community-1", locator: sessionLocator,
    });
    await expect(api.read()).rejects.toThrow("did not match this community");
    expect(sessionLocator.value).toBeNull();
  });
});


test("a loaded deep link remains current when the locator disappears", async () => {
  const sessionLocator = locator();
  sessionLocator.value = "session-1";
  const response = { ...common, revision: 2, status: "provisioning", publish_plan: null,
    publish_plan_sha256: null, readiness_result_sha256: null, retry_after_seconds: 2 };
  const poll = vi.fn(async () => response);
  const api = createCommunityNamespaceSettingsApi({
    // SAFETY: These fakes provide the session and poll response fields used here.
    client: { get_communitiesCommunityIdHnsRootImportsSessionId: poll,
      post_communitiesCommunityIdHnsRootImportsSessionIdPoll: poll } as never,
    communityId: common.community_id, communityPath: "/c/community-1", locator: sessionLocator,
    readCsrfToken: () => "csrf-1",
  });
  const snapshot = await api.read();
  sessionLocator.clear();
  await api.execute({ kind: "poll", expected_generation: snapshot.generation, idempotency_key: "poll-loaded" });
  expect(poll).toHaveBeenCalledWith(expect.objectContaining({ path: { communityId: common.community_id, sessionId: "session-1" } }), expect.anything());
});

test("the vendored client decodes a lifecycle-bearing HNS session response", async () => {
  const response = {
    community_id: common.community_id,
    attachment: null,
    session: {
      ...common,
      revision: 4,
      status: "failed",
      lifecycle: {
        phase: "checking_authority",
        pending_reason: "waiting for authority",
        deadline: { kind: "finality", at: "2099-09-11T00:00:00.000Z" },
        server_time: "2026-09-11T00:00:00.000Z",
        next_check_at: null,
        retry_hint_seconds: 5,
        permitted_actions: ["poll", "recover"],
        observation: null,
      },
      publish_plan: null,
      publish_plan_sha256: null,
      readiness_result_sha256: null,
      retry_after_seconds: null,
    },
  };
  // The generated client decodes strictly; an undeclared field is a validation
  // error, so this fails on a client older than 0.72.0. The app's own client
  // factory builds the real generated client.
  const client = createApiClient({
    origin: "https://api.example",
    fetchImpl: async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
  const decoded = await client.get_communitiesCommunityIdHnsRootImports({
    path: { communityId: common.community_id },
  });
  expect(decoded.session?.lifecycle?.phase).toBe("checking_authority");
  expect(decoded.session?.lifecycle?.permitted_actions).toContain("poll");
});

const recoveryChallenge = {
  ownership_source: "hns_parent_chain_txt",
  challenge_name: "harbor",
  challenge_value: "pirate-verification=recovery-fixture",
  expires_at: "2099-10-03T12:00:00.000Z",
} as const;
const recoveryStart = {
  route_recovery_id: "recovery-1", session_id: "recovery-session-1", generation: 8,
  channel: "poll_result", status: "pending", expires_at: recoveryChallenge.expires_at,
  challenge: recoveryChallenge, replayed: false,
} as const;
const recoveryRoute = {
  family: "hns", root_label: "harbor", root_label_display: "harbor", path_segment: "harbor", href: "/c/harbor", app_host: null,
} as const;
function retainedRoot(status = "suspended", generation: number | undefined = 8) {
  return {
    community_id: common.community_id,
    attachment: {
      canonical_route: { root_label_display: "harbor" }, status,
      ...(generation === undefined ? {} : { binding_generation: generation }),
    },
    session: { ...common, root_label: "harbor", revision: 43, status: "activated", publish_plan: null, publish_plan_sha256: null, readiness_result_sha256: null, retry_after_seconds: null },
  };
}
function recoveryApi(client: unknown, recoveryLocator = locator(), importLocator = locator()) {
  return createCommunityNamespaceSettingsApi({
    // SAFETY: Each fake supplies the generated methods used in its scenario.
    client: client as never, communityId: common.community_id, communityPath: "/c/harbor",
    readCsrfToken: () => "csrf-fixture", locator: importLocator, recoveryLocator,
  });
}

test("restores a retained root through owner recovery using binding generation, never import revision", async () => {
  const discovery = vi.fn().mockResolvedValueOnce(retainedRoot()).mockResolvedValueOnce(retainedRoot("active", 9));
  const start = vi.fn(async (_request: { body: { idempotency_key: string; expected_generation: number } }) => recoveryStart);
  const poll = vi.fn<(_request: unknown) => Promise<PostCommunitiesCommunityIdCanonicalRouteOwnershipRecoveryPollResponse>>()
    .mockResolvedValueOnce({ route_recovery_id: "recovery-1", session_id: "recovery-session-1", generation: 8, replayed: false, status: "pending", retry_after_seconds: 30, result_hash: null })
    .mockResolvedValueOnce({ route_recovery_id: "recovery-1", session_id: "recovery-session-1", generation: 9, replayed: false, status: "verified", retry_after_seconds: null, result_hash: "a".repeat(64), canonical_route: recoveryRoute });
  const imports = vi.fn();
  const recoveryKey = locator();
  const api = recoveryApi({ get_communitiesCommunityIdHnsRootImports: discovery,
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryStart: start,
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryPoll: poll,
    post_communitiesCommunityIdHnsRootImports: imports }, recoveryKey);
  let state = await api.read();
  expect(state.generation).toBe(8);
  expect(state.next_action.kind).toBe("owner_recovery");
  state = await api.execute({ kind: "start_owner_recovery", expected_generation: 8, idempotency_key: "recover-key" });
  expect(state.next_action).toMatchObject({ kind: "owner_recovery", status: "pending", challenge: recoveryChallenge });
  expect(start.mock.calls[0]).toEqual([{ path: { communityId: common.community_id }, body: { expected_generation: 8, idempotency_key: "recover-key" } }, expect.objectContaining({ credentials: "same-origin" })]);
  state = await api.execute({ kind: "poll", expected_generation: 8, idempotency_key: "check-1" });
  expect(state.next_action).toMatchObject({ status: "pending", challenge: recoveryChallenge });
  state = await api.execute({ kind: "poll", expected_generation: 8, idempotency_key: "check-2" });
  expect(state.attachment).toMatchObject({ status: "active", binding_generation: 9 });
  expect(state.next_action).toMatchObject({ kind: "verified", canonical_route: "https://app.harbor/" });
  expect(recoveryKey.value).toBeNull();
  expect(imports).not.toHaveBeenCalled();
  expect(poll.mock.calls[0]?.[0]).toMatchObject({ body: { route_recovery_id: "recovery-1", session_id: "recovery-session-1", expected_generation: 8, channel: "poll_result" } });
});

test("a lost start response and reload resume the same challenge without another admission key", async () => {
  const key = locator();
  const start = vi.fn<(_request: { body: { idempotency_key: string; expected_generation: number } }) => Promise<Omit<typeof recoveryStart, "replayed"> & { replayed: boolean }>>().mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({ ...recoveryStart, replayed: true });
  const client = { get_communitiesCommunityIdHnsRootImports: async () => retainedRoot(),
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryStart: start };
  const first = recoveryApi(client, key);
  await first.read();
  await expect(first.execute({ kind: "start_owner_recovery", expected_generation: 8, idempotency_key: "first-key" })).rejects.toThrow("response lost");
  expect(key.value).toBe("first-key");
  const reloaded = recoveryApi(client, key);
  expect((await reloaded.read()).next_action).toMatchObject({ status: "required", resume: true });
  const state = await reloaded.execute({ kind: "start_owner_recovery", expected_generation: 8, idempotency_key: "new-page-key" });
  expect(state.next_action).toMatchObject({ challenge: recoveryChallenge });
  expect(start.mock.calls.map(([request]) => request.body.idempotency_key)).toEqual(["first-key", "first-key"]);
});

test("an expired recovery requests a fresh challenge explicitly, without restarting the root import", async () => {
  const start = vi.fn(async (_request: { body: { idempotency_key: string; expected_generation: number } }) => recoveryStart);
  const api = recoveryApi({ get_communitiesCommunityIdHnsRootImports: async () => retainedRoot(),
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryStart: start,
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryPoll: async () => ({ ...recoveryStart, status: "expired", retry_after_seconds: null, result_hash: "a".repeat(64) }) });
  await api.read();
  await api.execute({ kind: "start_owner_recovery", expected_generation: 8, idempotency_key: "first-key" });
  expect((await api.execute({ kind: "poll", expected_generation: 8, idempotency_key: "poll-key" })).next_action).toMatchObject({ status: "expired" });
  await api.execute({ kind: "start_owner_recovery", expected_generation: 8, idempotency_key: "fresh-key" });
  expect(start.mock.calls.map(([request]) => request.body.idempotency_key)).toEqual(["first-key", "fresh-key"]);
});

test("an activated import deep link checks current ownership instead of showing expired evidence as verified", async () => {
  const importKey = locator(); importKey.value = "session-1";
  const api = recoveryApi({ get_communitiesCommunityIdHnsRootImports: async () => retainedRoot(),
    get_communitiesCommunityIdHnsRootImportsSessionId: async () => retainedRoot().session }, locator(), importKey);
  expect((await api.read()).next_action).toMatchObject({ kind: "owner_recovery", status: "required" });
  expect(importKey.value).toBeNull();
});

test("a suspended attachment without its binding generation cannot fall back to an activated import", async () => {
  const retained = retainedRoot();
  const start = vi.fn();
  const imports = vi.fn();
  const api = recoveryApi({
    get_communitiesCommunityIdHnsRootImports: async () => ({
      ...retained,
      attachment: { canonical_route: retained.attachment.canonical_route, status: "suspended" },
    }),
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryStart: start,
    post_communitiesCommunityIdHnsRootImports: imports,
  });
  await expect(api.read()).rejects.toThrow("Ownership verification has expired");
  await expect(api.execute({ kind: "start_owner_recovery", expected_generation: 43, idempotency_key: "wrong-generation" })).rejects.toThrow("Refresh the community address");
  expect(start).not.toHaveBeenCalled();
  expect(imports).not.toHaveBeenCalled();
});

test("a discovery response for another community cannot start owner recovery", async () => {
  const start = vi.fn();
  const api = recoveryApi({
    get_communitiesCommunityIdHnsRootImports: async () => ({ ...retainedRoot(), community_id: "another-community" }),
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryStart: start,
  });
  await expect(api.read()).rejects.toThrow("did not match this community");
  expect(start).not.toHaveBeenCalled();
});

test("a lost successful poll response is recovered from current ownership after reload", async () => {
  const key = locator();
  const discovery = vi.fn().mockResolvedValueOnce(retainedRoot()).mockResolvedValueOnce(retainedRoot("active", 9));
  const start = vi.fn(async () => recoveryStart);
  const poll = vi.fn().mockRejectedValueOnce(new Error("verified response lost"));
  const client = {
    get_communitiesCommunityIdHnsRootImports: discovery,
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryStart: start,
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryPoll: poll,
  };
  const first = recoveryApi(client, key);
  await first.read();
  await first.execute({ kind: "start_owner_recovery", expected_generation: 8, idempotency_key: "saved-recovery" });
  await expect(first.execute({ kind: "poll", expected_generation: 8, idempotency_key: "lost-poll" })).rejects.toThrow("verified response lost");
  expect(key.value).toBe("saved-recovery");
  const reloaded = recoveryApi(client, key);
  expect((await reloaded.read()).next_action).toMatchObject({ kind: "verified", canonical_route: "https://app.harbor/" });
  expect(key.value).toBeNull();
  expect(start).toHaveBeenCalledOnce();
  expect(poll).toHaveBeenCalledOnce();
});

test("recovery refuses a stale binding generation before invoking the verifier", async () => {
  const start = vi.fn();
  const api = recoveryApi({ get_communitiesCommunityIdHnsRootImports: async () => retainedRoot(),
    post_communitiesCommunityIdCanonicalRouteOwnershipRecoveryStart: start });
  await api.read();
  await expect(api.execute({ kind: "start_owner_recovery", expected_generation: 43, idempotency_key: "wrong-clock" })).rejects.toThrow("address changed");
  expect(start).not.toHaveBeenCalled();
});

test("the pinned generated client carries binding generation and cookie/CSRF recovery requests, including pending 503", async () => {
  const requests: Request[] = [];
  const route = { family: "hns", root_label: "harbor", root_label_display: "harbor", path_segment: "harbor", href: "/c/harbor", app_host: null };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (path.endsWith("/start")) return Response.json(recoveryStart, { status: 201 });
    if (path.endsWith("/poll")) return Response.json({ route_recovery_id: "recovery-1", session_id: "recovery-session-1", generation: 8, status: "unavailable", replayed: false, retry_after_seconds: 30, result_hash: null }, { status: 503 });
    return Response.json({ community_id: common.community_id, attachment: { canonical_route: route, status: "suspended", binding_generation: 8 }, session: null });
  });
  const api = createCommunityNamespaceSettingsApi({ communityId: common.community_id, communityPath: "/c/harbor", origin: "https://pirate.example", fetchImpl, readCsrfToken: () => "csrf-fixture", locator: locator(), recoveryLocator: locator() });
  expect((await api.read()).generation).toBe(8);
  await api.execute({ kind: "start_owner_recovery", expected_generation: 8, idempotency_key: "recovery-key" });
  expect((await api.execute({ kind: "poll", expected_generation: 8, idempotency_key: "poll-key" })).next_action).toMatchObject({ status: "unavailable", challenge: recoveryChallenge });
  expect(requests.map((request) => request.credentials)).toEqual(["same-origin", "same-origin", "same-origin"]);
  expect(requests.slice(1).map((request) => request.headers.get("x-csrf-token"))).toEqual(["csrf-fixture", "csrf-fixture"]);
  expect(await requests[1]?.json()).toEqual({ expected_generation: 8, idempotency_key: "recovery-key" });
  expect(new URL(requests[1]!.url).pathname).toBe("/api/communities/community-1/canonical-route/ownership-recovery/start");
});
