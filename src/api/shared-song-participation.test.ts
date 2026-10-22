import { ApiClientError } from "@pirate/api-client";
import { afterEach, expect, it, vi } from "vitest";
import { createSharedSongParticipationData } from "./shared-song-participation.ts";
import { MegapotParticipantSignedOutError } from "./megapot-participant-data.ts";
import { clearSession, refreshSession } from "./session.ts";
import { createSessionApiClient } from "./client.ts";
import { sharedSongParticipationFixture } from "../features/rewards/shared-song-participation.fixtures.ts";

const scope = { communityId: "test-community", postId: "test-song" };
function setup() {
  const participation = sharedSongParticipationFixture();
  const client = {
    // SAFETY: this adapter consumes only the account ID.
    get_usersMe: vi.fn(async () => ({ id: "test-account" }) as never),
    get_communitiesCommunityIdPostsPostIdMegapotParticipation: vi.fn(async () => participation),
  };
  return { participation, client, data: createSharedSongParticipationData(client), controller: new AbortController() };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("reads exact history between account proofs without requiring a persona, membership or wallet", async () => {
  const { data, participation, client, controller } = setup();
  await expect(data.read(scope, controller.signal)).resolves.toEqual(participation);
  expect(client.get_usersMe).toHaveBeenCalledTimes(2);
  expect(client.get_communitiesCommunityIdPostsPostIdMegapotParticipation).toHaveBeenCalledExactlyOnceWith({ path: scope }, { signal: controller.signal });
});
it("omits a known signed-out account without requesting private history", async () => {
  const { client, controller } = setup();
  const data = createSharedSongParticipationData(client, async () => "anonymous");
  await expect(data.read(scope, controller.signal)).rejects.toBeInstanceOf(MegapotParticipantSignedOutError);
  expect(client.get_usersMe).not.toHaveBeenCalled();
  expect(client.get_communitiesCommunityIdPostsPostIdMegapotParticipation).not.toHaveBeenCalled();
});
it("rejects an account change before or after the private read", async () => {
  const first = setup();
  const data = createSharedSongParticipationData(first.client, async () => ({ status: "authenticated", userId: "other-account" }));
  await expect(data.read(scope, first.controller.signal)).rejects.toThrow("reward_account_changed");
  expect(first.client.get_communitiesCommunityIdPostsPostIdMegapotParticipation).not.toHaveBeenCalled();
  const second = setup();
  // SAFETY: same account-ID-only test double as setup.
  second.client.get_usersMe.mockResolvedValueOnce({ id: "first" } as never).mockResolvedValueOnce({ id: "second" } as never);
  await expect(second.data.read(scope, second.controller.signal)).rejects.toThrow("reward_account_changed");
});
it.each(["community_id", "post_id"] as const)("refuses a response for a different %s", async field => {
  const { data, client, participation, controller } = setup();
  client.get_communitiesCommunityIdPostsPostIdMegapotParticipation.mockResolvedValue({ ...participation, target: { ...participation.target, [field]: "other" } });
  await expect(data.read(scope, controller.signal)).rejects.toThrow("reward_song_changed");
});
it.each(["refresh", "sign-out", "abort"])("discards a delayed private read after %s even if transport ignores cancellation", async transition => {
  const { data, client, participation, controller } = setup();
  let finish!: () => void;
  client.get_communitiesCommunityIdPostsPostIdMegapotParticipation.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { finish = resolve; }); return participation;
  });
  const pending = data.read(scope, controller.signal); const outcome = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  if (transition === "refresh") refreshSession();
  else if (transition === "sign-out") clearSession();
  else controller.abort();
  finish(); await outcome;
  expect(client.get_usersMe).toHaveBeenCalledOnce();
});
it("keeps a decoded empty pot distinct from not found, disabled service and a malformed response", async () => {
  const { client, controller, participation } = setup();
  const emptyClient = { ...client, get_communitiesCommunityIdPostsPostIdMegapotParticipation: vi.fn(async () => null) };
  await expect(createSharedSongParticipationData(emptyClient).read(scope, controller.signal)).resolves.toBeNull();
  for (const error of [
    new ApiClientError({ status: 404, code: "not_found", name: "NotFound", retryable: false }, { error: { code: "not_found", message: "not found", retryable: false } }),
    new ApiClientError({ status: 502, code: "provider_unavailable", name: "ProviderUnavailable", retryable: true }, { error: { code: "provider_unavailable", message: "off", retryable: true } }), new Error("decode failed"),
  ]) {
    client.get_communitiesCommunityIdPostsPostIdMegapotParticipation.mockRejectedValueOnce(error);
    await expect(createSharedSongParticipationData(client).read(scope, controller.signal)).rejects.toBe(error);
  }
  client.get_communitiesCommunityIdPostsPostIdMegapotParticipation.mockResolvedValue(participation);
  await expect(createSharedSongParticipationData(client).read(scope, controller.signal)).resolves.toEqual(participation);
});
it("uses the genuine decoder through the same-origin session proxy and rejects a numeric Dance floor", async () => {
  const { participation, controller } = setup();
  let malformed = false;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/users/me")) return new Response(JSON.stringify({ id: "test-account" }));
    const body = malformed ? { ...participation, qualification_rules: participation.qualification_rules.map(row => row.binding.activity === "dance" ? { ...row, binding: { ...row.binding, numeric_floor_bps: 8000 } } : row) } : participation;
    return new Response(JSON.stringify(body));
  });
  // The generated users/me decoder correctly needs its complete response;
  // retain a minimal identity double while exercising the real private decoder.
  const real = createSessionApiClient({ origin: "https://fixture.invalid", fetchImpl });
  // SAFETY: the identity double exposes only the account ID consumed here.
  const data = createSharedSongParticipationData({ get_usersMe: async () => ({ id: "test-account" }) as never, get_communitiesCommunityIdPostsPostIdMegapotParticipation: real.get_communitiesCommunityIdPostsPostIdMegapotParticipation });
  await expect(data.read(scope, controller.signal)).resolves.toEqual(participation);
  expect(String(fetchImpl.mock.calls[0][0])).toBe("https://fixture.invalid/api/communities/test-community/posts/test-song/megapot-participation");
  malformed = true;
  await expect(data.read(scope, controller.signal)).rejects.toThrow();
});
