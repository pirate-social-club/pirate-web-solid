import { ApiClientError } from "@pirate/api-client";
import { MegapotPoolUnavailableError } from "./megapot-pool-availability.ts";
import { afterEach, expect, it, vi } from "vitest";
import { createMegapotParticipantData } from "./megapot-participant-data.ts";
import { participantPool as pool, participantStanding as standing } from "../features/rewards/megapot-participant.fixtures.ts";
const scope = { communityId: "community-1", postId: "post-1" };
function setup() {
  const publicClient = { get_communitiesCommunityIdPostsPostIdRewardsMegapotPool: vi.fn(async () => ({ pool })) };
  const sessionClient = {
    // SAFETY: only the account ID is consumed by this data adapter.
    get_usersMe: vi.fn(async () => ({ id: "account-1" }) as never),
    get_rewardOfferLegsLegIdStanding: vi.fn(async () => ({ standing })),
  };
  return { publicClient, sessionClient, data: createMegapotParticipantData(publicClient, sessionClient), signal: new AbortController().signal };
}
it("uses only the public client for discovery and fences private standing with account and drawing readback", async () => {
  const { data, signal, publicClient, sessionClient } = setup();
  expect(await data.pool(scope, signal)).toEqual(pool);
  expect(sessionClient.get_usersMe).not.toHaveBeenCalled();
  expect(await data.standing(scope, pool, signal)).toEqual({ pool, standing });
  expect(sessionClient.get_usersMe).toHaveBeenCalledTimes(2);
  expect(publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).toHaveBeenLastCalledWith({ path: scope }, { signal });
});
it("discards standing if the account changes during the read", async () => {
  const { data, signal, sessionClient } = setup();
  // SAFETY: the adapter reads only id from these deliberately different accounts.
  sessionClient.get_usersMe.mockResolvedValueOnce({ id: "first" } as never).mockResolvedValueOnce({ id: "second" } as never);
  await expect(data.standing(scope, pool, signal)).rejects.toThrow("reward_account_changed");
});
it.each(["drawing", "leg", "standing", "song"])("discards a changed %s instead of confirming an unrelated share", async kind => {
  const { data, signal, publicClient, sessionClient } = setup();
  if (kind === "drawing") publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockResolvedValue({ pool: { ...pool, drawing: { ...pool.drawing!, drawing_id: "43" } } });
  if (kind === "leg") publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockResolvedValue({ pool: { ...pool, leg_id: "new-leg" } });
  if (kind === "song") publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockResolvedValue({ pool: { ...pool, post_id: "other-song" } });
  if (kind === "standing") sessionClient.get_rewardOfferLegsLegIdStanding.mockResolvedValue({ standing: { ...standing, drawing_id: "43" } });
  await expect(data.standing(scope, pool, signal)).rejects.toThrow();
});
it("preserves failed reads and discards aborted replies", async () => {
  const { data, publicClient } = setup();
  publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockRejectedValueOnce(new Error("offline"));
  await expect(data.pool(scope, new AbortController().signal)).rejects.toThrow("offline");
  await expect(data.pool(scope, AbortSignal.abort())).rejects.toThrow();
});

const unavailable = () => new ApiClientError(
  { status: 502, code: "provider_unavailable", name: "ProviderUnavailable", retryable: true },
  { error: { code: "provider_unavailable", message: "Reward services are unavailable", retryable: true } },
);
afterEach(() => vi.unstubAllGlobals());

it("sends one probe for concurrent cards and stops later factories on the same page after 502", async () => {
  vi.stubGlobal("window", {});
  const first = setup(), second = setup();
  let release!: () => void;
  first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { release = resolve; });
    throw unavailable();
  });
  const pending = Promise.allSettled([
    first.data.pool(scope, first.signal), second.data.pool(scope, second.signal),
  ]);
  await vi.waitFor(() => expect(first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).toHaveBeenCalledOnce());
  expect(second.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).not.toHaveBeenCalled();
  release();
  expect((await pending).every(result => result.status === "rejected" && result.reason instanceof MegapotPoolUnavailableError)).toBe(true);
  const later = setup();
  await expect(later.data.pool(scope, later.signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  expect(later.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).not.toHaveBeenCalled();
  expect(first.sessionClient.get_usersMe).not.toHaveBeenCalled();
  // A new document gets a fresh availability probe.
  vi.stubGlobal("window", {});
  const nextPage = setup();
  expect(await nextPage.data.pool(scope, nextPage.signal)).toEqual(pool);
});

it("does not let a failed server-side instance disable another request", async () => {
  const first = setup(), second = setup();
  first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockRejectedValueOnce(unavailable());
  await expect(first.data.pool(scope, first.signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  expect(await second.data.pool(scope, second.signal)).toEqual(pool);
});

it("keeps enabled reads working after an absent pool or aborted queued card", async () => {
  vi.stubGlobal("window", {});
  const first = setup(), second = setup();
  let release!: () => void;
  first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { pool };
  });
  const controller = new AbortController();
  const pending = Promise.allSettled([
    first.data.pool(scope, first.signal), second.data.pool(scope, controller.signal),
  ]);
  await vi.waitFor(() => expect(first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).toHaveBeenCalledOnce());
  controller.abort();
  release();
  const results = await pending;
  expect(results[0].status).toBe("fulfilled");
  expect(results[1].status).toBe("rejected");
  expect(second.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).not.toHaveBeenCalled();
  const absent = createMegapotParticipantData({ get_communitiesCommunityIdPostsPostIdRewardsMegapotPool: async () => ({ pool: null }) }, second.sessionClient);
  expect(await absent.pool(scope, second.signal)).toBeNull();
  expect(await second.data.pool(scope, second.signal)).toEqual(pool);
});
