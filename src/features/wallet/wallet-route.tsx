import { Title } from "@solidjs/meta";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { createSessionApiClient } from "../../api/client.ts";
import { PageContainer } from "@pirate/web-solid-ui";
import { Button, Card, CardContent, Type } from "../../design-system";
import { requestGlobalSignIn } from "../auth/global-sign-in-host.tsx";
import { useApplicationSession } from "../shell/application-session.tsx";
import { useApplicationPersonas } from "../shell/application-personas.tsx";
import { loadPersonaWallets, type PersonaWallet } from "./wallet-portfolio-model.ts";
import { createWalletBalances } from "./wallet-balances.ts";
import { readWalletBalances } from "./wallet-balance-reader.ts";
import type { WalletNetworkMode } from "./wallet-network-catalog.ts";
import { WalletPortfolio } from "./wallet-portfolio.tsx";
import { createRewardClaimData } from "../../api/reward-claim.ts";
import { WalletWinnings } from "../rewards/wallet-winnings.tsx";

/** A claim to resume after returning from the palm scan (browser only). */
function resumeClaimId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = new URL(window.location.href).searchParams.get("claim");
  return value !== null && value.length > 0 && value.length <= 128 ? value : undefined;
}

function dropResumeClaim() {
  const url = new URL(window.location.href);
  url.searchParams.delete("claim");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function WalletRouteView() {
  const account = useApplicationSession();
  const profiles = useApplicationPersonas();
  const [wallets, setWallets] = createSignal<readonly PersonaWallet[]>([]);
  const [walletOwner, setWalletOwner] = createSignal<string>();
  const ownedWallets = () => { const session = account(); return typeof session === "object" && walletOwner() === session.userId ? wallets() : []; };
  const [networkMode, setNetworkMode] = createSignal<WalletNetworkMode>("mainnet");
  const balances = createWalletBalances(() => {
    const session = account();
    const wallet = ownedWallets().find(item => item.personaId === profiles?.selected()?.personaId);
    return typeof session === "object" && wallet?.address ? { accountId: session.userId, personaId: wallet.personaId, address: wallet.address } : undefined;
  }, networkMode, readWalletBalances);
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let request = 0;
  let active = true;
  const authenticated = () => typeof account() === "object";
  const load = () => {
    const epoch = ++request;
    setWalletOwner(undefined);
    setWallets([]);
    setFailed(false);
    setLoading(authenticated());
    if (!authenticated()) return;
    const session = account();
    if (typeof session !== "object") return;
    void loadPersonaWallets(createSessionApiClient()).then(result => {
      if (active && request === epoch) { setWallets(result); setWalletOwner(session.userId); }
    }).catch(() => {
      if (active && request === epoch) setFailed(true);
    }).finally(() => {
      if (active && request === epoch) setLoading(false);
    });
  };
  createEffect(account, load);
  onCleanup(() => { active = false; request++; });
  return <main data-route-path="/wallet"><Title>Wallet</Title><PageContainer gutter class="flex flex-col gap-6 py-8">
    {/* Signed-in, the Wallet Hub owns the page heading. */}
    <Show when={!authenticated() || loading() || failed()}><Type as="h1" variant="h1">Wallet</Type></Show>
    <Show when={!authenticated()}>
      <Card><CardContent class="flex flex-col items-start gap-4 p-6">
        <Show when={account() === "anonymous"} fallback={<Show when={account() === "failed"} fallback={<Type role="status">Loading wallet…</Type>}>
          <Type>Your account could not be checked.</Type>
          <Button variant="outline" onClick={() => profiles?.setPickerOpen(true)}>Check again</Button>
        </Show>}>
          <Type>Sign in to view your wallets.</Type>
          <Button onClick={requestGlobalSignIn}>Sign in</Button>
        </Show>
      </CardContent></Card>
    </Show>
    <Show when={authenticated()}>
      <Show when={loading()}><Type role="status">Loading wallets…</Type></Show>
      <Show when={failed()}><Card><CardContent class="flex flex-col items-start gap-4 p-6"><Type role="alert">Your wallets could not be loaded.</Type><Button variant="outline" onClick={load}>Try again</Button></CardContent></Card></Show>
      <WalletWinnings data={createRewardClaimData()} resumeCreditId={resumeClaimId()} onResumeConsumed={dropResumeClaim} />
      <Show when={!loading() && !failed()}><WalletPortfolio chainSections={balances.sections()} balancesLoading={balances.loading()} onRefresh={balances.reload} networkMode={networkMode()} onNetworkModeChange={setNetworkMode} wallets={ownedWallets()} selectedPersonaId={profiles?.selected()?.personaId} onSelect={id => profiles?.select(id)} onChangeProfile={() => profiles?.setPickerOpen(true)} /></Show>
    </Show>
  </PageContainer></main>;
}
