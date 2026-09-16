import { Match, Show, Switch, createSignal } from "solid-js";
import { formatUnits } from "viem";
import { Button, TextField, TextFieldInput, TextFieldLabel } from "../../design-system.ts";
import type { RewardFundingState } from "../../api/reward-funding-controller.ts";
import { failureLine, failureTitle } from "./boost-song-model.ts";

export interface RewardFundingPanelProps {
  readonly state: RewardFundingState;
  readonly personaLabel: string;
  readonly tokenSymbol: string;
  readonly busy: boolean;
  readonly onConfirm: (reviewId: string) => void;
  readonly onRefresh: () => void;
  readonly onReconcile: (hash: string) => void;
}
/** The application owns this approval: the Privy provider is headless. */
export function RewardFundingPanel(props: RewardFundingPanelProps) {
  const [hash, setHash] = createSignal("");
  const reason = () => props.state.kind === "reconciliation" ? props.state.reason : props.state.kind === "server" ? props.state.reconciliationReason : undefined;
  const transaction = () => props.state.kind === "server" ? props.state.funding.transaction_hash : "transactionHash" in props.state ? props.state.transactionHash : null;
  return <div class="space-y-4" aria-live="polite">
    <Switch>
      <Match when={props.state.kind === "review" && props.state}>{state => <>
        <p>Review transfer</p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt>From</dt><dd>{props.personaLabel}</dd>
          <dt>Wallet</dt><dd class="break-all">{state().review.context.funding.sender_address}</dd>
          <dt>Network</dt><dd>Base Sepolia · testnet</dd>
          <dt>Amount</dt><dd>{formatUnits(BigInt(state().review.context.funding.expected_amount_atomic), state().review.context.funding.token_decimals)} {props.tokenSymbol}</dd>
          <dt>Estimated execution fee</dt><dd>{formatUnits(BigInt(state().review.fee.executionFeeAtomic), 18)} ETH</dd>
        </dl>
        <details><summary>Transfer details</summary><dl class="space-y-1 break-all text-sm">
          <dt>Token contract</dt><dd>{state().review.context.funding.token_address}</dd>
          <dt>Recipient</dt><dd>{state().review.context.funding.recipient_address}</dd>
          <dt>Confirmations required</dt><dd>{state().review.context.funding.required_confirmations}</dd>
        </dl><p class="text-sm">The fee estimate excludes the network data fee. The final fee may differ.</p></details>
        <Button disabled={props.busy} onClick={() => props.onConfirm(state().review.id)}>Confirm transfer</Button>
        <Button variant="outline" disabled={props.busy} onClick={props.onRefresh}>Update fee estimate</Button>
      </>}</Match>
      <Match when={props.state.kind === "uncertain"}><p>The wallet may have sent this transfer. Check its status before doing anything else.</p></Match>
      <Match when={props.state.kind === "submitted"}><p>Transfer submitted. Waiting for confirmation.</p></Match>
      <Match when={props.state.kind === "server" && props.state}>{state => <p>{({
        planned: "Funding has not been confirmed.", confirming: "Transfer is confirming.", confirmed: "Funding confirmed.",
        reverted: "The transfer reverted. This reward is not funded.", reconciliation_required: "Funding needs reconciliation.",
      })[state().funding.status]}</p>}</Match>
      <Match when={props.state.kind === "closed"}><p>Reopen rewards with the current persona.</p></Match>
    </Switch>
    <Show when={reason()}>{value => <div role="alert"><p>{failureTitle(value())}</p><p>{failureLine(value())}</p></div>}</Show>
    <Show when={transaction()}>{value => <p class="break-all text-sm">Transaction: {value()}</p>}</Show>
    <Show when={props.state.kind === "reconciliation" && props.state.reason === "transaction_mismatch" && props.state}>{value => <p class="break-all text-sm">Server transaction: {value().serverTransactionHash ?? "No hash reported"}</p>}</Show>
    <Show when={(props.state.kind === "uncertain" || props.state.kind === "reconciliation") && transaction() === null}><p class="text-sm">No transaction hash is available.</p></Show>
    <Show when={props.state.kind === "idle" || props.state.kind === "cancelled" || props.state.kind === "uncertain" || props.state.kind === "reconciliation" || props.state.kind === "submitted" || props.state.kind === "server"}>
      <Button variant="outline" disabled={props.busy} onClick={props.onRefresh}>Check status</Button>
    </Show>
    <Show when={props.state.kind === "uncertain" || props.state.kind === "reconciliation"}>
      <details><summary>Have a transaction hash?</summary>
        <p class="text-sm">Use the hash from your wallet or support. This checks the transfer; it does not send another one.</p>
        <TextField value={hash()} onChange={setHash}><TextFieldLabel>Transaction hash</TextFieldLabel><TextFieldInput /></TextField>
        <Button disabled={props.busy || !/^0x[0-9a-f]{64}$/iu.test(hash())} onClick={() => props.onReconcile(hash())}>Check this transaction</Button>
      </details>
    </Show>
  </div>;
}
