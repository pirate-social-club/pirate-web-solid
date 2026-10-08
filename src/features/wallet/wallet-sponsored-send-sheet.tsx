import { createSignal, Match, onCleanup, onSettled, Show, Switch } from "solid-js";
import { formatUnits, getAddress, parseUnits } from "viem";
import {
  LoadingIndicator,
  Button, Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle,
  TextField, TextFieldInput, TextFieldLabel, Type,
} from "../../design-system.ts";
import { createWalletSponsoredSendData, type WalletSponsoredSendData, type WalletSponsoredSendRecord } from "../../api/wallet-sponsored-send.ts";
import { createRewardWalletSession, type RewardTokenTransfer, type RewardWalletSession } from "../../api/reward-wallet-session.ts";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import { defaultPrivyFactory } from "../../api/privy-session.ts";
import { requestGlobalSignInCompletion } from "../auth/global-sign-in-host.tsx";
import { checkRecipient, explorerTransactionUrl } from "../rewards/winnings-send-model.ts";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const DECIMALS = 6;
type Sender = Readonly<{ address: string; walletIndex: number }>;
type Step = "loading" | "unavailable" | "details" | "authorization" | "review" | "status";
type SigningWallet = Pick<RewardWalletSession, "restoreAuthorization" | "signSponsoredRequest" | "dispose">;

export type WalletSponsoredSendDependencies = Readonly<{
  data: WalletSponsoredSendData;
  openWallet: () => Promise<SigningWallet>;
}>;

export function browserWalletSponsoredSend(): WalletSponsoredSendDependencies {
  return {
    data: createWalletSponsoredSendData(),
    openWallet: async () => createRewardWalletSession(await fetchVerificationConfig(), defaultPrivyFactory, { restoreSaved: true }),
  };
}

