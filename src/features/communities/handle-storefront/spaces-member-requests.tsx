import { Title } from "@solidjs/meta";
import { createEffect, createSignal, For, onCleanup, Show, sharedConfig } from "solid-js";
import { Button, Card, CardContent, CardHeader } from "../../../design-system.ts";
import { createSessionHandleSalesClient, createSessionSpacesMemberRecoveryClient, readHandleSalesCsrfCookie, type SessionHandleSalesApiClient, type SessionSpacesMemberRecoveryApiClient } from "../../../api/handle-sales-client.ts";
import { useApplicationSession, useApplicationSessionPending } from "../../shell/application-session.tsx";
import { createSpacesMemberRecovery, type SpacesMemberRecoveryState, type SpacesMemberRequest } from "./spaces-member-recovery.ts";
import { listSpacesMemberAttempts, runSpacesMemberAttempt } from "./spaces-member-attempt.ts";
import { SpacesClaimStateCard } from "./spaces-claim-state.tsx";

function RequestCard(props: { readonly item: SpacesMemberRequest }) {
  const item = props.item;
  if (item.kind === "quote_refusal") return <Card><CardContent class="space-y-2 p-5">
    <h2 class="font-semibold">Earlier eligibility request</h2>
    <p>This request needs eligibility evidence. Its original community, root and network were not retained by the service.</p>
    <p class="text-sm text-muted-foreground">Offering: {item.offering_id} · Persona: {item.owner_persona_id}</p>
  </CardContent></Card>;
  const progress = item.kind === "quote" ? item.quote : item.kind === "reservation" ? item.reservation : item.claim;
  return <Card data-spaces-member-request={item.kind}><CardContent class="space-y-3 p-5">
    <Show when={item.kind === "claim"} fallback={<>
      <h2 class="font-semibold">{progress.handle.handle_label}@{progress.handle.namespace_root}</h2>
      <p>{item.kind === "quote" ? `Quote: ${item.quote.status}` : item.kind === "reservation" ? `Reservation: ${item.reservation.status}` : ""}.</p>
      <p>This earlier step does not establish whether a later request committed. Check again before doing anything else.</p>
    </>}>
      {item.kind === "claim" && <>
        <SpacesClaimStateCard claim={item.claim} />
        <a class="underline" href={`/c/${encodeURIComponent(item.context.community_id)}/name-order/${encodeURIComponent(item.claim.claim_id)}`}>Open registration</a>
      </>}
    </Show>
    <p class="text-sm text-muted-foreground">Original root: @{item.context.namespace_root} · Network: {item.context.network}</p>
    <p class="text-sm text-muted-foreground">Persona: {item.context.owner_persona_id}</p>
  </CardContent></Card>;
}

