// POST119 source; exact wire bodies come only from the actual generated API adapter.
import type { OwnerStudyFinancialApi } from "./guest-study-financial-api";
import type { GuestStudyAccountingApi } from "./guest-study-accounting-api";
import { isGuestRewardTerms, type GuestRewardTerms } from "./guest-study-reward-model";
export type OwnerStudyStartBody = Parameters<OwnerStudyFinancialApi["startSession"]>[0]["body"];
export interface OwnerStudyAnswerMarker { sessionItemId: string; attemptNumber: number; idempotencyKey: string }
export interface OriginalOwnerStudyStart {
  accountId: string; communityId: string; postId: string; body: OwnerStudyStartBody;
  acceptedTerms: GuestRewardTerms; disclosureText: string;
  state: "submitted" | "pending_confirmation" | "completed" | "not_started";
  sessionId: string | null;
  inventory: { initialized: true; pending: OwnerStudyAnswerMarker | null } | null;
}
export type OriginalOwnerCreditCommand = {
  accountId: string; creditId: string; state: "submitted" | "completed";
} & ({ kind: "recipient_selection"; body: Parameters<GuestStudyAccountingApi["selectCreditRecipient"]>[0]["body"] }
  | { kind: "owner_claim"; body: Parameters<GuestStudyAccountingApi["claimCredit"]>[0]["body"] });
const object = (v: unknown): v is object => typeof v === "object" && v !== null && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 128 && !/[\s\u0000-\u001f\u007f]/u.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
export function isOriginalOwnerStudyStart(v: unknown): v is OriginalOwnerStudyStart {
  if (!object(v) || Object.keys(v).length !== 9 || !("accountId" in v) || !("communityId" in v) || !("postId" in v)
    || !("body" in v) || !("disclosureText" in v) || typeof v.disclosureText !== "string" || v.disclosureText.length === 0 || v.disclosureText.length > 4096 || !("acceptedTerms" in v) || !("state" in v) || !("sessionId" in v) || !("inventory" in v)
    || !id(v.accountId) || !id(v.communityId) || !id(v.postId) || !isGuestRewardTerms(v.acceptedTerms)
    || v.acceptedTerms.community_id !== v.communityId || v.acceptedTerms.post_id !== v.postId) return false;
  const b = v.body;
  if (!object(b) || Object.keys(b).length !== 7 || !("idempotency_key" in b) || !("persona_id" in b)
    || !("target_language" in b) || !("learner_band" in b) || !("timezone" in b)
    || !("reward_preview_terms_hash" in b) || !("disclosure" in b) || !id(b.idempotency_key) || !id(b.persona_id)
    || !(b.target_language === null || id(b.target_language)) || !id(b.timezone) || !hash(b.reward_preview_terms_hash)
    || !(b.learner_band === null || ["A1", "A2", "B1", "B2", "C1", "C2"].some(band => band === b.learner_band))
    || ((b.target_language === null) !== (b.learner_band === null)) || !object(b.disclosure)
    || Object.keys(b.disclosure).length !== 2 || !("version" in b.disclosure) || !("accepted" in b.disclosure)
    || !id(b.disclosure.version) || b.disclosure.accepted !== true || b.disclosure.version !== v.acceptedTerms.disclosure_version) return false;
  if (!["submitted", "pending_confirmation", "completed", "not_started"].some(state => state === v.state)
    || !(v.sessionId === null || id(v.sessionId))) return false;
  if (v.inventory === null) return true;
  if (!object(v.inventory) || Object.keys(v.inventory).length !== 2 || !("initialized" in v.inventory)
    || v.inventory.initialized !== true || !("pending" in v.inventory) || v.sessionId === null) return false;
  const p = v.inventory.pending;
  return p === null || (object(p) && Object.keys(p).length === 3 && "sessionItemId" in p && "attemptNumber" in p
    && "idempotencyKey" in p && id(p.sessionItemId) && positive(p.attemptNumber) && id(p.idempotencyKey));
}
export function isOriginalOwnerCreditCommand(v: unknown): v is OriginalOwnerCreditCommand {
  if (!object(v) || Object.keys(v).length !== 5 || !("accountId" in v) || !("creditId" in v) || !("state" in v)
    || !("kind" in v) || !("body" in v) || !id(v.accountId) || !id(v.creditId)
    || (v.state !== "submitted" && v.state !== "completed") || !object(v.body) || Object.keys(v.body).length !== 2
    || !("idempotency_key" in v.body) || !id(v.body.idempotency_key)) return false;
  return v.kind === "recipient_selection" ? "persona_id" in v.body && id(v.body.persona_id)
    : v.kind === "owner_claim" && "selection_revision" in v.body && (v.body.selection_revision === null || positive(v.body.selection_revision));
}
