import { Match, Show, Switch, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { formatUnits, getAddress } from "viem";
import {
  Button, Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle,
  TextField, TextFieldInput, TextFieldLabel, Type,
} from "../../design-system.ts";
import type { RewardCredit } from "../../api/reward-claim.ts";
import { createSponsoredSendData, type SponsoredSendData, type SponsoredSendRecord } from "../../api/reward-sponsored-send.ts";
import type { WinnerSendRecord } from "../../api/reward-winnings-send.ts";
import { createRewardWalletSession, type RewardTokenTransfer, type RewardWalletSession } from "../../api/reward-wallet-session.ts";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import { defaultPrivyFactory } from "../../api/privy-session.ts";
import { requestGlobalSignInCompletion } from "../auth/global-sign-in-host.tsx";
import { checkAmount, checkRecipient, defaultAmount, explorerTransactionUrl, sendableAtomic } from "./winnings-send-model.ts";

export type SponsoredSendWallet = Pick<RewardWalletSession,
  "restoreAuthorization" | "signSponsoredRequest" | "dispose">;
export type SponsoredSendDependencies = Readonly<{
  data: SponsoredSendData;
  openWallet: () => Promise<SponsoredSendWallet>;
}>;

export function browserSponsoredSend(): SponsoredSendDependencies {
  return {
    data: createSponsoredSendData(),
    openWallet: async () => createRewardWalletSession(await fetchVerificationConfig(), defaultPrivyFactory, { restoreSaved: true }),
  };
}

type Step = "loading" | "unavailable" | "details" | "wallet_authorization" | "review" | "status";
type Sender = { readonly address: string; readonly walletIndex: number };

/** One durable server record is required before the wallet signs the exact sponsored request. */
export function SponsoredSendSheet(props: Readonly<{ credit: RewardCredit; dependencies: SponsoredSendDependencies; onClose: () => void }>) {
  const credit = untrack(() => props.credit);
  const dependencies = untrack(() => props.dependencies);
  const [step, setStep] = createSignal<Step>("loading");
  const [sender, setSender] = createSignal<Sender>();
  const [balance, setBalance] = createSignal<bigint>();
  const [record, setRecord] = createSignal<SponsoredSendRecord | null>(null);
  const [directSend, setDirectSend] = createSignal<WinnerSendRecord | null>(null);
  const [recipient, setRecipient] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [touched, setTouched] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");
  const idempotencyKey = crypto.randomUUID();
  const signInAbort = new AbortController();
  let alive = true;
  let wallet: SponsoredSendWallet | undefined;
  const shutdown = () => { alive = false; signInAbort.abort(); wallet?.dispose(); wallet = undefined; };
  onCleanup(shutdown);
  const close = () => { shutdown(); props.onClose(); };
  const requestClose = () => { if (!submitting()) close(); };
  const run = async (operation: () => Promise<void>) => {
    if (busy() || !alive) return;
    setBusy(true);
    setError("");
    try { await operation(); }
    catch {
      if (alive) { setError("This send could not be completed. Check its recorded status before trying again."); setStep("status"); }
    } finally { if (alive) setBusy(false); }
  };
  const usdc = (atomic: bigint) => `${formatUnits(atomic, credit.token_decimals)} USDC`;
  const recipientCheck = () => checkRecipient(recipient(), sender()?.address ?? "0x0000000000000000000000000000000000000000", credit.token_address);
  const amountCheck = () => checkAmount(amount(), credit.token_decimals, sendableAtomic(credit, balance()));

  const refresh = async () => {
    const [sponsored, direct] = await Promise.all([
      dependencies.data.read(credit.credit_id), dependencies.data.readDirectSend(credit.credit_id),
    ]);
    if (!alive) return;
    setRecord(sponsored);
    setDirectSend(direct);
    setStep(sponsored === null && direct === null ? "details" : "status");
  };
  onSettled(() => {
    void Promise.resolve().then(async () => {
      try {
        const [sponsored, direct] = await Promise.all([
          dependencies.data.read(credit.credit_id), dependencies.data.readDirectSend(credit.credit_id),
        ]);
        let resolved: Sender | undefined;
        let held: bigint | undefined;
        try {
          resolved = await dependencies.data.sender(credit);
          held = await dependencies.data.tokenBalance(credit.token_address, resolved.address);
        } catch { /* Existing status remains readable when a wallet read fails. */ }
        if (!alive) return;
        setRecord(sponsored);
        setDirectSend(direct);
        setSender(resolved);
        setBalance(held);
        setAmount(defaultAmount(credit, held));
        setStep(sponsored !== null || direct !== null ? "status" : resolved === undefined ? "unavailable" : "details");
      } catch { if (alive) setStep("unavailable"); }
    });
  });

  const openWallet = async () => {
    if (wallet !== undefined) return wallet;
    const opened = await dependencies.openWallet();
    if (!alive) { opened.dispose(); throw new Error("wallet_session_closed"); }
    wallet = opened;
    return opened;
  };
  const begin = () => run(async () => {
    setTouched(true);
    if (!recipientCheck().ok || !amountCheck().ok) return;
    const current = await openWallet();
    if (!await current.restoreAuthorization()) { setStep("wallet_authorization"); return; }
    setStep("review");
  });
  const signIn = () => run(async () => {
    const authenticated = await requestGlobalSignInCompletion(signInAbort.signal);
    if (!alive || !authenticated) return;
    wallet?.dispose(); wallet = undefined;
    const current = await openWallet();
    if (!await current.restoreAuthorization()) {
      setError("Wallet authorization could not be restored. Sign in again from the Wallet page.");
      return;
    }
    setStep("review");
  });
  const matches = (current: SponsoredSendRecord, transfer: RewardTokenTransfer) =>
    current.credit_id === credit.credit_id && current.chain_id === credit.chain_id &&
    getAddress(current.sender_address) === getAddress(transfer.sender) &&
    getAddress(current.recipient_address) === getAddress(transfer.recipient) &&
    current.amount_atomic === transfer.amountAtomic;
  const transfer = (current: SponsoredSendRecord): RewardTokenTransfer => {
    const assigned = sender();
    if (assigned === undefined) throw new Error("winnings_sender_unavailable");
    return {
      sender: assigned.address, token: credit.token_address, recipient: current.recipient_address,
      amountAtomic: current.amount_atomic, walletIndex: assigned.walletIndex,
    };
  };
  const authorize = async (current: SponsoredSendRecord) => {
    if (current.status !== "reserved" || current.authorization === null) { await refresh(); return; }
    const fresh = await dependencies.data.read(credit.credit_id);
    if (!alive) return;
    if (fresh === null || fresh.send_id !== current.send_id || fresh.status !== "reserved" || fresh.authorization === null ||
      fresh.chain_id !== current.chain_id || fresh.sender_address !== current.sender_address ||
      fresh.recipient_address !== current.recipient_address || fresh.amount_atomic !== current.amount_atomic) {
      setRecord(fresh); setStep("status");
      setError("The recorded send changed. Nothing was signed.");
      return;
    }
    const intended = transfer(fresh);
    if (!matches(fresh, intended)) {
      setRecord(fresh); setStep("status");
      setError("The payout wallet no longer matches this send. Nothing was signed.");
      return;
    }
    const currentWallet = await openWallet();
    if (!await currentWallet.restoreAuthorization()) { setStep("wallet_authorization"); return; }
    const signature = await currentWallet.signSponsoredRequest(intended, fresh.authorization.wallet_id, fresh.authorization.payload_base64);
    if (!alive) return;
    // Once submit starts its outcome can be unknown. Never submit or sign a
    // second time from this sheet; status must come from the server.
    setSubmitting(true);
    setStep("status");
    try { setRecord(await dependencies.data.submit(fresh.send_id, signature)); }
    catch {
      try { await refresh(); }
      catch { /* An unavailable status cannot authorize another attempt. */ }
      setError("The send may have reached the network. Check its status; do not send again.");
    } finally { if (alive) setSubmitting(false); }
  };
  const confirm = () => run(async () => {
    const to = recipientCheck();
    const value = amountCheck();
    const assigned = sender();
    if (!to.ok || !value.ok || assigned === undefined) { setStep("details"); return; }
    const existing = await dependencies.data.read(credit.credit_id);
    const direct = await dependencies.data.readDirectSend(credit.credit_id);
    if (!alive) return;
    if (existing !== null || direct !== null) {
      setRecord(existing); setDirectSend(direct); setStep("status");
      setError("This winning already has a send record. Review it before doing anything else.");
      return;
    }
    let reserved: SponsoredSendRecord;
    try { reserved = await dependencies.data.reserve(credit.credit_id, to.address, value.atomic.toString(), idempotencyKey); }
    catch {
      // A lost response may still have reserved the send. A read is safe; no
      // wallet signing takes place after a failed reservation response.
      try { await refresh(); } catch { setStep("unavailable"); }
      setError("The send could not be recorded. Nothing was signed. Check its status.");
      return;
    }
    if (!alive) return;
    setRecord(reserved); setStep("status");
    const intended: RewardTokenTransfer = {
      sender: assigned.address, token: credit.token_address, recipient: to.address,
      amountAtomic: value.atomic.toString(), walletIndex: assigned.walletIndex,
    };
    if (!matches(reserved, intended) || reserved.status !== "reserved" || reserved.authorization === null) {
      setError("The recorded send differs from this form. Nothing was signed.");
      return;
    }
    await authorize(reserved);
  });

  return (
    <Modal open onOpenChange={(open) => { if (!open) requestClose(); }}>
      <ModalContent class="flex max-h-[88dvh] w-full flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4 md:w-[min(100%-2rem,32rem)] md:max-w-[32rem] md:px-7 md:pb-7 md:pt-7" mobileSide="bottom">
        <ModalHeader class="text-start">
          <ModalTitle>Send USDC</ModalTitle>
          <ModalDescription>Send from the wallet that received your winnings. Pirate covers the network fee.</ModalDescription>
        </ModalHeader>
        <Show when={error()}>{message => <Type role="alert" class="text-destructive-text break-words">{message()}</Type>}</Show>
        <Switch>
          <Match when={step() === "loading"}><Type role="status">Loading your winnings…</Type></Match>
          <Match when={step() === "unavailable"}>
            <Type role="alert">Your payout wallet or send record could not be loaded. Nothing was signed.</Type>
            <Button onClick={requestClose}>Close</Button>
          </Match>
          <Match when={step() === "details"}>
            <div class="flex flex-col gap-4">
              <Type class="text-sm">Winnings paid: {usdc(BigInt(credit.paid_atomic))}</Type>
              <Type class="text-sm">Wallet balance: {balance() === undefined ? "unavailable right now" : usdc(balance()!)}</Type>
              <TextField value={recipient()} onChange={setRecipient} validationState={touched() && !recipientCheck().ok ? "invalid" : "valid"}>
                <TextFieldLabel>Send to</TextFieldLabel><TextFieldInput placeholder="0x…" autocomplete="off" spellcheck={false} />
              </TextField>
              <Show when={touched() && recipientCheck()}>{check => { const value = check(); return value.ok ? null : <Type role="alert" class="text-sm text-destructive-text">{value.message}</Type>; }}</Show>
              <TextField value={amount()} onChange={setAmount} validationState={touched() && !amountCheck().ok ? "invalid" : "valid"}>
                <TextFieldLabel>Amount (USDC)</TextFieldLabel><TextFieldInput inputmode="decimal" autocomplete="off" />
              </TextField>
              <Show when={touched() && amountCheck()}>{check => { const value = check(); return value.ok ? null : <Type role="alert" class="text-sm text-destructive-text">{value.message}</Type>; }}</Show>
              <Button disabled={busy()} onClick={() => void begin()}>Continue</Button>
            </div>
          </Match>
          <Match when={step() === "wallet_authorization"}>
            <Type>Your wallet authorization has ended. Use the usual sign-in to reconnect it before sending.</Type>
            <Button disabled={busy()} onClick={() => void signIn()}>Sign in</Button>
          </Match>
          <Match when={step() === "review"}>
            <div class="flex flex-col gap-4">
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt>Amount</dt><dd>{(() => { const value = amountCheck(); return value.ok ? usdc(value.atomic) : "Invalid"; })()}</dd>
                <dt>To</dt><dd class="break-all">{recipient()}</dd>
                <dt>From</dt><dd class="break-all">{sender()?.address}</dd>
                <dt>Network</dt><dd>Base Sepolia</dd>
                <dt>Network fee</dt><dd>Covered by Pirate</dd>
              </dl>
              <Button disabled={busy()} onClick={() => void confirm()}>Authorize send</Button>
              <Button variant="ghost" disabled={busy()} onClick={() => setStep("details")}>Change details</Button>
            </div>
          </Match>
          <Match when={step() === "status"}>
            <div class="flex flex-col gap-4" aria-live="polite">
              <Show when={directSend()}>{old => (
                <>
                  <Type role="status">This winning already has a send through the earlier wallet flow: {old().status.replaceAll("_", " ")}.</Type>
                  <Show when={old().transaction_hashes.at(-1)}>{hash => <a class="break-all text-sm underline" href={explorerTransactionUrl(hash())} target="_blank" rel="noopener noreferrer">View earlier transfer</a>}</Show>
                </>
              )}</Show>
              <Show when={record()}>{current => (
                <>
                  <Type class="text-sm">Recorded amount: {usdc(BigInt(current().amount_atomic))}</Type>
                  <Type class="text-sm break-all">To: {current().recipient_address}</Type>
                  <Show when={current().transaction_hash}>{hash => <a class="break-all text-sm underline" href={explorerTransactionUrl(hash())} target="_blank" rel="noopener noreferrer">View transfer</a>}</Show>
                  <Switch>
                    <Match when={current().status === "confirmed"}><Type role="status">This send is confirmed. The USDC arrived at the recipient.</Type></Match>
                    <Match when={current().status === "reverted"}><Type role="status">This transaction failed. Contact support before another send.</Type></Match>
                    <Match when={current().status === "abandoned"}><Type role="status">This unsigned request expired. No transaction was submitted.</Type></Match>
                    <Match when={current().status === "reserved"}>
                      <Type role="status">This send is recorded but has not been submitted.</Type>
                      <Button disabled={busy() || current().authorization === null || sender() === undefined} onClick={() => void run(() => authorize(current()))}>Authorize recorded send</Button>
                    </Match>
                    <Match when={true}><Type role="status">The network is checking this send. Check its status before any other action.</Type></Match>
                  </Switch>
                </>
              )}</Show>
              <Button variant="outline" disabled={busy()} onClick={() => void run(refresh)}>Refresh status</Button>
              <Button variant="ghost" disabled={busy() || submitting()} onClick={requestClose}>Close</Button>
            </div>
          </Match>
        </Switch>
      </ModalContent>
    </Modal>
  );
}
