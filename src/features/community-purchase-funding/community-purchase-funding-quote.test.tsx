import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { JSX } from "@solidjs/web";

import { CommunityPurchaseFundingQuote } from "./community-purchase-funding-quote";
import type {
  CommunityPurchaseFundingQuote as FundingQuote,
  FundingDraftStorage,
  FundingQuoteClient,
} from "./funding-draft";

const disposers: Array<() => void> = [];

interface MountedUi {
  readonly container: HTMLElement;
  readonly dispose: () => void;
}

function render(ui: () => JSX.Element): MountedUi {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let rootDispose = () => {};
  createRoot(dispose => {
    rootDispose = dispose;
    solidRender(ui, container);
  });
  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    rootDispose();
    container.remove();
  };
  disposers.push(dispose);
  return { container, dispose };
}

function storage(): FundingDraftStorage {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; },
  };
}

function quote(overrides: Partial<FundingQuote> = {}): FundingQuote {
  return {
    quote_id: "quote-1",
    community_id: "community-1",
    listing_id: "listing-1",
    policy_version: 3,
    quoted_at: "2026-08-19T09:00:00.000Z",
    expires_at: "2026-08-19T09:10:00.000Z",
    replayed: false,
    funding: {
      chain_id: 8453,
      token_contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      token_decimals: 6,
      sender: "0x769a00000000000000000000000000000000ca15",
      recipient: "0x1111000000000000000000000000000000001111",
      amount_atomic: "12500000",
      required_confirmations: 3,
    },
    ...overrides,
  };
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("CommunityPurchaseFundingQuote", () => {
  test("requests only intent, renders server-derived terms, and never starts admission", async () => {
    const requests: Array<{ community_id: string; listing_id: string }> = [];
    const client: FundingQuoteClient = {
      createQuote: async intent => {
        requests.push(intent);
        return quote();
      },
    };
    const mounted = render(() => (
      <CommunityPurchaseFundingQuote
        communityId="community-1"
        listingId="listing-1"
        client={client}
        storage={storage()}
        now={() => Date.parse("2026-08-19T09:01:00.000Z")}
      />
    ));

    expect(mounted.container.querySelector("[data-funding-quote-state='idle']")).not.toBeNull();
    mounted.container.querySelector("button")?.click();
    await vi.waitFor(() => expect(mounted.container.querySelector("[data-funding-quote-result]")).not.toBeNull());

    expect(requests).toEqual([{ community_id: "community-1", listing_id: "listing-1" }]);
    expect(mounted.container.textContent).toContain("12.5 atomic units");
    expect(mounted.container.textContent).toContain("8453");
    expect(mounted.container.textContent).toContain("Quote quote-1");
    expect(mounted.container.textContent).not.toContain("Begin");
  });

  test("restores a saved quote after remount without another request", async () => {
    const savedStorage = storage();
    let requestCount = 0;
    const client: FundingQuoteClient = {
      createQuote: async () => {
        requestCount += 1;
        return quote();
      },
    };
    const first = render(() => (
      <CommunityPurchaseFundingQuote
        communityId="community-1"
        listingId="listing-1"
        client={client}
        storage={savedStorage}
        now={() => Date.parse("2026-08-19T09:01:00.000Z")}
      />
    ));
    first.container.querySelector("button")?.click();
    await vi.waitFor(() => expect(first.container.querySelector("[data-funding-quote-result]")).not.toBeNull());
    first.dispose();

    const second = render(() => (
      <CommunityPurchaseFundingQuote
        communityId="community-1"
        listingId="listing-1"
        client={client}
        storage={savedStorage}
        now={() => Date.parse("2026-08-19T09:02:00.000Z")}
      />
    ));
    await vi.waitFor(() => expect(second.container.querySelector("[data-funding-quote-result]")).not.toBeNull());
    expect(requestCount).toBe(1);
    expect(second.container.textContent).toContain("Quote quote-1");
  });

  test("shows an explicit refresh action for an expired saved quote", async () => {
    const savedStorage = storage();
    const client: FundingQuoteClient = { createQuote: async () => quote({ replayed: true }) };
    const first = render(() => (
      <CommunityPurchaseFundingQuote
        communityId="community-1"
        listingId="listing-1"
        client={client}
        storage={savedStorage}
        now={() => Date.parse("2026-08-19T09:01:00.000Z")}
      />
    ));
    first.container.querySelector("button")?.click();
    await vi.waitFor(() => expect(first.container.querySelector("[data-funding-quote-result]")).not.toBeNull());
    first.dispose();

    const expired = render(() => (
      <CommunityPurchaseFundingQuote
        communityId="community-1"
        listingId="listing-1"
        client={client}
        storage={savedStorage}
        now={() => Date.parse("2026-08-19T09:11:00.000Z")}
      />
    ));
    await vi.waitFor(() => expect(expired.container.textContent).toContain("Refresh expired quote"));
    expect(expired.container.querySelector("[data-funding-quote-result]")).toBeNull();
  });
});
