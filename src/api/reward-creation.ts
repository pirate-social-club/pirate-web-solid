import type { AddAssetBonusLegInput, AddMegapotPoolLegInput, OpenSongRewardOfferInput } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions, type PirateApiClient } from "./client.ts";
import type { RewardFunding, RewardFundingActor, RewardFundingTarget } from "./reward-funding-client.ts";

export type RewardLegRequest =
  | { readonly kind: "asset_bonus"; readonly input: AddAssetBonusLegInput }
  | { readonly kind: "megapot_pool"; readonly input: AddMegapotPoolLegInput };
export interface RewardCreationScope extends RewardFundingActor { readonly communityId: string; readonly postId: string }
export interface RewardCreationJournal {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  exclusive<T>(key: string, operation: () => Promise<T>): Promise<T>;
}
export interface RewardCreationApi {
  open(input: OpenSongRewardOfferInput): Promise<string>;
  add(request: RewardLegRequest): Promise<RewardFundingTarget>;
}
interface RecordV1 {
  readonly version: 1;
  readonly scope: RewardCreationScope;
  readonly offer: OpenSongRewardOfferInput | null;
  readonly leg: RewardLegRequest;
  readonly offerId: string | null;
  readonly target: RewardFundingTarget | null;
}
interface HistoryV1 {
  readonly version: 1;
  readonly creation: RecordV1;
  readonly resolution: Readonly<{
    status: "confirmed" | "reverted";
    transactionHash: string | null;
  }>;
}
export const rewardCreationKey = (scope: RewardCreationScope) =>
  `pirate:reward-creation:v1:${JSON.stringify([scope.accountId, scope.personaId, scope.communityId, scope.postId])}`;
