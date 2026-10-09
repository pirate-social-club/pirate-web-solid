import { MegapotPoolUnavailableError } from "../../api/megapot-pool-availability.ts";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { formatUnits } from "viem";
import { Button } from "../../design-system.ts";
import { createMegapotParticipantData, type MegapotParticipantData, type ParticipantPool, type ParticipantRewardSnapshot, type ParticipantScope } from "../../api/megapot-participant-data.ts";
import { onSessionCleared, onSessionRefreshed } from "../../api/session.ts";
import { poolStatus, participantMessage, rewardTime } from "./megapot-participant-model.ts";
import { qualificationText } from "./reward-sponsor-terms.ts";

type Props = ParticipantScope & { readonly data?: MegapotParticipantData };
const sameScope = (scope: ParticipantScope | undefined, props: ParticipantScope) => scope !== undefined && scope.communityId === props.communityId && scope.postId === props.postId;
/** A song without both identifiers has no pool to ask about. */
const addressable = (scope: ParticipantScope) => Boolean(scope.communityId) && Boolean(scope.postId);

export function MegapotPoolView(props: { readonly pool: ParticipantPool; readonly compact?: boolean; readonly now?: number }) {
  return <section aria-label="Song reward" class="rounded-xl border border-border-soft bg-card p-3 text-sm space-y-2" data-megapot-pool>
    <p class="font-semibold">Megapot test pool · {poolStatus(props.pool, props.now)}</p>
    <p>Eligible activities: {props.pool.eligible_activities.map(activity => activity === "study" ? "Study" : "Karaoke").join(" or ")}. Qualifying accounts share net winnings equally.</p>
    <Show when={props.pool.drawing}>{drawing => <p>{drawing().beneficiary_count} qualifying {drawing().beneficiary_count === 1 ? "account" : "accounts"} · drawing {drawing().drawing_id}</p>}</Show>
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
    if (!addressable(scope)) return;
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
      // The host is hidden while it is empty, so watch the card it sits in.
      observer.observe(host.parentElement ?? host);
    } else start();
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    // An effect callback has no owner, so onCleanup would never run here. Return the cleanup.
    return () => { controller.abort(); observer?.disconnect(); clearTimeout(timer); clearInterval(clock); };
  });
  const pool = () => sameScope(loaded()?.scope, props) ? loaded()?.pool : undefined;
  // Empty until a pool is known, and then it must take no space or gap in the card.
  return <div ref={host} class="relative z-10 empty:hidden" data-megapot-host><Show when={pool()}>{value => <MegapotPoolView pool={value()} compact={props.compact} now={now()} />}</Show></div>;
}

export function MegapotShareView(props: { readonly snapshot: ParticipantRewardSnapshot }) {
  return <>
    <p>{participantMessage(props.snapshot)}</p>
    <Show when={props.snapshot.standing?.share_held ? props.snapshot.standing : undefined}>{standing => <>
      <Show when={!["no_win", "won", "sent", "payout_pending"].includes(standing().participant_state)}>
        <p class="text-muted-foreground">If your pool wins, your amount is held until you verify to claim it.</p>
      </Show>
      <a href="/wallet" class="block w-fit underline">Open Wallet</a>
    </>}</Show>
  </>;
}

