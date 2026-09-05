import { describe, expect, test, vi } from "vitest";

import { createCommunityNamespaceSettingsApi, type HnsSessionLocator } from "./community-namespace-settings-api";

const common = {
  attachment_intent_id: "attachment-1",
  community_id: "community-1",
  expires_at: "2026-09-11T00:00:00.000Z",
  replayed: false,
  root_import_session_id: "session-1",
  root_label: "dankmemes",
};

const plan = {
  acknowledgement_required: true,
  added_records: [],
  current_records: [],
  preserved_records: [],
  preserved_unknown_record_types: ["SYNTH4"],
  removed_conflicts: [],
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
  test("drives the real one-signature ceremony and preserves every wallet record", async () => {
    const sessionLocator = locator();
    const pollResponses = [
      { ...common, revision: 2, status: "provisioning", publish_plan: null, publish_plan_sha256: null, readiness_result_sha256: null, retry_after_seconds: 2 },
      { ...common, revision: 3, status: "awaiting_owner_update", publish_plan: plan, publish_plan_sha256: "plan-hash", readiness_result_sha256: null, retry_after_seconds: 2 },
      { ...common, revision: 4, status: "observing", publish_plan: plan, publish_plan_sha256: "plan-hash", readiness_result_sha256: null, retry_after_seconds: 2 },
      { ...common, revision: 5, status: "ready", publish_plan: plan, publish_plan_sha256: "plan-hash", readiness_result_sha256: "ready-hash", retry_after_seconds: null },
    ];
    const poll = vi.fn(async (_input: unknown, _options: unknown) => pollResponses.shift());
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
        get_communitiesCommunityIdHnsRootImportsSessionId: vi.fn(),
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
      acknowledgement_required: true,
      kind: "publish_resource",
      records: [
        { record_type: "SYNTH4", supported: true, value: '{"type":"SYNTH4","address":"203.0.113.8"}', wallet_record: plan.replacement_records[0] },
        { record_type: "TXT", supported: true, value: "unrelated value", wallet_record: plan.replacement_records[1] },
        { record_type: "NS", supported: true, value: "ns1.pirate", wallet_record: plan.replacement_records[2] },
        { record_type: "DS", supported: true, value: "1234 13 2 abcd", wallet_record: plan.replacement_records[3] },
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
      acknowledgement_required: true,
      kind: "publish_resource",
      records: [{ record_type: "CAA", supported: false, value: '{"type":"CAA","tag":"issue","value":"ca.example"}' }],
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
        post_communitiesCommunityIdHnsRootImportsSessionIdPoll: poll } as never,
      communityId: common.community_id, communityPath: "/c/community-1", locator: sessionLocator,
      readCsrfToken: () => "csrf-1",
    });
    const snapshot = await api.read();
    expect(snapshot.next_action).toEqual({ kind: "wait", reason_code: "verification_pending", retry_after_seconds: 7 });
    expect(sessionLocator.value).toBe("session-1");
    expect(discovery).toHaveBeenCalledWith({ path: { communityId: common.community_id } }, { credentials: "same-origin" });
    await api.execute({ kind: "poll", expected_generation: snapshot.generation, idempotency_key: "poll-recovered" });
    expect(poll).toHaveBeenCalledWith(expect.objectContaining({ path: { communityId: common.community_id, sessionId: "session-1" } }), expect.anything());
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
    client: { get_communitiesCommunityIdHnsRootImportsSessionId: async () => response,
      post_communitiesCommunityIdHnsRootImportsSessionIdPoll: poll } as never,
    communityId: common.community_id, communityPath: "/c/community-1", locator: sessionLocator,
    readCsrfToken: () => "csrf-1",
  });
  const snapshot = await api.read();
  sessionLocator.clear();
  await api.execute({ kind: "poll", expected_generation: snapshot.generation, idempotency_key: "poll-loaded" });
  expect(poll).toHaveBeenCalledWith(expect.objectContaining({ path: { communityId: common.community_id, sessionId: "session-1" } }), expect.anything());
});
