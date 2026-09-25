import { Match, Show, Switch, createSignal, onCleanup, onSettled, untrack } from "solid-js";
import { formatUnits } from "viem";
import {
  Button, Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle,
  TextField, TextFieldInput, TextFieldLabel, Type,
} from "../../design-system.ts";
import type { RewardCredit } from "../../api/reward-claim.ts";
import { createWinningsSendData, type WinningsSendData, type WinningsSender } from "../../api/reward-winnings-send.ts";
import { createRewardWalletSession, type RewardWalletSession } from "../../api/reward-wallet-session.ts";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import {
  checkAmount, checkRecipient, createWinningsSendController, defaultAmount, explorerTransactionUrl,
  failureMessage, transferFor, type GasPollOptions, type SendFailure, type SendState, type WinningsSendController,
} from "./winnings-send-model.ts";

export type WinningsSendWallet = Pick<
  RewardWalletSession, "sendCode" | "loginWithCode" | "selectTestnetFor" | "estimateTransfer" | "sendTransfer" | "dispose"
>;

export type WinningsSendDependencies = Readonly<{
  data: WinningsSendData;
  /** A separate, short-lived wallet sign-in; it never touches the app session. */
  openWallet: () => Promise<WinningsSendWallet>;
  poll?: GasPollOptions;
}>;

export function browserWinningsSend(): WinningsSendDependencies {
  return {
    data: createWinningsSendData(),
    openWallet: async () => createRewardWalletSession(await fetchVerificationConfig()),
  };
}

type Step = "loading" | "unavailable" | "details" | "sign_in" | "progress";

const retryable: ReadonlySet<SendFailure> = new Set(["unavailable", "gas_failed", "no_eth", "gas_limit_no_eth", "refused", "not_sent", "failed"]);

