import type {
  GetAssetBonusLegsLegIdFundingFundingEffectIdResponse,
  GetRewardOfferLegsLegIdFundingFundingEffectIdResponse,
} from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions, type PirateApiClient } from "./client.ts";

export type RewardFunding = GetAssetBonusLegsLegIdFundingFundingEffectIdResponse["funding"] |
  GetRewardOfferLegsLegIdFundingFundingEffectIdResponse["funding"];
export interface RewardFundingTarget {
  readonly kind: "asset_bonus" | "megapot_pool";
  readonly legId: string;
  readonly fundingEffectId: string;
}
export interface RewardFundingActor {
  readonly accountId: string;
  readonly personaId: string;
}
export interface RewardFundingContext {
  readonly actor: RewardFundingActor;
  readonly walletIndex: number;
  readonly funding: RewardFunding;
}
export interface RewardFundingApi {
  load(target: RewardFundingTarget, actor: RewardFundingActor): Promise<RewardFundingContext>;
  observe(target: RewardFundingTarget, actor: RewardFundingActor, transactionHash: string, key: string): Promise<RewardFunding>;
}

export function assertFundingTarget(target: RewardFundingTarget, funding: RewardFunding): void {
  if (funding.leg_id !== target.legId || funding.funding_effect_id !== target.fundingEffectId ||
      funding.object !== `${target.kind}_funding` || funding.chain_id !== 84532) {
    throw new Error("funding_instruction_mismatch");
  }
}

/** Only the generated, authenticated API supplies transaction instructions. */
export function createRewardFundingApi(
  client: PirateApiClient = createSessionApiClient(),
  csrf: () => string | undefined = readCsrfCookie,
): RewardFundingApi {
  return {
    async load(target, actor) {
      const before = await client.get_usersMe(undefined);
      if (before.id !== actor.accountId) throw new Error("funding_account_changed");
      const path = { legId: target.legId, fundingEffectId: target.fundingEffectId };
      const [personas, response] = await Promise.all([
        client.get_personas(undefined),
        target.kind === "megapot_pool"
          ? client.get_rewardOfferLegsLegIdFundingFundingEffectId({ path })
          : client.get_assetBonusLegsLegIdFundingFundingEffectId({ path }),
      ]);
      const after = await client.get_usersMe(undefined);
      if (after.id !== actor.accountId) throw new Error("funding_account_changed");
      const persona = personas.personas.find(item => item.persona_id === actor.personaId);
      const wallet = persona?.wallet_set.evm;
      if (persona?.status !== "active" || wallet == null ||
          wallet.address.toLowerCase() !== response.funding.sender_address.toLowerCase()) {
        throw new Error("wallet_assignment_mismatch");
      }
      assertFundingTarget(target, response.funding);
      return { actor: { ...actor }, walletIndex: wallet.hd_wallet_index, funding: response.funding };
    },
    async observe(target, actor, transactionHash, key) {
      const me = await client.get_usersMe(undefined);
      if (me.id !== actor.accountId) throw new Error("funding_account_changed");
      const token = csrf();
      if (token === undefined) throw new Error("funding_csrf_required");
      const input = {
        path: { legId: target.legId, fundingEffectId: target.fundingEffectId },
        body: { persona_id: actor.personaId, transaction_hash: transactionHash, idempotency_key: key },
      };
      const response = target.kind === "megapot_pool"
        ? await client.post_rewardOfferLegsLegIdFundingFundingEffectIdObservations(input, sessionRequestOptions(token))
        : await client.post_assetBonusLegsLegIdFundingFundingEffectIdObservations(input, sessionRequestOptions(token));
      assertFundingTarget(target, response.funding);
      return response.funding;
    },
  };
}
