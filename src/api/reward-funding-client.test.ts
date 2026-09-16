import { describe, expect, it, vi } from "vitest";
import { createSessionApiClient } from "./client.ts";
import { createRewardFundingApi, type RewardFundingTarget } from "./reward-funding-client.ts";
import { actor, context, sender, target, transactionHash } from "../../test/fixtures/reward-funding.ts";

function harness(kind: RewardFundingTarget["kind"] = "asset_bonus") {
  let userId = actor.accountId;
  let walletAddress: string | null = sender;
  let personaStatus = "active";
  let csrf: string | undefined = "csrf-fixture";
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(url.origin).toBe("https://app.example");
    expect(url.pathname.startsWith("/api/")).toBe(true);
    expect(init?.credentials).toBe("same-origin");
    const path = url.pathname.slice(4);
    let response;
    if (path === "/users/me") response = {
      id: userId, object: "user", verification_state: "unverified", created: 1,
      verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(name => [name, { state: "unverified" }])),
    };
    else if (path === "/personas") response = { personas: [{
      persona_id: actor.personaId, object: "persona", status: personaStatus,
      profile: { persona_id: actor.personaId, object: "persona_profile", revision: 1, display_name: null, avatar_ref: null, cover_ref: null, bio: null, preferred_locale: null, primary_public_handle: null },
      wallet_set: { evm: walletAddress === null ? null : { chain_account_kind: "evm", address: walletAddress, hd_wallet_index: 3, assigned_at: "2026-09-08T00:00:00.000Z" } },
      community_binding: null, created_at: "2026-09-08T00:00:00.000Z", retired_at: null,
    }] };
    else {
      const segment = kind === "megapot_pool" ? "reward-offer-legs" : "asset-bonus-legs";
      const base = `/${segment}/leg-a/funding/funding-a`;
      expect([base, `${base}/observations`]).toContain(path);
      if (init?.method === "POST") {
        expect(new Headers(init.headers).get("x-csrf-token")).toBe("csrf-fixture");
        response = { funding: { ...context(kind).funding, status: "confirming", transaction_hash: transactionHash }, replayed: false };
      } else response = { funding: context(kind).funding };
    }
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  });
  return {
    api: createRewardFundingApi(createSessionApiClient({ origin: "https://app.example", fetchImpl }), () => csrf), fetchImpl,
    user: (id: string) => { userId = id; }, wallet: (address: string | null) => { walletAddress = address; },
    status: (status: string) => { personaStatus = status; }, noCsrf: () => { csrf = undefined; },
  };
}

describe("generated reward funding transport", () => {
  it.each(["asset_bonus", "megapot_pool"] as const)("reads and observes %s through authenticated same-origin transport", async kind => {
    const h = harness(kind); const ref = { ...target, kind };
    expect(await h.api.load(ref, actor)).toEqual(context(kind));
    expect(await h.api.observe(ref, actor, transactionHash, "observation-key")).toMatchObject({ status: "confirming" });
    const request = h.fetchImpl.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ persona_id: actor.personaId, transaction_hash: transactionHash, idempotency_key: "observation-key" });
  });
  it("rejects a different authenticated account before reading funding", async () => {
    const h = harness(); h.user("other-account");
    await expect(h.api.load(target, actor)).rejects.toThrow("funding_account_changed");
    expect(h.fetchImpl).toHaveBeenCalledOnce();
  });
  it.each([null, "0x4444444444444444444444444444444444444444"])("rejects missing or different persona assignment %s", async address => {
    const h = harness(); h.wallet(address);
    await expect(h.api.load(target, actor)).rejects.toThrow("wallet_assignment_mismatch");
  });
  it("rejects a suspended persona", async () => {
    const h = harness(); h.status("suspended");
    await expect(h.api.load(target, actor)).rejects.toThrow("wallet_assignment_mismatch");
  });
  it("requires CSRF before any observation write", async () => {
    const h = harness(); h.noCsrf();
    await expect(h.api.observe(target, actor, transactionHash, "key")).rejects.toThrow("funding_csrf_required");
    expect(h.fetchImpl.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });
});
