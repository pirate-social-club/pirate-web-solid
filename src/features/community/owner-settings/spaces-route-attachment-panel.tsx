import { Button, Card, FormFieldLabel, PrefixInput, Textarea, Type } from "@pirate/web-solid-ui";
import { ApiClientError } from "@pirate/api-client";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import { useApplicationSession } from "../../shell/application-session";
import { OwnerSettingsSignInCard } from "./owner-settings-sign-in-card";
import type {
  SpacesRouteAttachmentApi,
  SpacesRouteAttachmentResult,
  SpacesRouteAttachmentState,
} from "./spaces-route-attachment-api";

const CHECK_LATER = "We couldn't check this address right now. Try again in a minute.";
/** The plain reason an attempt is over, or undefined while it can still continue. */
function endedReason(status: SpacesRouteAttachmentState["status"]): string | undefined {
  switch (status) {
    case "expired": return "The time to sign ran out. Start again to get a new message.";
    case "signature_rejected": return "That signature doesn't match the wallet that owns this address. Start again and sign with the owner wallet.";
    case "root_changed": return "The owner of this address changed. Start again with the wallet that owns it now.";
    case "configuration_changed": return "This request is out of date. Start again to get a new message.";
    default: return undefined;
  }
}

function newKey(): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return [...random].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const isPending = (result: SpacesRouteAttachmentResult): result is Extract<SpacesRouteAttachmentResult, { status: "verification_pending" }> =>
  result.status === "verification_pending";

/**
 * One screen for connecting an address the first time and for restoring the
 * same address after it stopped working. The server decides which applies.
 */