type ShareState = { scope: ParticipantScope; content: string; snapshot?: ParticipantRewardSnapshot };
/** Mount only on the completion surface. Scores never manufacture a share. */
export function MegapotShareStatus(props: Props) {
  const [state, setState] = createSignal<ShareState>();
  const [busy, setBusy] = createSignal(false);
  let request = 0;
  let controller: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let alive = true;
  // The song whose public pool this surface has seen. It is public knowledge,
  // so it survives invalidation; private standing never does.
  let observed: ParticipantScope | undefined;
  let inFlight = false;
  let resumeGuardUntil = 0;
  const invalidate = () => { ++request; controller?.abort(); clearTimeout(timeout); clearTimeout(expiry); inFlight = false; resumeGuardUntil = 0; setState(undefined); setBusy(false); };
  const load = async () => {
    invalidate();
    if (!alive) return;
    const generation = request;
    const scope = { communityId: props.communityId, postId: props.postId };
    const current = () => alive && request === generation && sameScope(scope, props);
    if (!sameScope(observed, scope)) observed = undefined;
    if (!addressable(scope)) return;
    // Standing is already cleared. Where a pool is known, keep the box in place while it reloads.
    if (observed) setState({ scope, content: "Checking your share…" });
    inFlight = true;
    resumeGuardUntil = Date.now() + 1_000;
    controller = new AbortController();
    const signal = controller.signal;
    const ownedController = controller;
    timeout = setTimeout(() => ownedController.abort(), 15_000);
    setBusy(true);
    try {
      const data = props.data ?? createMegapotParticipantData();
      const pool = await data.pool(scope, signal);
      if (!current()) return;
      if (!pool) { observed = undefined; setState(undefined); return; }
      observed = scope;
      setState({ scope, content: "Checking your share…" });
      const snapshot = await data.standing(scope, pool, signal);
      if (!current() || signal.aborted) return;
      setState({ scope, content: "", snapshot });
      // Do not leave account-private or drawing-specific claims visible indefinitely.
      expiry = setTimeout(() => { if (current()) setState({ scope, content: "Check again for your latest share status." }); }, 60_000);
    } catch (error) {
      // While rewards are disabled the pool read answers unavailable for every
      // song. Without an observed pool a failed read renders nothing rather
      // than putting a rewards box on every completion.
      if (current() && sameScope(observed, scope)) setState(error instanceof MegapotPoolUnavailableError
        ? { scope, content: "Rewards are temporarily unavailable. Try again shortly." }
        : { scope, content: "Your reward status is unavailable. Check again to confirm your share." });
    } finally { if (current()) { clearTimeout(timeout); inFlight = false; setBusy(false); } }
  };
  createEffect(() => ({ communityId: props.communityId, postId: props.postId }), () => {
    queueMicrotask(() => { if (alive) void load(); });
  });
  createEffect(() => true, () => {
    // The session store announces a cleared session to its clear listeners and
    // then, in the same call, to its refresh listeners. A session read of ours
    // that answers 401 clears the session, so reloading on that refresh would
    // repeat the rejected read without end. A cleared session only takes the
    // private standing down; a refresh on its own, as after sign-in, reloads.
    let cleared = false;
    const drop = () => { cleared = true; invalidate(); queueMicrotask(() => { cleared = false; }); };
    const refresh = () => { if (!cleared) void load(); };
    // Returning to the page fires visibilitychange, focus or both. The first
    // reloads; the other finds that reload under way, or just started, and
    // leaves it alone rather than cancelling and repeating it.
    const resume = () => { if (!inFlight && Date.now() >= resumeGuardUntil) void load(); };
    const visibility = () => { if (document.visibilityState === "hidden") invalidate(); else resume(); };
    const unsubscribeCleared = onSessionCleared(drop);
    const unsubscribe = onSessionRefreshed(refresh);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => { unsubscribeCleared(); unsubscribe(); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", visibility); };
  });
  onCleanup(() => { alive = false; ++request; controller?.abort(); clearTimeout(timeout); clearTimeout(expiry); });
  const visible = () => sameScope(state()?.scope, props) ? state() : undefined;
  return <Show when={visible()}>{value => <section aria-label="Your song reward" aria-live="polite" class="rounded-xl border border-border-soft bg-card p-4 text-sm space-y-3" data-megapot-share>
    <p class="font-semibold">Your Megapot share</p>
    <Show when={value().snapshot} fallback={<p>{value().content}</p>}>{snapshot => <MegapotShareView snapshot={snapshot()} />}</Show>
    <Button variant="outline" disabled={busy()} onClick={() => { void load(); }}>Check reward status</Button>
  </section>}</Show>;
}
