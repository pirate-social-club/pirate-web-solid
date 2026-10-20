import { describe, expect, test, vi } from "vitest";
import { ApiClientError, type GetUsersMeSpacesHandleRequestsResponse } from "@pirate/api-client";
import type { SessionSpacesMemberRecoveryApiClient } from "../../../api/handle-sales-client.ts";
import { createSpacesMemberRecovery, type SpacesMemberRequest } from "./spaces-member-recovery.ts";

const at = "2026-10-20T00:00:00.000Z";
const reader = (implementation: SessionSpacesMemberRecoveryApiClient["get_usersMeSpacesHandleRequests"]) => vi.fn(implementation);
function retained(root = "first-root", id = "first", network: "mainnet" | "regtest" = "regtest"): SpacesMemberRequest {
  const hash = "a".repeat(64);
  return {
    kind: "quote", action: { action_id: `action-${id}`, endpoint_template: "/handle-quotes", idempotency_key: `key-${id}`, request_hash: hash, committed_at: at },
    context: { community_id: "community-original", offering_id: `offering-${id}`, offering_revision: 1, offering_hash: hash,
      sale_namespace_activation_id: `activation-${id}`, sale_namespace_activation_generation: 1, owner_persona_id: "persona-original", network, namespace_root: root },
    quote: { quote_id: `quote-${id}`, quote_hash: hash, offering_id: `offering-${id}`, offering_revision: 1, offering_hash: hash,
      sale_namespace_activation_id: `activation-${id}`, sale_namespace_activation_generation: 1, fulfillment: { kind: "spaces_native_v1" },
      owner_persona_id: "persona-original", recipient: { kind: "persona_taproot_v1", network, script_pubkey_hex: `5120${"a".repeat(64)}` },
      handle: { family: "spaces", namespace_root: root, handle_label: "original-name" }, display_identifier: `original-name@${root}`,
      pricing: { kind: "free_v1", pricing_id: "free", pricing_revision: 1, pricing_hash: hash, atomic_amount: "0" },
      eligibility: { policy_revision: 1, policy_hash: hash, decision: "passed", evidence_use_ids: [], evaluated_at: at },
      status: "quoted", quoted_at: at, expires_at: "2026-10-20T00:05:00.000Z" },
  };
}
function page(items: readonly SpacesMemberRequest[] = [], next_cursor: string | null = null): GetUsersMeSpacesHandleRequestsResponse {
  return { object: "spaces_member_request_readback_v1", coverage: "retained_committed_actions_with_stored_scope",
    scope_incomplete_actions: "omitted_when_scope_unprovable", unlocated_request_outcome: "unknown",
    new_submission_admission: "not_established_by_readback", items, next_cursor };
}
function deferred<A>() {
  let resolve: (value: A) => void = () => {};
  const promise = new Promise<A>(done => { resolve = done; });
  return { promise, resolve };
}

