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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096;
}

function isIntent(value: unknown): value is CommunityPurchaseFundingIntent {
  return isRecord(value) && nonEmpty(value.community_id) && nonEmpty(value.listing_id);
}

function isTerms(value: unknown): value is CommunityPurchaseFundingTerms {
  return (
    isRecord(value) &&
    Number.isInteger(value.chain_id) &&
    nonEmpty(value.token_contract) &&
    value.token_decimals === 6 &&
    nonEmpty(value.sender) &&
    nonEmpty(value.recipient) &&
    /^[1-9][0-9]*$/u.test(String(value.amount_atomic)) &&
    Number.isInteger(value.required_confirmations)
  );
}

function isQuote(value: unknown): value is CommunityPurchaseFundingQuote {
  return (
    isRecord(value) &&
    nonEmpty(value.quote_id) &&
    nonEmpty(value.community_id) &&
    nonEmpty(value.listing_id) &&
    Number.isInteger(value.policy_version) &&
    nonEmpty(value.quoted_at) &&
    nonEmpty(value.expires_at) &&
    typeof value.replayed === "boolean" &&
    isTerms(value.funding)
  );
}

function decodeDraft(value: unknown): CommunityPurchaseFundingDraft | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isIntent(value.intent) ||
    !isQuote(value.quote) ||
    !nonEmpty(value.saved_at)
  ) {
    return null;
  }
  if (
    value.quote.community_id !== value.intent.community_id ||
    value.quote.listing_id !== value.intent.listing_id
  ) {
    return null;
  }
  return value as unknown as CommunityPurchaseFundingDraft;
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
    this.storage.setItem(COMMUNITY_PURCHASE_FUNDING_DRAFT_KEY, JSON.stringify(draft));
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
