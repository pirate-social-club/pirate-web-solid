import { sharedPotDisposition } from "./shared-pot-terms.ts";
import { isServer } from "@solidjs/web";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Button } from "../../design-system.ts";
import { createSharedSongParticipationData, type SharedSongParticipation, type SharedSongParticipationData } from "../../api/shared-song-participation.ts";
import { MegapotParticipantSignedOutError, type ParticipantScope } from "../../api/megapot-participant-data.ts";
import { onSessionCleared, onSessionRefreshed } from "../../api/session.ts";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle.ts";
import { rewardTime } from "./megapot-participant-model.ts";
import { sharedSongAmount, sharedSongDrawingStatus, sharedSongRule, sharedSongStanding } from "./shared-song-participation-model.ts";

export function SharedSongParticipationView(props: { readonly participation: SharedSongParticipation; readonly now: number }) {
  const value = () => props.participation;
  return <div class="space-y-4" data-shared-song-history>
    <p>A share of the song’s pool winnings, if its ticket wins. One equal share per qualifying account, per song, per drawing; a share is not an extra ticket.</p>
    <p>Pirate holds the song’s ticket and receives its net winnings after Megapot’s observed referral win share. Your allocation is credited first and stays held until you verify and Claim in Wallet; payout to your persona wallet follows.</p>
    <p>Qualify again for each drawing. Start after the song is funded, with its funded objectives recorded for that session. Earlier practice cannot be upgraded.</p>
    <Show when={!value().participation_available}><p>New participation is currently unavailable. The funded terms and your recorded history remain below.</p></Show>
    <details>
      <summary class="cursor-pointer underline">Funded requirements and budget</summary>
      <div class="mt-3 space-y-2">
        <For each={value().qualification_rules}>{rule => <p>{sharedSongRule(rule)}<Show when={!rule.currently_available}> This funded policy is currently unavailable for new participation.</Show></p>}</For>
        <p>Confirmed contributions: {sharedSongAmount(value().confirmed_contributed_atomic, value().chain_id)}. Remaining ticket budget: {sharedSongAmount(value().remaining_budget_atomic, value().chain_id)}.</p>
        <p>These are pool funds, separate from creator and collaborator earnings. They are not your winnings.</p>
        <p>Maximum ticket price: {sharedSongAmount(value().terms.ticket_price_ceiling_atomic, value().chain_id)}.</p>
        <p class="break-words">{sharedPotDisposition(value().terms)}</p>
        <p>Funded window: {rewardTime(value().terms.starts_at)} to {rewardTime(value().terms.ends_at)}.</p>
        <p>Terminal unspent budget returns proportionally to the original funding wallets.</p>
        <p>{value().chain_id === 84532 ? "Base Sepolia · test USDC has no spendable value." : "Base · USDC."}</p>
      </div>
    </details>
    <ol class="space-y-3" aria-label="Funded drawing history">
      <For each={value().drawings}>{row => <li class="space-y-2 rounded-lg border border-border-soft p-3" data-planned-drawing={row.planned_drawing_id}>
        <p class="font-semibold">Drawing {row.planned_drawing_id} · {sharedSongDrawingStatus(row, props.now)}</p>
        <Show when={row.kind === "materialized" ? row : undefined}>{materialized => <>
          <p>Drawing: <time datetime={materialized().drawing_at}>{rewardTime(materialized().drawing_at)}</time>. Entry cutoff: <time datetime={materialized().drawing.entry_cutoff_at}>{rewardTime(materialized().drawing.entry_cutoff_at)}</time>.</p>
          <Show when={materialized().drawing.state === "entry_open"}><p>{entryCountdown(materialized().drawing.entry_cutoff_at, props.now)}</p></Show>
          <p>{materialized().drawing.beneficiary_count} qualifying {materialized().drawing.beneficiary_count === 1 ? "account" : "accounts"}.</p>
          <Show when={materialized().drawing.gross_prize_pool_atomic !== null && materialized().drawing.prize_pool_observed_at}>{observed => <p>
            Drawing-wide gross prize pool: {sharedSongAmount(materialized().drawing.gross_prize_pool_atomic!, value().chain_id)}, before referral deductions. Last observed pre-rollover: {rewardTime(observed())}. This is not this song’s winnings or your allocation.
          </p>}</Show>
        </>}</Show>
        <p>{sharedSongStanding(row, props.now)}</p>
        <Show when={row.kind === "materialized" ? row.standing.credit : undefined}>{credit => <>
          <p>Your confirmed allocation: {sharedSongAmount(credit().amount_atomic, value().chain_id)}.</p>
          <p>This allocation is net of Megapot’s observed referral win share.</p>
          <a href="/wallet" class="block w-fit underline">Review winnings in Wallet</a>
        </>}</Show>
      </li>}</For>
    </ol>
    <p class="text-xs text-muted-foreground">Status as of <time datetime={value().as_of}>{rewardTime(value().as_of)}</time>.</p>
  </div>;
}