export function SpacesRouteAttachmentPanel(props: {
  api: SpacesRouteAttachmentApi;
  communityId: string;
  /** Keeps one signed-in account's unfinished attempt apart from another's. Defaults to the signed-in account. */
  accountId?: string;
  /**
   * Repairs the owner's application session before each request, as the other
   * address ceremonies do. It receives the account and an abort signal for the
   * scope that asked, and resolves false when the owner must sign in.
   */
  sessionRepair?: (accountId: string | undefined, signal: AbortSignal) => Promise<boolean>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const applicationSession = useApplicationSession();
  const accountId = (): string | undefined => {
    if (props.accountId !== undefined) return props.accountId;
    const account = applicationSession();
    return account !== undefined && typeof account === "object" ? account.userId : undefined;
  };
  const [root, setRoot] = createSignal("");
  const [signature, setSignature] = createSignal("");
  const [attempt, setAttempt] = createSignal<SpacesRouteAttachmentState>();
  // working is null when the live lookup could not answer: no verdict either way.
  const [connected, setConnected] = createSignal<{ root: string; href: string; working: boolean | null }>();
  const [busy, setBusyState] = createSignal(true);
  const [message, setMessage] = createSignal("");
  const [copied, setCopied] = createSignal(false);
  const [authRequired, setAuthRequired] = createSignal(false);
  // Whether this panel currently holds the shared address choice.
  let holdsChoice = false;
  const setBusy = (next: boolean) => {
    setBusyState(next);
    holdsChoice = next;
    props.onBusyChange?.(next);
  };

  // Every request belongs to the account and community that started it. When
  // either changes, `scope` advances and late replies for the old one are dropped.
  let scope = 0;
  let scopeAbort = new AbortController();
  type Scope = Readonly<{ live: () => boolean; communityId: string; accountId: string | undefined;
    signal: AbortSignal; storageKey: (root: string) => string | null }>;
  const enter = (): Scope => {
    const mine = scope;
    const communityId = props.communityId;
    const owner = accountId();
    // Without a known account there is no safe per-account slot, so nothing is
    // stored; the server's current request is still read back on return.
    const prefix = owner === undefined ? null : `spaces-route-attachment:${owner}:${communityId}:`;
    return { live: () => mine === scope, communityId, accountId: owner, signal: scopeAbort.signal,
      storageKey: (canonicalRoot) => prefix === null ? null : prefix + canonicalRoot };
  };
  /** Ends the current scope: its repair is aborted and nothing it awaited may act. */
  const leave = () => {
    scope += 1;
    scopeAbort.abort();
    scopeAbort = new AbortController();
  };
  /**
   * An action from an ended scope skips its own cleanup, so release the shared
   * choice for it. Only when actually held, and never synchronously: leave()
   * runs inside an effect callback, where a parent's signal write is refused.
   */
  const releaseChoice = () => {
    if (!holdsChoice) return;
    holdsChoice = false;
    props.onBusyChange?.(false);
  };
  /**
   * Session repair is itself a wait. It runs for the scope and owner that
   * asked, and a scope that ended meanwhile must send nothing and store nothing.
   */
  const sessionReady = async (at: Scope): Promise<boolean> => {
    if (props.sessionRepair === undefined) return at.live();
    const ready = await props.sessionRepair(at.accountId, at.signal);
    if (!at.live()) return false;
    if (!ready) setAuthRequired(true);
    return ready;
  };
  const savedKey = (at: Scope, canonicalRoot: string) => {
    const name = at.storageKey(canonicalRoot);
    return name === null || typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(name);
  };
  const saveKey = (at: Scope, canonicalRoot: string, key: string) => {
    const name = at.storageKey(canonicalRoot);
    if (name !== null && typeof sessionStorage !== "undefined") sessionStorage.setItem(name, key);
  };
  const clearKey = (at: Scope, canonicalRoot: string) => {
    const name = at.storageKey(canonicalRoot);
    if (name !== null && typeof sessionStorage !== "undefined") sessionStorage.removeItem(name);
  };

  /** A finished attempt is history; whether the address works now is read separately. */
  const showConnected = async (at: Scope, state: SpacesRouteAttachmentState) => {
    clearKey(at, state.canonical_root);
    let working: boolean | null;
    try {
      working = await props.api.resolves({ canonicalRoot: state.canonical_root, communityId: at.communityId });
    } catch {
      working = null; // An outage or bad reply is not evidence the address stopped working.
    }
    if (!at.live()) return;
    setAttempt(undefined);
    setSignature("");
    setRoot(`@${state.canonical_root}`);
    setConnected({ root: state.canonical_root, href: state.canonical_href, working });
    if (working === null) setMessage(CHECK_LATER);
  };

  const apply = async (at: Scope, result: SpacesRouteAttachmentResult): Promise<void> => {
    if (!at.live()) return;
    if (isPending(result)) {
      setMessage(CHECK_LATER);
      return;
    }
    setRoot(`@${result.canonical_root}`);
    if (result.status === "committed") return showConnected(at, result);
    if (result.status === "awaiting_signature" || result.status === "proved") {
      setConnected(undefined);
      setAttempt(result);
      return;
    }
    clearKey(at, result.canonical_root);
    setAttempt(undefined);
    setSignature("");
    setMessage(endedReason(result.status) ?? "Start again to get a new message.");
  };

  const isOpen = (state: SpacesRouteAttachmentState): boolean =>
    state.status === "awaiting_signature" || state.status === "proved";

  const load = async (at: Scope) => {
    try {
      if (!await sessionReady(at)) return;
      const current = await props.api.current({ communityId: at.communityId });
      if (!at.live()) return;
      // An attempt that ended earlier needs no announcement on a fresh visit.
      if (current !== null && !isPending(current)) {
        if (isOpen(current) || current.status === "committed") await apply(at, current);
        else setRoot(`@${current.canonical_root}`);
      }
    } catch (reason) {
      if (at.live() && reason instanceof ApiClientError && reason.status === 401) setAuthRequired(true);
    } finally {
      // Reading state only disables this panel's own controls; it never holds
      // the shared address choice, so the owner can switch networks meanwhile.
      if (at.live()) setBusyState(false);
    }
  };
  // Session refreshes replace the session object without changing who is
  // signed in. Effects here rerun on every recompute, so compare the actual
  // account and community and ignore a refresh that changes neither.
  let lastScopeKey: string | undefined;
  createEffect(() => `${props.communityId}\n${accountId() ?? ""}`, (scopeKey) => {
    if (scopeKey === lastScopeKey) return;
    lastScopeKey = scopeKey;
    leave();
    const at = enter();
    queueMicrotask(() => {
      if (!at.live()) return;
      releaseChoice();
      setRoot("");
      setSignature("");
      setAttempt(undefined);
      setConnected(undefined);
      setMessage("");
      setCopied(false);
      setAuthRequired(false);
      setBusyState(true);
      void load(at);
    });
  });
  onCleanup(leave);

  const reportFailure = (at: Scope, reason: unknown, fallback: string, stage: "start" | "continue" = "start") => {
    if (!at.live()) return;
    if (reason instanceof ApiClientError && reason.status === 401) setAuthRequired(true);
    else if (reason instanceof ApiClientError && reason.status === 409) {
      setMessage(stage === "start"
        ? "This address can't be connected here. It may already belong to a community, or another request is still open. Try again in a few minutes."
        : "This request can't continue as it is. Reload the page to see where it stands.");
    } else setMessage(fallback);
  };

  const start = async () => {
    if (busy()) return;
    const at = enter();
    const typed = root().trim().toLowerCase();
    const canonicalRoot = typed.startsWith("@") ? typed.slice(1) : typed;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(canonicalRoot) || canonicalRoot.length > 62) {
      setMessage("Enter an address such as @yahoo.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (!await sessionReady(at)) return;
      let idempotencyKey = savedKey(at, canonicalRoot);
      const reused = idempotencyKey !== null;
      if (idempotencyKey === null) {
        idempotencyKey = newKey();
        saveKey(at, canonicalRoot, idempotencyKey);
      }
      let result = await props.api.start({ communityId: at.communityId, canonicalRoot, idempotencyKey });
      // A saved key can name an attempt that has since ended. Pressing the
      // button asks for a new one, so it gets a new key and a new message.
      if (at.live() && reused && !isPending(result) && endedReason(result.status) !== undefined) {
        idempotencyKey = newKey();
        saveKey(at, canonicalRoot, idempotencyKey);
        result = await props.api.start({ communityId: at.communityId, canonicalRoot, idempotencyKey });
      }
      await apply(at, result);
    } catch (reason) {
      // The server keeps an open request until it runs out. If this browser
      // lost its key for it, continue that request rather than fail.
      if (at.live() && reason instanceof ApiClientError && reason.status === 409) {
        clearKey(at, canonicalRoot);
        try {
          const open = await props.api.current({ communityId: at.communityId });
          if (open !== null && !isPending(open) && isOpen(open)) {
            await apply(at, open);
            if (at.live()) setMessage("Continuing the request you already started.");
            return;
          }
        } catch {
          /* Fall through to the plain refusal. */
        }
      }
      reportFailure(at, reason, "We couldn't start. Check the address and try again.");
    } finally {
      if (at.live()) setBusy(false);
    }
  };

  const finish = async (at: Scope, state: SpacesRouteAttachmentState) => {
    const result = await props.api.commit({ communityId: at.communityId,
      attachmentIntentId: state.attachment_intent_id, generation: state.generation });
    await apply(at, result);
  };

  const submitSignature = async () => {
    const state = attempt();
    if (state === undefined || busy()) return;
    const at = enter();
    const signatureHex = signature().trim().toLowerCase();
    if (!/^[0-9a-f]{128}$/.test(signatureHex)) {
      setMessage("Paste the 128-character signature from your wallet.");
      return;
    }
    setBusy(true);
    setMessage("");
    let accepted = false;
    try {
      if (!await sessionReady(at)) return;
      const result = await props.api.prove({ communityId: at.communityId,
        attachmentIntentId: state.attachment_intent_id, signatureHex });
      await apply(at, result);
      if (at.live() && !isPending(result) && result.status === "proved") {
        accepted = true;
        await finish(at, result);
      }
    } catch (reason) {
      reportFailure(at, reason, accepted
        ? "Your signature was accepted, but we couldn't finish. Select Continue to try again."
        : "We couldn't check the signature. You can try the same signature again.", "continue");
    } finally {
      if (at.live()) setBusy(false);
    }
  };

  const resume = async () => {
    const state = attempt();
    if (state === undefined || busy()) return;
    const at = enter();
    setBusy(true);
    setMessage("");
    try {
      if (!await sessionReady(at)) return;
      await finish(at, state);
    } catch (reason) {
      reportFailure(at, reason, "We couldn't finish. Select Continue to try again.", "continue");
    } finally {
      if (at.live()) setBusy(false);
    }
  };

  const copyMessage = async (text: string) => {
    const at = enter();
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false;
    }
    if (at.live()) setCopied(ok);
  };

  /** After signing in again, read this account's state rather than assume it. */
  const signedIn = () => {
    setAuthRequired(false);
    setBusyState(true);
    void load(enter());
  };

  const signBy = (expiresAt: string) => new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const restoring = () => attempt()?.purpose === "revalidation" || connected()?.working === false;

  return (
    <Show when={!authRequired()} fallback={<OwnerSettingsSignInCard onAuthenticated={signedIn} />}>
      <Card class="space-y-4 p-5 md:p-6" data-spaces-route-attachment>
        <Type as="h2" variant="h3">Community address</Type>
        <Show when={connected()?.working === true}>
          <p class="text-sm" data-spaces-route-connected>
            This community is at <a class="underline" href={`/c/@${connected()!.root}`}>{connected()!.href}</a>.
          </p>
        </Show>
        <Show when={connected()?.working !== true}>
          <Show when={connected()?.working === false}>
            <p class="text-sm" data-spaces-route-stopped>
              @{connected()!.root} has stopped working as this community's address. The community itself is still open. Restore the address by signing with the wallet that owns it.
            </p>
          </Show>
          <Show when={connected() === undefined && attempt() === undefined}>
            <p class="text-sm text-muted-foreground">Use a Spaces name you own as this community's address. You sign one message with the wallet that owns it. Nothing is sent or spent.</p>
          </Show>
          <Show when={connected()?.working === null}>
            <p class="text-sm" data-spaces-route-unchecked>@{connected()!.root} is this community's address.</p>
          </Show>
          <Show when={attempt() === undefined && connected()?.working !== null}>
            <div class="space-y-2">
              <FormFieldLabel htmlFor="spaces-route-root" label="Address" />
              <PrefixInput id="spaces-route-root" class="h-16" prefix="@" value={root().replace(/^@/u, "")}
                disabled={busy() || connected() !== undefined} onInput={(event) => setRoot(event.currentTarget.value)} placeholder="name" />
            </div>
            <Button type="button" disabled={busy()} onClick={() => void start()}>
              {restoring() ? "Restore address" : "Connect address"}
            </Button>
          </Show>
          <Show when={attempt()}>{(state) => (
            <div class="space-y-3">
              <dl class="space-y-1 text-sm">
                <div><dt class="inline text-muted-foreground">Address: </dt><dd class="inline break-all" data-spaces-route-href>{state().canonical_href}</dd></div>
              </dl>
              <Show when={state().status === "awaiting_signature"}>
                <p class="text-sm">Sign this exact message with the wallet that owns @{state().canonical_root}, then paste the signature below. Never enter a seed phrase or private key here.</p>
                <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-sm" data-spaces-route-message>{state().challenge_message}</pre>
                <div class="flex items-center gap-3">
                  <Button type="button" variant="secondary" disabled={busy()} onClick={() => void copyMessage(state().challenge_message)}>Copy message</Button>
                  <Show when={copied()}><span role="status" class="text-sm">Copied</span></Show>
                </div>
                <p class="text-xs text-muted-foreground" data-spaces-route-deadline>Sign before {signBy(state().expires_at)}. To use a different address, wait until then and start again.</p>
                <div class="space-y-2">
                  <FormFieldLabel htmlFor="spaces-route-signature" label="Signature" />
                  <Textarea id="spaces-route-signature" class="min-h-24 font-mono"
                    value={signature()} disabled={busy()} onInput={(event) => setSignature(event.currentTarget.value)} />
                </div>
                <Button type="button" disabled={busy()} onClick={() => void submitSignature()}>
                  {restoring() ? "Restore address" : "Connect address"}
                </Button>
              </Show>
              <Show when={state().status === "proved"}>
                <p class="text-sm">Your signature was accepted. Continue to finish before {signBy(state().expires_at)}.</p>
                <Button type="button" disabled={busy()} onClick={() => void resume()}>Continue</Button>
              </Show>
            </div>
          )}</Show>
        </Show>
        <Show when={message()}><p role="status" class="text-sm">{message()}</p></Show>
      </Card>
    </Show>
  );
}