export function SpacesMemberRequests(props: {
  readonly client?: Pick<SessionSpacesMemberRecoveryApiClient, "get_usersMeSpacesHandleRequests">;
  readonly mutationClient?: SessionHandleSalesApiClient;
  readonly readCsrf?: () => string | undefined;
}) {
  const account = useApplicationSession();
  const pending = useApplicationSessionPending();
  const [state, setState] = createSignal<SpacesMemberRecoveryState>({ kind: "account-pending", items: [], nextCursor: null, loadingMore: false }, { ownedWrite: true });
  const [local, setLocal] = createSignal<ReturnType<typeof listSpacesMemberAttempts>>({ attempts: [], incomplete: false }, { ownedWrite: true });
  const [retrying, setRetrying] = createSignal(false, { ownedWrite: true });
  const [message, setMessage] = createSignal("", { ownedWrite: true });
  const owner = createSpacesMemberRecovery({
    client: props.client ?? { get_usersMeSpacesHandleRequests: (args, options) => createSessionSpacesMemberRecoveryClient().get_usersMeSpacesHandleRequests(args, options) },
    changed: next => {
      if (next.kind === "signed-out") {
        generation++; command?.abort(); command = undefined;
        setLocal({ attempts: [], incomplete: false }); setMessage(""); setRetrying(false);
      }
      setState(next);
    },
    currentAccountId: () => accountId(),
  });
  let generation = 0;
  let disposed = false;
  let command: AbortController | undefined;
  const accountId = () => {
    const current = account();
    return !pending() && typeof current === "object" && current.status === "authenticated" ? current.userId : undefined;
  };
  const readLocal = () => {
    const id = accountId();
    if (id === undefined || owner.accountId() !== id) return;
    try { setLocal(listSpacesMemberAttempts(localStorage, id)); }
    catch { setLocal({ attempts: [], incomplete: true }); }
  };
  const check = async () => { readLocal(); await owner.refresh(); };
  const retry = async (key: string) => {
    const id = accountId();
    const retained = local().attempts.find(attempt => attempt.key === key);
    if (id === undefined || owner.accountId() !== id || state().kind === "signed-out" || retained === undefined || retrying()) return;
    const csrf = (props.readCsrf ?? readHandleSalesCsrfCookie)();
    if (csrf === undefined) { setMessage("Your session could not be confirmed. Sign in and check again."); return; }
    const currentGeneration = generation;
    const active = new AbortController(); command = active;
    const current = () => !disposed && generation === currentGeneration && accountId() === id && owner.accountId() === id && !active.signal.aborted;
    setRetrying(true); setMessage("");
    try {
      const result = await runSpacesMemberAttempt({ client: props.mutationClient ?? createSessionHandleSalesClient(), storage: localStorage,
        accountId: id, communityId: retained.record.communityId, attemptKey: key, csrf, signal: active.signal, current });
      if (!current()) return;
      setMessage(result.kind === "unknown" ? "The outcome is still unknown. Check your retained requests again."
        : result.kind === "recipient_wallet_required" ? "The original request needs a receiving wallet. Its keys have been kept."
        : result.kind === "eligibility_required" ? "The original request needs eligibility evidence. Its keys have been kept."
        : "Original request checked. Refreshing its private progress…");
      await check();
    } finally {
      if (current()) setRetrying(false);
      if (command === active) command = undefined;
    }
  };
  createEffect(() => ({ account: account(), pending: pending() }), ({ account: session, pending: checking }) => {
    generation++; command?.abort(); command = undefined;
    setLocal({ attempts: [], incomplete: false }); setMessage(""); setRetrying(false);
    const changed = owner.setSession(checking || session === "resolving" || session === undefined ? { kind: "pending" }
      : session === "failed" ? { kind: "failed" } : session === "anonymous" ? { kind: "anonymous" } : { kind: "ready", accountId: session.userId });
    if (!changed) {
      const expected = generation;
      queueMicrotask(() => { if (!disposed && generation === expected) readLocal(); });
      return;
    }
    const expected = generation;
    const load = () => queueMicrotask(() => { if (!disposed && generation === expected) void check(); });
    if (sharedConfig.onHydrationEnd) sharedConfig.onHydrationEnd(load); else load();
  });
  onCleanup(() => { disposed = true; generation++; command?.abort(); owner.dispose(); });
  return <main class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8" data-route-path="/spaces-name-requests">
    <Title>Spaces name requests</Title>
    <Card><CardHeader><h1 class="text-2xl font-semibold">Spaces name requests</h1></CardHeader><CardContent class="space-y-4">
      <p>Check earlier requests using their original community, root and persona.</p>
      <Show when={state().kind === "account-pending" || state().kind === "checking"}><p role="status">Checking your requests…</p></Show>
      <Show when={state().kind === "account-failed"}><p role="alert">Your account could not be checked. Check your session and try again.</p></Show>
      <Show when={state().kind === "signed-out"}><p>Sign in to see your requests.</p><a class="underline" href="/auth/sign-in?return_to=%2Fspaces-name-requests">Sign in</a></Show>
      <Show when={accountId() !== undefined && state().kind !== "signed-out"}>
        <p>No matching result does not mean a name is available or that an earlier request failed. Requests that have not committed yet may appear later.</p>
        <Show when={state().kind === "unknown"}><p role="status">The earlier outcome is unknown. Check again safely.</p></Show>
        <Button variant="outline" onClick={() => void check()} disabled={state().kind === "checking" || state().loadingMore || retrying()}>Check requests</Button>
      </Show>
      <a class="underline" href="/settings">Back to Settings</a>
    </CardContent></Card>
    <Show when={accountId() !== undefined && state().kind !== "account-pending" && state().kind !== "signed-out" && owner.accountId() === accountId()}>
    <For each={state().items}>{item => <RequestCard item={item} />}</For>
    <Show when={state().nextCursor !== null}><Button variant="outline" disabled={state().loadingMore || retrying()} onClick={() => void owner.more()}>{state().loadingMore ? "Checking more…" : "Check more requests"}</Button></Show>
    <Show when={local().incomplete}><p role="status">Some local request details are unavailable. Their outcomes remain unknown.</p></Show>
    <For each={local().attempts}>{attempt => <Card><CardContent class="space-y-3 p-5">
      <h2 class="font-semibold">Retained request: {attempt.record.desiredLabel}@{attempt.record.original.namespace_root}</h2>
      <p>This retries only the original request and its original keys, even if your current profile or community offerings changed.</p>
      <Button variant="outline" disabled={retrying()} onClick={() => void retry(attempt.key)}>Retry original request</Button>
    </CardContent></Card>}</For>
    <Show when={message()}><p role="status">{message()}</p></Show>
    </Show>
  </main>;
}