/** The ordinary Wallet USDC send; tokens need not come from a reward. */
export function WalletSponsoredSendSheet(props: Readonly<{
  personaId: string;
  walletAddress: string;
  onClose: () => void;
  dependencies?: WalletSponsoredSendDependencies;
}>) {
  const dependencies = props.dependencies ?? browserWalletSponsoredSend();
  const [step, setStep] = createSignal<Step>("loading");
  const [sender, setSender] = createSignal<Sender>();
  const [balance, setBalance] = createSignal<bigint>();
  const [record, setRecord] = createSignal<WalletSponsoredSendRecord | null>(null);
  const [recipient, setRecipient] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [touched, setTouched] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [idempotencyKey, setIdempotencyKey] = createSignal(crypto.randomUUID());
  const signInAbort = new AbortController();
  let alive = true;
  let wallet: SigningWallet | undefined;
  const shutdown = () => { alive = false; signInAbort.abort(); wallet?.dispose(); wallet = undefined; };
  onCleanup(shutdown);
  const close = () => { shutdown(); props.onClose(); };
  const requestClose = () => { if (!busy() && !submitting()) close(); };
  const run = async (operation: () => Promise<void>) => {
    if (busy() || !alive) return;
    setBusy(true);
    setError("");
    try { await operation(); }
    catch {
      if (alive) {
        setError("The send could not be completed. Check its recorded status before trying again.");
        setStep("status");
      }
    } finally { if (alive) setBusy(false); }
  };
  const format = (atomic: bigint) => `${formatUnits(atomic, DECIMALS)} USDC`;
  const recipientCheck = () => checkRecipient(recipient(), sender()?.address ?? props.walletAddress, USDC);
  const amountCheck = () => {
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/u.test(amount().trim())) {
      return { ok: false as const, message: "Enter an amount with up to 6 decimal places." };
    }
    const atomic = parseUnits(amount().trim(), DECIMALS);
    if (atomic <= 0n) return { ok: false as const, message: "Enter an amount above zero." };
    if (balance() === undefined || atomic > balance()!) {
      return { ok: false as const, message: "This wallet does not hold that much USDC." };
    }
    return { ok: true as const, atomic };
  };
  const refresh = async () => {
    const current = await dependencies.data.read(props.personaId);
    if (!alive) return;
    setRecord(current);
    setStep(current === null ? "details" : "status");
  };
  const refreshBalance = async () => {
    const assigned = await dependencies.data.sender(props.personaId);
    if (getAddress(assigned.address) !== getAddress(props.walletAddress)) throw new Error("wallet_assignment_mismatch");
    const held = await dependencies.data.tokenBalance(USDC, assigned.address);
    if (!alive) return;
    setSender(assigned);
    setBalance(held);
    setAmount(formatUnits(held, DECIMALS));
  };
  onSettled(() => {
    void Promise.resolve().then(async () => {
      try {
        await Promise.all([refresh(), refreshBalance()]);
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
  const transfer = (current: WalletSponsoredSendRecord): RewardTokenTransfer => {
    const assigned = sender();
    if (assigned === undefined) throw new Error("wallet_sender_unavailable");
    return {
      sender: assigned.address, token: USDC, recipient: current.recipient_address,
      amountAtomic: current.amount_atomic, walletIndex: assigned.walletIndex,
    };
  };
  const matches = (current: WalletSponsoredSendRecord, intended: RewardTokenTransfer) =>
    current.persona_id === props.personaId && current.chain_id === 84_532 &&
    getAddress(current.sender_address) === getAddress(intended.sender) &&
    getAddress(current.token_address) === getAddress(intended.token) &&
    getAddress(current.recipient_address) === getAddress(intended.recipient) &&
    current.amount_atomic === intended.amountAtomic;
  const authorize = async (current: WalletSponsoredSendRecord) => {
    if (current.status !== "reserved" || current.authorization === null) { await refresh(); return; }
    const fresh = await dependencies.data.read(props.personaId);
    if (!alive) return;
    if (fresh === null || fresh.send_id !== current.send_id || fresh.status !== "reserved" || fresh.authorization === null ||
      fresh.chain_id !== current.chain_id || fresh.token_address !== current.token_address ||
      fresh.sender_address !== current.sender_address || fresh.recipient_address !== current.recipient_address ||
      fresh.amount_atomic !== current.amount_atomic) {
      setRecord(fresh); setStep("status"); setError("The recorded send changed. Nothing was signed."); return;
    }
    const intended = transfer(fresh);
    if (!matches(fresh, intended)) {
      setRecord(fresh); setStep("status"); setError("The assigned wallet changed. Nothing was signed."); return;
    }
    const currentWallet = await openWallet();
    if (!await currentWallet.restoreAuthorization()) { setStep("authorization"); return; }
    const signature = await currentWallet.signSponsoredRequest(intended, fresh.authorization.wallet_id, fresh.authorization.payload_base64);
    if (!alive) return;
    setSubmitting(true); setStep("status");
    try { setRecord(await dependencies.data.submit(fresh.send_id, signature)); }
    catch {
      try { await refresh(); } catch { /* A failed read cannot authorize another submission. */ }
      setError("The send may have reached the network. Check its status; do not send again.");
    } finally { if (alive) setSubmitting(false); }
  };
  const begin = () => run(async () => {
    setTouched(true);
    if (!recipientCheck().ok || !amountCheck().ok) return;
    const current = await openWallet();
    setStep(await current.restoreAuthorization() ? "review" : "authorization");
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
  const confirm = () => run(async () => {
    const to = recipientCheck();
    const value = amountCheck();
    const assigned = sender();
    if (!to.ok || !value.ok || assigned === undefined) { setStep("details"); return; }
    let reserved: WalletSponsoredSendRecord;
    try { reserved = await dependencies.data.reserve(props.personaId, to.address, value.atomic.toString(), idempotencyKey()); }
    catch {
      try { await refresh(); } catch { setStep("unavailable"); }
      setError("The send could not be recorded. Nothing was signed. Check its status.");
      return;
    }
    if (!alive) return;
    setRecord(reserved); setStep("status");
    const intended: RewardTokenTransfer = {
      sender: assigned.address, token: USDC, recipient: to.address,
      amountAtomic: value.atomic.toString(), walletIndex: assigned.walletIndex,
    };
    if (!matches(reserved, intended) || reserved.status !== "reserved" || reserved.authorization === null) {
      setError("The recorded send differs from this form. Nothing was signed."); return;
    }
    await authorize(reserved);
  });
  const startNew = () => run(async () => {
    await refreshBalance();
    if (!alive) return;
    setIdempotencyKey(crypto.randomUUID());
    setRecord(null); setRecipient(""); setTouched(false); setStep("details");
  });
  return <Modal open onOpenChange={open => { if (!open) requestClose(); }}>
    <ModalContent class="flex max-h-[88dvh] w-full flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4 md:max-w-[32rem] md:px-7 md:pb-7 md:pt-7" mobileSide="bottom">
      <ModalHeader class="text-start"><ModalTitle>Send USDC</ModalTitle>
        <ModalDescription>Send from this wallet. Pirate covers the network fee.</ModalDescription></ModalHeader>
      <Show when={error()}>{message => <Type role="alert" class="text-destructive-text break-words">{message()}</Type>}</Show>
      <Switch>
        <Match when={step() === "loading"}><LoadingIndicator label="Loading your wallet" /></Match>
        <Match when={step() === "unavailable"}><Type role="alert">Your wallet or send record could not be loaded. Nothing was signed.</Type><Button onClick={requestClose}>Close</Button></Match>
        <Match when={step() === "details"}><div class="flex flex-col gap-4">
          <Type class="text-sm">Wallet balance: {balance() === undefined ? "unavailable" : format(balance()!)}</Type>
          <TextField value={recipient()} onChange={setRecipient} validationState={touched() && !recipientCheck().ok ? "invalid" : "valid"}>
            <TextFieldLabel>Send to</TextFieldLabel><TextFieldInput placeholder="0x…" autocomplete="off" spellcheck={false} />
          </TextField>
          <Show when={touched() && !recipientCheck().ok}><Type role="alert" class="text-sm text-destructive-text">{(() => { const check = recipientCheck(); return check.ok ? "" : check.message; })()}</Type></Show>
          <TextField value={amount()} onChange={setAmount} validationState={touched() && !amountCheck().ok ? "invalid" : "valid"}>
            <TextFieldLabel>Amount (USDC)</TextFieldLabel><TextFieldInput inputmode="decimal" autocomplete="off" />
          </TextField>
          <Show when={touched() && !amountCheck().ok}><Type role="alert" class="text-sm text-destructive-text">{amountCheck().ok ? "" : amountCheck().message}</Type></Show>
          <Button disabled={busy()} onClick={() => void begin()}>Continue</Button>
        </div></Match>
        <Match when={step() === "authorization"}><Type>Your wallet authorization has ended. Use the usual sign-in to reconnect it before sending.</Type><Button disabled={busy()} onClick={() => void signIn()}>Sign in</Button></Match>
        <Match when={step() === "review"}><div class="flex flex-col gap-4">
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt>Amount</dt><dd>{(() => { const check = amountCheck(); return check.ok ? format(check.atomic) : "Invalid"; })()}</dd>
            <dt>To</dt><dd class="break-all">{recipient()}</dd>
            <dt>From</dt><dd class="break-all">{sender()?.address}</dd>
            <dt>Network</dt><dd>Base Sepolia</dd><dt>Network fee</dt><dd>Covered by Pirate</dd>
          </dl>
          <Button disabled={busy()} onClick={() => void confirm()}>Authorize send</Button>
          <Button variant="ghost" disabled={busy()} onClick={() => setStep("details")}>Change details</Button>
        </div></Match>
        <Match when={step() === "status"}><div class="flex flex-col gap-4" aria-live="polite">
          <Show when={record()}>{current => <>
            <Type class="text-sm">Recorded amount: {format(BigInt(current().amount_atomic))}</Type>
            <Type class="text-sm break-all">To: {current().recipient_address}</Type>
            <Show when={current().transaction_hash}>{hash => <a class="break-all text-sm underline" href={explorerTransactionUrl(hash())} target="_blank" rel="noopener noreferrer">View transfer</a>}</Show>
            <Switch>
              <Match when={current().status === "confirmed"}><Type role="status">This send is confirmed. The USDC arrived at the recipient.</Type></Match>
              <Match when={current().status === "reverted"}><Type role="status">This transaction failed. Its token transfer did not happen.</Type></Match>
              <Match when={current().status === "abandoned"}><Type role="status">This unsigned request expired. No transaction was submitted.</Type></Match>
              <Match when={current().status === "reserved"}><Type role="status">This send is recorded but has not been submitted.</Type><Button disabled={busy() || current().authorization === null || sender() === undefined} onClick={() => void run(() => authorize(current()))}>Authorize recorded send</Button></Match>
              <Match when={true}><Type role="status">The network is checking this send. Check its status before any other action.</Type></Match>
            </Switch>
            <Show when={["confirmed", "reverted", "abandoned"].includes(current().status)}><Button disabled={busy()} onClick={() => void startNew()}>New send</Button></Show>
          </>}</Show>
          <Button variant="outline" disabled={busy()} onClick={() => void run(refresh)}>Refresh status</Button>
          <Button variant="ghost" disabled={busy() || submitting()} onClick={requestClose}>Close</Button>
        </div></Match>
      </Switch>
    </ModalContent>
  </Modal>;
}
