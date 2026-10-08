import { MegapotPoolUnavailableError } from "../../api/megapot-pool-availability.ts";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { formatUnits } from "viem";
import { Button } from "../../design-system.ts";
import { createMegapotParticipantData, type MegapotParticipantData, type ParticipantPool, type ParticipantRewardSnapshot, type ParticipantScope } from "../../api/megapot-participant-data.ts";
import { onSessionRefreshed } from "../../api/session.ts";
import { poolStatus, participantMessage, rewardTime } from "./megapot-participant-model.ts";
import { qualificationText } from "./reward-sponsor-terms.ts";

type Props = ParticipantScope & { readonly data?: MegapotParticipantData };
const sameScope = (scope: ParticipantScope | undefined, props: ParticipantScope) => scope?.communityId === props.communityId && scope.postId === props.postId;

export function MegapotPoolView(props: { readonly pool: ParticipantPool; readonly compact?: boolean; readonly now?: number }) {
  return <section aria-label="Song reward" class="rounded-xl border border-border-soft bg-card p-3 text-sm space-y-2" data-megapot-pool>
    <p class="font-semibold">Megapot test pool · {poolStatus(props.pool, props.now)}</p>
    <p>Eligible activities: {props.pool.eligible_activities.map(activity => activity === "study" ? "Study" : "Karaoke").join(" or ")}. Qualifying accounts share net winnings equally.</p>
    <Show when={props.pool.drawing}>{drawing => <p>{drawing().beneficiary_count} qualifying accounts · drawing {drawing().drawing_id}</p>}</Show>
    <Show when={!props.compact}>
      <p>One share per account, per song, per drawing. Complete a qualifying activity again for a later drawing.</p>
      <For each={props.pool.qualification_policies ?? []}>{policy => <p>{qualificationText(policy)}</p>}</For>
      <p>Additional score floor: {props.pool.min_score_bps / 100}%.</p>
      <Show when={!props.pool.qualification_policies}><p>Full qualification terms are unavailable.</p></Show>
      <Show when={props.pool.drawing?.entry_cutoff_at}>{cutoff => <p>Entry cutoff: <time datetime={cutoff()}>{rewardTime(cutoff())}</time></p>}</Show>
      <Show when={props.pool.drawing?.gross_prize_pool_atomic != null && props.pool.drawing?.prize_pool_observed_at}>{observed => <p>
        Gross prize pool: {formatUnits(BigInt(props.pool.drawing!.gross_prize_pool_atomic!), 6)} test USDC, before referral share. Last observed <time datetime={observed()}>{rewardTime(observed())}</time>. This is the drawing’s total prize pool, not your winnings.
      </p>}</Show>
      <p>Pirate buys and holds the ticket. If the pool wins, your amount is held until you verify to claim it.</p>
      <Show when={props.pool.fallback_disclosure}>{disclosure => <p>{disclosure()}</p>}</Show>
    </Show>
  </section>;
}

/** Cards load on approach to the viewport; the full song page loads immediately. */
export function MegapotPoolSummary(props: Props & { readonly compact?: boolean }) {
  let host!: HTMLDivElement;
  const [loaded, setLoaded] = createSignal<{ scope: ParticipantScope; pool: ParticipantPool }>();
  const [now, setNow] = createSignal(Date.now());
  createEffect(() => ({ communityId: props.communityId, postId: props.postId, compact: props.compact }), scope => {
    const controller = new AbortController();
    let observer: IntersectionObserver | undefined;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (started || controller.signal.aborted) return;
      started = true;
      observer?.disconnect();
      timer = setTimeout(() => controller.abort(), 15_000);
      void Promise.resolve().then(async () => {
        try {
          const pool = await (props.data ?? createMegapotParticipantData()).pool(scope, controller.signal);
          if (!controller.signal.aborted && pool) setLoaded({ scope, pool });
        } catch { /* Optional public projection: do not block discovery. */ }
        finally { clearTimeout(timer); }
      });
    };
    if (scope.compact && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) start(); }, { rootMargin: "200px" });
      observer.observe(host);
    } else start();
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    onCleanup(() => { controller.abort(); observer?.disconnect(); clearTimeout(timer); clearInterval(clock); });
  });
  const pool = () => sameScope(loaded()?.scope, props) ? loaded()?.pool : undefined;
  return <div ref={host} class="relative z-10"><Show when={pool()}>{value => <MegapotPoolView pool={value()} compact={props.compact} now={now()} />}</Show></div>;
}

