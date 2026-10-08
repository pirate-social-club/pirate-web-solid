import { ApiClientError } from "@pirate/api-client";
import { MegapotPoolUnavailableError } from "./megapot-pool-availability.ts";
import { afterEach, expect, it, vi } from "vitest";
import { createMegapotParticipantData } from "./megapot-participant-data.ts";
import { createPublicApiClient } from "./client.ts";
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
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

it("releases healthy cards concurrently after the first probe, despite a hung sibling", async () => {
  vi.stubGlobal("window", {});
  const first = setup(), slow = setup(), fast = setup();
  let releaseProbe!: () => void, releaseSlow!: () => void;
  first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { releaseProbe = resolve; });
    return { pool };
  });
  slow.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { releaseSlow = resolve; });
    return { pool };
  });
  const initial = first.data.pool(scope, first.signal);
  const hung = slow.data.pool(scope, slow.signal);
  const independent = fast.data.pool(scope, fast.signal);
  expect(fast.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).not.toHaveBeenCalled();
  releaseProbe();
  await initial;
  expect(await independent).toEqual(pool);
  expect(slow.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).toHaveBeenCalledOnce();
  // A later card also bypasses the still-pending sibling.
  expect(await fast.data.pool(scope, fast.signal)).toEqual(pool);
  releaseSlow();
  await hung;
});

it("allows one recovery probe after 30 seconds and resumes parallel reads on success", async () => {
  vi.stubGlobal("window", {});
  let now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const first = setup(), recovery = setup(), waiting = setup();
  first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockRejectedValueOnce(unavailable());
  await expect(first.data.pool(scope, first.signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  now = 30_999;
  await expect(recovery.data.pool(scope, recovery.signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  expect(recovery.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).not.toHaveBeenCalled();
  now = 31_000;
  let release!: () => void;
  recovery.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { pool };
  });
  const probe = recovery.data.pool(scope, recovery.signal);
  const queued = waiting.data.pool(scope, waiting.signal);
  expect(recovery.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).toHaveBeenCalledOnce();
  expect(waiting.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).not.toHaveBeenCalled();
  release();
  expect(await probe).toEqual(pool);
  expect(await queued).toEqual(pool);
});

it("renews the cooldown when recovery still reports an unavailable provider", async () => {
  vi.stubGlobal("window", {});
  let now = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const first = setup(), second = setup();
  first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockRejectedValue(unavailable());
  await expect(first.data.pool(scope, first.signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  now += 30_000;
  const results = await Promise.allSettled([first.data.pool(scope, first.signal), second.data.pool(scope, second.signal)]);
  expect(results.every(result => result.status === "rejected" && result.reason instanceof MegapotPoolUnavailableError)).toBe(true);
  now += 29_999;
  await expect(second.data.pool(scope, second.signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  expect(first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).toHaveBeenCalledTimes(2);
  expect(second.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).not.toHaveBeenCalled();
});

it("does not let a late healthy reply clear a newer outage", async () => {
  vi.stubGlobal("window", {});
  const first = setup(), slow = setup(), failing = setup();
  await first.data.pool(scope, first.signal);
  let release!: () => void;
  slow.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { pool };
  });
  const late = slow.data.pool(scope, slow.signal);
  failing.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockRejectedValueOnce(unavailable());
  await expect(failing.data.pool(scope, failing.signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  release();
  expect(await late).toEqual(pool);
  await expect(first.data.pool(scope, first.signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  expect(first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).toHaveBeenCalledOnce();
});

it("cancels a waiting card promptly without cancelling the first probe", async () => {
  vi.stubGlobal("window", {});
  const first = setup(), waiting = setup();
  let release!: () => void;
  first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { pool };
  });
  const initial = first.data.pool(scope, first.signal);
  const controller = new AbortController();
  const cancelled = waiting.data.pool(scope, controller.signal);
  controller.abort();
  await expect(cancelled).rejects.toThrow();
  expect(waiting.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool).not.toHaveBeenCalled();
  release();
  expect(await initial).toEqual(pool);
});

it("releases the initial probe on cancellation even if its transport ignores abort", async () => {
  vi.stubGlobal("window", {});
  const first = setup(), waiting = setup();
  let release!: () => void;
  first.publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { release = resolve; });
    throw unavailable();
  });
  const controller = new AbortController();
  const cancelled = first.data.pool(scope, controller.signal);
  const next = waiting.data.pool(scope, waiting.signal);
  controller.abort();
  await expect(cancelled).rejects.toThrow();
  expect(await next).toEqual(pool);
  release();
  expect(await waiting.data.pool(scope, waiting.signal)).toEqual(pool);
});

it("recognises the reply a disabled provider actually sends, through the generated client", async () => {
  vi.stubGlobal("window", {});
  // The body and status api-next staging returns for this route while Rewards is off.
  const fetchImpl = vi.fn(async () => new Response(
    JSON.stringify({ error: { code: "provider_unavailable", message: "Reward services are unavailable", retryable: true }, request_id: "request-1" }),
    { status: 502, headers: { "content-type": "application/json; charset=UTF-8" } },
  ));
  const data = createMegapotParticipantData(createPublicApiClient({ origin: "https://app.example", fetchImpl }), setup().sessionClient);
  await expect(data.pool(scope, new AbortController().signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  expect(fetchImpl).toHaveBeenCalledOnce();
  await expect(data.pool(scope, new AbortController().signal)).rejects.toBeInstanceOf(MegapotPoolUnavailableError);
  expect(fetchImpl).toHaveBeenCalledOnce();
});
