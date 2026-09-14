/** @jsxImportSource @solidjs/web */
import { For, Show, createSignal, onCleanup } from "solid-js";
import { Button, Modal, ModalContent } from "../../design-system.ts";
import { createSelfPassCeremony } from "../../api/self-pass.ts";
import { createZkPassportCeremony } from "../../api/zkpassport.ts";
import type { DocumentProvider, DocumentRequirement } from "./document-requirement.ts";

export interface DocumentVerificationRequest {
  readonly title: string;
  /** Reloads account-bound authority; provider callbacks alone never satisfy this request. */
  readonly load: (signal: AbortSignal) => Promise<DocumentRequirement>;
  readonly signal: AbortSignal;
}
interface Prompt extends DocumentVerificationRequest { readonly finish: (verified: boolean) => void }
const eventName = "pirate:document-verification";
export function requestDocumentVerification(input: DocumentVerificationRequest): Promise<boolean> {
  if (typeof window === "undefined" || input.signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    const finish = (verified: boolean) => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener("abort", cancel);
      resolve(verified && !input.signal.aborted);
    };
    const cancel = () => finish(false);
    input.signal.addEventListener("abort", cancel, { once: true });
    window.dispatchEvent(new CustomEvent<Prompt>(eventName, { detail: { ...input, finish } }));
  });
}
interface Ceremony { readonly url: string; readonly completion?: Promise<unknown>; cancel(): void }
export interface DocumentVerificationHostProps {
  readonly start?: (provider: DocumentProvider, intentId: string, signal: AbortSignal) => Promise<Ceremony>;
  readonly qr?: (url: string) => Promise<string>;
  readonly pollIntervalMs?: number;
}
async function start(provider: DocumentProvider, intentId: string, signal: AbortSignal): Promise<Ceremony> {
  return provider === "self.pass"
    ? createSelfPassCeremony({ intentId, signal })
    : createZkPassportCeremony({ intentId, requestOptions: { signal } });
}

