import { For, Show, createSignal, onCleanup } from "solid-js";
import { formatUnits } from "viem";
import { Button } from "../../design-system.ts";
import type { createRewardSponsorData } from "../../api/reward-sponsor-data.ts";
import type { RewardFundingActor } from "../../api/reward-funding-client.ts";
import { qualificationText } from "./reward-sponsor-terms.ts";
type Data = ReturnType<typeof createRewardSponsorData>;
type Song = Awaited<ReturnType<Data["song"]>>;
type Private = Awaited<ReturnType<Data["privateRewards"]>>;
export function RewardSongStatus(props: { song: Song; actor: RewardFundingActor; data: Data }) {
  const [privateData, setPrivateData] = createSignal<Private>();
  const [busy, setBusy] = createSignal(false), [error, setError] = createSignal("");
  let alive = true;
  onCleanup(() => { alive = false; });
  const load = async (cursor?: string) => {
    if (busy()) return;
    setBusy(true); setError("");
    try {
      const next = await props.data.privateRewards(props.actor, props.song.pool?.leg_id ?? null, cursor);
      if (alive) setPrivateData(previous => cursor && previous ? { ...next, credits: { ...next.credits, items: [...previous.credits.items, ...next.credits.items] } } : next);
    } catch { if (alive) { setPrivateData(undefined); setError("Private reward status is unavailable."); } }
    finally { if (alive) setBusy(false); }
  };
  return <div class="space-y-3">
    <Show when={props.song.pool}>{pool => <section aria-label="Song Megapot reward">
      <p>Megapot shared winnings · {pool().leg_status.replaceAll("_", " ")}</p>
      <p>Pirate buys and holds the ticket. Qualifiers share net winnings.</p>
      <p>{formatUnits(BigInt(pool().available_budget_atomic),6)} USDC available · additional score floor {pool().min_score_bps / 100}%</p>
      <Show when={pool().qualification_policies} fallback={<p>Original qualification terms are unavailable for this older reward.</p>}>{policies => <For each={policies()}>{policy => <p class="text-sm">{qualificationText(policy)}</p>}</For>}</Show>
      <Show when={pool().drawing}>{drawing => <p>Drawing: {drawing().state.replaceAll("_", " ")} · {drawing().beneficiary_count} qualifiers</p>}</Show>
      <Show when={pool().fallback_disclosure}>{disclosure => <p>{disclosure()}</p>}</Show>
    </section>}</Show>
    <For each={props.song.bonuses.items}>{bonus => <section aria-label="Song token reward">
      <p>{formatUnits(BigInt(bonus.amount_per_claim_atomic),bonus.token_decimals)} {bonus.token_symbol} per qualifying account · {bonus.leg_status.replaceAll("_", " ")}</p>
      <p>{bonus.claimed_count} of {bonus.max_claims} claimed · offer {bonus.offer_status.replaceAll("_", " ")}</p>
      <Show when={bonus.qualification_policies} fallback={<p>Original qualification terms are unavailable for this older reward.</p>}>{policies => <For each={policies()}>{policy => <p class="text-sm">{qualificationText(policy)}</p>}</For>}</Show>
    </section>}</For>
    <Button variant="outline" disabled={busy()} onClick={() => { void load(); }}>My reward status</Button>
    <Show when={error()}>{message => <p role="alert">{message()}</p>}</Show>
    <Show when={privateData()}>{value => <section aria-label="Private account rewards">
      <Show when={value().standing}>{standing => <p>Your standing in this pool: {standing().participant_state.replaceAll("_", " ")}<Show when={standing().sponsor_fallback_state}> · sponsor fallback {standing().sponsor_fallback_state?.replaceAll("_", " ")}</Show></p>}</Show>
      <p>Account reward credits (all songs)</p>
      <Show when={value().credits.items.length} fallback={<p>No credits on this page.</p>}>
        <For each={value().credits.items}>{credit => <p class="break-all text-sm">{formatUnits(BigInt(credit.amount_atomic),credit.token_decimals)} · token {credit.token_address} · {credit.state.replaceAll("_", " ")} · payout persona {credit.payout_persona_id}</p>}</For>
      </Show>
      <Show when={value().credits.next_cursor}>{cursor => <Button variant="outline" disabled={busy()} onClick={() => { void load(cursor()); }}>More credits</Button>}</Show>
    </section>}</Show>
  </div>;
}
