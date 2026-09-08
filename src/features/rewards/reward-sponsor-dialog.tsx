import { useApplicationSession } from "../shell/application-session.tsx";
import { RewardSongStatus } from "./reward-song-status.tsx";
import { sponsorFailure } from "./reward-sponsor-errors.ts";
import { For, Match, Show, Switch, createSignal, createEffect, onCleanup, untrack } from "solid-js";
import { formatUnits } from "viem";
import { Button, Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle, TextField, TextFieldInput, TextFieldLabel } from "../../design-system.ts";
import { createRewardSponsorData } from "../../api/reward-sponsor-data.ts";
import { createBrowserRewardCreationJournal, createRewardCreation, createRewardCreationApi, type RewardCreationScope, type RewardCreationJournal } from "../../api/reward-creation.ts";
import { createBrowserRewardFunding } from "../../api/reward-funding.ts";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import type { RewardFundingState } from "../../api/reward-funding-controller.ts";
import { createSessionApiClient } from "../../api/client.ts";
import { qualificationText, sponsorTerms, type SponsorDraft } from "./reward-sponsor-terms.ts";
import { RewardFundingPanel } from "./reward-funding-panel.tsx";

type Catalog = Awaited<ReturnType<ReturnType<typeof createRewardSponsorData>["catalog"]>>;
type Terms = ReturnType<typeof sponsorTerms>;
export interface RewardSponsorDependencies {
  readonly data: ReturnType<typeof createRewardSponsorData>;
  readonly journal: RewardCreationJournal;
  readonly creationApi: typeof createRewardCreationApi;
  readonly funding: typeof createBrowserRewardFunding;
  readonly config: typeof fetchVerificationConfig;
}
export function RewardSponsorDialog(props: { communityId: string; postId: string; songTitle: string; onClose: () => void; dependencies?: RewardSponsorDependencies }) {
  const dependencies = untrack(() => props.dependencies);
  const data = dependencies?.data ?? createRewardSponsorData();
  const applicationSession = useApplicationSession();
  const [catalog, setCatalog] = createSignal<Catalog>();
  const [personaId, setPersonaId] = createSignal("");
  const [draft, setDraft] = createSignal<SponsorDraft>({ kind: "megapot_pool", amount: "", perClaim: "", claims: "10", assetAddress: "", activities: "either", minimumScore: "70", ticketCeiling: "", cutoffSeconds: "60", endsAt: "" });
  const [step, setStep] = createSignal<"loading" | "unavailable" | "compose" | "terms" | "resume" | "authorize" | "funding">("loading");
  const [terms, setTerms] = createSignal<Terms>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [funding, setFunding] = createSignal<RewardFundingState>({ kind: "idle" });
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [codeSent, setCodeSent] = createSignal(false);
  const [existing, setExisting] = createSignal(false);
  const [songState, setSongState] = createSignal<Awaited<ReturnType<typeof data.song>>>();
  let alive = true;
  let scope: RewardCreationScope | null = null;
  let creation: ReturnType<typeof createRewardCreation> | undefined;
  let wallet: Awaited<ReturnType<typeof createBrowserRewardFunding>> | undefined;
  const currentScope = () => {
    const session = applicationSession();
    if (!alive || !scope || scope.communityId !== props.communityId || scope.postId !== props.postId) return null;
    if (session !== undefined && (typeof session === "string" || session.userId !== scope.accountId)) return null;
    return scope;
  };
  const update = <K extends keyof SponsorDraft>(key: K, value: SponsorDraft[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const persona = () => catalog()?.personas.find(p => p.persona_id === personaId());
  const personaLabel = () => persona()?.profile.display_name ?? personaId();
  const close = () => { alive = false; scope = null; wallet?.dispose(); props.onClose(); };
  onCleanup(() => { alive = false; scope = null; wallet?.dispose(); });
  createEffect(() => ({ session: applicationSession(), accountId: catalog()?.accountId }), ({ session, accountId }) => {
    if (accountId && session !== undefined && (typeof session === "string" || session.userId !== accountId)) queueMicrotask(close);
  });
  const run = async (operation: () => Promise<void>) => {
    if (busy() || !alive) return;
    setBusy(true); setError("");
    try { await operation(); }
    catch (cause) {
      if (alive) {
        setError(sponsorFailure(cause));
        if (step() === "loading") setStep("unavailable");
        if (cause instanceof Error && cause.message === "wallet_reauthentication_required") setStep("authorize");
      }
    } finally { if (alive) setBusy(false); }
  };
  const selectPersona = (id: string, loaded = catalog()) => {
    wallet?.dispose(); wallet = undefined; setFunding({ kind: "idle" }); setTerms(undefined); setEmail(""); setCode(""); setCodeSent(false);
    if (!loaded || !loaded.personas.some(p => p.persona_id === id)) throw new Error("Choose a persona with a wallet.");
    setPersonaId(id);
    scope = { accountId: loaded.accountId, personaId: id, communityId: props.communityId, postId: props.postId };
    creation = createRewardCreation({ scope, currentScope, journal: dependencies?.journal ?? createBrowserRewardCreationJournal(), api: (dependencies?.creationApi ?? createRewardCreationApi)(scope) });
    setStep(creation.pending() ? "resume" : "compose");
  };
  createEffect(() => true, () => { queueMicrotask(() => { void run(async () => {
    const [loaded, song] = await Promise.all([data.catalog(), data.song(props.communityId, props.postId)]);
    if (!alive) return;
    setCatalog(loaded); setSongState(song);
    setExisting(song.pool !== null || song.bonuses.items.length > 0);
    update("assetAddress", loaded.assets.items[0]?.token_address ?? "");
    const first = loaded.personas.find(p => p.community_binding?.community_id === props.communityId) ?? loaded.personas[0];
    if (!first) throw new Error("Create a persona wallet before funding rewards.");
    selectPersona(first.persona_id, loaded);
  }); }); });
  // Cookie identity can change in another tab. Clear private state when this tab returns.
  createEffect(() => true, () => {
    if (dependencies) return;
    const verify = () => { void createSessionApiClient().get_usersMe(undefined).then(me => {
      if (alive && scope && me.id !== scope.accountId) close();
    }).catch(() => { if (alive) close(); }); };
    window.addEventListener("focus", verify);
    onCleanup(() => window.removeEventListener("focus", verify));
  });
  const review = () => {
    if (!scope || !catalog()) return;
    try {
      const next = sponsorTerms(scope, draft(), catalog()!.assets.items, catalog()!.policies, new Date());
      setTerms(next); setError(""); setStep("terms");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the reward terms."); }
  };
  const attach = async (resume: boolean) => {
    if (!scope || !creation) throw new Error("Choose a persona.");
    const record = creation.pending();
    setStep("resume");
    const target = resume ? await creation.recover() : await creation.start(terms()!.offer, terms()!.leg);
    if (!alive || !scope) return;
    if (resume && record) {
      const tokenSymbol = record.leg.kind === "asset_bonus" ? record.leg.input.body.token_symbol : "USDC";
      setTerms({ offer: record.offer, leg: record.leg, tokenSymbol, policies: [] });
    }
    wallet = await (dependencies?.funding ?? createBrowserRewardFunding)({ config: await (dependencies?.config ?? fetchVerificationConfig)(), actor: scope, target, currentActor: currentScope });
    if (!alive) { wallet.dispose(); return; }
    const recovered = await wallet.controller.recover();
    setFunding(recovered);
    setStep(recovered.kind === "idle" ? "authorize" : "funding");
  };
  const authorize = async () => {
    if (!wallet) return;
    await wallet.authorization.loginWithCode(email(),code());
    await wallet.selectTestnet();
    setFunding(await wallet.controller.prepare()); setStep("funding");
  };
  const refresh = async () => {
    if (!wallet) return;
    const next = funding().kind === "review" ? await wallet.controller.prepare() : await wallet.controller.recover(); setFunding(next);
    if (next.kind === "idle" || next.kind === "cancelled") setStep("authorize");
  };
  const Field = (fieldProps: { label: string; field: "amount" | "perClaim" | "claims" | "ticketCeiling" | "minimumScore" | "cutoffSeconds" | "endsAt"; type?: "text" | "datetime-local" }) => <label class="block">{fieldProps.label}
    <input class="block w-full rounded-md border border-input bg-background px-3 py-2" type={fieldProps.type ?? "text"} value={draft()[fieldProps.field]} onInput={event => update(fieldProps.field, event.currentTarget.value)} />
  </label>;
  const bonusTerms = () => { const leg = terms()?.leg; return leg?.kind === "asset_bonus" ? leg : undefined; };
  const poolTerms = () => { const leg = terms()?.leg; return leg?.kind === "megapot_pool" ? leg : undefined; };
  return <Modal open onOpenChange={open => { if (!open) close(); }}><ModalContent class="max-w-lg max-h-[90dvh] overflow-y-auto">
    <ModalHeader><ModalTitle>Boost {props.songTitle}</ModalTitle><ModalDescription>Song rewards · Base Sepolia testnet</ModalDescription></ModalHeader>
    <Show when={error()}>{message => <p role="alert" class="text-destructive-text break-words">{message()}</p>}</Show>
    <Switch>
      <Match when={step() === "unavailable"}><p>Sign in with a persona wallet and reopen rewards to try again.</p></Match>
      <Match when={step() === "loading"}><p>Loading rewards…</p></Match>
      <Match when={step() === "compose"}>
        <div class="space-y-4">
          <label class="block">Persona<select class="block w-full" value={personaId()} disabled={busy()} onChange={event => { try { selectPersona(event.currentTarget.value); } catch (cause) { setError(sponsorFailure(cause)); } }}>
            <For each={catalog()?.personas}>{p => <option value={p.persona_id}>{p.profile.display_name ?? p.persona_id}</option>}</For>
          </select></label>
          <Show when={personaId()} keyed>{id => <Show when={songState()}>{song => <RewardSongStatus song={song()} actor={{ accountId: catalog()!.accountId, personaId: id }} data={data} />}</Show>}</Show>
          <Show when={!existing()} fallback={<p>This song already has rewards. Adding another reward needs its existing offer terms; this form currently creates a new offer.</p>}>
            <label class="block">Reward<select class="block w-full" value={draft().kind} onChange={event => update("kind", event.currentTarget.value === "asset_bonus" ? "asset_bonus" : "megapot_pool")}>
              <option value="megapot_pool">Megapot shared winnings</option><option value="asset_bonus">Token bonus</option>
            </select></label>
            <Show when={draft().kind === "asset_bonus"} fallback={<>
              <Field label="Budget (USDC)" field="amount" /><Field label="Maximum ticket price (USDC)" field="ticketCeiling" />
              <label class="block">Activities<select class="block w-full" value={draft().activities} onChange={event => update("activities", event.currentTarget.value === "study" ? "study" : event.currentTarget.value === "karaoke" ? "karaoke" : "either")}>
                <option value="either">Study or singing</option><option value="study">Study</option><option value="karaoke">Singing</option>
              </select></label>
              <Field label="Additional score floor (%)" field="minimumScore" /><Field label="Entry cutoff before drawing (seconds)" field="cutoffSeconds" />
              <p class="text-sm">Pirate buys and holds the ticket. Qualifiers share net winnings. If nobody qualifies, no ticket is purchased.</p>
            </>}>
              <label class="block">Token<select class="block w-full" value={draft().assetAddress} onChange={event => update("assetAddress", event.currentTarget.value)}>
                <For each={catalog()?.assets.items}>{asset => <option value={asset.token_address}>{asset.token_symbol} · {asset.token_address}</option>}</For>
              </select></label>
              <Show when={catalog()?.assets.items.length === 0}><p>No bonus tokens are available.</p></Show>
              <Show when={catalog()?.assets.next_cursor}><Button variant="outline" disabled={busy()} onClick={() => { void run(async () => {
                const page = await data.assets(catalog()!.assets.next_cursor!); if (alive) setCatalog(old => old ? { ...old, assets: { items: [...old.assets.items, ...page.items], next_cursor: page.next_cursor } } : old);
              }); }}>More tokens</Button></Show>
              <Field label="Amount per person" field="perClaim" /><Field label="Number of recipients" field="claims" />
              <p class="text-sm">Study or singing counts. Each account can claim once.</p>
            </Show>
            <div aria-label="Qualification requirements"><For each={catalog()?.policies.filter(policy => draft().kind === "asset_bonus" || draft().activities === "either" || draft().activities === policy.activity)}>{policy => <p class="text-sm">{qualificationText(policy)}</p>}</For></div>
            <Field label="Offer ends (your local time)" field="endsAt" type="datetime-local" />
            <Button disabled={busy()} onClick={review}>Review terms</Button>
          </Show>
        </div>
      </Match>
      <Match when={step() === "terms" && terms()}>{value => <div class="space-y-3">
        <p>{formatUnits(BigInt(value().leg.input.body.funding_amount_atomic), bonusTerms()?.input.body.token_decimals ?? 6)} {value().tokenSymbol} from {personaLabel()}</p>
        <p>Ends {new Date(value().offer.body.ends_at).toLocaleString()}</p>
        <For each={value().policies}>{policy => <p class="text-sm">{qualificationText(policy)}</p>}</For>
        <Show when={poolTerms()}>{leg => <p class="text-sm">An additional {leg().input.body.min_score_bps / 100}% score floor applies. Qualifiers share net winnings. No ticket is bought without qualifiers.</p>}</Show>
        <Show when={bonusTerms()}>{leg => <p class="text-sm">{formatUnits(BigInt(leg().input.body.amount_per_claim_atomic), leg().input.body.token_decimals)} {value().tokenSymbol} to each of the first {leg().input.body.max_claims} qualifying accounts.</p>}</Show>
        <Show when={poolTerms()}>{leg => <p class="text-sm">Ticket price ceiling: {formatUnits(BigInt(leg().input.body.max_ticket_price_atomic), 6)} USDC. Entries close {leg().input.body.entry_cutoff_seconds} seconds before the drawing.</p>}</Show>
        <p class="text-sm">These terms cannot be edited after creation. Unspent funding is returned after the offer ends.</p>
        <Button disabled={busy()} onClick={() => { void run(() => attach(false)); }}>Create reward</Button>
        <Button variant="ghost" disabled={busy()} onClick={() => setStep("compose")}>Back</Button>
      </div>}</Match>
      <Match when={step() === "resume"}><p>A saved reward creation is available for this persona.</p>
        <label>Persona<select value={personaId()} disabled={busy()} onChange={event => { try { selectPersona(event.currentTarget.value); } catch (cause) { setError(sponsorFailure(cause)); } }}><For each={catalog()?.personas}>{p => <option value={p.persona_id}>{p.profile.display_name ?? p.persona_id}</option>}</For></select></label><Button disabled={busy()} onClick={() => { void run(() => attach(true)); }}>Resume saved reward</Button></Match>
      <Match when={step() === "authorize"}><div class="space-y-3">
        <p>Confirm access to {personaLabel()}'s wallet. You will review the transfer before sending.</p>
        <TextField value={email()} onChange={setEmail}><TextFieldLabel>Email for your wallet</TextFieldLabel><TextFieldInput inputmode="email" /></TextField>
        <Button disabled={busy() || !email()} onClick={() => { void run(async () => { await wallet!.authorization.sendCode(email()); if (alive) setCodeSent(true); }); }}>Send code</Button>
        <Show when={codeSent()}><TextField value={code()} onChange={setCode}><TextFieldLabel>Code</TextFieldLabel><TextFieldInput /></TextField><Button disabled={busy() || !code()} onClick={() => { void run(authorize); }}>Review transfer</Button></Show>
      </div></Match>
      <Match when={step() === "funding"}><RewardFundingPanel state={funding()} personaLabel={personaLabel()} tokenSymbol={terms()?.tokenSymbol ?? "token"} busy={busy()}
        onConfirm={id => { void run(async () => { try { setFunding(await wallet!.controller.confirm(id)); } finally { if (alive) setFunding(wallet!.controller.state); } }); }}
        onRefresh={() => { void run(refresh); }} onReconcile={hash => { void run(async () => { setFunding(await wallet!.controller.reconcileTransaction(hash)); }); }} /></Match>
    </Switch>
    <Show when={busy()}><p role="status">Working…</p></Show>
  </ModalContent></Modal>;
}