/** One modal leaves its underlying route, feed position, draft, and persona choice mounted. */
export function DocumentVerificationHost(props: DocumentVerificationHostProps = {}) {
  const [open, setOpen] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [requirement, setRequirement] = createSignal<DocumentRequirement>();
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [qr, setQr] = createSignal("");
  let prompt: Prompt | undefined;
  let operation: AbortController | undefined;
  let ceremony: Ceremony | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const stop = () => {
    generation += 1;
    operation?.abort(); operation = undefined;
    if (timer !== undefined) clearTimeout(timer);
    if (deadline !== undefined) clearTimeout(deadline);
    timer = undefined; deadline = undefined;
    ceremony?.cancel(); ceremony = undefined;
    setUrl(""); setQr(""); setBusy(false);
  };
  const close = (verified = false) => {
    stop(); setOpen(false);
    const previous = prompt; prompt = undefined;
    previous?.signal.removeEventListener("abort", cancelled);
    previous?.finish(verified);
  };
  const cancelled = () => close(false);
  const fail = (token: number) => {
    if (token !== generation) return;
    stop(); setMessage("Verification could not be confirmed. You can retry or choose the other provider.");
  };
  const refresh = async (token: number, current: Prompt, signal: AbortSignal) => {
    const latest = await current.load(signal);
    if (token !== generation || signal.aborted) return undefined;
    if (latest.kind === "satisfied") { close(true); return undefined; }
    setRequirement(latest);
    return latest;
  };
  const choose = async (provider: DocumentProvider) => {
    const current = prompt;
    if (current === undefined || current.signal.aborted) return;
    stop(); setMessage(""); setBusy(true);
    const token = generation;
    const controller = new AbortController(); operation = controller;
    try {
      const latest = await refresh(token, current, controller.signal);
      if (latest === undefined) return;
      if (!latest.acceptedProviderIds.includes(provider)) throw new Error("provider_unavailable");
      const launched = await (props.start ?? start)(provider, latest.intentId, controller.signal);
      if (token !== generation || controller.signal.aborted) {
        void launched.completion?.catch(() => undefined); launched.cancel(); return;
      }
      ceremony = launched;
      // Attach rejection handling before QR generation or any other asynchronous work.
      void launched.completion?.catch(() => fail(token));
      if (launched.url) {
        const data = await (props.qr ?? (async value => {
          const { default: QRCode } = await import("qrcode");
          return QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 2, width: 320 });
        }))(launched.url);
        if (token !== generation) return;
        setUrl(launched.url); setQr(data);
      }
      setBusy(false);
      // This is a ceremony timeout, never the lifetime of reusable account evidence.
      deadline = setTimeout(() => fail(token), 15 * 60 * 1000);
      // Starting another provider may legitimately replace the child. Pin the
      // first authoritative post-start projection, then retire an obsolete QR.
      let bound: { intentId: string; generation: number } | undefined;
      const poll = async () => {
        try {
          const next = await refresh(token, current, controller.signal);
          if (next === undefined) return;
          if (next.requirementHash !== latest.requirementHash || next.providerId !== provider
            || (bound !== undefined && (next.intentId !== bound.intentId || next.generation !== bound.generation))) {
            fail(token); return;
          }
          bound ??= { intentId: next.intentId, generation: next.generation };
          timer = setTimeout(() => { void poll(); }, props.pollIntervalMs ?? 2_000);
        } catch { fail(token); }
      };
      await poll();
    } catch { fail(token); }
  };
  const receive = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    // SAFETY: this private app event is produced by requestDocumentVerification, never from a URL or provider callback.
    const incoming = event.detail as Prompt;
    close(false);
    if (incoming.signal.aborted) { incoming.finish(false); return; }
    prompt = incoming;
    incoming.signal.addEventListener("abort", cancelled, { once: true });
    setTitle(incoming.title); setMessage(""); setRequirement(undefined); setOpen(true); setBusy(true);
    reload();
  };
  const reload = () => {
    const current = prompt;
    if (current === undefined || current.signal.aborted) return;
    stop(); setMessage(""); setBusy(true);
    const controller = new AbortController(); operation = controller;
    const token = generation;
    void refresh(token, current, controller.signal).then(() => {
      if (token === generation) setBusy(false);
    }).catch(() => fail(token));
  };
  if (typeof window !== "undefined") window.addEventListener(eventName, receive);
  onCleanup(() => {
    if (typeof window !== "undefined") window.removeEventListener(eventName, receive);
    close(false);
  });
  const pending = () => { const value = requirement(); return value?.kind === "pending" ? value : undefined; };
  return <Modal open={open()} onOpenChange={next => { if (!next) close(false); }}>
    <ModalContent aria-label={title()} mobileSide="bottom" class="max-h-[90dvh] overflow-y-auto rounded-t-xl bg-background p-6 sm:max-w-lg sm:rounded-xl">
      <div class="flex flex-col gap-4">
        <h2 class="text-xl font-semibold">{title()}</h2>
        <p>Choose either app to verify your document. Your place in Pirate stays here.</p>
        <Show when={busy()}><p role="status">Preparing verification…</p></Show>
        <For each={pending()?.acceptedProviderIds}>{provider => <Button type="button" variant="outline" disabled={busy()} onClick={() => { void choose(provider); }}>
          Verify with {provider === "self.pass" ? "Self" : "ZKPassport"}
        </Button>}</For>
        <Show when={pending()?.requirement === "nationality"}>
          <p class="text-sm text-muted-foreground">Self discloses your nationality to Pirate to check this requirement. ZKPassport proves that it matches without disclosing the country. Pirate does not retain the disclosed country.</p>
        </Show>
        <Show when={url()}>
          <p role="status">Scan with the selected app, or open it on this phone. Waiting for Pirate to confirm the proof.</p>
          <Show when={qr()}>{source => <img src={source()} width="320" height="320" alt="Document verification QR code" />}</Show>
          <a href={url()} rel="noreferrer">Open verification app</a>
        </Show>
        <Show when={message()}><p role="alert">{message()}</p></Show>
        <Show when={message() && pending() === undefined}>
          <Button type="button" variant="outline" disabled={busy()} onClick={reload}>Retry verification</Button>
        </Show>
        <Button type="button" variant="ghost" onClick={() => close(false)}>Cancel</Button>
      </div>
    </ModalContent>
  </Modal>;
}