describe("conservative Spaces member readback owner", () => {
  test("an authoritative401 invalidates read ownership even while the outer session remains cached authenticated", async () => {
    const get = reader(async () => page([retained()]));
    const owner = createSpacesMemberRecovery({ client: { get_usersMeSpacesHandleRequests: get }, currentAccountId: () => "account-a" });
    owner.setSession({ kind: "ready", accountId: "account-a" }); await owner.refresh();
    get.mockRejectedValue(new ApiClientError({ status: 401, code: "unauthorized", name: "Unauthorized", retryable: false },
      { error: { code: "unauthorized", message: "Sign in required", retryable: false } }));
    await owner.refresh();
    expect(owner.state()).toMatchObject({ kind: "signed-out", items: [], nextCursor: null });
    expect(owner.accountId()).toBeUndefined();
    await owner.refresh(); await owner.more();
    expect(get).toHaveBeenCalledTimes(2);
    owner.dispose();
  });
  test("empty readback stays unknown and a later committed action can be checked without any command", async () => {
    const get = reader(async () => page());
    const post = vi.fn();
    const wire = { get_usersMeSpacesHandleRequests: get, post_handleClaims: post };
    const owner = createSpacesMemberRecovery({ client: wire });
    owner.setSession({ kind: "ready", accountId: "account-a" });
    await owner.refresh();
    expect(owner.state()).toMatchObject({ kind: "unknown", items: [], nextCursor: null });
    get.mockResolvedValue(page([retained()]));
    await owner.refresh();
    expect(owner.state().items).toEqual([retained()]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(post).not.toHaveBeenCalled();
    expect(get.mock.calls[0]?.[0]).toEqual({ query: { limit: "20" } });
    owner.dispose();
  });

  test("paging preserves two original roots and their original networks", async () => {
    const get = reader(async () => page([retained()], "smr1.YQ"));
    const owner = createSpacesMemberRecovery({ client: { get_usersMeSpacesHandleRequests: get } });
    owner.setSession({ kind: "ready", accountId: "account-a" });
    await owner.refresh();
    get.mockResolvedValue(page([retained("second-root", "second", "mainnet")]));
    await owner.more();
    expect(owner.state().items.map(item => item.kind === "quote" && [item.context.namespace_root, item.context.network]))
      .toEqual([["first-root", "regtest"], ["second-root", "mainnet"]]);
    expect(get.mock.calls[1]?.[0]).toEqual({ query: { limit: "20", cursor: "smr1.YQ" } });
    expect(get.mock.calls[0]?.[1]).toMatchObject({ credentials: "same-origin", signal: expect.any(AbortSignal) });
    await owner.more();
    expect(get).toHaveBeenCalledTimes(2);
    owner.dispose();
  });

  test("repeated cursors and contradictory original context remain partial unknown", async () => {
    const get = reader(async () => page([retained()], "smr1.YQ"));
    const owner = createSpacesMemberRecovery({ client: { get_usersMeSpacesHandleRequests: get } });
    owner.setSession({ kind: "ready", accountId: "account-a" });
    await owner.refresh();
    get.mockResolvedValue(page([retained("second-root", "second")], "smr1.YQ"));
    await owner.more();
    expect(owner.state()).toMatchObject({ kind: "unknown", nextCursor: null });
    expect(owner.state().items).toEqual([retained()]);
    await owner.more();
    expect(get).toHaveBeenCalledTimes(2);
    const wrong = retained();
    if (wrong.kind !== "quote") throw new Error("invalid test quote");
    get.mockResolvedValue(page([{ ...wrong, context: { ...wrong.context, namespace_root: "changed-root" } }]));
    await owner.refresh();
    expect(owner.state()).toMatchObject({ kind: "unknown", items: [] });
    owner.dispose();
  });

  test("a partial refusal never acquires missing scope from the current filter", async () => {
    const partial: SpacesMemberRequest = { kind: "quote_refusal", action: { action_id: "partial", endpoint_template: "/handle-quotes", idempotency_key: "partial-key", request_hash: "a".repeat(64), committed_at: at },
      offering_id: "offering-original", owner_persona_id: "persona-original", immutable_context: "not_recorded", result_kind: "eligibility_required", reason: "evidence_required" };
    const get = reader(async () => page([partial]));
    const owner = createSpacesMemberRecovery({ client: { get_usersMeSpacesHandleRequests: get } });
    owner.setSession({ kind: "ready", accountId: "account-a" });
    await owner.refresh();
    expect(owner.state().items).toEqual([partial]);
    const filtered = createSpacesMemberRecovery({ client: { get_usersMeSpacesHandleRequests: get }, filters: { namespace_root: "first-root", network: "regtest" } });
    filtered.setSession({ kind: "ready", accountId: "account-a" });
    await filtered.refresh();
    expect(filtered.state()).toMatchObject({ kind: "unknown", items: [] });
    owner.dispose(); filtered.dispose();
  });

  test("pending revalidation clears private results and rejects a late old-account response", async () => {
    const old = deferred<GetUsersMeSpacesHandleRequestsResponse>();
    const get = reader(async () => page());
    get.mockImplementationOnce(() => old.promise);
    const owner = createSpacesMemberRecovery({ client: { get_usersMeSpacesHandleRequests: get } });
    owner.setSession({ kind: "ready", accountId: "account-a" });
    const first = owner.refresh();
    const oldSignal = get.mock.calls[0]?.[1]?.signal;
    owner.setSession({ kind: "pending" });
    expect(oldSignal?.aborted).toBe(true);
    expect(owner.state()).toMatchObject({ kind: "account-pending", items: [] });
    await owner.refresh();
    expect(get).toHaveBeenCalledTimes(1);
    owner.setSession({ kind: "ready", accountId: "account-b" });
    get.mockResolvedValue(page([retained("second-root", "account-b")]));
    await owner.refresh();
    old.resolve(page([retained("first-root", "account-a")]));
    await first;
    expect(owner.state().items.map(item => item.action.action_id)).toEqual(["action-account-b"]);
    expect(get).toHaveBeenCalledTimes(2);
    owner.setSession({ kind: "anonymous" });
    expect(owner.state()).toMatchObject({ kind: "signed-out", items: [] });
    owner.dispose();
  });

  test("unmount aborts and suppresses every later private result", async () => {
    const waiting = deferred<GetUsersMeSpacesHandleRequestsResponse>();
    const get = reader(() => waiting.promise);
    const changed = vi.fn();
    const owner = createSpacesMemberRecovery({ client: { get_usersMeSpacesHandleRequests: get }, changed });
    owner.setSession({ kind: "ready", accountId: "account-a" });
    const pending = owner.refresh();
    const count = changed.mock.calls.length;
    owner.dispose();
    expect(get.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    waiting.resolve(page([retained()]));
    await pending;
    expect(owner.state().items).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(count);
    await owner.refresh();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
