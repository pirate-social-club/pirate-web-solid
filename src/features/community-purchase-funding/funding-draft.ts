/**
 * Reload-safe, non-authentication state for the M3 community-purchase quote.
 *
 * This module deliberately stops at the quote boundary. `begin` is still
 * uncomposed on api-next, and the generated 0.8.0 client intake is a separate
 * release decision. The persisted draft is therefore useful now without
 * inventing an admission or wallet-transaction side effect.
 */

export const COMMUNITY_PURCHASE_FUNDING_DRAFT_KEY =
  "pirate.m3.community-purchase-funding.v1";

export interface CommunityPurchaseFundingIntent {
  readonly community_id: string;
  readonly listing_id: string;
}

export interface CommunityPurchaseFundingTerms {
  readonly chain_id: number;
  readonly token_contract: string;
  readonly token_decimals: 6;
  readonly sender: string;
  readonly recipient: string;
  readonly amount_atomic: string;
  readonly required_confirmations: number;
}

export interface CommunityPurchaseFundingQuote {
  readonly quote_id: string;
  readonly community_id: string;
  readonly listing_id: string;
  readonly policy_version: number;
  readonly quoted_at: string;
  readonly expires_at: string;
  readonly replayed: boolean;
  readonly funding: CommunityPurchaseFundingTerms;
}

export interface CommunityPurchaseFundingDraft {
  readonly version: 1;
  readonly intent: CommunityPurchaseFundingIntent;
  readonly quote: CommunityPurchaseFundingQuote;
  readonly saved_at: string;
}

export interface FundingDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface FundingQuoteClient {
  createQuote(intent: CommunityPurchaseFundingIntent): Promise<CommunityPurchaseFundingQuote>;
}

export type FundingDraftState =
  | { readonly kind: "empty" }
  | { readonly kind: "ready"; readonly draft: CommunityPurchaseFundingDraft }
  | { readonly kind: "expired"; readonly draft: CommunityPurchaseFundingDraft };

const MAX_STORAGE_BYTES = 32 * 1024;

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type PropertyValue = string | number | boolean | object | null | undefined;

