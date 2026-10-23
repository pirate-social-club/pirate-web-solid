import { type GetCommunitiesCommunityIdPostsPostIdMegapotParticipationResponse, type PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "./client.ts";
import { captureSessionAuthority, isCurrentSessionAuthority } from "./browser-session-events.ts";
import { MegapotParticipantSignedOutError, type ParticipantScope } from "./megapot-participant-data.ts";
import { onSessionCleared, onSessionRefreshed, resolveAccountSession, type AccountSessionResolution } from "./session.ts";
import { assertSharedSongParticipation } from "./shared-song-participation-validation.ts";

export type SharedSongParticipation = NonNullable<GetCommunitiesCommunityIdPostsPostIdMegapotParticipationResponse>;
export type SharedSongDrawing = SharedSongParticipation["drawings"][number];
export interface SharedSongParticipationData {
  read(scope: ParticipantScope, signal: AbortSignal): Promise<SharedSongParticipation | null>;
}
type Client = Pick<PirateApiClient, "get_usersMe" | "get_communitiesCommunityIdPostsPostIdMegapotParticipation">;

/** Account-only read: no persona, membership, wallet, cache or persistence. */
export function createSharedSongParticipationData(
  suppliedClient?: Client,
  resolveAccount: (() => Promise<AccountSessionResolution>) | undefined = suppliedClient ? undefined : () => resolveAccountSession(),
): SharedSongParticipationData {
  let client = suppliedClient;
  return {
    async read(scope, signal) {
      let invalidated = false;
      const invalidate = () => { invalidated = true; };
      const cleared = onSessionCleared(invalidate), refreshed = onSessionRefreshed(invalidate);
      try {
        const account = await resolveAccount?.();
        signal.throwIfAborted();
        if (account === "anonymous") throw new MegapotParticipantSignedOutError();
        const authority = captureSessionAuthority();
        const assertCurrent = () => {
          signal.throwIfAborted();
          if (invalidated || (!suppliedClient && !isCurrentSessionAuthority(authority))) throw new Error("reward_account_changed");
        };
        assertCurrent();
        const session = client ??= createSessionApiClient({ fetchImpl: (input, init) => fetch(input, { ...init, cache: "no-store" }) });
        const before = await session.get_usersMe(undefined, { signal });
        assertCurrent();
        if (account && before.id !== account.userId) throw new Error("reward_account_changed");
        const participation = await session.get_communitiesCommunityIdPostsPostIdMegapotParticipation({ path: scope }, { signal });
        assertCurrent();
        const after = await session.get_usersMe(undefined, { signal });
        assertCurrent();
        if (before.id !== after.id) throw new Error("reward_account_changed");
        if (participation && (participation.target.community_id !== scope.communityId || participation.target.post_id !== scope.postId)) throw new Error("reward_song_changed");
        if (participation) assertSharedSongParticipation(participation);
        // A decoded null is an accessible song without a committed shared pot.
        // A 404, unavailable provider or failed decoder remains a failure.
        return participation;
      } finally { cleared(); refreshed(); }
    },
  };
}
