import { For, Show, createSignal, createUniqueId, onCleanup, onSettled } from "solid-js";
import { Button, IconGift, IconMicrophone, IconPlaylist, IconVideoCamera, LoadingIndicator, Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle, ModalTrigger, PillButton, RewardPill } from "../../../design-system.ts";
import type { AuthenticatedSession } from "../../../api/session.ts";
import { readSongVideoPolicy, songVideoEntryHref, type SongVideoEligibilityReader } from "./song-video-entry.tsx";
import { readSongActivityRewards, songActivityRewards, type SongActivityRewards } from "./song-activities-rewards.ts";

export type SongActivityViewer = "pending" | "anonymous" | "error" | AuthenticatedSession;
export interface SongActivitiesDependencies {
  readonly readRewards?: typeof readSongActivityRewards;
  readonly readVideoEligibility?: SongVideoEligibilityReader;
  readonly navigate?: (href: string) => void;
}

/** One post-row entry; public discovery precedes authentication at selection. */
export function SongActivities(props: {
  readonly communityId: string;
  readonly postId: string;
  readonly studyPath: string;
  readonly karaokePath: string;
  readonly viewer: SongActivityViewer;
  readonly dependencies?: SongActivitiesDependencies;
  readonly onChoose: (href: string, signedIn: boolean) => void;
}) {
  const [compact, setCompact] = createSignal(true);
  let trigger: HTMLButtonElement | undefined;
  const [open, setOpen] = createSignal(false);
  const [expandedReward, setExpandedReward] = createSignal<string>();
  const rewardDetailsId = createUniqueId();
  const [data, setData] = createSignal<SongActivityRewards>();
  const [loading, setLoading] = createSignal(true);
  const [failed, setFailed] = createSignal(false);
  const [video, setVideo] = createSignal(false);
  const [videoFailed, setVideoFailed] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());
  let active = true;
  let request = 0;
  onCleanup(() => { active = false; });
  const loadRewards = async () => {
    const current = ++request;
    setLoading(true);
    setFailed(false);
    setData(undefined);
    try {
      const result = await (props.dependencies?.readRewards ?? readSongActivityRewards)(props.communityId, props.postId);
      if (active && current === request) { setData(result); setNow(Date.now()); }
    } catch { if (active && current === request) setFailed(true); }
    finally { if (active && current === request) setLoading(false); }
  };
  const loadVideo = async () => {
    setVideoFailed(false);
    const viewer = props.viewer;
    const personaId = viewer !== "pending" && viewer !== "anonymous" && viewer !== "error" && !viewer.personasUnavailable ? viewer.personas[0]?.personaId : undefined;
    try {
      const result = await (props.dependencies?.readVideoEligibility ?? readSongVideoPolicy)({ communityId: props.communityId, postId: props.postId,
        personaId });
      if (active) setVideo(result);
    } catch { if (active) { setVideo(false); setVideoFailed(true); } }
  };
  onSettled(() => {
    // The comments panel can narrow the card even on a wide desktop.
    // Size the label against its actual action row, not the viewport.
    let observer: ResizeObserver | undefined;
    const row = trigger?.closest<HTMLElement>('[role="group"][aria-label="Post actions"]') ?? trigger?.parentElement;
    if (row) {
      setCompact(row.clientWidth < 350);
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => setCompact(row.clientWidth < 350));
        observer.observe(row);
      }
    }
    void loadRewards();
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => { clearInterval(clock); observer?.disconnect(); };
  });
  const rewards = () => data() ? songActivityRewards(data()!, now()) : [];
  const signedIn = () => props.viewer !== "pending" && props.viewer !== "anonymous" && props.viewer !== "error";
  const ready = () => signedIn() || props.viewer === "anonymous";
  const changeOpen = (value: boolean) => {
    setOpen(value);
    if (value) { setExpandedReward(undefined); void loadRewards(); void loadVideo(); }
  };
  const choose = (href: string) => {
    if (!ready()) return;
    setOpen(false);
    props.onChoose(href, signedIn());
  };
  const options = () => [
    { id: "study", label: "Study", description: "Practice the lyrics", href: props.studyPath, icon: IconPlaylist },
    { id: "karaoke", label: "Karaoke", description: "Sing and get scored", href: props.karaokePath, icon: IconMicrophone },
    ...(video() ? [{ id: "video", label: "Dance", description: "Make a dance video", href: songVideoEntryHref(props.postId), icon: IconVideoCamera }] : []),
  ];
  return <Modal open={open()} onOpenChange={changeOpen}>
    <ModalTrigger as={PillButton} ref={element => { trigger = element; }} aria-label={rewards().length ? "Activities · rewards available" : "Activities"} aria-haspopup="dialog" aria-expanded={open() ? "true" : "false"}
      class={`h-11 min-w-11 gap-2 px-2 text-sm ${rewards().length ? "border-amber-500/50 bg-amber-500/10 text-foreground" : ""}`} title="Activities">
      <Show when={rewards().length > 0} fallback={<IconPlaylist class="size-5" aria-hidden="true" />}><IconGift class="size-5" aria-hidden="true" /></Show>
      <Show when={!compact()}><span>Activities</span></Show>
    </ModalTrigger>
      <ModalContent mobileSide="bottom" class="max-h-[88dvh] w-full overflow-y-auto px-4 pb-5 pt-5 md:max-w-lg md:px-6 md:pb-6">
        <ModalHeader class="text-start pr-8"><ModalTitle>Activities</ModalTitle><ModalDescription class="sr-only">Choose an activity for this song and review any rewards.</ModalDescription></ModalHeader>
        <div class="mt-4 space-y-3">
          <For each={options()}>{option => {
            const activityRewards = () => rewards().filter(reward => reward.activity === option.id);
            const rewardFor = (id: string) => activityRewards().find(reward => reward.id === id)!;
            const expanded = () => expandedReward() === option.id;
            const detailsId = `${rewardDetailsId}-${option.id}`;
            return <section class="min-w-0 rounded-xl border border-border-soft bg-card">
              <div class="grid grid-cols-[1.5rem_minmax(0,1fr)_fit-content(50%)] grid-rows-[auto_auto] gap-x-3 gap-y-1 p-4">
                <button type="button" disabled={!ready()} aria-label={option.label} class="col-span-3 row-span-2 col-start-1 row-start-1 grid min-w-0 grid-cols-subgrid grid-rows-subgrid rounded-md text-start disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" onClick={() => choose(option.href)}>
                  <option.icon class="col-start-1 row-span-2 mt-1.5 size-6 text-muted-foreground" aria-hidden="true" />
                  <span class="col-start-2 row-start-1 flex min-h-9 items-center self-start font-semibold">{option.label}</span>
                  <span class="col-span-2 col-start-2 row-start-2 text-sm text-muted-foreground">{option.description}</span>
                </button>
                <Show when={activityRewards().length > 0}>
                  <div class="z-10 col-start-3 row-start-1 flex min-w-0 flex-wrap justify-end gap-1.5 self-center">
                    <For each={activityRewards().map(reward => reward.id)}>{id => <RewardPill kind={rewardFor(id).kind}
                      aria-label={`${option.label} rewards: ${rewardFor(id).shortLabel}`} aria-expanded={expanded() ? "true" : "false"} aria-controls={detailsId}
                      onClick={() => setExpandedReward(expanded() ? undefined : option.id)}>{rewardFor(id).shortLabel}</RewardPill>}</For>
                  </div>
                </Show>
              </div>
              <Show when={activityRewards().length > 0}>
                <div id={detailsId} role="region" aria-label={`${option.label} reward details`} hidden={!expanded()} class="mx-4 mb-4 space-y-3 border-t border-border-soft pt-3 text-sm">
                  <For each={activityRewards()}>{reward => <div>
                    <p class="font-semibold text-foreground">{reward.label}</p>
                    <ul class="mt-2 space-y-2 text-foreground"><For each={reward.terms}>{term => <li>{term}</li>}</For></ul>
                  </div>}</For>
                </div>
              </Show>
            </section>;
          }}</For>
          <Show when={props.viewer === "pending"}><LoadingIndicator label="Checking sign-in" variant="inline" /></Show>
          <Show when={props.viewer === "error"}><p role="status" class="text-sm text-muted-foreground">Sign-in could not be checked. Close this panel and retry the post actions.</p></Show>
          <Show when={loading()}><LoadingIndicator label="Checking rewards" variant="inline" /></Show>
          <Show when={failed()}><p role="status" class="text-sm text-muted-foreground">Rewards could not be checked. <Button size="sm" variant="ghost" onClick={() => void loadRewards()}>Retry rewards</Button></p></Show>
          <Show when={data() && !loading() && ((data()!.pool?.offer_status === "active" && data()!.pool?.leg_status === "active" && data()!.pool?.qualification_policies === null) || data()!.bonuses.items.some(bonus => bonus.offer_status === "active" && bonus.leg_status === "active" && bonus.qualification_policies === null))}>
            <p class="text-sm text-muted-foreground">Reward requirements are unavailable.</p>
          </Show>
          <Show when={videoFailed()}><p role="status" class="text-sm text-muted-foreground">Video creation could not be checked. <Button size="sm" variant="ghost" onClick={() => void loadVideo()}>Retry video</Button></p></Show>
        </div>
      </ModalContent>
  </Modal>;
}