export const rewardCreationHistoryKey = (scope: RewardCreationScope, target: RewardFundingTarget) =>
  `pirate:reward-creation-history:v1:${JSON.stringify([scope.accountId, scope.personaId, scope.communityId, scope.postId, target.kind, target.legId, target.fundingEffectId])}`;
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- This is the private JSON decoding boundary; every consumed field is checked below.
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const atomic = (value: unknown) => typeof value === "string" && /^[1-9][0-9]{0,77}$/u.test(value) && BigInt(value) < 2n ** 256n;
function validLeg(value: unknown): value is RewardLegRequest {
  if (!object(value) || !object(value.input) || !object(value.input.path) || !object(value.input.body)) return false;
  const b = value.input.body;
  if (typeof value.input.path.offerId !== "string" || !identifier(b.idempotency_key) || !identifier(b.persona_id) || !atomic(b.funding_amount_atomic)) return false;
  const versions = b.expected_qualification_policy_versions;
  if (!object(versions) || !Object.keys(versions).length || Object.entries(versions).some(([k,v]) => !["study", "karaoke"].includes(k) || !identifier(v))) return false;
  if (value.kind === "asset_bonus") return b.chain_id === 84532 && typeof b.token_address === "string" && /^0x[0-9a-f]{40}$/iu.test(b.token_address) &&
    Number.isInteger(b.token_decimals) && Number(b.token_decimals) >= 0 && Number(b.token_decimals) <= 77 && identifier(b.token_symbol) && identifier(b.asset_policy_version) &&
    atomic(b.amount_per_claim_atomic) && Number.isSafeInteger(b.max_claims) && Number(b.max_claims) > 0;
  if (value.kind !== "megapot_pool") return false;
  return atomic(b.max_ticket_price_atomic) && Number.isSafeInteger(b.entry_cutoff_seconds) && Number(b.entry_cutoff_seconds) > 0 &&
    Array.isArray(b.eligible_activities) && b.eligible_activities.length > 0 && new Set(b.eligible_activities).size === b.eligible_activities.length &&
    b.eligible_activities.every(a => a === "study" || a === "karaoke") && Number.isInteger(b.min_score_bps) && Number(b.min_score_bps) >= 7000 && Number(b.min_score_bps) <= 10000 &&
    ((b.empty_pool_policy === "no_purchase" && b.fallback_payout_persona_id === null && b.fallback_disclosure_acknowledged === false) ||
      (b.empty_pool_policy === "funder_fallback" && b.min_score_bps === 7000 && identifier(b.fallback_payout_persona_id) && b.fallback_disclosure_acknowledged === true));
}
function validOffer(value: unknown, scope: RewardCreationScope): boolean {
  return object(value) && object(value.path) && object(value.body) &&
    value.path.communityId === scope.communityId && value.path.postId === scope.postId &&
    value.body.persona_id === scope.personaId && identifier(value.body.idempotency_key) &&
    typeof value.body.starts_at === "string" && typeof value.body.ends_at === "string" &&
    Number.isFinite(Date.parse(value.body.starts_at)) && Date.parse(value.body.ends_at) > Date.parse(value.body.starts_at);
}
function isStoredRecord(v: unknown, scope: RewardCreationScope): v is RecordV1 {
  return !(!object(v) || v.version !== 1 || !object(v.scope) || v.scope.accountId !== scope.accountId || v.scope.personaId !== scope.personaId || v.scope.communityId !== scope.communityId || v.scope.postId !== scope.postId ||
    !(v.offer === null ? v.offerId !== null : validOffer(v.offer, scope)) ||
    !validLeg(v.leg) || v.leg.input.body.persona_id !== scope.personaId || !(v.offerId === null || identifier(v.offerId)) ||
    v.leg.input.path.offerId !== (v.offerId ?? "") ||
    !(v.target === null || object(v.target) && v.target.kind === v.leg.kind && identifier(v.target.legId) && identifier(v.target.fundingEffectId) && v.offerId !== null));
}
function decode(raw: string, scope: RewardCreationScope): RecordV1 {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("reward_creation_recovery_corrupt"); }
  if (!isStoredRecord(value, scope)) throw new Error("reward_creation_recovery_corrupt");
  return value;
}
function withOfferId(leg: RewardLegRequest, offerId: string): RewardLegRequest {
  return leg.kind === "asset_bonus"
    ? { kind: leg.kind, input: { ...leg.input, path: { offerId } } }
    : { kind: leg.kind, input: { ...leg.input, path: { offerId } } };
}

/** One journal and lock per actor/song, including the interval before any server identity exists.
 * Recovery only replays creation. It never signs, clears a receipt, or replaces uncertain terms. */
