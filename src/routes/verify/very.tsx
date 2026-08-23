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

type VeryWidget = Readonly<{
  open?: () => void;
  destroy?: () => void;
}>;

type VeryWidgetModule = typeof import("@veryai/widget");
let veryWidgetModulePromise: Promise<VeryWidgetModule> | undefined;
// Private DOM contract from the pinned @veryai/widget 1.0.22 build. Keep the
// package-contract test in very.test.tsx when upgrading the widget: it fails if
// the SDK stops creating this overlay and dismissal can no longer be observed.
const VERY_WIDGET_OVERLAY_SELECTOR = ".very-dialog-overlay";

export type VeryWidgetConfig = Readonly<{
  appId: string;
  context: string;
  typeId: string;
  query: string;
  verifyUrl?: string;
  onSuccess: (providerPayloadRef: string) => void;
  onError?: (error: string) => void;
  theme?: "default" | "light" | "dark";
}>;

export type VeryWidgetLoader = () => Promise<Readonly<{
  createVeryWidget: (config: VeryWidgetConfig) => VeryWidget;
}>>;

const loadVeryWidgetModule: VeryWidgetLoader = async () => {
  veryWidgetModulePromise ??= import("@veryai/widget");
  return await veryWidgetModulePromise;
};

function safeMessage(error: unknown): string {
  if (error instanceof VeryWebClientError) {
    switch (error.code) {
      case "csrf_required": return "Sign in again before starting verification.";
      case "ceremony_expired": return "This ceremony expired. Start a fresh one.";
      case "ceremony_cancelled": return "The ceremony was cancelled. Start a fresh one.";
      case "join_not_ready": return "That community is not currently ready for a Very verification.";
      case "provider_unavailable": return "Very is still processing the palm scan.";
      case "provider_rejected": return "Very rejected the verification. You can retry.";
      case "invalid_presentation": return "The server returned an invalid Very ceremony.";
      default: return "Very verification is unavailable right now.";
    }
  }
  return "Very verification failed safely. Please retry.";
}

function initialCommunityId(): string {
  if (typeof window === "undefined") return "";
  const params = new URL(window.location.href).searchParams;
  return params.get("community_id") ?? params.get("communityId") ?? "";
}

function mobileRuntime(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile|Tablet/iu.test(navigator.userAgent);
}