/** Spec 015 §5.2a: send claimed winnings on from the wallet they were paid to. */
export function WinningsSendSheet(props: Readonly<{ credit: RewardCredit; dependencies: WinningsSendDependencies; onClose: () => void }>) {
  const credit = untrack(() => props.credit);
  const dependencies = untrack(() => props.dependencies);
  const decimals = credit.token_decimals;
  const [step, setStep] = createSignal<Step>("loading");
  const [sender, setSender] = createSignal<WinningsSender>();
  const [balance, setBalance] = createSignal<bigint>();
  const [recipient, setRecipient] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [touched, setTouched] = createSignal(false);
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [codeSent, setCodeSent] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [send, setSend] = createSignal<SendState>({ kind: "gas" });
  const [atomic, setAtomic] = createSignal(0n);
  const [to, setTo] = createSignal("");
  let alive = true;
  let wallet: WinningsSendWallet | undefined;
  let controller: WinningsSendController | undefined;

  const shutdown = () => {
    alive = false;
    controller?.close();
    wallet?.dispose();
    controller = undefined;
    wallet = undefined;
  };
  onCleanup(shutdown);
  const close = () => { shutdown(); props.onClose(); };

  const run = async (operation: () => Promise<void>) => {
    if (busy() || !alive) return;
    setBusy(true);
    setError("");
    try { await operation(); }
    finally { if (alive) setBusy(false); }
  };

  // Solid 2 rejects signal writes made synchronously inside settle callbacks.
  onSettled(() => {
    void Promise.resolve().then(async () => {
      let resolved: WinningsSender;
      try { resolved = await dependencies.data.sender(credit); }
      catch { if (alive) setStep("unavailable"); return; }
      let held: bigint | undefined;
      try { held = await dependencies.data.tokenBalance(credit.token_address, resolved.address); }
      catch { held = undefined; }
      if (!alive) return;
      setSender(resolved);
      setBalance(held);
      setAmount(defaultAmount(credit, held));
      setStep("details");
    });
  });

  const recipientCheck = () => checkRecipient(recipient(), sender()?.address ?? "0x0000000000000000000000000000000000000000");
  const amountCheck = () => checkAmount(amount(), decimals, balance());
  const toSignIn = () => {
    setTouched(true);
    const target = recipientCheck();
    const value = amountCheck();
    if (!target.ok || !value.ok) return;
    setTo(target.address);
    setAtomic(value.atomic);
    setStep("sign_in");
  };

  const transfer = () => transferFor(credit, sender()!, to(), atomic());
  const openWallet = async () => {
    if (wallet !== undefined) return wallet;
    const opened = await dependencies.openWallet();
    if (!alive) { opened.dispose(); throw new Error("wallet_session_closed"); }
    wallet = opened;
    return opened;
  };
  const sendCode = () => run(async () => {
    try {
      await (await openWallet()).sendCode(email().trim());
      if (alive) setCodeSent(true);
    } catch (cause) {
      if (alive) setError(cause instanceof Error && cause.message === "wallet_auth_unavailable"
        ? "Wallet sign-in is not available right now."
        : "The code could not be sent. Check the email and try again.");
    }
  });
  const signIn = () => run(async () => {
    const session = await openWallet().catch(() => undefined);
    if (session === undefined) { setError("Wallet sign-in is not available right now."); return; }
    try { await session.loginWithCode(email().trim(), code().trim()); }
    catch { if (alive) setError("That code did not work. Check it and try again."); return; }
    const fixed = transfer();
    try { await session.selectTestnetFor(fixed); }
    catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      if (alive) setError(failureMessage(reason === "wallet_assignment_mismatch" ? "wrong_wallet" : reason === "wallet_wrong_chain" ? "wrong_network" : "failed"));
      return;
    }
    if (!alive) return;
    controller?.close();
    controller = createWinningsSendController({
      creditId: credit.credit_id, transfer: fixed, wallet: session,
      requestGasTopup: dependencies.data.requestGasTopup, readGasTopup: dependencies.data.readGasTopup,
      onState: (next) => { if (alive) setSend(next); },
      poll: dependencies.poll,
    });
    setStep("progress");
    await controller.prepare();
  });
  const act = (operation: (value: WinningsSendController) => Promise<SendState>) => run(async () => {
    if (controller !== undefined) await operation(controller);
  });

  const failure = () => { const state = send(); return state.kind === "failed" ? state : undefined; };
  const review = () => { const state = send(); return state.kind === "review" ? state : undefined; };
  const sent = () => { const state = send(); return state.kind === "sent" ? state : undefined; };
  const usdc = (value: bigint) => `${formatUnits(value, decimals)} USDC`;

  return (
    <Modal open onOpenChange={(open) => { if (!open) close(); }}>
      <ModalContent class="flex max-h-[88dvh] w-full flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4 md:w-[min(100%-2rem,32rem)] md:max-w-[32rem] md:px-7 md:pb-7 md:pt-7" mobileSide="bottom">
        <ModalHeader class="text-start">
          <ModalTitle>Send winnings</ModalTitle>
          <ModalDescription>Send USDC from the wallet your winnings were paid to.</ModalDescription>
        </ModalHeader>
        <Show when={error()}>{(message) => <Type role="alert" class="text-destructive-text break-words">{message()}</Type>}</Show>
        <Switch>
          <Match when={step() === "loading"}><Type role="status">Loading your wallet…</Type></Match>
          <Match when={step() === "unavailable"}>
            <Type role="alert">The wallet your winnings were paid to could not be found. Nothing was sent.</Type>
            <Button variant="outline" onClick={close}>Close</Button>
          </Match>
          <Match when={step() === "details"}>
            <div class="flex flex-col gap-4">
              <Type class="text-sm">
                Balance: {balance() === undefined ? "unavailable right now" : usdc(balance()!)}
              </Type>
              <TextField value={recipient()} onChange={setRecipient} validationState={touched() && !recipientCheck().ok ? "invalid" : "valid"}>
                <TextFieldLabel>Send to</TextFieldLabel>
                <TextFieldInput placeholder="0x…" autocomplete="off" spellcheck={false} />
              </TextField>
              <Show when={touched() && recipientCheck()}>{(check) => {
                const current = check();
                return current.ok ? null : <Type role="alert" class="text-sm text-destructive-text">{current.message}</Type>;
              }}</Show>
              <TextField value={amount()} onChange={setAmount} validationState={touched() && !amountCheck().ok ? "invalid" : "valid"}>
                <TextFieldLabel>Amount (USDC)</TextFieldLabel>
                <TextFieldInput inputmode="decimal" autocomplete="off" />
              </TextField>
              <Show when={touched() && amountCheck()}>{(check) => {
                const current = check();
                return current.ok ? null : <Type role="alert" class="text-sm text-destructive-text">{current.message}</Type>;
              }}</Show>
              <Button onClick={toSignIn}>Continue</Button>
            </div>
          </Match>
          <Match when={step() === "sign_in"}>
            <div class="flex flex-col gap-4">
              <Type>Sign in to your wallet to send {usdc(atomic())}. You will see the network fee before anything is sent.</Type>
              <TextField value={email()} onChange={setEmail}>
                <TextFieldLabel>Email for your wallet</TextFieldLabel>
                <TextFieldInput inputmode="email" autocomplete="email" />
              </TextField>
              <Button variant={codeSent() ? "outline" : "default"} disabled={busy() || email().trim().length === 0} onClick={() => void sendCode()}>
                {codeSent() ? "Send a new code" : "Send code"}
              </Button>
              <Show when={codeSent()}>
                <TextField value={code()} onChange={setCode}>
                  <TextFieldLabel>Code</TextFieldLabel>
                  <TextFieldInput inputmode="numeric" autocomplete="one-time-code" />
                </TextField>
                <Button disabled={busy() || code().trim().length === 0} onClick={() => void signIn()}>Continue</Button>
              </Show>
              <Button variant="ghost" disabled={busy()} onClick={() => setStep("details")}>Back</Button>
            </div>
          </Match>
          <Match when={step() === "progress"}>
            <div class="flex flex-col gap-4" aria-live="polite">
              <Switch>
                <Match when={send().kind === "gas"}>
                  <Type role="status">Waiting for gas. We are adding a little ETH to your wallet to pay the network fee.</Type>
                </Match>
                <Match when={review()}>{(state) => (
                  <>
                    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                      <dt>Amount</dt><dd>{usdc(atomic())}</dd>
                      <dt>To</dt><dd class="break-all">{to()}</dd>
                      <dt>From</dt><dd class="break-all">{sender()?.address}</dd>
                      <dt>Network</dt><dd>Base Sepolia</dd>
                      <dt>Network fee</dt><dd>up to {formatUnits(BigInt(state().fee.executionFeeAtomic), 18)} ETH</dd>
                    </dl>
                    <Show when={state().gasLimitReached}>
                      <Type class="text-sm">Gas help is used up for today, so your wallet pays this fee with its own ETH.</Type>
                    </Show>
                    <Show when={state().feeChanged}>
                      <Type role="status" class="text-sm">The network fee went up. Check the new fee before sending.</Type>
                    </Show>
                    <Button disabled={busy()} onClick={() => void act((value) => value.confirm())}>Send {usdc(atomic())}</Button>
                    <Button variant="ghost" disabled={busy()} onClick={close}>Cancel</Button>
                  </>
                )}</Match>
                <Match when={send().kind === "sending"}><Type role="status">Sending…</Type></Match>
                <Match when={sent()}>{(state) => (
                  <>
                    <Type role="status" class="font-semibold">Sent</Type>
                    <Type>{usdc(atomic())} is on its way to {to()}.</Type>
                    <a class="break-all text-sm underline" href={explorerTransactionUrl(state().transactionHash)} target="_blank" rel="noopener noreferrer">
                      View transaction {state().transactionHash} on the Base Sepolia explorer
                    </a>
                    <Button onClick={close}>Done</Button>
                  </>
                )}</Match>
                <Match when={send().kind === "uncertain"}>
                  <Type role="alert">Your wallet may have sent this transfer. It may still arrive, so check your wallet's activity before sending again.</Type>
                  <Button onClick={close}>Close</Button>
                </Match>
                <Match when={failure()}>{(state) => (
                  <>
                    <Type role="alert">{failureMessage(state().reason)}</Type>
                    <Show when={state().reason === "gas_timeout"}>
                      <Button disabled={busy()} onClick={() => void act((value) => value.checkGasAgain())}>Check again</Button>
                    </Show>
                    <Show when={state().reason === "gas_failed"}>
                      <Button variant="outline" disabled={busy()} onClick={() => void act((value) => value.continueWithoutGas())}>Try with my own ETH</Button>
                    </Show>
                    <Show when={state().reason === "signed_out"}>
                      <Button disabled={busy()} onClick={() => { setCode(""); setCodeSent(false); setStep("sign_in"); }}>Sign in again</Button>
                    </Show>
                    <Show when={state().reason === "insufficient_usdc"}>
                      <Button disabled={busy()} onClick={() => setStep("details")}>Change amount</Button>
                    </Show>
                    <Show when={retryable.has(state().reason)}>
                      <Button disabled={busy()} onClick={() => void act((value) => value.prepare())}>Try again</Button>
                    </Show>
                    <Button variant="ghost" disabled={busy()} onClick={close}>Close</Button>
                  </>
                )}</Match>
              </Switch>
            </div>
          </Match>
        </Switch>
      </ModalContent>
    </Modal>
  );
}