export function createRewardCreation(options: {
  scope: RewardCreationScope; currentScope: () => RewardCreationScope | null; journal: RewardCreationJournal; api: RewardCreationApi;
}) {
  const scope = { ...options.scope }, key = rewardCreationKey(scope);
  const assertCurrent = () => {
    const current = options.currentScope();
    if (!current || rewardCreationKey(current) !== key) throw new Error("reward_creation_actor_changed");
  };
  const read = () => { assertCurrent(); const raw = options.journal.read(key); return raw === null ? null : decode(raw, scope); };
  const write = (record: RecordV1) => {
    assertCurrent(); const raw = JSON.stringify(record); decode(raw, scope);
    options.journal.write(key, raw);
    if (options.journal.read(key) !== raw) throw new Error("reward_creation_recovery_unavailable");
  };
  const resume = async (initial: RecordV1): Promise<RewardFundingTarget> => {
    let record = initial;
    assertCurrent();
    if (record.offerId === null) {
      if (record.offer === null) throw new Error("reward_creation_recovery_corrupt");
      const offerId = await options.api.open(record.offer);
      assertCurrent();
      record = { ...record, offerId, leg: withOfferId(record.leg, offerId) };
      write(record);
    }
    if (record.target === null) {
      const target = await options.api.add(record.leg);
      assertCurrent(); record = { ...record, target }; write(record);
    }
    // The returned identities are durable before a caller can construct the signer.
    return { ...record.target! };
  };
  return {
    pending() { const record = read(); return record === null ? null : structuredClone(record); },
    start(offer: OpenSongRewardOfferInput | null, leg: RewardLegRequest) {
      // Capture the reviewed request synchronously, before waiting for another tab's lock.
      const candidate: RecordV1 = structuredClone({ version: 1, scope, offer, leg, offerId: leg.input.path.offerId || null, target: null });
      return options.journal.exclusive(key, async () => {
        assertCurrent();
        if (read() !== null) throw new Error("reward_creation_recovery_required");
        write(candidate);
        return resume(candidate);
      });
    },
    recover() {
      return options.journal.exclusive(key, async () => {
        const record = read();
        if (record === null) throw new Error("reward_creation_recovery_not_required");
        return resume(record);
      });
    },
    complete(funding: RewardFunding) {
      return options.journal.exclusive(key, async () => {
        const record = read();
        if (record?.target === null || record === null) {
          throw new Error("reward_creation_recovery_not_required");
        }
        const target = record.target;
        if (
          funding.leg_id !== target.legId ||
          funding.funding_effect_id !== target.fundingEffectId ||
          funding.object !== `${target.kind}_funding` ||
          (funding.status !== "confirmed" && funding.status !== "reverted")
        ) {
          throw new Error("reward_creation_completion_unproven");
        }
        const historyKey = rewardCreationHistoryKey(scope, target);
        const history: HistoryV1 = {
          version: 1,
          creation: record,
          resolution: { status: funding.status, transactionHash: funding.transaction_hash },
        };
        const raw = JSON.stringify(history);
        options.journal.write(historyKey, raw);
        if (options.journal.read(historyKey) !== raw) {
          throw new Error("reward_creation_recovery_unavailable");
        }
        options.journal.remove(key);
        if (options.journal.read(key) !== null) {
          throw new Error("reward_creation_recovery_unavailable");
        }
      });
    },
  };
}
export function createBrowserRewardCreationJournal(): RewardCreationJournal {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.locks) throw new Error("reward_creation_recovery_unavailable");
  const storage = window.localStorage, locks = navigator.locks;
  return {
    read: key => storage.getItem(key), write: (key, raw) => storage.setItem(key, raw),
    remove: key => storage.removeItem(key),
    async exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> { return await locks.request(key, { mode: "exclusive" }, operation); },
  };
}
export function createRewardCreationApi(actor: RewardFundingActor, client: PirateApiClient = createSessionApiClient()): RewardCreationApi {
  const authorize = async (personaId: string) => {
    const me = await client.get_usersMe(undefined);
    if (me.id !== actor.accountId || personaId !== actor.personaId) throw new Error("reward_creation_actor_changed");
    const csrf = readCsrfCookie();
    if (csrf === undefined) throw new Error("reward_creation_csrf_required");
    return sessionRequestOptions(csrf);
  };
  return {
    async open(input) {
      const result = await client.post_communitiesCommunityIdPostsPostIdRewardOffers(input, await authorize(input.body.persona_id));
      if (result.offer.community_id !== input.path.communityId || result.offer.post_id !== input.path.postId) throw new Error("reward_creation_response_mismatch");
      return result.offer.offer_id;
    },
    async add(request) {
      const options = await authorize(request.input.body.persona_id);
      const result = request.kind === "asset_bonus"
        ? await client.post_rewardOffersOfferIdAssetBonusLegs(request.input, options)
        : await client.post_rewardOffersOfferIdMegapotPoolLegs(request.input, options);
      if (result.leg.offer_id !== request.input.path.offerId || result.leg.leg_id !== result.funding.leg_id || result.funding.object !== `${request.kind}_funding`) throw new Error("reward_creation_response_mismatch");
      return { kind: request.kind, legId: result.leg.leg_id, fundingEffectId: result.funding.funding_effect_id };
    },
  };
}
