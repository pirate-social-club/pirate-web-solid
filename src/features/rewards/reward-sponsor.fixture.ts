import { createRewardFundingController } from "../../api/reward-funding-controller.ts";
import type { RewardFunding } from "../../api/reward-funding-client.ts";
import type { RewardFundingReceipt } from "../../api/reward-funding-recovery.ts";
import type { RewardSponsorDependencies } from "./reward-sponsor-dialog.tsx";
/** Controlled Storybook/test server and wallet. No network calls or real signing. */
export function rewardSponsorFixture(): RewardSponsorDependencies {
  const records = new Map<string,string>(), receipts = new Map<string,RewardFundingReceipt>();
  let queue = Promise.resolve();
  const exclusive = <T,>(_key: string, operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation); queue = result.then(() => {}, () => {}); return result;
  };
  const asset = { chain_id: 84532 as const, token_address: `0x${"a".repeat(40)}`, token_decimals: 6, token_symbol: "PSTB", asset_policy_version: "staging-token-v1" };
  let funding: RewardFunding = { object: "asset_bonus_funding", action: "fund_with_asset", funding_effect_id: "effect", leg_id: "leg", status: "planned", chain_id: 84532, token_address: asset.token_address, token_decimals: 6, sender_address: `0x${"b".repeat(40)}`, recipient_address: `0x${"c".repeat(40)}`, expected_amount_atomic: "10000000", confirmed_amount_atomic: null, required_confirmations: 2, transaction_hash: null };
  return {
    journal: { read: key => records.get(key) ?? null, write: (key,raw) => { records.set(key,raw); }, exclusive },
    data: {
      async catalog() { return { accountId: "account", personas: [{ object: "persona", persona_id: "persona", status: "active", profile: { object: "persona_profile", persona_id: "persona", revision: 1, display_name: "Harbor persona", avatar_ref: null, cover_ref: null, bio: null, preferred_locale: "en", primary_public_handle: null }, wallet_set: { evm: { chain_account_kind: "evm", address: funding.sender_address, hd_wallet_index: 0, assigned_at: "2026-09-08T00:00:00Z" } }, community_binding: { community_id: "community", binding_source: "persona_creation" }, created_at: "2026-09-08T00:00:00Z", retired_at: null }], policies: [
        { activity: "study", policy: { kind: "study_session_first_pass_v2", qualification_policy_version_id: "study-v2", required_correct_bps: 7000 } },
        { activity: "karaoke", policy: { kind: "karaoke_qualification_v2", qualification_policy_version_id: "karaoke-v2", minimum_scored_line_count: 5, minimum_coverage_bps: 8500, minimum_final_score_bps: 7000, eligible_playback_kinds: ["full_mix","instrumental"] } },
      ], assets: { items: [asset], next_cursor: null } }; },
      async privateRewards() { return { credits: { object: "reward_credit_list", items: [], next_cursor: null }, standing: null }; },
      async assets() { return { items: [], next_cursor: null }; },
      async song() { return { pool: null, bonuses: { object: "song_asset_bonus_list", items: [] } }; },
    },
    creationApi: () => ({
      async open() { return "offer"; },
      async add(request) {
        if (request.kind === "asset_bonus") funding = { ...funding, object: "asset_bonus_funding", action: "fund_with_asset", token_decimals: request.input.body.token_decimals, expected_amount_atomic: request.input.body.funding_amount_atomic };
        else funding = { ...funding, object: "megapot_pool_funding", action: "fund_with_usdc", token_decimals: 6, expected_amount_atomic: request.input.body.funding_amount_atomic };
        return { kind: request.kind, legId: funding.leg_id, fundingEffectId: funding.funding_effect_id };
      },
    }),
    async config() { return { enabled: true, privyAppId: "storybook-fixture" }; },
    async funding(options) {
      let authorized = false;
      const controller = createRewardFundingController({ ...options,
        api: {
          async load() { return { actor: options.actor, walletIndex: 0, funding }; },
          async observe(_target,_actor,hash) { funding = { ...funding, status: "confirmed", transaction_hash: hash, confirmed_amount_atomic: funding.expected_amount_atomic }; return funding; },
        },
        wallet: {
          async estimate() { if (!authorized) throw new Error("wallet_reauthentication_required"); return { gasLimit: "21000", gasPriceAtomic: "2000000000", executionFeeAtomic: "42000000000000" }; },
          async send(_context,_fee,beforeBroadcast) { await beforeBroadcast(); return `0x${"d".repeat(64)}`; },
          dispose() { authorized = false; },
        },
        recovery: { read: key => receipts.get(key) ?? null, write: (key,receipt) => { receipts.set(key,receipt); }, remove: key => { receipts.delete(key); }, exclusive },
      });
      return {
        controller,
        authorization: {
          async sendCode() {}, async loginWithCode(_email,code) { if (code !== "123456") throw new Error("Use fixture code 123456."); authorized = true; },
          async beginOAuth() { throw new Error("Fixture uses email."); }, async completeOAuth() {}, async loginWithWallet() {},
        },
        async selectTestnet() {}, dispose: controller.dispose,
      };
    },
  };
}
