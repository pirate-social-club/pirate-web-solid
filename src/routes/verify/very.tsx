import { Show, createSignal, onCleanup } from "solid-js";

import {
  Button,
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
} from "../../design-system";
import {
  VERY_WEB_POLL_INTERVAL_MS,
  VeryWebClientError,
  createVeryWebCeremony,
  type VeryWebCeremony,
  type VeryWebCompletion,
  type VeryWebPresentation,
} from "../../api/very.ts";

type Phase = "idle" | "starting" | "ready" | "polling" | "complete" | "error";

function safeMessage(error: unknown): string {
  if (error instanceof VeryWebClientError) {
    switch (error.code) {
      case "csrf_required": return "Sign in again before starting verification.";
      case "ceremony_expired": return "This ceremony expired. Start a fresh one.";
      case "ceremony_cancelled": return "The ceremony was cancelled. Start a fresh one.";
      case "provider_unavailable": return "Very is still processing the palm scan.";
      case "provider_rejected": return "Very rejected the verification. You can retry.";
      case "invalid_presentation": return "The server returned an invalid Very ceremony.";
      default: return "Very verification is unavailable right now.";
    }
  }
  return "Very verification failed safely. Please retry.";
}

function initialIntentId(): string {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get("intent_id") ?? "";
}

function mobileRuntime(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile|Tablet/iu.test(navigator.userAgent);
}

export default function VeryVerificationRoute() {
  const [intentId, setIntentId] = createSignal(initialIntentId());
  const [phase, setPhase] = createSignal<Phase>("idle");
  const [message, setMessage] = createSignal("");
  const [qr, setQr] = createSignal("");
  const [presentation, setPresentation] = createSignal<VeryWebPresentation>();
  const [completion, setCompletion] = createSignal<VeryWebCompletion>();
  const [busy, setBusy] = createSignal(false);
  let ceremony: VeryWebCeremony | undefined;
  let active = true;
  let polling = false;

  onCleanup(() => {
    active = false;
    ceremony?.cancel();
  });

  async function startVery() {
    const value = intentId().trim();
    if (value === "") {
      setMessage("Enter the server-issued community join intent ID.");
      setPhase("error");
      return;
    }
    ceremony?.cancel();
    setBusy(true);
    setMessage("");
    setQr("");
    setCompletion(undefined);
    setPresentation(undefined);
    setPhase("starting");
    try {
      const created = await createVeryWebCeremony({ intentId: value });
      if (!active) {
        created.cancel();
        return;
      }
      ceremony = created;
      if (created.initialCompletion !== undefined) {
        setCompletion(created.initialCompletion);
        setPhase("complete");
        return;
      }
      if (created.presentation === undefined) throw new VeryWebClientError("invalid_presentation");
      setPresentation(created.presentation);
      const { default: QRCode } = await import("qrcode");
      setQr(await QRCode.toDataURL(created.presentation.mobileUri, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 320,
      }));
      setPhase("ready");
    } catch (error) {
      if (!active) return;
      setMessage(safeMessage(error));
      setPhase("error");
    } finally {
      if (active) setBusy(false);
    }
  }

  async function pollUntilComplete() {
    if (polling || ceremony === undefined) return;
    polling = true;
    setPhase("polling");
    setMessage("");
    try {
      while (active && ceremony !== undefined) {
        try {
          const result = await ceremony.pollBridge();
          if (!active) return;
          setCompletion(result);
          setPhase("complete");
          return;
        } catch (error) {
          if (!(error instanceof VeryWebClientError) || error.code !== "provider_unavailable") {
            throw error;
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, VERY_WEB_POLL_INTERVAL_MS));
        }
      }
    } catch (error) {
      if (!active) return;
      setMessage(safeMessage(error));
      setPhase("error");
    } finally {
      polling = false;
    }
  }

  function openOnPhone() {
    const current = presentation();
    if (current === undefined || typeof window === "undefined") return;
    void pollUntilComplete();
    window.location.href = current.mobileUri;
  }

  function reset() {
    ceremony?.cancel();
    ceremony = undefined;
    setQr("");
    setPresentation(undefined);
    setCompletion(undefined);
    setMessage("");
    setPhase("idle");
  }

  return (
    <main data-route-path="/verify/very" class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <h1 class="text-2xl font-semibold">Very palm verification</h1>
      <p>Scan the QR code with the Very app on desktop, or open it directly on your phone.</p>

      <Show when={phase() === "idle" || phase() === "error"}>
        <TextField name="intent-id" value={intentId()} onChange={setIntentId}>
          <TextFieldLabel>Community join intent ID</TextFieldLabel>
          <TextFieldInput autocomplete="off" />
          <TextFieldDescription>
            Use the opaque intent ID supplied by the gated-community join flow.
          </TextFieldDescription>
        </TextField>
        <Button type="button" disabled={busy()} onClick={() => void startVery()}>
          {busy() ? "Starting…" : "Start palm verification"}
        </Button>
      </Show>

      <Show when={phase() === "starting"}>
        <p role="status">Preparing a server-bound Very ceremony…</p>
      </Show>

      <Show when={phase() === "ready" && presentation() !== undefined}>
        <section aria-label="Very ceremony" class="flex flex-col gap-4">
          <p role="status">
            {mobileRuntime()
              ? "Open the Very app on this phone to complete the palm scan."
              : "Scan this QR code with the Very app to complete the palm scan."}
          </p>
          <Show when={qr()}>
            {(source) => <img src={source()} alt="Very palm verification QR code" width="320" height="320" />}
          </Show>
          <div class="flex flex-wrap gap-3">
            <Show when={mobileRuntime()}>
              <Button type="button" onClick={openOnPhone}>Open Very app</Button>
            </Show>
            <Button type="button" onClick={() => void pollUntilComplete()}>
              I scanned the QR code
            </Button>
            <Button type="button" onClick={reset}>Cancel</Button>
          </div>
        </section>
      </Show>

      <Show when={phase() === "polling"}>
        <p role="status">Waiting for the server to receive the palm-scan result…</p>
      </Show>

      <Show when={phase() === "complete" && completion() !== undefined}>
        <section aria-label="Very verification complete" role="status" class="flex flex-col gap-3">
          <h2 class="text-xl font-semibold">Verification complete</h2>
          <p>{completion()?.replayed ? "This was an already-completed ceremony." : "The server accepted the palm-scan evidence."}</p>
          <p class="break-all text-sm">Proof session: {completion()?.proofSessionId}</p>
          <Button type="button" onClick={reset}>Start another ceremony</Button>
        </section>
      </Show>

      <Show when={message().length > 0}>
        <p role="alert">{message()}</p>
      </Show>
    </main>
  );
}
