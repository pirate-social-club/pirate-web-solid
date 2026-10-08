import { For, Show, createEffect, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle, RewardPill } from "../../../design-system.ts";
import { readSongActivityRewards, songActivityRewards, type SongActivityRewards } from "../public-post/song-activities-rewards.ts";
import type { SongAttributionLinkResolver } from "../song-attribution/song-attribution.ts";

/** Public reward discovery belongs to the app, never the media renderer.
 * Song ownership comes from its canonical read, not the video community. */
export function createHomeFeedRewards(input: {
  readonly songs: () => readonly string[];
  readonly scope: () => string;
  readonly songForPost: (postId: string) => string | undefined;
  readonly resolveLink: SongAttributionLinkResolver;
  readonly readRewards: typeof readSongActivityRewards;
}) {
  const [data, setData] = createSignal<ReadonlyMap<string, SongActivityRewards>>(new Map());
  const [now, setNow] = createSignal(Date.now());
  const [selection, setSelection] = createSignal<{ songId: string; rewardId: string; postId: string }>();
  let scope: string | undefined;
  let alive = true;
  let trigger: HTMLButtonElement | undefined;
  const requested = new Set<string>();
  onCleanup(() => { alive = false; });
  onSettled(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  });
  const load = async (songId: string, expectedScope: string) => {
    try {
      const link = await input.resolveLink({ songPostId: songId });
      if (!alive || expectedScope !== scope || !link?.communityId) return;
      const result = await input.readRewards(link.communityId, songId);
      if (alive && expectedScope === scope) setData(current => new Map(current).set(songId, result));
    } catch {
      // A failed or inaccessible read cannot advertise a reward.
      if (alive && expectedScope === scope) setData(current => { const next = new Map(current); next.delete(songId); return next; });
    }
  };
  createEffect(() => ({ songs: input.songs(), scope: input.scope() }), next => {
    if (scope !== next.scope) {
      scope = next.scope;
      requested.clear();
      queueMicrotask(() => { if (alive && scope === next.scope) { setData(new Map()); setSelection(undefined); } });
    }
    for (const songId of next.songs) {
      if (requested.has(songId)) continue;
      requested.add(songId);
      void load(songId, next.scope);
    }
  });
  const rewards = (songId: string) => {
    const value = data().get(songId);
    return value ? songActivityRewards(value, now()) : [];
  };
  const selectedRewards = () => {
    const selected = selection();
    return selected ? rewards(selected.songId).filter(reward => reward.id === selected.rewardId) : [];
  };
  return {
    selectedPostId: () => selection()?.postId,
    renderLabels: (postId: string) => {
      const songId = input.songForPost(postId);
      if (!songId) return;
      const uniqueIds = () => [...new Set(rewards(songId).map(reward => reward.id))];
      const rewardFor = (id: string) => rewards(songId).find(reward => reward.id === id)!;
      return <Show when={uniqueIds().length}><div class="pointer-events-auto mt-2 flex flex-wrap gap-1.5" aria-label="Song rewards">
        <For each={uniqueIds()}>{id => <RewardPill kind={rewardFor(id).kind} aria-label={`Song reward: ${rewardFor(id).shortLabel}`} aria-haspopup="dialog"
          onClick={event => { trigger = event.currentTarget; setSelection({ songId, rewardId: id, postId }); void load(songId, untrack(() => scope)!); }}>{rewardFor(id).shortLabel}</RewardPill>}</For>
      </div></Show>;
    },
    dialog: () => <Modal open={selection() !== undefined} onOpenChange={open => { if (!open) setSelection(undefined); }}>
      <ModalContent mobileSide="bottom" class="max-h-[88dvh] w-full overflow-y-auto px-4 pb-5 pt-5 md:max-w-lg md:px-6 md:pb-6"
        onCloseAutoFocus={event => { event.preventDefault(); trigger?.focus(); }}>
        <ModalHeader class="pr-8 text-start"><ModalTitle>{selectedRewards()[0]?.label ?? "Reward unavailable"}</ModalTitle>
          <ModalDescription>Requirements for this song</ModalDescription></ModalHeader>
        <Show when={selectedRewards().length} fallback={<p class="mt-4 text-sm text-muted-foreground">This reward is no longer available or could not be checked.</p>}>
          <div class="mt-4 space-y-4"><For each={selectedRewards()}>{reward => <section>
            <h3 class="font-semibold">{reward.activity === "study" ? "Study" : "Karaoke"}</h3>
            <ul class="mt-2 space-y-2 text-sm"><For each={reward.terms}>{term => <li>{term}</li>}</For></ul>
          </section>}</For></div>
        </Show>
      </ModalContent>
    </Modal>,
  };
}