function property(value: object, key: string): PropertyValue {
  const candidate: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
  if (
    candidate === null ||
    candidate === undefined ||
    typeof candidate === "string" ||
    typeof candidate === "number" ||
    typeof candidate === "boolean" ||
    typeof candidate === "object"
  ) {
    return candidate;
  }
  return undefined;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096;
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function parseIntent(value: unknown): CommunityPurchaseFundingIntent | null {
  if (!isObject(value)) return null;
  const communityId = property(value, "community_id");
  const listingId = property(value, "listing_id");
  return nonEmpty(communityId) && nonEmpty(listingId)
    ? { community_id: communityId, listing_id: listingId }
    : null;
}

function parseTerms(value: unknown): CommunityPurchaseFundingTerms | null {
  if (!isObject(value)) return null;
  const chainId = property(value, "chain_id");
  const tokenContract = property(value, "token_contract");
  const tokenDecimals = property(value, "token_decimals");
  const sender = property(value, "sender");
  const recipient = property(value, "recipient");
  const amountAtomic = property(value, "amount_atomic");
  const requiredConfirmations = property(value, "required_confirmations");
  return integer(chainId) &&
    nonEmpty(tokenContract) &&
    tokenDecimals === 6 &&
    nonEmpty(sender) &&
    nonEmpty(recipient) &&
    typeof amountAtomic === "string" &&
    /^[1-9][0-9]*$/u.test(amountAtomic) &&
    integer(requiredConfirmations)
    ? {
        chain_id: chainId,
        token_contract: tokenContract,
        token_decimals: 6,
        sender,
        recipient,
        amount_atomic: amountAtomic,
        required_confirmations: requiredConfirmations,
      }
    : null;
}

function parseQuote(value: unknown): CommunityPurchaseFundingQuote | null {
  if (!isObject(value)) return null;
  const quoteId = property(value, "quote_id");
  const communityId = property(value, "community_id");
  const listingId = property(value, "listing_id");
  const policyVersion = property(value, "policy_version");
  const quotedAt = property(value, "quoted_at");
  const expiresAt = property(value, "expires_at");
  const replayed = property(value, "replayed");
  const funding = parseTerms(property(value, "funding"));
  return nonEmpty(quoteId) &&
    nonEmpty(communityId) &&
    nonEmpty(listingId) &&
    integer(policyVersion) &&
    nonEmpty(quotedAt) &&
    nonEmpty(expiresAt) &&
    typeof replayed === "boolean" &&
    funding !== null
    ? {
        quote_id: quoteId,
        community_id: communityId,
        listing_id: listingId,
        policy_version: policyVersion,
        quoted_at: quotedAt,
        expires_at: expiresAt,
        replayed,
        funding,
      }
    : null;
}

function decodeDraft(value: unknown): CommunityPurchaseFundingDraft | null {
  if (!isObject(value) || property(value, "version") !== 1) return null;
  const intent = parseIntent(property(value, "intent"));
  const quote = parseQuote(property(value, "quote"));
  const savedAt = property(value, "saved_at");
  if (intent === null || quote === null || !nonEmpty(savedAt)) return null;
  if (quote.community_id !== intent.community_id || quote.listing_id !== intent.listing_id) {
    return null;
  }
  return { version: 1, intent, quote, saved_at: savedAt };
}

function sameIntent(
  left: CommunityPurchaseFundingIntent,
  right: CommunityPurchaseFundingIntent,
): boolean {
  return left.community_id === right.community_id && left.listing_id === right.listing_id;
}

function isExpired(quote: CommunityPurchaseFundingQuote, now: number): boolean {
  const expiry = Date.parse(quote.expires_at);
  return !Number.isFinite(expiry) || expiry <= now;
}

/** Use only in the browser; SSR must inject a request-safe storage seam. */
export function browserFundingDraftStorage(): FundingDraftStorage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export class CommunityPurchaseFundingDraftController {
  private readonly storage: FundingDraftStorage;
  private readonly client: FundingQuoteClient;
  private readonly now: () => number;
  private draft: CommunityPurchaseFundingDraft | null;

  constructor(options: {
    readonly storage: FundingDraftStorage;
    readonly client: FundingQuoteClient;
    readonly now?: () => number;
  }) {
    this.storage = options.storage;
    this.client = options.client;
    this.now = options.now ?? (() => Date.now());
    this.draft = this.readStoredDraft();
  }

  state(): FundingDraftState {
    if (this.draft === null) return { kind: "empty" };
    return isExpired(this.draft.quote, this.now())
      ? { kind: "expired", draft: this.draft }
      : { kind: "ready", draft: this.draft };
  }

  /**
   * Returns the persisted quote for the same intent without another request.
   * If the browser crashed after the server committed but before persistence,
   * the server's exact-replay rule makes the retry safe.
   */
  async createOrResumeQuote(
    intent: CommunityPurchaseFundingIntent,
  ): Promise<CommunityPurchaseFundingQuote> {
    const current = this.draft;
    if (current !== null && sameIntent(current.intent, intent) && !isExpired(current.quote, this.now())) {
      return current.quote;
    }

    const quote = await this.client.createQuote(intent);
    if (quote.community_id !== intent.community_id || quote.listing_id !== intent.listing_id) {
      throw new Error("Quote response does not match the requested intent");
    }
    if (isExpired(quote, this.now())) throw new Error("Quote is already expired");
    const draft: CommunityPurchaseFundingDraft = {
      version: 1,
      intent,
      quote,
      saved_at: new Date(this.now()).toISOString(),
    };
    // Local persistence is a reload aid, not part of the server transaction.
    // A quota/full/private-mode storage failure must not make a successfully
    // created server quote look like an API failure. Keep it in memory for the
    // current page; a later reload can safely retry via exact replay.
    try {
      this.storage.setItem(COMMUNITY_PURCHASE_FUNDING_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Deliberately best-effort; no auth or economic data is written anywhere
      // else as a fallback.
    }
    this.draft = draft;
    return quote;
  }

  clear(): void {
    this.storage.removeItem(COMMUNITY_PURCHASE_FUNDING_DRAFT_KEY);
    this.draft = null;
  }

  private readStoredDraft(): CommunityPurchaseFundingDraft | null {
    let raw: string | null;
    try {
      raw = this.storage.getItem(COMMUNITY_PURCHASE_FUNDING_DRAFT_KEY);
    } catch {
      return null;
    }
    if (raw === null || raw.length === 0 || raw.length > MAX_STORAGE_BYTES) return null;
    try {
      return decodeDraft(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}
