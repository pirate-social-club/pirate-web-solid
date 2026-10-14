import { Button, Card, Type, FormFieldLabel, PrefixInput, Textarea } from "@pirate/web-solid-ui";
import { For, Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { createActor } from "xstate";

import { createSpacesOwnerProofApi, type SpacesOwnerProofApi } from "./spaces-owner-proof-api";
import { canStartSpacesProof, canonicalSpacesRoot, createSpacesCommandKeys, createSpacesOwnerProofMachine,
  freshSpacesProof, spacesProofNotice, type SpacesProofScope } from "./spaces-owner-proof-machine";
import { OwnerSettingsSignInCard } from "./owner-settings-sign-in-card";
import { useApplicationSession } from "../../shell/application-session";
import { ensureApplicationSession } from "../../auth/session-recovery";
import { resolveAccountSession } from "../../../api/session";
import { useOwnedActor } from "../../posts/video-submission/solid-actor";

export function SpacesOwnerProofPanel(props: { api?: SpacesOwnerProofApi; communityId: string;
  accountId?: string; onBusyChange?: (busy: boolean) => void }) {
  const suppliedApi = untrack(() => props.api);
  const api = suppliedApi ?? createSpacesOwnerProofApi();
  const [root, setRoot] = createSignal("");
  const [signature, setSignature] = createSignal("");
  const [draftError, setDraftError] = createSignal("");
  const applicationSession = useApplicationSession();
  const accountId = () => {
    const session = applicationSession();
    if (session !== undefined && typeof session === "object") return session.userId;
    if (session === "anonymous") return null;
    // Injected ports are isolated fixtures; real requests always resolve the application session.
    return props.accountId ?? (suppliedApi === undefined ? undefined : "fixture-account");
  };
  let revision = 0;
  let disposed = false;
  const scope = (): SpacesProofScope => untrack(() => ({ communityId: props.communityId, accountId: accountId(), revision }));
  const current = (at: SpacesProofScope) => !disposed && at.communityId === props.communityId
    && at.accountId === accountId() && at.revision === revision;
  const machine = createSpacesOwnerProofMachine({ api, isCurrent: at => untrack(() => current(at)),
    commandKey: createSpacesCommandKeys(typeof sessionStorage === "undefined" ? undefined : sessionStorage),
    authorize: async (at, expected, signal) => {
      if (suppliedApi !== undefined) return at.accountId ?? undefined;
      const account = await resolveAccountSession({ timeoutMs: 15_000 });
      signal.throwIfAborted();
      if (!untrack(() => current(at)) || account === "anonymous" || expected !== undefined && expected !== account.userId
        || at.accountId !== undefined && at.accountId !== account.userId) return undefined;
      if (!await ensureApplicationSession(account.userId, signal)) return undefined;
      signal.throwIfAborted();
      return untrack(() => current(at)) ? account.userId : undefined;
    },
  });
  const { snapshot, send } = useOwnedActor(createActor(machine, { input: { scope: scope() } }));
  const context = () => current(snapshot().context.scope) ? snapshot().context : undefined;
  const progress = () => context()?.progress;
  const ceremony = () => progress()?.ceremony;
  const challenge = () => {
    const saved = ceremony();
    return saved?.status === "awaiting_signature" || saved?.status === "verification_pending" ? saved.challenge : undefined;
  };
  const proof = () => freshSpacesProof(progress());
  const candidate = () => progress()?.operator_assignment ?? undefined;
  const confirmed = () => candidate()?.status === "confirmed" && candidate()?.current;
  const busy = () => context() === undefined || snapshot().matches("discovering") || snapshot().matches("reading") || snapshot().matches("acting");
  const ready = () => context() !== undefined && snapshot().matches("ready");
  const canChooseRoot = () => context() !== undefined && context()?.unresolved === undefined;
  const message = () => draftError() || context()?.notice || spacesProofNotice(progress());

  let previousScope = untrack(() => JSON.stringify([props.communityId, accountId()]));
  createEffect(() => JSON.stringify([props.communityId, accountId()]), (next) => {
    if (next === previousScope) return;
    previousScope = next;
    revision++;
    send({ type: "SCOPE", scope: scope() });
    queueMicrotask(() => { if (!disposed) { setRoot(""); setSignature(""); setDraftError(""); } });
  });
  // Plain reads leave the shared choice free; a command holds it through unresolved readback.
  createEffect(() => context() !== undefined && (snapshot().matches("acting") || context()?.unresolved !== undefined), (value) => {
    queueMicrotask(() => { if (!disposed) props.onBusyChange?.(value); });
  });
  const refresh = () => { setSignature(""); setDraftError(""); send({ type: "REFRESH" }); };
  const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
  if (typeof window !== "undefined") {
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", onVisible);
  }
  onCleanup(() => {
    disposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    }
    props.onBusyChange?.(false);
  });
  const choose = () => {
    if (!canChooseRoot()) return;
    setRoot(""); setSignature(""); setDraftError("");
    send({ type: "CHOOSE", scope: scope() });
  };
  const select = (value: string) => {
    if (!canChooseRoot()) return;
    setRoot(value); setSignature(""); setDraftError("");
    send({ type: "SELECT", root: value, scope: scope() });
  };
  const start = (replace = false) => {
    const value = canonicalSpacesRoot(context()?.root ?? root());
    if (value === undefined) { setDraftError("Enter a Spaces root such as @yahoo."); return; }
    setDraftError(""); setSignature("");
    send({ type: "START", root: value, scope: scope(), replace });
  };
  const poll = () => {
    const value = signature().trim().toLowerCase();
    if (!/^[0-9a-f]{128}$/u.test(value)) { setDraftError("Paste the 128-character hexadecimal signature from your Spaces wallet."); return; }
    setDraftError(""); setSignature("");
    send({ type: "POLL", signatureHex: value });
  };

  return <Show when={context() === undefined || !snapshot().matches("signInRequired")}
    fallback={<OwnerSettingsSignInCard onAuthenticated={refresh} />}>
    <Card class="space-y-4 p-5 md:p-6" data-spaces-owner-proof>
      <Type as="h2" variant="h3">Prove your Spaces root</Type>
      <Type as="p" variant="body" class="text-muted-foreground">Use the Spaces wallet that owns the root. This check signs a message and sends no Bitcoin transaction.</Type>
      <Show when={context()?.root === undefined && (context()?.roots.length ?? 0) > 1}>
        <p class="text-sm">Choose a saved root.</p>
        <div class="flex flex-wrap gap-2"><For each={context()?.roots}>{value =>
          <Button type="button" disabled={!ready()} onClick={() => select(value)}>@{value}</Button>
        }</For></div>
      </Show>
      <div class="space-y-2">
        <FormFieldLabel htmlFor="spaces-owner-root" label="Spaces root" />
        <PrefixInput id="spaces-owner-root" class="h-16" prefix="@" value={context()?.root ?? root().replace(/^@/u, "")}
          disabled={busy() || context()?.root !== undefined} onInput={event => setRoot(event.currentTarget.value)} placeholder="root" />
      </div>
      <Show when={ready() && canStartSpacesProof(progress())}>
        <Button type="button" onClick={() => start()}>Get ownership message</Button>
      </Show>
      <Show when={context()?.root !== undefined}>
        <Button type="button" variant="secondary" disabled={!canChooseRoot()} onClick={choose}>Choose another root</Button>
      </Show>
      <Show when={challenge()}>{saved => <div class="space-y-3">
        <p class="text-sm">Sign the 32-byte digest below with the Schnorr key that owns @{saved().canonical_root}. Do not paste your seed phrase or private key here.</p>
        <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-sm" data-spaces-challenge>{saved().challenge_message}</pre>
        <p class="break-all font-mono text-sm" data-spaces-challenge-digest>Digest: {saved().challenge_digest_hex}</p>
        <p class="text-xs text-muted-foreground">Challenge expires at {saved().expires_at}.</p>
        <Show when={ceremony()?.status === "awaiting_signature"}>
          <div class="space-y-2">
            <FormFieldLabel htmlFor="spaces-owner-signature" label="Message signature (hex)" />
            <Textarea id="spaces-owner-signature" class="min-h-24 font-mono" value={signature()}
              disabled={busy()} onInput={event => setSignature(event.currentTarget.value)} />
          </div>
          <div class="flex gap-2">
            <Button type="button" disabled={!ready()} onClick={poll}>Check signature</Button>
            <Button type="button" variant="secondary" disabled={!ready()} onClick={() => start(true)}>Get a new message</Button>
          </div>
        </Show>
        <Show when={ceremony()?.status === "verification_pending"}>
          <Button type="button" disabled={!ready()} onClick={() => send({ type: "RESUME" })}>Check saved proof</Button>
        </Show>
      </div>}</Show>
      <Show when={message()}><p role="status" class="text-sm">{message()}</p></Show>
      <Show when={busy()}><p role="status" class="text-sm">Checking status…</p></Show>
      <Button type="button" variant="secondary" disabled={busy()} onClick={refresh}>Refresh status</Button>
      <Show when={proof()}>{saved => <>
        <p class="text-xs text-muted-foreground">Ownership check expires at {saved().fresh_until}.</p>
        <Show when={!confirmed()}>
          <Button type="button" variant="secondary" disabled={!ready()} onClick={() => send({ type: "ASSIGN" })}>Check operator address</Button>
        </Show>
      </>}</Show>
      <Show when={candidate()}>{selected => <div class="space-y-3 rounded-md border p-3" data-spaces-operator-assignment>
        <p class="text-sm">Delegation address for @{selected().canonical_root}</p>
        <p class="break-all font-mono text-sm" data-spaces-delegation-address>{selected().delegation_address}</p>
        <Show when={proof() !== undefined && selected().status === "prepared"}>
          <Button type="button" disabled={!ready()} onClick={() => send({ type: "CONFIRM" })}>Confirm this operator address</Button>
        </Show>
        <Show when={confirmed()}><p role="status">Address confirmed. Delegate from your Spaces wallet when ready.</p></Show>
        <Show when={selected().status === "confirmed" && !selected().current}><p role="status">This address is no longer current. Refresh status before continuing.</p></Show>
      </div>}</Show>
    </Card>
  </Show>;
}
