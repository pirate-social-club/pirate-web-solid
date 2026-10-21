import { Show, createSignal, onCleanup, onSettled } from "solid-js";
import { getRequestEvent } from "@solidjs/web";
import { createRewardClaimData } from "../../api/reward-claim";
import { createWalletSponsoredSendData } from "../../api/wallet-sponsored-send.ts";
import { validWalletSendIdentifier } from "../../features/wallet/wallet-send-continuation.ts";
import { safeReturnPath } from "../../features/auth/sign-in-return";
import { resolveSession, sessionPersonasUnavailable, refreshSession } from "../../api/session";
import { toCommunityPersonaChoiceWire } from "../../features/identity/community-persona-choice";
import { createCommunityProfileAttempt } from "../../features/identity/community-profile-attempt.ts";
import { rememberJoinedNameContinuation } from "../../features/identity/community-join-continuation.ts";

import { Button, Type } from "../../design-system";
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

const INCOMPLETE_LINK_MESSAGE = "This link is incomplete. Go back and try again.";

function safeMessage(error: unknown): string {
  if (error instanceof VeryWebClientError) {
    switch (error.code) {
      case "csrf_required": return "Sign in again, then try again.";
      case "ceremony_expired": return "That scan expired. Try again.";
      case "ceremony_cancelled": return "Scan cancelled. Try again.";
      case "join_not_ready": return "This community can't be joined right now.";
      case "profiles_unavailable": return "Your profiles didn't load. Try again.";
      case "join_failed": return "Your palm scan worked, but joining didn't. Try again.";
      case "provider_unavailable": return "Very is still checking your scan.";
      case "provider_rejected": return "Very didn't accept the scan. Try again.";
      case "invalid_presentation": return "Very couldn't start. Try again.";
      default: return "Palm scan isn't available right now.";
    }
  }
  return "Something went wrong. Try again.";
}

function routeUrl(): URL | undefined {
  const event = getRequestEvent();
  if (event) return new URL(event.request.url);
  return typeof window === "undefined" ? undefined : new URL(window.location.href);
}

function initialCommunityId(url: URL | undefined): string {
  const params = url?.searchParams;
  if (!params) return "";
  return params.get("community_id") ?? params.get("communityId") ?? "";
}