export default function VeryVerificationRoute(props: Readonly<{ loadWidget?: VeryWidgetLoader }> = {}) {
  const [communityId, setCommunityId] = createSignal(initialCommunityId());
  const [phase, setPhase] = createSignal<Phase>("idle");
  const [message, setMessage] = createSignal("");
  const [qr, setQr] = createSignal("");
  const [presentation, setPresentation] = createSignal<VeryWebPresentation>();
  const [completion, setCompletion] = createSignal<VeryWebCompletion>();
  const [busy, setBusy] = createSignal(false);
  let ceremony: VeryWebCeremony | undefined;
  let widget: VeryWidget | undefined;
  let widgetObserver: MutationObserver | undefined;
  let widgetSettled = false;
  let active = true;
  let polling = false;

  function cleanupWidget() {
    widgetObserver?.disconnect();
    widgetObserver = undefined;
    widgetSettled = true;
    const currentWidget = widget;
    widget = undefined;
    currentWidget?.destroy?.();
  }

  onCleanup(() => {
    active = false;
    ceremony?.cancel();
    cleanupWidget();
  });

  async function completeWidget(
    currentCeremony: VeryWebCeremony,
    providerPayloadRef: string,
  ) {
    if (!active || widgetSettled || ceremony !== currentCeremony) return;
    // Settle before crossing the async boundary so duplicate provider callbacks
    // cannot issue a second completion request or race dismissal cleanup.
    widgetSettled = true;
    try {
      const result = await currentCeremony.completeWithWidget(providerPayloadRef);
      if (!active || ceremony !== currentCeremony) return;
      setCompletion(result);
      setPhase("complete");
    } catch (error) {
      if (!active || ceremony !== currentCeremony) return;
      setMessage(safeMessage(error));
      setPhase("error");
    } finally {
      cleanupWidget();
      if (active && ceremony === currentCeremony) setBusy(false);
    }
  }

  function retainWidgetForRetry(currentCeremony: VeryWebCeremony) {
    if (!active || widgetSettled || ceremony !== currentCeremony) return;
    // @veryai/widget 1.0.22 renders its own retryable error state and its
    // Try Again action refreshes the bridge session with the same query.
    // Keep the server proof session and widget alive for that retry.
    setPhase("ready");
  }

  async function openDesktopWidget(currentCeremony: VeryWebCeremony, source: VeryWebPresentation) {
    widgetSettled = false;
    const { createVeryWidget } = await (props.loadWidget ?? loadVeryWidgetModule)();
    if (!active || ceremony !== currentCeremony || widgetSettled) return;
    const instance = createVeryWidget({
      appId: source.appId,
      context: source.context,
      typeId: source.typeId,
      query: source.query,
      verifyUrl: source.verifyUrl,
      onSuccess: (providerPayloadRef: string) => {
        void completeWidget(currentCeremony, providerPayloadRef);
      },
      onError: () => {
        retainWidgetForRetry(currentCeremony);
      },
      theme: "dark",
    });
    widget = instance;
    instance.open?.();
    setPhase("ready");
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      const observer = new MutationObserver(() => {
        if (widgetSettled || widget !== instance || document.querySelector(VERY_WIDGET_OVERLAY_SELECTOR)) {
          return;
        }
        // The widget has no dismissal callback. Overlay removal is the only
        // reliable signal for its close button/backdrop path.
        widgetSettled = true;
        currentCeremony.cancel();
        widget = undefined;
        observer.disconnect();
        widgetObserver = undefined;
        instance.destroy?.();
        setMessage("Very verification was dismissed. Start a fresh ceremony.");
        setPhase("error");
        setBusy(false);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      widgetObserver = observer;
    }
  }

  async function startVery() {
    const value = communityId().trim();
    if (value === "") {
      setMessage("Enter the gated community ID.");
      setPhase("error");
      return;
    }
    ceremony?.cancel();
    cleanupWidget();
    setBusy(true);
    setMessage("");
    setQr("");
    setCompletion(undefined);
    setPresentation(undefined);
    setPhase("starting");
    try {
      const created = await createVeryWebCeremony({ communityId: value });
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
      if (mobileRuntime()) {
        const { default: QRCode } = await import("qrcode");
        setQr(await QRCode.toDataURL(created.presentation.mobileUri, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 320,
        }));
        setPhase("ready");
      } else {
        await openDesktopWidget(created, created.presentation);
      }
    } catch (error) {
      if (!active) return;
      ceremony?.cancel();
      ceremony = undefined;
      cleanupWidget();
      setMessage(safeMessage(error));
      setPhase("error");
    } finally {
      if (active) setBusy(false);
    }
  }

  async function pollUntilComplete() {
    if (polling || ceremony === undefined) return;
    const currentCeremony = ceremony;
    polling = true;
    setPhase("polling");
    setMessage("");
    try {
      while (active && ceremony === currentCeremony) {
        try {
          const result = await currentCeremony.pollBridge();
          if (!active || ceremony !== currentCeremony) return;
          setCompletion(result);
          setPhase("complete");
          return;
        } catch (error) {
          if (!active || ceremony !== currentCeremony) return;
          if (!(error instanceof VeryWebClientError) || error.code !== "provider_unavailable") {
            throw error;
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, VERY_WEB_POLL_INTERVAL_MS));
        }
      }
    } catch (error) {
      if (!active || ceremony !== currentCeremony) return;
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
    cleanupWidget();
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
        <TextField name="community-id" value={communityId()} onChange={setCommunityId}>
          <TextFieldLabel>Gated community ID</TextFieldLabel>
          <TextFieldInput autocomplete="off" />
          <TextFieldDescription>
            Use the community ID from the gated-community join link. The server
            resolves the one-time verification intent for you.
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
              : "The Very verification widget is open. Complete the palm scan in the widget."}
          </p>
          <Show when={mobileRuntime() && qr()}>
            {(source) => <img src={source()} alt="Very palm verification QR code" width="320" height="320" />}
          </Show>
          <div class="flex flex-wrap gap-3">
            <Show when={mobileRuntime()}>
              <Button type="button" onClick={openOnPhone}>Open Very app</Button>
              <Button type="button" onClick={() => void pollUntilComplete()}>
                I scanned the QR code
              </Button>
            </Show>
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