export function MegapotShareView(props: { readonly snapshot: ParticipantRewardSnapshot }) {
  return <>
    <p>{participantMessage(props.snapshot)}</p>
    <Show when={props.snapshot.standing.share_held}>
      <Show when={!["no_win", "sent", "payout_pending"].includes(props.snapshot.standing.participant_state)}>
        <p class="text-muted-foreground">If your pool wins, your amount is held until you verify to claim it.</p>
      </Show>
      <a href="/wallet" class="block w-fit underline">Open Wallet</a>
    </Show>
  </>;
}

type ShareState = { scope: ParticipantScope; content: string; snapshot?: ParticipantRewardSnapshot; retryable?: boolean };
/** Mount only on the completion surface. Scores never manufacture a share. */
export function MegapotShareStatus(props: Props) {
  const [state, setState] = createSignal<ShareState>();
  const [busy, setBusy] = createSignal(false);
  let request = 0;
  let controller: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  const invalidate = () => { ++request; controller?.abort(); clearTimeout(timeout); clearTimeout(expiry); setState(undefined); setBusy(false); };
  const load = async () => {
    invalidate();
    if (!alive) return;
    const generation = request;
    const scope = { communityId: props.communityId, postId: props.postId };
    const current = () => alive && request === generation && sameScope(scope, props);
    controller = new AbortController();
    const signal = controller.signal;
    const ownedController = controller;
    timeout = setTimeout(() => ownedController.abort(), 15_000);
    setBusy(true);
    try {
      const data = props.data ?? createMegapotParticipantData();
      const pool = await data.pool(scope, signal);
      if (!current()) return;
      if (!pool) return;
      setState({ scope, content: "Checking your share…" });
      const snapshot = await data.standing(scope, pool, signal);
      if (!current() || signal.aborted) return;
      setState({ scope, content: "", snapshot });
      // Do not leave account-private or drawing-specific claims visible indefinitely.
      expiry = setTimeout(() => { if (current()) setState({ scope, content: "Check again for your latest share status." }); }, 60_000);
    } catch (error) {
      if (current()) setState(error instanceof MegapotPoolUnavailableError
        ? { scope, content: "Rewards are unavailable. Reload this page to check again.", retryable: false }
        : { scope, content: "Your reward status is unavailable. Check again to confirm your share." });
    } finally { if (current()) { clearTimeout(timeout); setBusy(false); } }
  };
  createEffect(() => ({ communityId: props.communityId, postId: props.postId }), () => {
    queueMicrotask(() => { if (alive) void load(); });
  });
  createEffect(() => true, () => {
    const refresh = () => { invalidate(); void load(); };
    const hide = () => { if (document.visibilityState === "hidden") invalidate(); };
    const unsubscribe = onSessionRefreshed(refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", hide);
    onCleanup(() => { unsubscribe(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", hide); });
  });
  onCleanup(() => { alive = false; ++request; controller?.abort(); clearTimeout(timeout); clearTimeout(expiry); });
  const visible = () => sameScope(state()?.scope, props) ? state() : undefined;
  return <Show when={visible()}>{value => <section aria-label="Your song reward" aria-live="polite" class="rounded-xl border border-border-soft bg-card p-4 text-sm space-y-3" data-megapot-share>
    <p class="font-semibold">Your Megapot share</p>
    <Show when={value().snapshot} fallback={<p>{value().content}</p>}>{snapshot => <MegapotShareView snapshot={snapshot()} />}</Show>
    <Show when={value().retryable !== false}>
      <Button variant="outline" disabled={busy()} onClick={() => { void load(); }}>Check reward status</Button>
    </Show>
  </section>}</Show>;
}
