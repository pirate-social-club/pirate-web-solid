import { Show, createSignal, onCleanup } from "solid-js";
import { getRequestEvent } from "@solidjs/web";

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
  joinVeryCommunity,
  resolveVeryCommunityAction,
  type VeryWebCeremony,
  type VeryWebCompletion,
  type VeryWebPresentation,
  type VeryCreationTarget,
} from "../../api/very.ts";

type Phase = "idle" | "starting" | "waiting" | "ready" | "polling" | "joining" | "joined" | "verified" | "error";

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
      case "join_failed": return "Palm verification succeeded, but joining the community failed. Retry the join.";
      case "provider_unavailable": return "Very is still processing the palm scan.";
      case "provider_rejected": return "Very rejected the verification. You can retry.";
      case "invalid_presentation": return "The server returned an invalid Very ceremony.";
      default: return "Very verification is unavailable right now.";
    }
  }
  return "Very verification failed safely. Please retry.";
}

function routeUrl(): URL | undefined {
  const event = getRequestEvent();
  if (event) return new URL(event.request.url);
  return typeof window === "undefined" ? undefined : new URL(window.location.href);
}

function initialCommunityId(): string {
  const params = routeUrl()?.searchParams;
  if (!params) return "";
  return params.get("community_id") ?? params.get("communityId") ?? "";
}

