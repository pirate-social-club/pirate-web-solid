import { sharedPotDisposition } from "../rewards/shared-pot-terms.ts";
import { For } from "solid-js";
import { Button, Type } from "../../design-system";
import { rewardTime } from "../rewards/megapot-participant-model";
import { sharedSongAmount } from "../rewards/shared-song-participation-model";
import type { DanceCaptureContext } from "./dance-preparation-api";

/** Only the session's immutable captured objectives belong here. Fetching the
 * current song pot would silently replace what this recording can qualify for. */
export function DanceFundedObjectives(props: {
  readonly context: DanceCaptureContext;
  readonly onAccept: () => void;
}) {
  return <section aria-label="Captured funded Dance objectives" class="space-y-4">
    <Type as="h2" variant="h3">Before you record</Type>
    <p>A passed owner review can earn one equal share of this song’s pool winnings if its ticket wins. A share is not an extra ticket or a guaranteed payment.</p>
    <p>The community owner must mark this take Passed before the drawing’s cutoff. Private and public takes qualify equally.</p>
    <For each={props.context.objectives}>{objective => <p>Funded window ends <time datetime={objective.terms.ends_at}>{rewardTime(objective.terms.ends_at)}</time>. {objective.chain_id === 84532 ? "Base Sepolia · test USDC has no spendable value." : "Base · USDC."}</p>}</For>
    <details class="space-y-3 rounded-xl border border-border-soft p-4"><summary class="cursor-pointer font-medium">Drawing details and terms</summary>
    <p>Qualify again for each drawing. More qualifying activities in the same drawing do not add another share.</p>
    <For each={props.context.objectives}>{objective => <div class="space-y-3 rounded-lg border border-border-soft p-4">
      <p>Requirement: a passed owner review under the captured Dance policy. There is no numeric Dance score.</p>
      <p>Funded window: <time datetime={objective.terms.starts_at}>{rewardTime(objective.terms.starts_at)}</time> to <time datetime={objective.terms.ends_at}>{rewardTime(objective.terms.ends_at)}</time>.</p>
      <p>Maximum ticket price: {sharedSongAmount(objective.terms.ticket_price_ceiling_atomic, objective.chain_id)}. Pool funds are not your winnings.</p>
      <p class="break-words">{sharedPotDisposition(objective.terms)}</p>
      <p>{objective.chain_id === 84532 ? "Base Sepolia · test USDC has no spendable value." : "Base · USDC."}</p>
    </div>}</For>
    <p>Any allocation is net of Megapot’s observed referral win share. Winnings remain held until you verify and Claim in Wallet; payout follows.</p>
    </details>
    <p>By continuing, you accept these captured drawing terms for this take.</p>
    <Button class="w-full" onClick={props.onAccept}>Accept and continue</Button>
  </section>;
}