function positiveInteger(value: string | null): number | undefined {
  if (value === null || !/^[1-9]\d*$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function initialCreationTarget(url: URL | undefined): VeryCreationTarget | "invalid" | undefined {
  const params = url?.searchParams;
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

/** Spec 015 §5.2a: a reward winner verifies to claim held winnings. */
function initialRewardClaim(url: URL | undefined): boolean {
  return url?.searchParams.get("purpose") === "reward_claim";
}

function initialReturnTo(url: URL | undefined): string {
  if (!url) return "/";
  return safeReturnPath(url.searchParams.get("return_to"), url.origin) ?? "/";
}

function mobileRuntime(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile|Tablet/iu.test(navigator.userAgent);
}

export type VeryVerificationRouteProps = Readonly<{
  loadWidget?: VeryWidgetLoader;
  resolveSession?: typeof resolveSession;
  refreshSession?: typeof refreshSession;
  createCeremony?: typeof createVeryWebCeremony;
  resolveCommunityAction?: typeof resolveVeryCommunityAction;
  joinCommunity?: typeof joinVeryCommunity;
  prepareProfile?: ReturnType<typeof createCommunityProfileAttempt>;
  issueRewardClaimIntent?: () => Promise<string>;
  issueWalletSendIntent?: (personaId: string) => Promise<string>;
  /** The route URL; defaults to the request or window location. */
  url?: URL;
  /** Phone presentation; defaults to the user agent. */
  mobile?: boolean;
  /** Leaves the page; defaults to a full navigation. */
  navigate?: (path: string) => void;
  /** Opens the Very app link; defaults to assigning the location. */
  openApp?: (uri: string) => void;
}>;
// A named function with a separate default export: Storybook's transform
// rejects `export default function` with JSX under the pinned Solid plugin.
export function VeryVerificationRoute(props: VeryVerificationRouteProps = {}) {
  const prepareProfile = props.prepareProfile ?? createCommunityProfileAttempt();
  let profileRequest: AbortController | undefined;
  const url = props.url ?? routeUrl();
  const communityId = initialCommunityId(url);
  const parsedCreationTarget = initialCreationTarget(url);
  const creationTarget = parsedCreationTarget === "invalid" ? undefined : parsedCreationTarget;
  const invalidCreationTarget = parsedCreationTarget === "invalid";
  const rewardClaim = !invalidCreationTarget && creationTarget === undefined && initialRewardClaim(url);
  const sendPurpose = url?.searchParams.get("purpose") === "wallet_send";
  const sendPersona = sendPurpose ? url?.searchParams.get("persona_id") ?? "" : "";
  const walletSend = !invalidCreationTarget && creationTarget === undefined && sendPurpose;
  const invalidSend = walletSend && !validWalletSendIdentifier(sendPersona);
  const returnTo = initialReturnTo(url);
  const mobile = () => props.mobile ?? mobileRuntime();
  const navigate = (path: string) => {
    if (props.navigate) props.navigate(path);
    else window.location.assign(path);
  };
  const openApp = (uri: string) => {
    if (props.openApp) props.openApp(uri);
    else window.location.href = uri;
  };

  const operationTarget = () =>
    creationTarget?.ceremonyIntentId ?? (walletSend ? `wallet_send:${sendPersona}` : rewardClaim ? "reward_claim" : communityId.trim());
  // Every caller passes its target, so a link without one cannot be repaired
  // here; it says so instead of asking for an identifier.
  const linkBroken = invalidCreationTarget || invalidSend || operationTarget() === "";
  const title = creationTarget !== undefined
    ? "Create your community"
    : walletSend ? "Verify to send" : rewardClaim ? "Claim your winnings" : "Join this community";

  const [phase, setPhase] = createSignal<Phase>(linkBroken ? "error" : "starting");
  const [message, setMessage] = createSignal(linkBroken ? INCOMPLETE_LINK_MESSAGE : "");
  const [presentation, setPresentation] = createSignal<VeryWebPresentation>();
  const [busy, setBusy] = createSignal(false);
  let ceremony: VeryWebCeremony | undefined;
  let widget: VeryWidget | undefined;
  let widgetObserver: MutationObserver | undefined;
  let widgetSettled = false;
  let active = true;
  let operationEpoch = 0;
  let pollingEpoch: number | undefined;

  function operationIsCurrent(epoch: number, target: string): boolean {
    return active && operationEpoch === epoch && operationTarget() === target;
  }

  function finish(next: "joined" | "verified") {
    setMessage("");
    setPhase(next);
    navigate(returnTo);
  }

  async function joinResolvedCommunity(targetCommunityId: string, epoch: number) {
    if (!operationIsCurrent(epoch, targetCommunityId)) return;
    setPhase("joining");
    const session = await (props.resolveSession ?? resolveSession)();
    if (!operationIsCurrent(epoch, targetCommunityId)) return;
    if (session === "anonymous") throw new VeryWebClientError("join_failed");
    if (sessionPersonasUnavailable(session)) throw new VeryWebClientError("profiles_unavailable");
    await commitPersonaJoin(targetCommunityId, epoch);
  }

  async function commitPersonaJoin(targetCommunityId: string, epoch: number) {
    if (!operationIsCurrent(epoch, targetCommunityId)) return;
    setPhase("joining");
    const session = await (props.resolveSession ?? resolveSession)();
    if (!operationIsCurrent(epoch, targetCommunityId) || session === "anonymous" || sessionPersonasUnavailable(session)) throw new VeryWebClientError("profiles_unavailable");
    profileRequest?.abort(); profileRequest = new AbortController();
    const profile = await prepareProfile({ session, communityId: targetCommunityId, signal: profileRequest.signal });
    if (!operationIsCurrent(epoch, targetCommunityId)) return;
    const current = await (props.resolveSession ?? resolveSession)();
    if (current === "anonymous" || current.userId !== session.userId || !operationIsCurrent(epoch, targetCommunityId)) throw new VeryWebClientError("join_failed");
    await (props.joinCommunity ?? joinVeryCommunity)({ communityId: targetCommunityId, persona: toCommunityPersonaChoiceWire({ kind: "existing", personaId: profile.personaId }) });
    if (!operationIsCurrent(epoch, targetCommunityId)) return;
    (props.refreshSession ?? refreshSession)();
    try { rememberJoinedNameContinuation(session.userId, targetCommunityId); } catch { /* Membership is committed even if the return hint cannot be retained. */ }
    finish("joined");
  }

  async function finishVerification(_result: VeryWebCompletion, target: string, epoch: number) {
    if (!operationIsCurrent(epoch, target)) return;
    if (creationTarget !== undefined || rewardClaim || walletSend) {
      finish("verified");
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
    profileRequest?.abort();
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
        setMessage("Scan cancelled. Try again.");
        setPhase("error");
        setBusy(false);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      widgetObserver = observer;
    }
  }

  async function startVery() {
    const value = operationTarget();
    if (linkBroken) {
      setMessage(INCOMPLETE_LINK_MESSAGE);
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
    setPresentation(undefined);
    setPhase("starting");
    try {
      let created: VeryWebCeremony;
      if (creationTarget !== undefined) {
        created = await (props.createCeremony ?? createVeryWebCeremony)({ creation: creationTarget });
      } else if (walletSend) {
        const intentId = await (props.issueWalletSendIntent ?? ((personaId) => createWalletSponsoredSendData().issueVerificationIntent(personaId)))(sendPersona);
        if (!operationIsCurrent(epoch, value)) return;
        created = await (props.createCeremony ?? createVeryWebCeremony)({ intentId });
      } else if (rewardClaim) {
        const intentId = await (props.issueRewardClaimIntent ?? (() => createRewardClaimData().issueVerificationIntent()))();
        if (!operationIsCurrent(epoch, value)) return;
        created = await (props.createCeremony ?? createVeryWebCeremony)({ intentId });
      } else {
        let action = await (props.resolveCommunityAction ?? resolveVeryCommunityAction)({ communityId: value });
        while (operationIsCurrent(epoch, value) && action.kind === "wait") {
          const retryAfterMs = action.retryAfterMs;
          setPhase("waiting");
          await new Promise<void>((resolve) => window.setTimeout(resolve, retryAfterMs));
          if (!operationIsCurrent(epoch, value)) return;
          action = await (props.resolveCommunityAction ?? resolveVeryCommunityAction)({ communityId: value });
        }
        if (!operationIsCurrent(epoch, value)) return;
        if (action.kind === "joined") {
          finish("joined");
          return;
        }
        if (action.kind === "join") {
          await joinResolvedCommunity(value, epoch);
          return;
        }
        if (action.kind !== "verify") throw new VeryWebClientError("join_not_ready");
        created = await (props.createCeremony ?? createVeryWebCeremony)({ intentId: action.intentId });
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
      if (mobile()) {
        // The owner's ruling: the phone goes straight to the Very app. A
        // browser may refuse an app link without a tap, so "Open Very" stays.
        setPhase("ready");
        openOnPhone(created.presentation);
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

  // Takes the presentation directly: a signal written in the same tick still
  // reads its previous value in Solid 2.
  function openOnPhone(current: VeryWebPresentation | undefined = presentation()) {
    if (current === undefined) return;
    void pollUntilComplete();
    openApp(current.mobileUri);
  }

  function reset() {
    operationEpoch += 1;
    profileRequest?.abort();
    ceremony?.cancel();
    ceremony = undefined;
    cleanupWidget();
    setPresentation(undefined);
    setMessage("");
    setBusy(false);
    setPhase("idle");
  }

  // The owner's ruling: the page starts the scan itself. A manual start is
  // only the retry after a failed, dismissed or cancelled attempt.
  // Start after the settle callback returns: Solid 2 rejects signal writes
  // made synchronously inside effect callbacks.
  onSettled(() => {
    if (phase() === "starting") void Promise.resolve().then(startVery);
  });

  const scanning = () => (phase() === "ready" || phase() === "polling") && presentation() !== undefined;
  const cancellable = () => phase() === "waiting" || phase() === "joining" || scanning();
  const settled = () => phase() === "idle" || phase() === "error";

  return (
    <main data-route-path="/verify/very" class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <header class="space-y-2">
        <Type as="h1" variant="h1">{title}</Type>
        <Type as="p" variant="caption">Palm scan with the Very app.</Type>
      </header>

      <Show when={phase() === "starting" || phase() === "joining" || phase() === "waiting"}>
        <Type as="p" role="status" variant="body">
          {phase() === "joining" ? "Joining…" : phase() === "waiting" ? "Finishing your last scan…" : "Starting…"}
        </Type>
      </Show>

      <Show when={scanning()}>
        <Type as="p" role="status" variant="body">
          {mobile() ? "Waiting for Very. Come back here when you're done." : "Scan your palm in the Very window."}
        </Type>
      </Show>

      <Show when={phase() === "joined" || phase() === "verified"}>
        <Type as="p" role="status" variant="body">{phase() === "joined" ? "You joined." : "Palm scan done."}</Type>
      </Show>

      <Show when={message().length > 0}>
        <Type as="p" role="alert" variant="body">{message()}</Type>
      </Show>

      <div class="flex flex-wrap gap-3">
        <Show when={scanning() && mobile()}>
          <Button type="button" onClick={() => openOnPhone()}>Open Very</Button>
        </Show>
        <Show when={settled() && !linkBroken}>
          <Button type="button" disabled={busy()} onClick={() => void startVery()}>
            {phase() === "error" ? "Try again" : "Scan your palm"}
          </Button>
        </Show>
        <Show when={phase() === "joined" || phase() === "verified"}>
          <Button type="button" onClick={() => navigate(returnTo)}>Continue</Button>
        </Show>
        <Show when={cancellable()}>
          <Button type="button" variant="secondary" onClick={reset}>Cancel</Button>
        </Show>
        <Show when={settled()}>
          <Button type="button" variant="secondary" onClick={() => navigate(returnTo)}>Back</Button>
        </Show>
      </div>
    </main>
  );
}

export default VeryVerificationRoute;