function positiveInteger(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d*$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function initialCreationTarget(): VeryCreationTarget | "invalid" | undefined {
  const params = routeUrl()?.searchParams;
  if (!params) return undefined;
  const creationKeys = [
    "intent_id",
    "creation_intent_id",
    "ceremony_intent_id",
    "provider_id",
    "requirement",
    "generation",
    "expected_revision",
  ] as const;
  if (!creationKeys.some((key) => params.has(key))) return undefined;
  if (params.has("intent_id")) return "invalid";

  const creationIntentId = params.get("creation_intent_id") ?? "";
  const ceremonyIntentId = params.get("ceremony_intent_id") ?? "";
  const providerId = params.get("provider_id");
  const requirement = params.get("requirement");
  const generation = positiveInteger(params.get("generation"));
  const expectedRevision = positiveInteger(params.get("expected_revision"));
  if (
    creationIntentId.length === 0 ||
    creationIntentId.trim() !== creationIntentId ||
    ceremonyIntentId.length === 0 ||
    ceremonyIntentId.trim() !== ceremonyIntentId ||
    providerId !== "very.web" ||
    requirement !== "human_identity" ||
    generation === undefined ||
    expectedRevision === undefined
  ) return "invalid";

  return {
    creationIntentId,
    ceremonyIntentId,
    providerId,
    requirement,
    generation,
    expectedRevision,
  };
}

function initialReturnTo(): string {
  const value = routeUrl()?.searchParams.get("return_to") ?? "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function mobileRuntime(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile|Tablet/iu.test(navigator.userAgent);
}

export default function VeryVerificationRoute(props: Readonly<{ loadWidget?: VeryWidgetLoader }> = {}) {
  const [communityId, setCommunityId] = createSignal(initialCommunityId());
  const parsedCreationTarget = initialCreationTarget();
  const creationTarget = parsedCreationTarget === "invalid" ? undefined : parsedCreationTarget;
  const invalidCreationTarget = parsedCreationTarget === "invalid";
  const returnTo = initialReturnTo();
  const [phase, setPhase] = createSignal<Phase>(invalidCreationTarget ? "error" : "idle");
  const [message, setMessage] = createSignal(
    invalidCreationTarget ? "This Community creation verification link is invalid. Return to the creation page and retry." : "",
  );
  const [qr, setQr] = createSignal("");
  const [presentation, setPresentation] = createSignal<VeryWebPresentation>();
  const [completion, setCompletion] = createSignal<VeryWebCompletion>();
  const [joinedCommunityId, setJoinedCommunityId] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let ceremony: VeryWebCeremony | undefined;
  let widget: VeryWidget | undefined;
  let widgetObserver: MutationObserver | undefined;
  let widgetSettled = false;
  let active = true;
  let operationEpoch = 0;
  let pollingEpoch: number | undefined;

  const operationTarget = () => creationTarget?.ceremonyIntentId ?? communityId().trim();

  function operationIsCurrent(epoch: number, target: string): boolean {
    return active && operationEpoch === epoch && operationTarget() === target;
  }

  async function joinResolvedCommunity(targetCommunityId: string, epoch: number) {
    if (!operationIsCurrent(epoch, targetCommunityId)) return;
    setPhase("joining");
    const joined = await joinVeryCommunity({ communityId: targetCommunityId });
    if (!operationIsCurrent(epoch, targetCommunityId)) return;
    setJoinedCommunityId(joined.communityId);
    setMessage("");
    setPhase("joined");
  }

  async function finishVerification(result: VeryWebCompletion, target: string, epoch: number) {
    if (!operationIsCurrent(epoch, target)) return;
    setCompletion(result);
    if (creationTarget !== undefined) {
      setMessage("");
      setPhase("verified");
      return;
    }
    await joinResolvedCommunity(target, epoch);
  }

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
    operationEpoch += 1;
    ceremony?.cancel();
    cleanupWidget();
  });

  async function completeWidget(
    currentCeremony: VeryWebCeremony,
    providerPayloadRef: string,
    targetCommunityId: string,
    epoch: number,
  ) {
    if (!operationIsCurrent(epoch, targetCommunityId) || widgetSettled || ceremony !== currentCeremony) return;
    // Settle before crossing the async boundary so duplicate provider callbacks
    // cannot issue a second completion request or race dismissal cleanup.
    widgetSettled = true;
    try {
      const result = await currentCeremony.completeWithWidget(providerPayloadRef);
      if (!operationIsCurrent(epoch, targetCommunityId) || ceremony !== currentCeremony) return;
      await finishVerification(result, targetCommunityId, epoch);
    } catch (error) {
      if (!operationIsCurrent(epoch, targetCommunityId) || ceremony !== currentCeremony) return;
      setMessage(safeMessage(error));
      setPhase("error");
    } finally {
      if (operationIsCurrent(epoch, targetCommunityId) && ceremony === currentCeremony) {
        cleanupWidget();
        setBusy(false);
      }
    }
  }

  function retainWidgetForRetry(currentCeremony: VeryWebCeremony, targetCommunityId: string, epoch: number) {
    if (!operationIsCurrent(epoch, targetCommunityId) || widgetSettled || ceremony !== currentCeremony) return;
    // @veryai/widget 1.0.22 renders its own retryable error state and its
    // Try Again action refreshes the bridge session with the same query.
    // Keep the server proof session and widget alive for that retry.
    setPhase("ready");
  }

  async function openDesktopWidget(
    currentCeremony: VeryWebCeremony,
    source: VeryWebPresentation,
    targetCommunityId: string,
    epoch: number,
  ) {
    widgetSettled = false;
    const { createVeryWidget } = await (props.loadWidget ?? loadVeryWidgetModule)();
    if (!operationIsCurrent(epoch, targetCommunityId) || ceremony !== currentCeremony || widgetSettled) return;
    const instance = createVeryWidget({
      appId: source.appId,
      context: source.context,
      typeId: source.typeId,
      query: source.query,
      verifyUrl: source.verifyUrl,
      onSuccess: (providerPayloadRef: string) => {
        void completeWidget(currentCeremony, providerPayloadRef, targetCommunityId, epoch);
      },
      onError: () => {
        retainWidgetForRetry(currentCeremony, targetCommunityId, epoch);
      },
      theme: "dark",
    });
    widget = instance;
    instance.open?.();
    setPhase("ready");
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      const observer = new MutationObserver(() => {
        if (
          !operationIsCurrent(epoch, targetCommunityId) ||
          widgetSettled ||
          widget !== instance ||
          document.querySelector(VERY_WIDGET_OVERLAY_SELECTOR)
        ) {
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
    const value = operationTarget();
    if (value === "") {
      setMessage("Enter the gated community ID.");
      setPhase("error");
      return;
    }
    const epoch = operationEpoch + 1;
    operationEpoch = epoch;
    ceremony?.cancel();
    ceremony = undefined;
    cleanupWidget();
    setBusy(true);
    setMessage("");
    setQr("");
    setCompletion(undefined);
    setJoinedCommunityId("");
    setPresentation(undefined);
    setPhase("starting");
    try {
      let created: VeryWebCeremony;
      if (creationTarget !== undefined) {
        created = await createVeryWebCeremony({ creation: creationTarget });
      } else {
        let action = await resolveVeryCommunityAction({ communityId: value });
        while (operationIsCurrent(epoch, value) && action.kind === "wait") {
          const retryAfterMs = action.retryAfterMs;
          setPhase("waiting");
          await new Promise<void>((resolve) => window.setTimeout(resolve, retryAfterMs));
          if (!operationIsCurrent(epoch, value)) return;
          action = await resolveVeryCommunityAction({ communityId: value });
        }
        if (!operationIsCurrent(epoch, value)) return;
        if (action.kind === "joined") {
          setJoinedCommunityId(value);
          setPhase("joined");
          return;
        }
        if (action.kind === "join") {
          await joinResolvedCommunity(value, epoch);
          return;
        }
        if (action.kind !== "verify") throw new VeryWebClientError("join_not_ready");
        created = await createVeryWebCeremony({ intentId: action.intentId });
      }
      if (!operationIsCurrent(epoch, value)) {
        created.cancel();
        return;
      }
      ceremony = created;
      if (created.initialCompletion !== undefined) {
        await finishVerification(created.initialCompletion, value, epoch);
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
        await openDesktopWidget(created, created.presentation, value, epoch);
      }
    } catch (error) {
      if (!operationIsCurrent(epoch, value)) return;
      ceremony?.cancel();
      ceremony = undefined;
      cleanupWidget();
      setMessage(safeMessage(error));
      setPhase("error");
    } finally {
      if (operationIsCurrent(epoch, value)) setBusy(false);
    }
  }

  async function pollUntilComplete() {
    if (pollingEpoch === operationEpoch || ceremony === undefined) return;
    const currentCeremony = ceremony;
    const epoch = operationEpoch;
    const targetCommunityId = operationTarget();
    pollingEpoch = epoch;
    setPhase("polling");
    setMessage("");
    try {
      while (operationIsCurrent(epoch, targetCommunityId) && ceremony === currentCeremony) {
        try {
          const result = await currentCeremony.pollBridge();
          if (!operationIsCurrent(epoch, targetCommunityId) || ceremony !== currentCeremony) return;
          await finishVerification(result, targetCommunityId, epoch);
          return;
        } catch (error) {
          if (!operationIsCurrent(epoch, targetCommunityId) || ceremony !== currentCeremony) return;
          if (!(error instanceof VeryWebClientError) || error.code !== "provider_unavailable") {
            throw error;
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, VERY_WEB_POLL_INTERVAL_MS));
        }
      }
    } catch (error) {
      if (!operationIsCurrent(epoch, targetCommunityId) || ceremony !== currentCeremony) return;
      setMessage(safeMessage(error));
      setPhase("error");
    } finally {
      if (pollingEpoch === epoch) pollingEpoch = undefined;
    }
  }

  function openOnPhone() {
    const current = presentation();
    if (current === undefined || typeof window === "undefined") return;
    void pollUntilComplete();
    window.location.href = current.mobileUri;
  }

  function reset() {
    operationEpoch += 1;
    ceremony?.cancel();
    ceremony = undefined;
    cleanupWidget();
    setQr("");
    setPresentation(undefined);
    setCompletion(undefined);
    setJoinedCommunityId("");
    setMessage("");
    setBusy(false);
    setPhase("idle");
  }

  return (
    <main data-route-path="/verify/very" class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <h1 class="text-2xl font-semibold">Very palm verification</h1>
      <p>Scan the QR code with the Very app on desktop, or open it directly on your phone.</p>

      <Show when={phase() === "idle" || phase() === "error"}>
        <Show when={!invalidCreationTarget}>
          <Show when={creationTarget === undefined}>
            <TextField name="community-id" value={communityId()} onChange={setCommunityId}>
              <TextFieldLabel>Gated community ID</TextFieldLabel>
              <TextFieldInput autocomplete="off" />
              <TextFieldDescription>
                Use the community ID from the gated-community join link. The server
                resolves the one-time verification intent for you.
              </TextFieldDescription>
            </TextField>
          </Show>
          <Button type="button" disabled={busy()} onClick={() => void startVery()}>
            {busy() ? "Starting…" : "Start palm verification"}
          </Button>
        </Show>
      </Show>

      <Show when={phase() === "starting"}>
        <p role="status">
          {creationTarget !== undefined ? "Starting palm verification…" : "Checking the gated-community join requirements…"}
        </p>
      </Show>

      <Show when={phase() === "waiting"}>
        <section class="flex flex-col gap-3">
          <p role="status">A prior Very ceremony is still pending. Waiting for it to complete or expire…</p>
          <Button type="button" onClick={reset}>Cancel</Button>
        </section>
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

      <Show when={phase() === "joining"}>
        <section class="flex flex-col gap-3">
          <p role="status">The server accepted the palm-scan evidence. Joining the community…</p>
          <Button type="button" onClick={reset}>Cancel</Button>
        </section>
      </Show>

      <Show when={phase() === "joined" && joinedCommunityId().length > 0}>
        <section aria-label="Community joined" role="status" class="flex flex-col gap-3">
          <h2 class="text-xl font-semibold">Community joined</h2>
          <p>Your Very proof was accepted and your membership is active.</p>
          <p class="break-all text-sm">Community: {joinedCommunityId()}</p>
          <Show when={completion() !== undefined}>
            <p class="break-all text-sm">Proof session: {completion()?.proofSessionId}</p>
          </Show>
          <Button type="button" onClick={reset}>Start another ceremony</Button>
        </section>
      </Show>

      <Show when={phase() === "verified"}>
        <section aria-label="Verification complete" role="status" class="flex flex-col gap-3">
          <h2 class="text-xl font-semibold">Verification complete</h2>
          <p>Your Very proof was accepted. Continue to finish the pending action.</p>
          <Show when={completion() !== undefined}>
            <p class="break-all text-sm">Proof session: {completion()?.proofSessionId}</p>
          </Show>
          <Button type="button" onClick={() => window.location.assign(returnTo)}>Continue</Button>
        </section>
      </Show>

      <Show when={message().length > 0}>
        <p role="alert">{message()}</p>
      </Show>
    </main>
  );
}
