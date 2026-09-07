import type { RewardFundingContext, RewardFundingTarget } from "../../src/api/reward-funding-client.ts";
export const sender = "0x1111111111111111111111111111111111111111";
export const recipient = "0x2222222222222222222222222222222222222222";
export const token = "0x3333333333333333333333333333333333333333";
export const transactionHash = `0x${"ab".repeat(32)}`;
export const actor = { accountId: "account-a", personaId: "persona-a" };
export const target: RewardFundingTarget = { kind: "asset_bonus", legId: "leg-a", fundingEffectId: "funding-a" };
export function context(kind: RewardFundingTarget["kind"] = "asset_bonus"): RewardFundingContext {
  const common = {
    funding_effect_id: "funding-a", leg_id: "leg-a", status: "planned" as const,
    chain_id: 84532 as const, token_address: token, token_decimals: 6 as const,
    sender_address: sender, recipient_address: recipient, expected_amount_atomic: "1000000",
    confirmed_amount_atomic: null, required_confirmations: 2, transaction_hash: null,
  };
  return {
    actor: { ...actor }, walletIndex: 3,
    funding: kind === "megapot_pool"
      ? { ...common, object: "megapot_pool_funding", action: "fund_with_usdc" }
      : { ...common, object: "asset_bonus_funding", action: "fund_with_asset" },
  };
}
export const fee = { gasLimit: "60000", gasPriceAtomic: "2", executionFeeAtomic: "120000" };
