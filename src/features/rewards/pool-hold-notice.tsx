import { Show, createSignal, onSettled } from "solid-js";
import { createPublicApiClient, type PirateApiClient } from "../../api/client.ts";
import type { GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse } from "@pirate/api-client";

type Pool = GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse["pool"];

export const POOL_HOLD_NOTICE_COPY =
  "If your pool wins, your amount is held until you verify to claim it.";

/** Spec 015 §8.1: the notice belongs on an activity whose pool can still admit entries. */
export function poolHoldNoticeVisible(pool: Pool): boolean {
  return pool !== null && pool.leg_status === "active" && pool.offer_status === "active";
}

/**
 * Pre-activity notice required by Spec 015 §8.1 inside Study and Karaoke when
 * the song has an active Megapot pool. The pool read is public and
 * best-effort: a failed or unavailable read never blocks the activity, and
 * nothing renders until the projection is loaded.
 */
export function PoolHoldNotice(props: {
  readonly communityId: string;
  readonly postId: string;
  readonly client?: PirateApiClient;
}) {
  const [pool, setPool] = createSignal<Pool | undefined>(undefined);
  onSettled(() => {
    let cancelled = false;
    // The optional read belongs to the browser. Defer it past the settle
    // callback so even a synchronous client failure can safely update state.
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      try {
        const client = props.client ?? createPublicApiClient();
        const result = await client.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool({
          path: { communityId: props.communityId, postId: props.postId },
        });
        if (!cancelled) setPool(result.pool);
      } catch {
        if (!cancelled) setPool(null);
      }
    });
    return () => { cancelled = true; };
  });
  const visible = () => {
    const current = pool();
    return current !== undefined && poolHoldNoticeVisible(current);
  };
  return (
    <Show when={visible()}>
      <div class="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">
        <p
          class="rounded-xl border border-border-soft bg-card p-3 text-sm text-muted-foreground"
          data-pool-hold-notice="true"
        >
          {POOL_HOLD_NOTICE_COPY}
        </p>
      </div>
    </Show>
  );
}
