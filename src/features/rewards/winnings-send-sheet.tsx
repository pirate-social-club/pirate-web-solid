import { Match, Show, Switch, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { formatUnits, getAddress } from "viem";
import {
  Button, Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle,
  TextField, TextFieldInput, TextFieldLabel, Type,
} from "../../design-system.ts";
import type { RewardCredit } from "../../api/reward-claim.ts";
import { createWinningsSendData, type WinnerSendRecord, type WinningsSendData, type WinningsSender } from "../../api/reward-winnings-send.ts";
import { createRewardWalletSession, type RewardFeeEstimate, type RewardTokenTransfer, type RewardWalletSession } from "../../api/reward-wallet-session.ts";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import {
  canBroadcast, checkAmount, checkRecipient, defaultAmount, explorerTransactionUrl,
  recordMatches, recordedTransfer, replacementFloor, sendableAtomic, sendFailureMessage,
  transferFor, waitForGasTopup, type GasPollOptions,
} from "./winnings-send-model.ts";

export type WinningsSendWallet = Pick<RewardWalletSession,
  "sendCode" | "loginWithCode" | "selectTestnetFor" | "estimateTransfer" | "sendTransfer" |
  "estimateCancellation" | "sendCancellation" | "dispose">;

export type WinningsSendDependencies = Readonly<{
  data: WinningsSendData;
  openWallet: () => Promise<WinningsSendWallet>;
  poll?: GasPollOptions;
}>;

export function browserWinningsSend(): WinningsSendDependencies {
  return {
    data: createWinningsSendData(),
    openWallet: async () => createRewardWalletSession(await fetchVerificationConfig()),
  };
}

type Step = "loading" | "unavailable" | "details" | "sign_in" | "preparing" | "review" | "status";
type Action = "new" | "retry" | "replace" | "cancel";
type UnattachedHash = Readonly<{ hash: string; kind: "transfer" | "cancel"; sendId: string }>;

/** A server record is required before any winning transfer or cancellation is signed. */
export function WinningsSendSheet(props: Readonly<{ credit: RewardCredit; dependencies: WinningsSendDependencies; onClose: () => void }>) {
  const credit = untrack(() => props.credit);
  const dependencies = untrack(() => props.dependencies);
  const [step, setStep] = createSignal<Step>("loading");
  const [sender, setSender] = createSignal<WinningsSender>();
  const [balance, setBalance] = createSignal<bigint>();
  const [record, setRecord] = createSignal<WinnerSendRecord | null>(null);
  const [recipient, setRecipient] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [touched, setTouched] = createSignal(false);
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [codeSent, setCodeSent] = createSignal(false);
  const [action, setAction] = createSignal<Action>("new");
  const [fee, setFee] = createSignal<RewardFeeEstimate>();
  const [gasLimitReached, setGasLimitReached] = createSignal(false);
  const [gasTopupId, setGasTopupId] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const [broadcasting, setBroadcasting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [unattached, setUnattached] = createSignal<UnattachedHash>();
  const [recoveryHash, setRecoveryHash] = createSignal("");
  let alive = true;
  let wallet: WinningsSendWallet | undefined;

  const shutdown = () => { alive = false; wallet?.dispose(); wallet = undefined; };
  onCleanup(shutdown);
  const close = () => { shutdown(); props.onClose(); };
  const requestClose = () => { if (!broadcasting() && (!busy() || step() === "preparing")) close(); };
  const run = async (operation: () => Promise<void>) => {
    if (busy() || !alive) return;
    setBusy(true);
    setError("");
    try { await operation(); }
    catch (cause) {
      if (alive) {
        setError(sendFailureMessage(cause));
        if (step() === "preparing") setStep(record() === null ? "details" : "status");
      }
    }
    finally { if (alive) setBusy(false); }
  };
  const usdc = (atomic: bigint) => `${formatUnits(atomic, credit.token_decimals)} USDC`;
  const recordedAmount = () => BigInt(record()?.amount_atomic ?? "0");
  const senderMatches = (current: WinnerSendRecord) => {
    const currentSender = sender();
    return currentSender !== undefined && getAddress(current.sender) === getAddress(currentSender.address) &&
      getAddress(current.token_address) === getAddress(credit.token_address) && current.credit_id === credit.credit_id;
  };
  const refresh = async () => {
    const current = await dependencies.data.readSend(credit.credit_id);
    if (!alive) return;
    setRecord(current);
    setStep(current === null ? "details" : "status");
  };

  onSettled(() => {
    void Promise.resolve().then(async () => {
      try {
        const current = await dependencies.data.readSend(credit.credit_id);
        let resolved: WinningsSender;
        try { resolved = await dependencies.data.sender(credit); }
        catch {
          if (alive) { setRecord(current); setStep(current === null ? "unavailable" : "status"); }
          return;
        }
        let held: bigint | undefined;
        try { held = await dependencies.data.tokenBalance(credit.token_address, resolved.address); }
        catch { held = undefined; }
        if (!alive) return;
        setSender(resolved);
        setBalance(held);
        setAmount(defaultAmount(credit, held));
        setRecord(current);
        setStep(current === null ? "details" : "status");
      } catch { if (alive) setStep("unavailable"); }
    });
  });

  const recipientCheck = () => checkRecipient(recipient(), sender()?.address ?? "0x0000000000000000000000000000000000000000", credit.token_address);
  const amountCheck = () => checkAmount(amount(), credit.token_decimals, sendableAtomic(credit, balance()));
  const beginNew = () => {
    setTouched(true);
    const to = recipientCheck();
    const atomic = amountCheck();
    if (!to.ok || !atomic.ok) return;
    setAction("new");
    setRecipient(to.address);
    setAmount(formatUnits(atomic.atomic, credit.token_decimals));
    setCode(""); setCodeSent(false);
    setStep("sign_in");
  };
  const beginRecorded = (next: Exclude<Action, "new">) => {
    const current = record();
    if (current === null || !senderMatches(current)) { setError("The payout wallet no longer matches this send. Contact support."); return; }
    if (next !== "retry" && !canBroadcast(current.status, next)) return;
    if (next === "retry" && current.status !== "retryable" && current.status !== "reverted") return;
    setAction(next);
    setCode(""); setCodeSent(false);
    setStep("sign_in");
  };
  const transfer = (): RewardTokenTransfer => {
    const current = record();
    if (action() !== "new" && current !== null) return recordedTransfer(current, sender()!.walletIndex, action() !== "retry");
    const to = recipientCheck();
    const atomic = amountCheck();
    if (!to.ok || !atomic.ok || sender() === undefined) throw new Error("winnings_send_invalid_input");
    return transferFor(credit, sender()!, to.address, atomic.atomic);
  };
  const openWallet = async () => {
    if (wallet !== undefined) return wallet;
    const opened = await dependencies.openWallet();
    if (!alive) { opened.dispose(); throw new Error("wallet_session_closed"); }
    wallet = opened;
    return opened;
  };
  const sendCode = () => run(async () => {
    try { await (await openWallet()).sendCode(email().trim()); if (alive) setCodeSent(true); }
    catch { if (alive) setError("The code could not be sent. Check the email and try again."); }
  });
  const prepareFee = async (currentWallet: WinningsSendWallet) => {
    const current = record();
    let minimumPrice = 0n;
    if ((action() === "replace" || action() === "cancel") && current?.status === "pending") {
      minimumPrice = replacementFloor(await dependencies.data.replacementGasPrice(current));
    }
    const fixed = transfer();
    const estimate = action() === "cancel"
      ? await currentWallet.estimateCancellation(fixed, minimumPrice)
      : await currentWallet.estimateTransfer(fixed, minimumPrice);
    if (alive) { setFee(estimate); setStep("review"); }
  };
  const waitForGas = async (topupId: string, currentWallet: WinningsSendWallet) => {
    const outcome = await waitForGasTopup(dependencies.data.readGasTopup, topupId, {
      ...dependencies.poll, cancelled: () => !alive || dependencies.poll?.cancelled?.() === true,
    });
    if (!alive) return;
    if (outcome === "confirmed") { setGasTopupId(undefined); await prepareFee(currentWallet); return; }
    if (outcome === "released") throw new Error("gas_topup_released");
    setGasTopupId(topupId);
    setError("Gas is taking longer than usual. Nothing has been signed. Check again.");
    setStep(record() === null ? "details" : "status");
  };
  const prepare = async (currentWallet: WinningsSendWallet) => {
    setStep("preparing");
    setGasLimitReached(false);
    const selected = action();
    const fresh = await dependencies.data.readSend(credit.credit_id);
    if (selected === "new" ? fresh !== null && fresh.status !== "cancelled"
      : fresh === null || !recordMatches(fresh, transfer(), credit.credit_id) ||
        fresh.attempt !== record()?.attempt ||
        (selected === "retry" ? fresh.status !== "retryable" && fresh.status !== "reverted"
          : !canBroadcast(fresh.status, selected))) {
      setRecord(fresh);
      setStep(fresh === null ? "unavailable" : "status");
      setError("The send changed in another session. Check its current status before signing.");
      return;
    }
    if (fresh !== null) setRecord(fresh);
    const response = await dependencies.data.requestGasTopup(credit.credit_id, crypto.randomUUID());
    if (!alive) return;
    if (response.status === "limit_reached") { setGasLimitReached(true); await prepareFee(currentWallet); return; }
    if (response.status === "not_needed") { await prepareFee(currentWallet); return; }
    if (response.topup_id === null) throw new Error("gas_topup_unavailable");
    await waitForGas(response.topup_id, currentWallet);
  };
  const signIn = () => run(async () => {
    const currentWallet = await openWallet();
    try { await currentWallet.loginWithCode(email().trim(), code().trim()); }
    catch { setError("That code did not work. Check it and try again."); return; }
    await currentWallet.selectTestnetFor(transfer());
    await prepare(currentWallet);
  });
  const checkGasAgain = () => run(async () => {
    const id = gasTopupId();
    if (id === undefined) return;
    await waitForGas(id, await openWallet());
  });
  const checkStatus = () => run(refresh);

  const attachKnownHash = async (known: UnattachedHash) => {
    const updated = known.kind === "cancel"
      ? await dependencies.data.attachCancellation(known.sendId, known.hash)
      : await dependencies.data.attachTransfer(known.sendId, known.hash);
    if (!alive) return;
    setUnattached(undefined);
    setRecord(updated);
    setStep("status");
  };
  const retryAttach = () => run(async () => {
    const known = unattached();
    if (known !== undefined) await attachKnownHash(known);
  });
  const recoverHash = (kind: "transfer" | "cancel") => run(async () => {
    const current = record();
    const hash = recoveryHash().trim();
    if (current === null || !/^0x[0-9a-f]{64}$/iu.test(hash)) { setError("Enter a valid transaction hash."); return; }
    await attachKnownHash({ hash, kind, sendId: current.send_id });
    setRecoveryHash("");
  });

  const confirm = () => run(async () => {
    const currentWallet = await openWallet();
    const shownFee = fee();
    if (shownFee === undefined) return;
    const intended = transfer();
    let current = record();
    // A new or reverted attempt is written durably before calling the wallet.
    if (action() === "new" || (action() === "retry" && current?.status === "reverted")) {
      try {
        current = await dependencies.data.requestSend(credit.credit_id, intended.recipient, intended.amountAtomic, crypto.randomUUID());
      } catch (cause) {
        // A lost create response is still a possible success. Read the server and
        // show its record; never sign based on a failed create response.
        try { await refresh(); }
        catch { setStep("unavailable"); }
        setError(sendFailureMessage(cause));
        return;
      }
    } else {
      current = await dependencies.data.readSend(credit.credit_id);
    }
    if (!alive) return;
    setRecord(current);
    if (current === null || !recordMatches(current, intended, credit.credit_id) || !senderMatches(current)) {
      setStep("status");
      setError("The recorded send differs from this form. Nothing was signed. Check its status.");
      return;
    }
    const selected = action();
    const mode = selected === "new" ? "retry" : selected;
    if (!canBroadcast(current.status, mode)) {
      setStep("status");
      setError("The send status changed. Nothing was signed. Check its status.");
      return;
    }
    const fixed = recordedTransfer(current, sender()!.walletIndex, current.status === "pending");
    const sendId = current.send_id;
    // The provider checks the wallet's pending and mined nonce immediately
    // before the RPC. API status is checked again after the fee review.
    setBroadcasting(true);
    try {
      const hash = action() === "cancel"
        ? await currentWallet.sendCancellation(fixed, shownFee, async () => {})
        : await currentWallet.sendTransfer(fixed, shownFee, async () => {});
      const known: UnattachedHash = { hash, kind: action() === "cancel" ? "cancel" : "transfer", sendId };
      setUnattached(known);
      setStep("status");
      try { await attachKnownHash(known); }
      catch { setError("The transaction was submitted, but its hash could not be recorded yet. Use Check transaction to retry recording it. Do not send again."); }
    } catch (cause) {
      setStep("status");
      setError(sendFailureMessage(cause));
      try { await refresh(); }
      catch { /* A failed status read never authorizes another signature. */ }
    } finally { if (alive) setBroadcasting(false); }
  });

  const currentStatus = () => record()?.status;
  const canUseRecordedWallet = () => record() !== null && senderMatches(record()!);
  return (
    <Modal open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <ModalContent class="flex max-h-[88dvh] w-full flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4 md:w-[min(100%-2rem,32rem)] md:max-w-[32rem] md:px-7 md:pb-7 md:pt-7" mobileSide="bottom">
        <ModalHeader class="text-start">
          <ModalTitle>Send winnings</ModalTitle>
          <ModalDescription>Send USDC from the wallet your winnings were paid to.</ModalDescription>
        </ModalHeader>
        <Show when={error()}>{message => <Type role="alert" class="text-destructive-text break-words">{message()}</Type>}</Show>
        <Switch>
          <Match when={step() === "loading"}><Type role="status">Loading your winnings…</Type></Match>
          <Match when={step() === "unavailable"}>
            <Type role="alert">Your payout wallet or send record could not be loaded. Nothing was signed.</Type>
            <Button onClick={close}>Close</Button>
          </Match>
          <Match when={step() === "details"}>
            <div class="flex flex-col gap-4">
              <Type class="text-sm">Winnings paid to this wallet: {usdc(BigInt(credit.paid_atomic))}</Type>
              <Type class="text-sm">Wallet balance: {balance() === undefined ? "unavailable right now" : usdc(balance()!)}</Type>
              <TextField value={recipient()} onChange={setRecipient} validationState={touched() && !recipientCheck().ok ? "invalid" : "valid"}>
                <TextFieldLabel>Send to</TextFieldLabel><TextFieldInput placeholder="0x…" autocomplete="off" spellcheck={false} />
              </TextField>
              <Show when={touched() && recipientCheck()}>{check => { const value = check(); return value.ok ? null : <Type role="alert" class="text-sm text-destructive-text">{value.message}</Type>; }}</Show>
              <TextField value={amount()} onChange={setAmount} validationState={touched() && !amountCheck().ok ? "invalid" : "valid"}>
                <TextFieldLabel>Amount (USDC)</TextFieldLabel><TextFieldInput inputmode="decimal" autocomplete="off" />
              </TextField>
              <Show when={touched() && amountCheck()}>{check => { const value = check(); return value.ok ? null : <Type role="alert" class="text-sm text-destructive-text">{value.message}</Type>; }}</Show>
              <Button disabled={busy()} onClick={beginNew}>Continue</Button>
              <Show when={gasTopupId()}><Button variant="outline" disabled={busy()} onClick={() => void checkGasAgain()}>Check gas again</Button></Show>
            </div>
          </Match>
          <Match when={step() === "sign_in"}>
            <div class="flex flex-col gap-4">
              <Type>Sign in to your wallet. You will review the network fee before signing.</Type>
              <TextField value={email()} onChange={setEmail}>
                <TextFieldLabel>Email for your wallet</TextFieldLabel><TextFieldInput inputmode="email" autocomplete="email" />
              </TextField>
              <Button variant={codeSent() ? "outline" : "default"} disabled={busy() || email().trim().length === 0} onClick={() => void sendCode()}>
                {codeSent() ? "Send a new code" : "Send code"}
              </Button>
              <Show when={codeSent()}>
                <TextField value={code()} onChange={setCode}>
                  <TextFieldLabel>Code</TextFieldLabel><TextFieldInput inputmode="numeric" autocomplete="one-time-code" />
                </TextField>
                <Button disabled={busy() || code().trim().length === 0} onClick={() => void signIn()}>Continue</Button>
              </Show>
              <Button variant="ghost" disabled={busy()} onClick={() => setStep(record() === null ? "details" : "status")}>Back</Button>
            </div>
          </Match>
          <Match when={step() === "preparing"}><Type role="status">Preparing the network fee…</Type></Match>
          <Match when={step() === "review"}>
            <div class="flex flex-col gap-4">
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt>Action</dt><dd>{action() === "cancel" ? "Cancel this send" : action() === "replace" ? "Replace the pending send" : "Send winnings"}</dd>
                <dt>Amount</dt><dd>{usdc(action() === "new" ? (() => { const value = amountCheck(); return value.ok ? value.atomic : 0n; })() : recordedAmount())}</dd>
                <dt>To</dt><dd class="break-all">{action() === "new" ? recipient() : record()?.recipient}</dd>
                <dt>From</dt><dd class="break-all">{sender()?.address}</dd>
                <dt>Network</dt><dd>Base Sepolia</dd>
                <dt>Network fee</dt><dd>up to {formatUnits(BigInt(fee()?.executionFeeAtomic ?? "0"), 18)} ETH</dd>
              </dl>
              <Show when={action() === "cancel"}><Type class="text-sm">A transfer already on the network may land before the cancellation. Check the final status afterward.</Type></Show>
              <Show when={gasLimitReached()}><Type class="text-sm">Gas help is used up for today, so your wallet pays this fee with its own ETH.</Type></Show>
              <Button disabled={busy()} onClick={() => void confirm()}>{action() === "cancel" ? "Sign cancellation" : action() === "replace" ? "Replace send" : "Send winnings"}</Button>
              <Button variant="ghost" disabled={busy()} onClick={requestClose}>Back</Button>
            </div>
          </Match>
          <Match when={step() === "status"}>
            <div class="flex flex-col gap-4" aria-live="polite">
              <Show when={record()}>{current => (
                <>
                  <Type class="text-sm">Recorded amount: {usdc(BigInt(current().amount_atomic))}</Type>
                  <Type class="text-sm break-all">To: {current().recipient}</Type>
                  <Show when={current().transaction_hashes.at(-1)}>{hash => <a class="break-all text-sm underline" href={explorerTransactionUrl(hash())} target="_blank" rel="noopener noreferrer">View transfer {hash()}</a>}</Show>
                  <Show when={current().cancellation_hashes.at(-1)}>{hash => <a class="break-all text-sm underline" href={explorerTransactionUrl(hash())} target="_blank" rel="noopener noreferrer">View cancellation {hash()}</a>}</Show>
                  <Switch>
                    <Match when={currentStatus() === "confirmed"}><Type role="status">This send is confirmed. The USDC arrived at the recipient.</Type></Match>
                    <Match when={currentStatus() === "cancelled"}>
                      <Type role="status">This send was cancelled. The USDC stayed in your wallet.</Type>
                      <Button disabled={busy()} onClick={() => { setRecord(null); setStep("details"); }}>Start a new send</Button>
                    </Match>
                    <Match when={currentStatus() === "reverted"}>
                      <Type role="status">This send failed on the network. The USDC stayed in your wallet.</Type>
                      <Button disabled={busy() || !canUseRecordedWallet()} onClick={() => beginRecorded("retry")}>Try again</Button>
                    </Match>
                    <Match when={currentStatus() === "retryable"}>
                      <Type role="status">No transfer with this recorded transaction number is currently known. A retry uses that same number.</Type>
                      <Button disabled={busy() || !canUseRecordedWallet() || unattached() !== undefined} onClick={() => beginRecorded("retry")}>Try send again</Button>
                      <Button variant="outline" disabled={busy() || !canUseRecordedWallet() || unattached() !== undefined} onClick={() => beginRecorded("cancel")}>Cancel send</Button>
                    </Match>
                    <Match when={currentStatus() === "pending"}>
                      <Type role="status">The network is still checking this send. Wait for its final result, or use the same transaction number to replace or cancel it.</Type>
                      <Show when={current().transaction_hashes.length + current().cancellation_hashes.length > 0}>
                        <Button disabled={busy() || !canUseRecordedWallet() || unattached() !== undefined} onClick={() => beginRecorded("replace")}>Replace with higher fee</Button>
                        <Button variant="outline" disabled={busy() || !canUseRecordedWallet() || unattached() !== undefined} onClick={() => beginRecorded("cancel")}>Cancel send</Button>
                      </Show>
                    </Match>
                    <Match when={currentStatus() === "settled_unverified"}>
                      <Type role="alert">The recorded transaction number was used, but this send could not be verified. Do not send again. If you have a transaction hash, check it below, or contact support.</Type>
                    </Match>
                  </Switch>
                  <Show when={currentStatus() === "settled_unverified" || currentStatus() === "retryable" ||
                    (currentStatus() === "pending" && current().transaction_hashes.length + current().cancellation_hashes.length === 0)}>
                    <Type class="text-sm">If your wallet shows a transaction hash for this send, record it here.</Type>
                    <TextField value={recoveryHash()} onChange={setRecoveryHash}>
                      <TextFieldLabel>Transaction hash</TextFieldLabel><TextFieldInput placeholder="0x…" autocomplete="off" spellcheck={false} />
                    </TextField>
                    <Button disabled={busy()} onClick={() => void recoverHash("transfer")}>Check transfer hash</Button>
                    <Button variant="outline" disabled={busy()} onClick={() => void recoverHash("cancel")}>Check cancel hash</Button>
                  </Show>
                  <Show when={!canUseRecordedWallet() && currentStatus() !== "confirmed" && currentStatus() !== "cancelled"}>
                    <Type role="alert">The payout wallet no longer matches your current wallet. Contact support before signing anything.</Type>
                  </Show>
                </>
              )}</Show>
              <Show when={unattached()}>{known => (
                <>
                  <Type role="alert">A transaction was submitted, but its hash has not been recorded by the server. Do not send again.</Type>
                  <a class="break-all text-sm underline" href={explorerTransactionUrl(known().hash)} target="_blank" rel="noopener noreferrer">View submitted transaction {known().hash}</a>
                  <Button disabled={busy()} onClick={() => void retryAttach()}>Check transaction</Button>
                </>
              )}</Show>
              <Show when={gasTopupId()}><Button variant="outline" disabled={busy()} onClick={() => void checkGasAgain()}>Check gas again</Button></Show>
              <Button variant="outline" disabled={busy()} onClick={() => void checkStatus()}>Refresh status</Button>
              <Button variant="ghost" disabled={busy()} onClick={requestClose}>Close</Button>
            </div>
          </Match>
        </Switch>
      </ModalContent>
    </Modal>
  );
}
