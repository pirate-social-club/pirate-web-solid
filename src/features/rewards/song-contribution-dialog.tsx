import { isServer } from "@solidjs/web";
import { For, Match, Show, Switch, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { formatUnits } from "viem";
import { createSongContributionCatalog, type SongContributionCatalog } from "../../api/song-contribution-catalog.ts";
import { createSongContributionApi, type SongContributionScope } from "../../api/song-contributions.ts";
import { createSongContributionController, type SongContributionView } from "../../api/song-contribution-controller.ts";
import { createBrowserContributionJournalStore, createSongContributionJournal } from "../../api/song-contribution-journal.ts";
import { createSongContributionWallet } from "../../api/song-contribution-wallet.ts";
import { createBrowserRewardCreationJournal, rewardCreationKey } from "../../api/reward-creation.ts";
import { createRewardWalletSession, type RewardWalletSession } from "../../api/reward-wallet-session.ts";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import { captureSessionAuthority } from "../../api/browser-session-events.ts";
import { onSessionRefreshed } from "../../api/session.ts";
import { Button, Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle, TextField, TextFieldInput, TextFieldLabel, Type } from "../../design-system.ts";
import { useApplicationSession } from "../shell/application-session.tsx";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle.ts";
import { BoostAmountField, BoostSummaryRow } from "./boost-song-sheet.tsx";
import { RewardSponsorDialog } from "./reward-sponsor-dialog.tsx";
import { contextTerms, contributionAmount, contributionChainLabel, contributionFailure, contributionStatus, contributionUnavailable, maximumContribution, qualificationLines, termsEnd, usdc, type SharedPotTerms } from "./song-contribution-model.ts";

export interface SongContributionDependencies {
  readonly catalog: (signal: AbortSignal) => Promise<SongContributionCatalog>;
  readonly api: typeof createSongContributionApi;
  readonly journal: typeof createSongContributionJournal;
  readonly store: typeof createBrowserContributionJournalStore;
  readonly authorization: () => Promise<SongContributionAuthorization>;
  readonly previous: (scope: SongContributionScope) => boolean;
  readonly nowMs?: () => number;
}
export type SongContributionAuthorization = Pick<RewardWalletSession, "sendCode" | "loginWithCode" | "estimateTransfer" | "sendTransfer" | "estimateCancellation" | "sendCancellation" | "dispose">;
const browserDependencies = (): SongContributionDependencies => ({
  catalog: createSongContributionCatalog(), api: createSongContributionApi,
  journal: createSongContributionJournal, store: createBrowserContributionJournalStore,
  authorization: async () => createRewardWalletSession(await fetchVerificationConfig()),
  previous: scope => createBrowserRewardCreationJournal().read(rewardCreationKey(scope)) !== null,
});

function SharedPotTermsView(props: { readonly terms: SharedPotTerms }) {
  return <section class="space-y-2" aria-label="Shared pot terms">
    <p>This shared pot rewards Study, singing and passed Dance reviews.</p>
    <For each={qualificationLines(props.terms)}>{line => <p class="text-sm">{line}</p>}</For>
    <p class="text-sm">At most one share per account in each drawing. You can enter without verification. Verification is required to claim winnings. Qualifying does not guarantee winnings.</p>
    <p class="text-sm">Up to {props.terms.planned_drawing_ids.length} drawings. Ends <time datetime={termsEnd(props.terms)}>{new Date(termsEnd(props.terms)).toLocaleString()}</time>.</p>
    <p class="text-sm">Ticket price ceiling: {usdc(props.terms.ticket_price_ceiling_atomic)}. No ticket is purchased without qualifiers. Qualifiers share net winnings.</p>
    <p class="text-sm">Ticket spending uses the pot’s budget. After the reward ends, the remaining unspent budget is refunded to the original funding wallets in proportion to confirmed contributions.</p>
  </section>;
}

export function SongContributionDialog(props: { readonly communityId: string; readonly postId: string; readonly songTitle: string; readonly onClose: () => void; readonly dependencies?: SongContributionDependencies }) {
  const dependencies = untrack(() => props.dependencies ?? browserDependencies()), applicationSession = useApplicationSession();
  const [catalog, setCatalog] = createSignal<SongContributionCatalog | undefined>(undefined, { ownedWrite: true });
  const [personaId, setPersonaId] = createSignal("", { ownedWrite: true });
  const [view, setView] = createSignal<SongContributionView>({ kind: "idle" }, { ownedWrite: true });
  const [phase, setPhase] = createSignal<"loading" | "ready" | "error" | "previous">("loading", { ownedWrite: true });
  const [busy, setBusy] = createSignal(false, { ownedWrite: true }), [error, setError] = createSignal("", { ownedWrite: true });
  const [amount, setAmount] = createSignal("", { ownedWrite: true }), [transactionHash, setTransactionHash] = createSignal("", { ownedWrite: true });
  const [authorizing, setAuthorizing] = createSignal(false, { ownedWrite: true }), [email, setEmail] = createSignal("", { ownedWrite: true }), [code, setCode] = createSignal("", { ownedWrite: true }), [codeSent, setCodeSent] = createSignal(false, { ownedWrite: true });
  const [previousOpen, setPreviousOpen] = createSignal(false, { ownedWrite: true });
  let active = true, revision = 0, request: AbortController | undefined, controller: ReturnType<typeof createSongContributionController> | undefined, authorization: SongContributionAuthorization | undefined, cancellation = false;
  const invalidate = () => { revision++; request?.abort(); controller?.dispose(); controller = undefined; authorization = undefined; cancellation = false; setView({ kind: "idle" }); setAmount(""); setTransactionHash(""); setAuthorizing(false); setEmail(""); setCode(""); setCodeSent(false); setBusy(false); setPreviousOpen(false); setError(""); };
  const clear = () => { invalidate(); setCatalog(undefined); setPersonaId(""); setPhase("loading"); };
  const close = () => { clear(); active = false; props.onClose(); };
  const owns = (attempt: number) => active && attempt === revision;
  const selectPersona = async (id: string, loaded: SongContributionCatalog) => {
    invalidate(); setPersonaId(id); setPhase("loading");
    const attempt = revision, communityId = props.communityId, postId = props.postId, authority = captureSessionAuthority();
    const scope = { accountId: loaded.accountId, personaId: id, communityId, postId };
    const currentScope = () => {
      const session = applicationSession();
      if (!owns(attempt) || props.communityId !== communityId || props.postId !== postId || captureSessionAuthority() !== authority || session !== undefined && (typeof session === "string" || session.userId !== loaded.accountId)) return null;
      return scope;
    };
    try {
      if (!loaded.personas.some(persona => persona.persona_id === id) || !currentScope()) throw new Error("contribution_scope_changed");
      if (dependencies.previous(scope)) { setPhase("previous"); return; }
      const wallet = () => { if (!authorization) throw new Error("wallet_reauthentication_required"); return createSongContributionWallet(authorization); };
      controller = createSongContributionController({ scope, currentScope,
        api: dependencies.api({ scope, currentScope }), journal: dependencies.journal({ scope, currentScope, store: dependencies.store(), nowMs: dependencies.nowMs }), nowMs: dependencies.nowMs,
        wallet: { estimate: (...args) => wallet().estimate(...args), send: (...args) => wallet().send(...args), dispose: () => { authorization?.dispose(); authorization = undefined; } },
      });
      const next = await controller.open(); if (!currentScope()) return; setView(next); setPhase("ready");
    } catch (cause) { if (owns(attempt)) { setError(contributionFailure(cause)); setPhase("error"); } }
  };
  const load = async () => {
    clear(); const attempt = revision, signal = new AbortController(); request = signal;
    const authority = captureSessionAuthority();
    try {
      const loaded = await dependencies.catalog(signal.signal);
      if (!owns(attempt) || captureSessionAuthority() !== authority) return;
      const session = applicationSession(); if (session !== undefined && (typeof session === "string" || session.userId !== loaded.accountId)) throw new Error("contribution_scope_changed");
      setCatalog(loaded);
      const first = loaded.personas.find(persona => persona.community_binding?.community_id === props.communityId) ?? loaded.personas[0];
      if (!first) { setPhase("error"); setError("Create a profile wallet before contributing to this song."); return; }
      await selectPersona(first.persona_id, loaded);
    } catch (cause) { if (owns(attempt)) { setError(contributionFailure(cause)); setPhase("error"); } }
  };
  createEffect(() => [props.communityId, props.postId, applicationSession()] as const, () => {
    clear(); const attempt = revision;
    if (!isServer) queueMicrotask(() => { if (owns(attempt)) void load(); });
  });
  onCleanup(onSessionRefreshed(() => { void load(); }));
  onCleanup(bindPrivatePageLifecycle(clear));
  onCleanup(() => { clear(); active = false; });
  const run = async (operation: (selected: NonNullable<typeof controller>) => Promise<void | SongContributionView>) => {
    const selected = controller, attempt = revision; if (!selected || busy()) return;
    setBusy(true); setError("");
    try { await operation(selected); }
    catch (cause) {
      if (owns(attempt)) {
        if (cause instanceof Error && (cause.message === "contribution_account_changed" || cause.message === "contribution_scope_changed")) {
          clear(); setPhase("error"); setError("Your sign-in changed. Reopen the song pot to continue.");
        } else if (cause instanceof Error && cause.message === "wallet_reauthentication_required") {
          setAuthorizing(true); setError("");
        } else setError(contributionFailure(cause));
      }
    }
    finally { if (owns(attempt)) { setView(selected.state); setBusy(false); } }
  };
  const payment = (cancel: boolean) => { cancellation = cancel; void run(selected => selected.preparePayment(cancel)); };
  const authorize = async (sendCode: boolean) => run(async selected => {
    const attempt = revision;
    if (!authorization) {
      const next = await dependencies.authorization();
      if (!owns(attempt)) { next.dispose(); return; } authorization = next;
    }
    if (sendCode) { await authorization.sendCode(email()); if (owns(attempt)) setCodeSent(true); }
    else { await authorization.loginWithCode(email(), code()); if (!owns(attempt)) return; await selected.preparePayment(cancellation); if (owns(attempt)) setAuthorizing(false); }
  });
  const status = () => { const state = view(); return state.kind === "status" || state.kind === "pay" ? state.current : state.kind === "pending" ? state.current ?? undefined : undefined; };
  const amountView = () => { const state = view(); return state.kind === "amount" ? state : undefined; };
  const readyContext = () => { const context = amountView()?.context; return context?.readiness === "ready" ? context : undefined; };
  const unavailableContext = () => { const context = amountView()?.context; return context?.readiness === "unavailable" ? contributionUnavailable(context) : "Contribution details are unavailable."; };
  const termsView = () => { const state = view(); return state.kind === "terms" ? state : undefined; };
  const payView = () => { const state = view(); return state.kind === "pay" ? state : undefined; };
  return <Show when={!previousOpen()} fallback={<RewardSponsorDialog recoveryOnly initialPersonaId={personaId()} communityId={props.communityId} postId={props.postId} songTitle={props.songTitle} onClose={() => { setPreviousOpen(false); void load(); }} />}>
    <Modal open onOpenChange={open => { if (!open) close(); }}><ModalContent mobileSide="bottom" class="flex max-h-[88dvh] w-full flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4 md:w-[min(100%-2rem,440px)] md:max-w-[440px] md:px-7 md:pb-7 md:pt-7" data-song-contribution={phase()}>
      <ModalHeader class="text-start"><ModalTitle>Add to the song pot</ModalTitle><ModalDescription>Support people who practice {props.songTitle}.</ModalDescription></ModalHeader>
      <Show when={error()}>{message => <p role="alert" class="text-destructive-text">{message()}</p>}</Show>
      <Show when={catalog()}>{loaded => <label class="block"><Type as="span" variant="label">Paying profile</Type><select aria-label="Paying profile" class="block w-full rounded-md border border-input bg-background px-3 py-2" value={personaId()} disabled={busy()} onChange={event => { void selectPersona(event.currentTarget.value, loaded()); }}><For each={loaded().personas}>{persona => <option value={persona.persona_id}>{persona.profile.display_name ?? persona.persona_id}</option>}</For></select></label>}</Show>
      <Switch>
        <Match when={phase() === "loading"}><p aria-busy="true">Loading the song pot…</p></Match>
        <Match when={phase() === "error"}><Button variant="secondary" onClick={() => { void load(); }}>Check again</Button></Match>
        <Match when={phase() === "previous"}><p>A previous reward payment is saved for this profile. Check it before starting a new contribution.</p><Button onClick={() => setPreviousOpen(true)}>Check saved reward</Button></Match>
        <Match when={phase() === "ready"}>
          <Show when={authorizing()} fallback={<Switch>
            <Match when={view().kind === "idle"}><Button disabled={busy()} onClick={() => { void run(selected => selected.refresh()); }}>Refresh terms</Button></Match>
            <Match when={amountView()}><Show when={amountView()?.notice}>{notice => <p role="status">{notice()}</p>}</Show><Show when={readyContext()} fallback={<p>{unavailableContext()}</p>}>{ready => <>
              <p>Available contribution: {usdc(ready().limits.minimum_atomic)}–{usdc(maximumContribution(ready()))}.</p><p class="text-sm text-muted-foreground">{contributionChainLabel(ready().chain_id)} · Payment fee comes from this profile’s wallet.</p>
              <BoostAmountField id="song-contribution-amount" label="Contribution (USDC)" value={amount()} onChange={setAmount} />
              <Button disabled={busy() || !amount()} onClick={() => { void run(selected => selected.reviewAmount(contributionAmount(amount()))); }}>Review contribution</Button>
              <Button variant="ghost" disabled={busy()} onClick={() => { void run(selected => selected.refresh()); }}>Refresh terms</Button>
            </>}</Show></Match>
            <Match when={termsView()}>{review => <>
              <BoostSummaryRow label="Contribution" value={usdc(review().request.funding_amount_atomic)} /><SharedPotTermsView terms={contextTerms(review().context)} />
              <p class="text-sm text-muted-foreground">These terms will be saved before you review and authorize the payment.</p><Button disabled={busy()} onClick={() => { void run(selected => selected.reserve()); }}>Continue to payment</Button>
              <Button variant="ghost" disabled={busy()} onClick={() => { void run(selected => selected.refresh()); }}>Change amount</Button>
            </>}</Match>
            <Match when={payView()}>{review => <>
              <BoostSummaryRow label={review().cancellation ? "Action" : "Contribution"} value={review().cancellation ? "Cancel the original payment" : usdc(review().current.command_receipt.instruction.amount_atomic)} />
              <BoostSummaryRow label="Payment fee" value={`${formatUnits(BigInt(review().fee.executionFeeAtomic), 18)} ETH`} /><p class="break-all text-sm">From {review().current.original_sender} on {contributionChainLabel(review().current.command_receipt.instruction.chain_id)}.</p>
              <SharedPotTermsView terms={review().current.command_receipt.committed_terms} />
              <Show when={review().cancellation}><p>The cancellation uses the original payment’s nonce and pays only the network fee. It is not confirmed until checked.</p></Show>
              <Button disabled={busy()} onClick={() => { void run(selected => selected.confirmPayment(review().reviewId)); }}>{review().cancellation ? "Confirm cancellation" : `Pay ${usdc(review().current.command_receipt.instruction.amount_atomic)}`}</Button>
            </>}</Match>
            <Match when={view().kind === "pending"}><p>Your original request is saved. Check its status before starting another contribution.</p><Button disabled={busy()} onClick={() => { void run(selected => selected.refresh()); }}>Check original request</Button><Button variant="secondary" disabled={busy()} onClick={() => { void run(selected => selected.retryOriginalCommand()); }}>Retry original request</Button></Match>
            <Match when={view().kind === "status"}><Show when={status()}>{state => <>
              <Type as="h2" variant="h3">{contributionStatus(state()).title}</Type><p>{contributionStatus(state()).detail}</p><BoostSummaryRow label="Original contribution" value={usdc(state().command_receipt.instruction.amount_atomic)} />
              <SharedPotTermsView terms={state().command_receipt.committed_terms} />
              <Show when={state().allowed_actions.includes("claim_funding_submission")}><Button disabled={busy()} onClick={() => payment(false)}>Review payment</Button></Show>
              <Show when={state().allowed_actions.includes("prepare_nonce_cancellation")}><Button variant="secondary" disabled={busy()} onClick={() => { void run(selected => selected.prepareCancellation()); }}>Prepare cancellation</Button></Show>
              <Show when={state().allowed_actions.includes("claim_nonce_cancellation")}><Button variant="secondary" disabled={busy()} onClick={() => payment(true)}>Review cancellation</Button></Show>
              <Show when={state().allowed_actions.includes("recover_original")}><Button variant="secondary" disabled={busy()} onClick={() => { void run(selected => selected.recoverOriginal()); }}>Reconcile original payment</Button></Show>
              <Show when={state().allowed_actions.includes("observe_original")}><details><summary>Have a transaction hash?</summary><TextField value={transactionHash()} onChange={setTransactionHash}><TextFieldLabel>Original transaction hash</TextFieldLabel><TextFieldInput /></TextField><Button disabled={busy() || !transactionHash()} onClick={() => { void run(selected => selected.observeOriginal(transactionHash())); }}>Check transaction</Button></details></Show>
              <Show when={state().allowed_actions.includes("start_fresh_contribution")}><Button variant="secondary" disabled={busy()} onClick={() => { void run(selected => selected.startFresh()); }}>Add another contribution</Button></Show>
              <Button variant="ghost" disabled={busy()} onClick={() => { void run(selected => selected.refresh()); }}>Refresh status</Button>
            </>}</Show></Match>
          </Switch>}>
            <p>Confirm access to this profile’s wallet. You will review the saved transfer and fee before paying.</p><TextField value={email()} onChange={setEmail}><TextFieldLabel>Email for your wallet</TextFieldLabel><TextFieldInput inputmode="email" /></TextField>
            <Button disabled={busy() || !email()} onClick={() => { void authorize(true); }}>Send code</Button>
            <Show when={codeSent()}><TextField value={code()} onChange={setCode}><TextFieldLabel>Code</TextFieldLabel><TextFieldInput /></TextField><Button disabled={busy() || !code()} onClick={() => { void authorize(false); }}>Review transfer</Button></Show>
          </Show>
        </Match>
      </Switch>
    </ModalContent></Modal>
  </Show>;
}
