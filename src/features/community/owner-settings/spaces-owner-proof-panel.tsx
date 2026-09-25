import { Button, Card, Type } from "@pirate/web-solid-ui";
import { Show, createSignal } from "solid-js";

import { createSpacesOwnerProofApi, type SpacesOwnerProofApi } from "./spaces-owner-proof-api";

type Challenge = Awaited<ReturnType<SpacesOwnerProofApi["start"]>>;

function newKey(): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return [...random].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function SpacesOwnerProofPanel(props: { api?: SpacesOwnerProofApi; communityId: string }) {
  const api = props.api ?? createSpacesOwnerProofApi();
  const [root, setRoot] = createSignal("");
  const [signature, setSignature] = createSignal("");
  const [challenge, setChallenge] = createSignal<Exclude<Challenge, { status: "verification_pending" }>>();
  const [pollKey, setPollKey] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [verifiedUntil, setVerifiedUntil] = createSignal("");

  const storageKey = (canonicalRoot: string) => `spaces-owner-proof:${props.communityId}:${canonicalRoot}`;
  const clearSavedKey = () => {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(storageKey(root().replace(/^@/u, "")));
  };

  const start = async () => {
    if (busy()) return;
    const displayedRoot = root().trim().toLowerCase();
    const canonicalRoot = displayedRoot.startsWith("@") ? displayedRoot.slice(1) : displayedRoot;
    if (!/^[a-z0-9][a-z0-9-]{0,61}$/.test(canonicalRoot)) {
      setMessage("Enter a Spaces root such as @yahoo.");
      return;
    }
    setBusy(true);
    setMessage("");
    setVerifiedUntil("");
    try {
      let idempotencyKey = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(storageKey(canonicalRoot));
      if (idempotencyKey === null) {
        idempotencyKey = newKey();
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem(storageKey(canonicalRoot), idempotencyKey);
      }
      const response = await api.start({ communityId: props.communityId, canonicalRoot, idempotencyKey });
      if ("status" in response) {
        setMessage("The Spaces chain is updating. Try again after its next checkpoint.");
        return;
      }
      setRoot(`@${response.canonical_root}`);
      setPollKey(newKey());
      setSignature("");
      setChallenge(response);
    } catch {
      setMessage("Ownership proof could not start. Check that this root belongs to you and try again.");
    } finally {
      setBusy(false);
    }
  };

  const checkSignature = async () => {
    const current = challenge();
    if (current === undefined || busy()) return;
    const signatureHex = signature().trim().toLowerCase();
    if (!/^[0-9a-f]{128}$/.test(signatureHex)) {
      setMessage("Paste the 128-character hexadecimal signature from your Spaces wallet.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await api.poll({ communityId: props.communityId, ceremonyId: current.ceremony_id,
        idempotencyKey: pollKey(), signatureHex });
      if (result.status === "verified") {
        clearSavedKey();
        setVerifiedUntil(result.fresh_until);
        setChallenge(undefined);
        setSignature("");
        setMessage("Ownership verified. The operator setup can continue.");
      } else if (result.status === "verification_pending") {
        setPollKey(newKey());
        setMessage("The Spaces chain is updating. Check this proof again after its next checkpoint.");
      } else {
        clearSavedKey();
        setChallenge(undefined);
        setSignature("");
        setMessage(result.status === "signature_rejected"
          ? "That signature did not match the owner key. Start a new proof."
          : "The root changed or the challenge expired. Start a new proof.");
      }
    } catch {
      setMessage("The signature could not be checked. You can try the same signature again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card class="space-y-4 p-5 md:p-6" data-spaces-owner-proof>
      <Type as="h2" variant="h3">Prove your Spaces root</Type>
      <p class="text-sm text-muted-foreground">Use the Spaces wallet that owns the root. This check signs a message and sends no Bitcoin transaction.</p>
      <label class="block space-y-1 text-sm" for="spaces-owner-root">
        <span>Spaces root</span>
        <input id="spaces-owner-root" class="w-full rounded-md border bg-background px-3 py-2" value={root()}
          disabled={busy() || challenge() !== undefined} onInput={(event) => setRoot(event.currentTarget.value)} placeholder="@yahoo" />
      </label>
      <Show when={challenge() === undefined}>
        <Button type="button" disabled={busy()} onClick={() => void start()}>Get ownership message</Button>
      </Show>
      <Show when={challenge()}>{(current) => (
        <div class="space-y-3">
          <p class="text-sm">Sign the 32-byte digest below with the Schnorr key that owns @{current().canonical_root}. The message explains what you are approving. Do not paste your seed phrase or private key here.</p>
          <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-sm" data-spaces-challenge>{current().challenge_message}</pre>
          <p class="break-all font-mono text-sm" data-spaces-challenge-digest>Digest: {current().challenge_digest_hex}</p>
          <p class="text-xs text-muted-foreground">Challenge expires at {current().expires_at}.</p>
          <label class="block space-y-1 text-sm" for="spaces-owner-signature">
            <span>Message signature (hex)</span>
            <textarea id="spaces-owner-signature" class="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              value={signature()} disabled={busy()} onInput={(event) => setSignature(event.currentTarget.value)} />
          </label>
          <div class="flex gap-2">
            <Button type="button" disabled={busy()} onClick={() => void checkSignature()}>Check signature</Button>
            <Button type="button" variant="secondary" disabled={busy()} onClick={() => { clearSavedKey(); setChallenge(undefined); setSignature(""); setMessage(""); }}>Start over</Button>
          </div>
        </div>
      )}</Show>
      <Show when={message()}><p role="status" class="text-sm">{message()}</p></Show>
      <Show when={verifiedUntil()}><p class="text-xs text-muted-foreground">Authority check expires at {verifiedUntil()}.</p></Show>
    </Card>
  );
}
