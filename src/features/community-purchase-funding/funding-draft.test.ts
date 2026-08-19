import { describe, expect, test } from "vitest";
import {
  COMMUNITY_PURCHASE_FUNDING_DRAFT_KEY,
  CommunityPurchaseFundingDraftController,
  type CommunityPurchaseFundingQuote,
  type FundingDraftStorage,
} from "./funding-draft";

const INTENT = { community_id: "staging-commerce-raw", listing_id: "staging-listing-raw-1" } as const;

const QUOTE: CommunityPurchaseFundingQuote = {
  quote_id: "quote_1",
  community_id: INTENT.community_id,
  listing_id: INTENT.listing_id,
  policy_version: 1,
  quoted_at: "2026-08-19T10:00:00.000Z",
  expires_at: "2026-08-19T10:10:00.000Z",
  replayed: false,
  funding: {
    chain_id: 8453,
    token_contract: "0x833589fC...2913",
    token_decimals: 6,
    sender: "0x769a4b7def3190eefacb783d2434825c8acbca15",
    recipient: "0x1111111111111111111111111111111111111111",
    amount_atomic: "12500000",
    required_confirmations: 3,
  },
};

function storage(seed?: string): FundingDraftStorage {
  let value = seed ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; },
  };
}

describe("CommunityPurchaseFundingDraftController", () => {
  test("persists a quote and resumes it after a reload without another request", async () => {
    let calls = 0;
    const firstStorage = storage();
    const client = { createQuote: async () => { calls += 1; return QUOTE; } };
    const first = new CommunityPurchaseFundingDraftController({
      storage: firstStorage,
      client,
      now: () => Date.parse("2026-08-19T10:01:00.000Z"),
    });

    await expect(first.createOrResumeQuote(INTENT)).resolves.toEqual(QUOTE);
    expect(calls).toBe(1);

    const persisted = firstStorage.getItem(COMMUNITY_PURCHASE_FUNDING_DRAFT_KEY);
    const afterReload = new CommunityPurchaseFundingDraftController({
      storage: storage(persisted ?? undefined),
      client,
      now: () => Date.parse("2026-08-19T10:02:00.000Z"),
    });
    await expect(afterReload.createOrResumeQuote(INTENT)).resolves.toEqual(QUOTE);
    expect(calls).toBe(1);
    expect(afterReload.state()).toMatchObject({ kind: "ready" });
  });

  test("retries safely when the browser crashed before saving the server response", async () => {
    let calls = 0;
    const client = {
      createQuote: async () => {
        calls += 1;
        return { ...QUOTE, replayed: calls > 1 };
      },
    };
    const controller = new CommunityPurchaseFundingDraftController({
      storage: storage(),
      client,
      now: () => Date.parse("2026-08-19T10:01:00.000Z"),
    });
    const first = await controller.createOrResumeQuote(INTENT);
    expect(first.replayed).toBe(false);
    controller.clear();
    const replay = await controller.createOrResumeQuote(INTENT);
    expect(replay.quote_id).toBe(first.quote_id);
    expect(replay.replayed).toBe(true);
    expect(calls).toBe(2);
  });

  test("keeps a successful quote usable when local persistence is unavailable", async () => {
    let calls = 0;
    const failingStorage: FundingDraftStorage = {
      getItem: () => null,
      setItem: () => { throw new Error("storage quota exceeded"); },
      removeItem: () => undefined,
    };
    const client = {
      createQuote: async () => {
        calls += 1;
        return { ...QUOTE, replayed: calls > 1 };
      },
    };
    const currentPage = new CommunityPurchaseFundingDraftController({
      storage: failingStorage,
      client,
      now: () => Date.parse("2026-08-19T10:01:00.000Z"),
    });
    await expect(currentPage.createOrResumeQuote(INTENT)).resolves.toMatchObject({ quote_id: "quote_1" });
    expect(currentPage.state()).toMatchObject({ kind: "ready" });

    const afterReload = new CommunityPurchaseFundingDraftController({
      storage: failingStorage,
      client,
      now: () => Date.parse("2026-08-19T10:02:00.000Z"),
    });
    await expect(afterReload.createOrResumeQuote(INTENT)).resolves.toMatchObject({ replayed: true });
    expect(calls).toBe(2);
  });

  test("discards malformed, mismatched, oversized, and expired drafts", () => {
    const malformed = storage(JSON.stringify({ version: 1, intent: INTENT }));
    expect(new CommunityPurchaseFundingDraftController({
      storage: malformed,
      client: { createQuote: async () => QUOTE },
    }).state()).toEqual({ kind: "empty" });

    const mismatched = storage(JSON.stringify({
      version: 1,
      intent: INTENT,
      quote: { ...QUOTE, community_id: "different-community" },
      saved_at: "2026-08-19T09:00:00.000Z",
    }));
    expect(new CommunityPurchaseFundingDraftController({
      storage: mismatched,
      client: { createQuote: async () => QUOTE },
    }).state()).toEqual({ kind: "empty" });

    const oversized = storage("x".repeat(32 * 1024 + 1));
    expect(new CommunityPurchaseFundingDraftController({
      storage: oversized,
      client: { createQuote: async () => QUOTE },
    }).state()).toEqual({ kind: "empty" });

    const expired = storage(JSON.stringify({
      version: 1,
      intent: INTENT,
      quote: { ...QUOTE, expires_at: "2026-08-19T09:59:00.000Z" },
      saved_at: "2026-08-19T09:00:00.000Z",
    }));
    expect(new CommunityPurchaseFundingDraftController({
      storage: expired,
      client: { createQuote: async () => QUOTE },
      now: () => Date.parse("2026-08-19T10:00:00.000Z"),
    }).state()).toMatchObject({ kind: "expired" });
  });
});
