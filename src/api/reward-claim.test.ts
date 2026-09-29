import { describe, expect, it, vi } from "vitest";
import { createRewardClaimData } from "./reward-claim.ts";
import type { RewardCredit } from "./reward-claim.ts";

const credit = (index: number): RewardCredit =>
  // SAFETY: the literal below carries every RewardCredit field with literal values.
  ({
    object: "reward_credit",
    credit_id: `credit-${index}`,
    payout_persona_id: "persona-1",
    chain_id: 84532,
    token_address: "0x0000000000000000000000000000000000000001",
    token_decimals: 6,
    amount_atomic: "1000000",
    available_atomic: "1000000",
    reserved_atomic: "0",
    paid_atomic: "0",
    source_kind: "megapot_allocation",
    state: "credited",
    created_at: "2026-09-29T00:00:00.000Z",
    updated_at: "2026-09-29T00:00:00.000Z",
    settled_at: null,
    claim: null,
    send: null,
  }) as RewardCredit;

const client = (pages: readonly (readonly RewardCredit[])[]) => {
  let cursor = 0;
  return {
    get_rewardsCredits: vi.fn(async () => {
      const index = cursor;
      cursor += 1;
      const items = pages[index] ?? [];
      const next = index + 1 < pages.length ? `cursor-${index + 1}` : null;
      return { object: "reward_credit_list" as const, items, next_cursor: next };
    }),
  };
};

describe("reward credit pagination", () => {
  it("returns every credit past the previous twenty-page bound", async () => {
    const pages = Array.from({ length: 25 }, (_, page) =>
      Array.from({ length: 100 }, (_, item) => credit(page * 100 + item)),
    );
    const data = createRewardClaimData(
      // SAFETY: the fake exposes only get_rewardsCredits, which is all credits() reads.
      client(pages) as never,
    );
    const result = await data.credits();
    expect(result.items).toHaveLength(2_500);
    expect(result.items.at(-1)?.credit_id).toBe("credit-2499");
    expect(result.next_cursor).toBeNull();
  });

  it("stops at the first null cursor", async () => {
    const data = createRewardClaimData(
      // SAFETY: the fake exposes only get_rewardsCredits, which is all credits() reads.
      client([Array.from({ length: 3 }, (_, i) => credit(i))]) as never,
    );
    const result = await data.credits();
    expect(result.items).toHaveLength(3);
  });

  it("fails loudly on a repeated cursor instead of looping or truncating", async () => {
    let calls = 0;
    const looping = {
      get_rewardsCredits: vi.fn(async () => {
        calls += 1;
        return {
          object: "reward_credit_list" as const,
          items: [credit(calls)],
          next_cursor: "cursor-stuck",
        };
      }),
    };
    const data = createRewardClaimData(
      // SAFETY: the fake exposes only get_rewardsCredits, which is all credits() reads.
      looping as never,
    );
    await expect(data.credits()).rejects.toThrow("reward_credit_cursor_repeated");
    expect(calls).toBe(2);
  });
});
