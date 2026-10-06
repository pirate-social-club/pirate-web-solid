import { Button, Card, Type } from "@pirate/web-solid-ui";
import { ApiClientError } from "@pirate/api-client";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

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
  /** Keeps one signed-in account's unfinished attempt apart from another's. */
  accountId?: string;
}) {
  const [root, setRoot] = createSignal("");
  const [signature, setSignature] = createSignal("");
  const [attempt, setAttempt] = createSignal<SpacesRouteAttachmentState>();
  const [connected, setConnected] = createSignal<{ root: string; href: string; working: boolean }>();
  const [busy, setBusy] = createSignal(true);
  const [message, setMessage] = createSignal("");
  const [copied, setCopied] = createSignal(false);
  const [authRequired, setAuthRequired] = createSignal(false);

  const storageKey = (canonicalRoot: string) =>
    `spaces-route-attachment:${props.accountId ?? "session"}:${props.communityId}:${canonicalRoot}`;
  const savedKey = (canonicalRoot: string) =>
    typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(storageKey(canonicalRoot));
  const saveKey = (canonicalRoot: string, key: string) => {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(storageKey(canonicalRoot), key);
  };
  const clearKey = (canonicalRoot: string) => {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(storageKey(canonicalRoot));
  };
  const reportFailure = (reason: unknown, fallback: string) => {
    if (reason instanceof ApiClientError && reason.status === 401) setAuthRequired(true);
    else if (reason instanceof ApiClientError && reason.status === 409) {
      setMessage("This address can't be connected here. It may already belong to a community, or another attempt is still open. Try again in a few minutes.");
    } else setMessage(fallback);
  };

  /** A finished attempt is history; whether the address works now is read separately. */
  const showConnected = async (state: SpacesRouteAttachmentState) => {
    clearKey(state.canonical_root);
    setAttempt(undefined);
    setSignature("");
    let working = false;
    try {
      working = await props.api.resolves({ canonicalRoot: state.canonical_root });
    } catch {
      working = false;
    }
    setRoot(`@${state.canonical_root}`);
    setConnected({ root: state.canonical_root, href: state.canonical_href, working });
  };

  const apply = async (result: SpacesRouteAttachmentResult): Promise<void> => {
    if (isPending(result)) {
      setMessage(CHECK_LATER);
      return;
    }
    setRoot(`@${result.canonical_root}`);
    if (result.status === "committed") return showConnected(result);
    if (result.status === "awaiting_signature" || result.status === "proved") {
      setConnected(undefined);
      setAttempt(result);
      return;
    }
    clearKey(result.canonical_root);
    setAttempt(undefined);
    setSignature("");
    setMessage(endedReason(result.status) ?? "Start again to get a new message.");
  };

  const load = async (isCurrent: () => boolean) => {
    try {
      const current = await props.api.current({ communityId: props.communityId });
      if (!isCurrent()) return;
      // An attempt that ended earlier needs no announcement on a fresh visit.
      if (current !== null && !isPending(current)) {
        if (current.status === "awaiting_signature" || current.status === "proved" || current.status === "committed") {
          await apply(current);
        } else setRoot(`@${current.canonical_root}`);
      }
    } catch (reason) {
      if (isCurrent() && reason instanceof ApiClientError && reason.status === 401) setAuthRequired(true);
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  createEffect(() => props.communityId, () => {
    let active = true;
    queueMicrotask(() => { if (active) void load(() => active); });
    onCleanup(() => { active = false; });
  });

  const start = async () => {
    if (busy()) return;
    const typed = root().trim().toLowerCase();
    const canonicalRoot = typed.startsWith("@") ? typed.slice(1) : typed;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(canonicalRoot) || canonicalRoot.length > 62) {
      setMessage("Enter an address such as @yahoo.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      let idempotencyKey = savedKey(canonicalRoot);
      const reused = idempotencyKey !== null;
      if (idempotencyKey === null) {
        idempotencyKey = newKey();
        saveKey(canonicalRoot, idempotencyKey);
      }
      let result = await props.api.start({ communityId: props.communityId, canonicalRoot, idempotencyKey });
      // A saved key can name an attempt that has since ended. Pressing the
      // button asks for a new one, so it gets a new key and a new message.
      if (reused && !isPending(result) && endedReason(result.status) !== undefined) {
        idempotencyKey = newKey();
        saveKey(canonicalRoot, idempotencyKey);
        result = await props.api.start({ communityId: props.communityId, canonicalRoot, idempotencyKey });
      }
      await apply(result);
    } catch (reason) {
      reportFailure(reason, "We couldn't start. Check the address and try again.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async (state: SpacesRouteAttachmentState) => {
    const result = await props.api.commit({ communityId: props.communityId,
      attachmentIntentId: state.attachment_intent_id, generation: state.generation });
    await apply(result);
  };

  const submitSignature = async () => {
    const state = attempt();
    if (state === undefined || busy()) return;
    const signatureHex = signature().trim().toLowerCase();
    if (!/^[0-9a-f]{128}$/.test(signatureHex)) {
      setMessage("Paste the 128-character signature from your wallet.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await props.api.prove({ communityId: props.communityId,
        attachmentIntentId: state.attachment_intent_id, signatureHex });
      await apply(result);
      if (!isPending(result) && result.status === "proved") await finish(result);
    } catch (reason) {
      reportFailure(reason, "We couldn't check the signature. You can try the same signature again.");
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    const state = attempt();
    if (state === undefined || busy()) return;
    setBusy(true);
    setMessage("");
    try {
      await finish(state);
    } catch (reason) {
      reportFailure(reason, "We couldn't finish. Select Continue to try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const startOver = () => {
    const state = attempt();
    if (state !== undefined) clearKey(state.canonical_root);
    setAttempt(undefined);
    setSignature("");
    setMessage("");
  };

  const signBy = (expiresAt: string) => new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const restoring = () => attempt()?.purpose === "revalidation" || connected()?.working === false;

  return (
    <Show when={!authRequired()} fallback={<OwnerSettingsSignInCard />}>
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
          <Show when={attempt() === undefined}>
            <label class="block space-y-1 text-sm" for="spaces-route-root">
              <span>Address</span>
              <input id="spaces-route-root" class="w-full rounded-md border bg-background px-3 py-2" value={root()}
                disabled={busy() || connected() !== undefined} onInput={(event) => setRoot(event.currentTarget.value)} placeholder="@yahoo" />
            </label>
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
                <p class="text-xs text-muted-foreground">Sign before {signBy(state().expires_at)}.</p>
                <label class="block space-y-1 text-sm" for="spaces-route-signature">
                  <span>Signature</span>
                  <textarea id="spaces-route-signature" class="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                    value={signature()} disabled={busy()} onInput={(event) => setSignature(event.currentTarget.value)} />
                </label>
                <div class="flex gap-2">
                  <Button type="button" disabled={busy()} onClick={() => void submitSignature()}>
                    {restoring() ? "Restore address" : "Connect address"}
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy()} onClick={startOver}>Start over</Button>
                </div>
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
