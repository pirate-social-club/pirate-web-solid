import { Title } from "@solidjs/meta";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Button, TextField, TextFieldInput, TextFieldLabel } from "../../design-system";
import {
  PrivyIdentityBootstrapRequired,
  createPrivySessionExchange,
  type PrivySessionExchange,
} from "../../api/privy-session.ts";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import {
  ZkPassportClientError,
  createZkPassportCeremony,
  type ZkPassportCeremony,
  type ZkPassportCompletion,
} from "../../api/zkpassport.ts";

type Phase = "loading" | "email" | "code" | "ready" | "ceremony" | "complete" | "unavailable";
const CEREMONY_TIMEOUT_MS = 15 * 60 * 1000;

function safeMessage(error: unknown): string {
  if (error instanceof PrivyIdentityBootstrapRequired) {
    return `Staging account bootstrap required: ${error.sourceUserId}`;
  }
  if (error instanceof ZkPassportClientError) {
    if (error.code === "submission_too_large") return "The proof exceeded the staging upload limit.";
    if (error.code === "ceremony_cancelled") return "The ceremony expired. Start a fresh one.";
    if (error.code === "proof_rejected") return "The proof was rejected. You can retry.";
  }
  return "The operation failed safely. Please retry.";
}

export default function ZkPassportVerificationRoute() {
  const [phase, setPhase] = createSignal<Phase>("loading");
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [qr, setQr] = createSignal("");
  const [ceremonyUrl, setCeremonyUrl] = createSignal("");
  const [completion, setCompletion] = createSignal<ZkPassportCompletion>();
  let auth: PrivySessionExchange | undefined;
  let ceremony: ZkPassportCeremony | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let mounted = true;

  createEffect(
    () => true,
    () => {
      if (typeof window === "undefined") return;
      void fetchVerificationConfig().then(async config => {
        auth = await createPrivySessionExchange(config);
        setPhase("email");
      }).catch(() => setPhase("unavailable"));
    },
  );

  onCleanup(() => {
    mounted = false;
    if (timeout !== undefined) clearTimeout(timeout);
    ceremony?.cancel();
    auth?.clear();
  });

  async function sendCode() {
    if (auth === undefined || email().length === 0) return;
    setBusy(true); setMessage("");
    try { await auth.sendCode(email()); setPhase("code"); }
    catch (error) { setMessage(safeMessage(error)); }
    finally { setBusy(false); }
  }

  async function authenticate() {
    if (auth === undefined || code().length === 0) return;
    setBusy(true); setMessage("");
    try { await auth.loginWithCode(email(), code()); setPhase("ready"); }
    catch (error) { setMessage(safeMessage(error)); }
    finally { setBusy(false); }
  }

  async function startCeremony() {
    setBusy(true); setMessage(""); setQr("");
    try {
      const created = await createZkPassportCeremony();
      if (!mounted) {
        created.cancel();
        await created.completion.catch(() => undefined);
        return;
      }
      ceremony = created;
      setCeremonyUrl(created.url);
      const { default: QRCode } = await import("qrcode");
      setQr(await QRCode.toDataURL(created.url, { errorCorrectionLevel: "M", margin: 2, width: 320 }));
      if (!mounted) {
        created.cancel();
        await created.completion.catch(() => undefined);
        return;
      }
      setPhase("ceremony");
      timeout = setTimeout(() => created.cancel(), CEREMONY_TIMEOUT_MS);
      const result = await created.completion;
      if (timeout !== undefined) clearTimeout(timeout);
      setCompletion(result); setPhase("complete");
    } catch (error) {
      ceremony?.cancel();
      ceremony = undefined;
      if (mounted) { setMessage(safeMessage(error)); setPhase("ready"); }
    } finally { if (mounted) setBusy(false); }
  }

  return (
    <main data-route-path="/verify/zkpassport" class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <Title>ZKPassport staging verification</Title>
      <h1 class="text-2xl font-semibold">ZKPassport staging ceremony</h1>
      <p>This diagnostic flow requests only the server-authored age predicate and reports the exact submission size.</p>
      <Show when={phase() === "loading"}><p role="status">Loading secure configuration…</p></Show>
      <Show when={phase() === "unavailable"}><p role="alert">This staging verification flow is disabled.</p></Show>
      <Show when={phase() === "email"}>
        <TextField name="email" value={email()} onChange={setEmail}>
          <TextFieldLabel>Email</TextFieldLabel><TextFieldInput />
        </TextField>
        <Button type="button" disabled={busy()} onClick={() => void sendCode()}>Send login code</Button>
      </Show>
      <Show when={phase() === "code"}>
        <TextField name="code" value={code()} onChange={setCode}>
          <TextFieldLabel>Login code</TextFieldLabel><TextFieldInput />
        </TextField>
        <Button type="button" disabled={busy()} onClick={() => void authenticate()}>Sign in</Button>
      </Show>
      <Show when={phase() === "ready"}>
        <Button type="button" disabled={busy()} onClick={() => void startCeremony()}>Start age-18 proof</Button>
      </Show>
      <Show when={phase() === "ceremony"}>
        <p role="status">Scan this code with ZKPassport, or open it on this phone.</p>
        <Show when={qr()}>{source => <img src={source()} alt="ZKPassport ceremony QR code" width="320" height="320" />}</Show>
        <a href={ceremonyUrl()}>Open ZKPassport</a>
      </Show>
      <Show when={phase() === "complete" && completion() !== undefined}>
        <p role="status">Proof completed.</p>
        <p>Submission size: {completion()?.requestBodyBytes} bytes.</p>
      </Show>
      <Show when={message().length > 0}><p role="alert">{message()}</p></Show>
    </main>
  );
}