type Props = ParticipantScope & { readonly data?: SharedSongParticipationData };
type State = { readonly scope: ParticipantScope; readonly participation?: SharedSongParticipation; readonly notice?: string };
const matches = (a: ParticipantScope | undefined, b: ParticipantScope) => a !== undefined && a.communityId === b.communityId && a.postId === b.postId;
function entryCountdown(cutoff: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(cutoff) - now) / 1_000));
  if (seconds === 0) return "Entry window closed.";
  return `Entry window closes in ${Math.floor(seconds / 3_600)}h ${Math.floor(seconds % 3_600 / 60)}m ${seconds % 60}s.`;
}

/** Session-private history. A disabled service, signed-out viewer or absent pot
 * adds no prize hook to a Rewards-off page. Failed refreshes erase old amounts. */
export function SharedSongParticipationStatus(props: Props) {
  const [state, setState] = createSignal<State | undefined>(undefined, { ownedWrite: true });
  const [busy, setBusy] = createSignal(false, { ownedWrite: true });
  const [now, setNow] = createSignal(Date.now());
  let active = true, generation = 0, inFlight = false, resumeAfter = 0;
  let request: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
  let observed: ParticipantScope | undefined;
  const clear = () => { ++generation; request?.abort(); clearTimeout(timeout); clearTimeout(expiry); inFlight = false; resumeAfter = 0; setState(undefined); setBusy(false); };
  const load = async () => {
    clear();
    if (!active || isServer || document.visibilityState === "hidden") return;
    const attempt = generation, scope = { communityId: props.communityId, postId: props.postId };
    if (!scope.communityId || !scope.postId) return;
    if (!matches(observed, scope)) observed = undefined;
    const current = new AbortController(); request = current;
    const owns = () => active && attempt === generation && matches(scope, props);
    if (observed) setState({ scope, notice: "Checking your song reward…" });
    inFlight = true; resumeAfter = Date.now() + 1_000; setBusy(true);
    current.signal.addEventListener("abort", () => {
      if (!owns()) return;
      inFlight = false; setBusy(false);
      if (matches(observed, scope)) setState({ scope, notice: "Your song reward status is unavailable. Check again to confirm your share." });
    }, { once: true });
    timeout = setTimeout(() => current.abort(), 15_000);
    try {
      const participation = await (props.data ?? createSharedSongParticipationData()).read(scope, current.signal);
      if (!owns()) return;
      current.signal.throwIfAborted();
      if (!participation) { observed = undefined; setState(undefined); return; }
      observed = scope; setNow(Date.now()); setState({ scope, participation });
      expiry = setTimeout(() => { if (owns()) setState({ scope, notice: "Check again for your latest drawing and winnings status." }); }, 60_000);
    } catch (error) {
      if (!owns()) return;
      if (error instanceof MegapotParticipantSignedOutError) { observed = undefined; setState(undefined); return; }
      if (matches(observed, scope)) setState({ scope, notice: "Your song reward status is unavailable. Check again to confirm your share." });
    } finally { if (owns()) { clearTimeout(timeout); inFlight = false; setBusy(false); } }
  };
  createEffect(() => [props.communityId, props.postId] as const, () => {
    clear(); const attempt = generation;
    if (!isServer) queueMicrotask(() => { if (active && attempt === generation) void load(); });
  });
  if (!isServer) {
    let cleared = false;
    onCleanup(onSessionCleared(() => { cleared = true; observed = undefined; clear(); queueMicrotask(() => { cleared = false; }); }));
    onCleanup(onSessionRefreshed(() => { clear(); if (!cleared) void load(); }));
    const resume = () => { if (!inFlight && Date.now() >= resumeAfter) void load(); };
    const visibility = () => { if (document.visibilityState === "hidden") clear(); else resume(); };
    window.addEventListener("focus", resume); document.addEventListener("visibilitychange", visibility);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    onCleanup(() => { window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", visibility); clearInterval(clock); });
    onCleanup(bindPrivatePageLifecycle(clear));
  }
  onCleanup(() => { active = false; ++generation; request?.abort(); clearTimeout(timeout); clearTimeout(expiry); });
  const visible = () => matches(state()?.scope, props) ? state() : undefined;
  return <Show when={visible()}>{value => <section aria-label="Your shared song reward" aria-live="polite" class="space-y-3 rounded-xl border border-border-soft bg-card p-4 text-sm" data-shared-song-participation>
    <p class="font-semibold">Song pool winnings</p>
    <Show when={value().participation} fallback={<p>{value().notice}</p>}>{participation => <SharedSongParticipationView participation={participation()} now={now()} />}</Show>
    <Button variant="outline" disabled={busy()} onClick={() => { void load(); }}>Check song reward status</Button>
  </section>}</Show>;
}
