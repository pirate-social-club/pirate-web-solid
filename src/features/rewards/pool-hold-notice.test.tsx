import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import type { GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse } from "@pirate/api-client";
import {
  POOL_HOLD_NOTICE_COPY,
  PoolHoldNotice,
  poolHoldNoticeVisible,
} from "./pool-hold-notice.tsx";

type Pool = GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse["pool"];

const pool = (legStatus: Pool extends null ? never : NonNullable<Pool>["leg_status"]): Pool =>
  // SAFETY: the literal below carries every projection field with literal values.
  ({
    object: "song_megapot_pool_projection",
    offer_id: "offer-1",
    leg_id: "leg-1",
    community_id: "community-1",
    post_id: "post-1",
    offer_status: "active",
    leg_status: legStatus,
    chain_id: 84532,
    token_address: "0x0000000000000000000000000000000000000001",
    token_decimals: 6,
    funded_atomic: "1000000",
    available_budget_atomic: "1000000",
    max_ticket_price_atomic: "5000",
    entry_cutoff_seconds: 600,
    eligible_activities: ["study", "karaoke"],
    min_score_bps: 7000,
    empty_pool_policy: "no_purchase",
    qualification_policies: null,
    allocation_rule: "equal_v1",
    ticket_custody: "pirate",
    winnings_basis: "net_of_referral_win_share",
    fallback_disclosure: null,
    drawing: null,
  }) as Pool;

const client = (result: () => Promise<{ readonly pool: Pool }>) =>
  // SAFETY: the returned fake is asserted into the client type at its single use below.
  ({
  get_communitiesCommunityIdPostsPostIdRewardsMegapotPool: vi.fn(async () => result()),
});

const disposers: (() => void)[] = [];

const mount = (poolResult: () => Promise<{ readonly pool: Pool }>) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  // SAFETY: the fake exposes only the pool read, which is all the notice calls.
  const fakeClient = client(poolResult) as never;
  createRoot(dispose => {
    disposers.push(dispose);
    render(
      () => (
        <PoolHoldNotice client={fakeClient} communityId="community-1" postId="post-1" />
      ),
      host,
    );
  });
  return host;
};

afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("shows the §8.1 hold notice while the pool leg can admit entries", async () => {
  const host = mount(async () => ({ pool: pool("active") }));
  await vi.waitFor(() =>
    expect(host.querySelector("[data-pool-hold-notice]")?.textContent).toBe(POOL_HOLD_NOTICE_COPY),
  );
});

it("renders nothing without a pool, for a terminal leg, or when the read fails", async () => {
  expect(poolHoldNoticeVisible(null)).toBe(false);
  expect(poolHoldNoticeVisible(pool("ended"))).toBe(false);
  expect(poolHoldNoticeVisible(pool("draft"))).toBe(false);
  const missing = mount(async () => ({ pool: null }));
  const failed = mount(async () => {
    throw new Error("offline");
  });
  await vi.waitFor(() =>
    expect(missing.querySelector("[data-pool-hold-notice]")).toBeNull(),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(failed.querySelector("[data-pool-hold-notice]")).toBeNull();
});

it("keeps the activity available when constructing the optional client fails", async () => {
  vi.stubGlobal("location", undefined);
  const host = document.createElement("div");
  document.body.appendChild(host);
  expect(() => createRoot(dispose => {
    disposers.push(dispose);
    render(() => <>
      <PoolHoldNotice communityId="community-1" postId="post-1" />
      <p>Activity available</p>
    </>, host);
  })).not.toThrow();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.textContent).toBe("Activity available");
  expect(host.querySelector("[data-pool-hold-notice]")).toBeNull();
});

it("ignores a pool read that resolves after the activity is disposed", async () => {
  let resolvePool: (value: { readonly pool: Pool }) => void = () => {};
  const read = vi.fn(() => new Promise<{ readonly pool: Pool }>(resolve => { resolvePool = resolve; }));
  const host = mount(read);
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
  disposers.splice(0).forEach(dispose => dispose());
  resolvePool({ pool: pool("active") });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.querySelector("[data-pool-hold-notice]")).toBeNull();
});
