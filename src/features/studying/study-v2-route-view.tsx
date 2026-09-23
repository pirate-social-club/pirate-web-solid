import type { verifyAdultViewing } from "../verification/age-verification.ts";
import { AgeAccessPrompt } from "../verification/age-access-prompt.tsx";
import { Title } from "@solidjs/meta";
import { isServer } from "@solidjs/web";
import { ApiClientError } from "@pirate/api-client";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import { onSessionRefreshed, refreshSession, resolveSession, sessionPersonasUnavailable, type ActivePersonaPublicProjection, type AuthenticatedSession, type SessionResolution } from "../../api/session";
import { Button, FormNote, Type } from "../../design-system";
import { preloadGlobalSignInAssets, prepareGlobalSignIn, requestGlobalSignIn, requestGlobalSignInCompletion } from "../auth/global-sign-in-host";
import { communityOperationPersonas, defaultOperationPersonaId, toOperationPersonas } from "../identity/community-persona-choice";
import {
  activityPreparationAdmissible,
  activityPreparationCandidates,
  activityPreparationMessage,
  createActivityPersonaPreparationApi,
  type ActivityPersonaPreparationApi,
} from "../identity/activity-persona-preparation";
import { OperationPersonaControl } from "../identity/operation-persona-control/operation-persona-control";
import {
  createStudyV2Api,
  StudyV2LocalError,
  type StudyAvailability,
  type StudyLearnerBand,
  type StudySession,
  type StudyV2Api,
} from "./study-v2-api";
import { createStudyV2RuntimeClient } from "./study-v2-runtime-client";
import { createStudyingBrowserRecorder } from "./studying-browser-recorder";
import {
  createStudySessionStartCoordinator,
  type StudySessionStartCoordinator,
  type StudySessionStartScope,
} from "./study-session-start-coordinator.ts";
import type { StudyingRecorder } from "./studying-route-model";
import {
  StudyAuthRequiredState,
  StudyRouteLoadFailureState,
  StudyRouteLoadingState,
} from "./studying-route-states";
import { StudyingRouteView } from "./studying-route-view";

type ReadyAvailability = Extract<StudyAvailability, { state: "ready" }>;
type RouteState =
  | { kind: "loading" }
  | { kind: "starting" }
  | { kind: "auth-required" }
  | { kind: "age-required" }
  | { kind: "failed"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "configure"; availability: ReadyAvailability; communityId: string; session: AuthenticatedSession }
  | {
      kind: "prepare";
      availability: ReadyAvailability;
      candidates: readonly ActivePersonaPublicProjection[];
      communityId: string;
      session: AuthenticatedSession;
    }
  | { kind: "lesson"; session: StudySession };

export interface StudyV2RouteViewProps {
  verifyAge?: typeof verifyAdultViewing;
  api?: StudyV2Api;
  preparationApi?: ActivityPersonaPreparationApi;
  navigate?: (href: string) => void;
  postId: string;
  routePath?: string;
  exitPath?: string;
  karaokePath?: string;
  recorder?: StudyingRecorder;
  resolveSession?: () => Promise<SessionResolution>;
  /** Test seam for the cross-tab start coordinator. */
  startCoordinator?: StudySessionStartCoordinator;
}

function availabilityMessage(availability: Exclude<StudyAvailability, { state: "ready" }>): string {
  if (availability.state === "processing") {
    return "This song's Study cards are still being prepared. Try again shortly.";
  }
  switch (availability.reason) {
    case "not_a_song": return "Study is available only for song posts.";
    case "lyrics_not_accepted": return "Study will be available after this song's lyrics are accepted.";
    case "learning_language_unsupported": return "The song's language is not supported for Study yet.";
    case "insufficient_exercises": return "This song does not have enough ready exercises for a Study session yet.";
    case "policy_blocked": return "Study is unavailable for this song under its current policy.";
  }
}

function safeFailure(error: unknown, fallback: string): string {
  if (error instanceof StudyV2LocalError) {
    return error.code === "age_locked"
      ? "Age verification is required before this song can be studied."
      : "Refresh the page, then try again.";
  }
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;
    if (status === 401 || status === 403) return "Sign in to start this Study session.";
    if (status === 409) return "That language and level do not have enough ready cards yet.";
  }
  return fallback;
}

function sessionKey(postId: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `study-session:${postId}:${random}`;
}

export function StudyV2RouteView(props: StudyV2RouteViewProps) {
  const api = props.api ?? createStudyV2Api();
  const preparation = props.preparationApi ?? createActivityPersonaPreparationApi();
  const recorder = props.recorder ?? createStudyingBrowserRecorder();
  const startCoordinator =
    props.startCoordinator ?? createStudySessionStartCoordinator({ api });
  const [state, setState] = createSignal<RouteState>({ kind: "loading" });
  const [personaId, setPersonaId] = createSignal("");
  const [preparePersonaId, setPreparePersonaId] = createSignal("");
  const [targetLanguage, setTargetLanguage] = createSignal("");
  const [learnerBand, setLearnerBand] = createSignal<StudyLearnerBand | "">("");
  const [starting, setStarting] = createSignal(false);
  const [preparing, setPreparing] = createSignal(false);
  const [walletConfirmationRequired, setWalletConfirmationRequired] = createSignal(false);
  const [walletConfirming, setWalletConfirming] = createSignal(false);
  const [message, setMessage] = createSignal("");
  let active = true;
  let loadStarted = false;
  let loadInFlight = false;
  let requestGeneration = 0;
  let prepareIdempotencyKey = sessionKey(`prepare:${props.postId}`);
  let lastStartScope: StudySessionStartScope | undefined;
  let walletConfirmationController: AbortController | undefined;

  const navigate = (href: string) => {
    if (props.navigate) props.navigate(href);
    else if (typeof window !== "undefined") window.location.assign(href);
  };

  const beginSession = async (input: {
    readonly availability: ReadyAvailability;
    readonly communityId: string;
    readonly learnerBand: StudyLearnerBand | null;
    readonly personaId: string;
    readonly session: AuthenticatedSession;
    readonly targetLanguage: string | null;
  }): Promise<void> => {
    setState({ kind: "starting" });
    setMessage("");
    const scope: StudySessionStartScope = {
      accountId: input.session.userId,
      communityId: input.communityId,
      learnerBand: input.learnerBand,
      personaId: input.personaId,
      postId: props.postId,
      targetLanguage: input.targetLanguage,
    };
    lastStartScope = scope;
    const result = await startCoordinator.start(scope);
    if (!active) return;
    if (result.status === "unavailable") {
      setMessage(result.message);
      setState({
        availability: input.availability,
        communityId: input.communityId,
        kind: "configure",
        session: input.session,
      });
      return;
    }
    try {
      const session = await api.getSession({
        communityId: input.communityId,
        sessionId: result.sessionId,
      });
      if (active) setState({ kind: "lesson", session });
    } catch {
      if (active) {
        setMessage("Study could not open the started session. Refresh the page and retry.");
        setState({
          availability: input.availability,
          communityId: input.communityId,
          kind: "configure",
          session: input.session,
        });
      }
    }
  };

  const load = async (preserveChoices = false) => {
    const generation = ++requestGeneration;
    // Set synchronously so a burst of refresh callbacks cannot each start a
    // request before the queued `loading` state is visible.
    loadInFlight = true;
    setState({ kind: "loading" });
    setMessage("");
    try {
      const resolved = await (props.resolveSession ?? resolveSession)();
      if (!active || generation !== requestGeneration) return;
      if (resolved === "anonymous") {
        setState({ kind: "auth-required" });
        return;
      }
      if (sessionPersonasUnavailable(resolved)) {
        setState({ kind: "failed", message: "We couldn't load your community profiles. Retry before starting Study." });
        return;
      }
      const loaded = await api.loadAvailability(props.postId);
      if (!active || generation !== requestGeneration) return;
      if (loaded.availability.state !== "ready") {
        setState({ kind: "unavailable", message: availabilityMessage(loaded.availability) });
        return;
      }
      const eligible = communityOperationPersonas(resolved.personas, loaded.communityId);
      if (eligible.length === 0) {
        // Study never requires joining this community. An account without an
        // exact-community persona prepares one explicitly through the API
        // instead of being sent through a join or proof flow.
        const candidates = activityPreparationCandidates(resolved.personas);
        prepareIdempotencyKey = sessionKey(`prepare:${loaded.communityId}`);
        setPreparePersonaId(defaultOperationPersonaId(candidates) ?? "");
        setWalletConfirmationRequired(false);
        setState({
          availability: loaded.availability,
          candidates,
          communityId: loaded.communityId,
          kind: "prepare",
          session: resolved,
        });
        return;
      }
      if (!preserveChoices || !eligible.some(persona => persona.personaId === personaId())) setPersonaId(defaultOperationPersonaId(eligible) ?? "");
      if (!preserveChoices) { setTargetLanguage(""); setLearnerBand(""); }
      const preparedPersona = defaultOperationPersonaId(eligible);
      if (eligible.length === 1 && preparedPersona !== undefined) {
        // A single prepared persona needs no preparation gate: open the first
        // exercise directly, source-only, reusing that persona. Capture still
        // waits for the participant's personal consent inside the lesson.
        await beginSession({
          availability: loaded.availability,
          communityId: loaded.communityId,
          learnerBand: null,
          personaId: preparedPersona,
          session: resolved,
          targetLanguage: null,
        });
        return;
      }
      // More than one eligible persona stays explicit: no silent identity choice.
      setState({
        availability: loaded.availability,
        communityId: loaded.communityId,
        kind: "configure",
        session: resolved,
      });
    } catch (error) {
      if (!active || generation !== requestGeneration) return;
      if (error instanceof StudyV2LocalError && error.code === "age_locked") { setState({ kind: "age-required" }); return; }
      const message = safeFailure(error, "We couldn't load Study for this song.");
      setState(message.startsWith("Sign in")
        ? { kind: "auth-required" }
        : { kind: "failed", message });
    } finally {
      if (generation === requestGeneration) loadInFlight = false;
    }
  };

  createEffect(
    () => true,
    () => {
      if (loadStarted || isServer) return;
      loadStarted = true;
      queueMicrotask(() => void load());
    },
  );
  // Sign-in refreshes the shared session store without reloading the document.
  // Resume only from the anonymous prompt: a configured session, an active
  // lesson and a failed persona read must not restart on an unrelated refresh.
  // The synchronous in-flight flag coalesces a burst of refreshes, and the
  // request generation rejects a slower earlier response that would otherwise
  // overwrite a newer state.
  if (!isServer) {
    onCleanup(onSessionRefreshed(() => {
      if (!active || loadInFlight || state().kind !== "auth-required") return;
      void load();
    }));
  }
  onCleanup(() => { active = false; walletConfirmationController?.abort(); });

  const start = async (configuration: Extract<RouteState, { kind: "configure" }>) => {
    const language = targetLanguage();
    const band = learnerBand();
    if (language !== "" && band === "") {
      setMessage("Choose a learner level for translated practice.");
      return;
    }
    if (!communityOperationPersonas(configuration.session.personas, configuration.communityId)
      .some(persona => persona.personaId === personaId())) {
      setMessage("Choose the persona this session presents in this community.");
      return;
    }
    const selectedBand: StudyLearnerBand | null = band === "" ? null : band;
    setStarting(true);
    setMessage("");
    try {
      await beginSession({
        availability: configuration.availability,
        communityId: configuration.communityId,
        learnerBand: language === "" ? null : selectedBand,
        personaId: personaId(),
        session: configuration.session,
        targetLanguage: language || null,
      });
    } finally {
      if (active) setStarting(false);
    }
  };

  const prepareIdentity = async (preparationState: Extract<RouteState, { kind: "prepare" }>) => {
    const candidates = preparationState.candidates;
    // One unbound candidate is an unambiguous bind; several require an
    // explicit selection; none mints a fresh pending_wallet identity.
    const single = defaultOperationPersonaId(candidates);
    const choice = candidates.length === 0
      ? { kind: "create_new" as const }
      : single !== undefined
        ? { kind: "existing" as const, personaId: single }
        : preparePersonaId() === ""
          ? undefined
          : { kind: "existing" as const, personaId: preparePersonaId() };
    if (choice === undefined) {
      setMessage("Choose the persona this community will present.");
      return;
    }
    setPreparing(true);
    setMessage("");
    setWalletConfirmationRequired(false);
    try {
      const result = await preparation.prepare({
        choice,
        communityId: preparationState.communityId,
        idempotencyKey: prepareIdempotencyKey,
      });
      if (!active) return;
      if (activityPreparationAdmissible(result)) {
        // The binding is now server-visible; drop the cached session read and
        // reload so the prepared persona is selectable and starts through the
        // ordinary session path.
        refreshSession();
        await load(true);
        return;
      }
      setWalletConfirmationRequired(true);
      setMessage("This identity needs its wallet confirmed before Study. Confirming asks for the wallet email code again and continues Study automatically afterwards.");
    } catch (error) {
      if (!active) return;
      setMessage(activityPreparationMessage(error));
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
        setState({ kind: "auth-required" });
      }
    } finally {
      if (active) setPreparing(false);
    }
  };

  /**
   * An actionable confirmation for a freshly minted pending_wallet persona:
   * the ordinary additional-persona activation runs on the next authenticated
   * session exchange, which prepares and confirms the pending wallet without
   * any join, then the route reloads into the prepared persona.
   */
  const confirmPendingWallet = async () => {
    if (walletConfirming()) return;
    setWalletConfirming(true);
    setMessage("");
    walletConfirmationController?.abort();
    const controller = new AbortController();
    walletConfirmationController = controller;
    const completion = requestGlobalSignInCompletion(controller.signal);
    const authenticated = await completion;
    if (walletConfirmationController === controller) walletConfirmationController = undefined;
    if (!active) return;
    if (!authenticated) {
      setMessage("Wallet confirmation was cancelled. Confirm again when you are ready.");
      setWalletConfirming(false);
      return;
    }
    refreshSession();
    setWalletConfirmationRequired(false);
    await load(true);
    if (active) setWalletConfirming(false);
  };

  const failureState = () => {
    const current = state();
    return current.kind === "failed" || current.kind === "unavailable" ? current : undefined;
  };
  const prepareState = () => {
    const current = state();
    return current.kind === "prepare" ? current : undefined;
  };
  const configurationState = () => {
    const current = state();
    return current.kind === "configure" ? current : undefined;
  };
  const lessonState = () => {
    const current = state();
    return current.kind === "lesson" ? current : undefined;
  };

  return (
    <main data-route-path={props.routePath ?? `/p/${props.postId}/study`} class="min-h-dvh bg-background text-foreground">
      <Title>Study · Pirate</Title>
      <Show
        when={state().kind !== "loading" && state().kind !== "starting"}
        fallback={<StudyRouteLoadingState label={state().kind === "starting" ? "Starting study" : "Loading study"} />}
      >
        <Show when={state().kind !== "auth-required"} fallback={(
          <StudyAuthRequiredState
            description="Study packs follow the song's community. Sign in to start a lesson."
            onConnect={requestGlobalSignIn}
            onConnectIntent={prepareGlobalSignIn}
            onConnectPreload={preloadGlobalSignInAssets}
            onExit={() => navigate(props.exitPath ?? "/")}
            title="Sign in to study"
          />
        )}>
          <Show when={state().kind === "age-required"}><AgeAccessPrompt verify={props.verifyAge} onVerified={async () => { await load(true); }} /></Show>
          <Show when={failureState() === undefined} fallback={(
            <StudyRouteLoadFailureState
              description={failureState()?.message ?? "We couldn't load Study for this song."}
              onGoHome={() => navigate(props.exitPath ?? "/")}
              onRetry={() => {
                void load();
              }}
              title="Study unavailable"
            />
          )}>
            <Show
              when={configurationState()}
              fallback={(
                <Show
                  when={prepareState()}
                  fallback={(
                    <Show when={lessonState()}>
                      {(lesson) => (
                        <StudyingRouteView
                          client={createStudyV2RuntimeClient({ api, initialSession: lesson().session })}
                          onExit={() => navigate(props.exitPath ?? "/")}
                          onKaraoke={() => navigate(props.karaokePath ?? `/p/${encodeURIComponent(props.postId)}/karaoke`)}
                          onStudyAgain={() => {
                            if (lastStartScope !== undefined) startCoordinator.forget(lastStartScope);
                            void load();
                          }}
                          postId={props.postId}
                          recorder={recorder}
                        />
                      )}
                    </Show>
                  )}
                >
                  {(preparationState) => {
                    const candidates = () => preparationState().candidates;
                    const needsChoice = () => defaultOperationPersonaId(candidates()) === undefined;
                    return (
                      <div class="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 py-8">
                        <header class="space-y-2">
                          <Type as="h1" variant="h1">Set up Study</Type>
                          <Type as="p" class="text-muted-foreground" variant="body">
                            Study does not require membership. Choose an existing persona to bind to this
                            community, or create a new activity identity. A newly created identity can start
                            only after its wallet is confirmed.
                          </Type>
                        </header>
                        <Show when={candidates().length > 0}>
                          <OperationPersonaControl
                            label="Continue as"
                            personas={toOperationPersonas(candidates())}
                            placeholder="Choose a persona"
                            selectedPersonaId={preparePersonaId()}
                            onSelect={(id) => {
                              setPreparePersonaId(id);
                              prepareIdempotencyKey = sessionKey(`prepare:${preparationState().communityId}`);
                            }}
                          />
                        </Show>
                        <p class="text-sm text-muted-foreground" data-persona-consequence-note>
                          Binding an existing persona to this community is one-time. Progress, streaks and
                          review history stay with your account either way.
                        </p>
                        <Show when={message()}>{(error) => <FormNote tone="destructive">{error()}</FormNote>}</Show>
                        <Show when={walletConfirmationRequired()}>
                          <Button
                            disabled={walletConfirming()}
                            loading={walletConfirming()}
                            onClick={() => void confirmPendingWallet()}
                          >
                            Confirm wallet and continue
                          </Button>
                        </Show>
                        <div class="mt-auto flex gap-3">
                          <Button class="flex-1" onClick={() => navigate(props.exitPath ?? "/")} variant="secondary">Exit</Button>
                          <Button
                            class="flex-1"
                            disabled={preparing() || (needsChoice() && candidates().length > 0 && preparePersonaId() === "")}
                            loading={preparing()}
                            onClick={() => void prepareIdentity(preparationState())}
                          >
                            Continue
                          </Button>
                        </div>
                      </div>
                    );
                  }}
                </Show>
              )}
            >
              {(configuration) => {
                const personas = () => toOperationPersonas(communityOperationPersonas(
                  configuration().session.personas, configuration().communityId,
                ));
                return (
                <div class="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 py-8">
                  <header class="space-y-2">
                    <Type as="h1" variant="h1">Start Study</Type>
                    <Type as="p" class="text-muted-foreground" variant="body">
                      Practice the original lyrics, or add a ready helper language and level.
                    </Type>
                  </header>
                  <OperationPersonaControl
                    label="Studying as"
                    personas={personas()}
                    placeholder="Choose a persona"
                    selectedPersonaId={personaId()}
                    onSelect={setPersonaId}
                  />
                  <p class="text-sm text-muted-foreground" data-persona-consequence-note>
                    Study progress, streaks, and review history stay with your account. This
                    persona is only how your session appears publicly in this community.
                  </p>
                  <label class="flex flex-col gap-2">
                    <Type as="span" variant="label">Helper language</Type>
                    <select
                      class="h-11 rounded-[var(--radius-lg)] border border-border bg-card px-3"
                      onChange={(event) => {
                        setTargetLanguage(event.currentTarget.value);
                        if (event.currentTarget.value === "") setLearnerBand("");
                      }}
                      value={targetLanguage()}
                    >
                      <option value="">Speaking practice only</option>
                      {configuration().availability.target_languages.map((language) => (
                        <option value={language}>{language}</option>
                      ))}
                    </select>
                  </label>
                  <Show when={targetLanguage() !== ""}>
                    <label class="flex flex-col gap-2">
                      <Type as="span" variant="label">Learner level</Type>
                      <select
                        class="h-11 rounded-[var(--radius-lg)] border border-border bg-card px-3"
                        onChange={(event) => {
                          const selected = configuration().availability.learner_bands
                            .find((band) => band === event.currentTarget.value);
                          setLearnerBand(selected ?? "");
                        }}
                        value={learnerBand()}
                      >
                        <option value="">Choose a level</option>
                        {configuration().availability.learner_bands.map((band) => (
                          <option value={band}>{band}</option>
                        ))}
                      </select>
                    </label>
                  </Show>
                  <Show when={message()}>{(error) => <FormNote tone="destructive">{error()}</FormNote>}</Show>
                  <div class="mt-auto flex gap-3">
                    <Button class="flex-1" onClick={() => navigate("/")} variant="secondary">Exit</Button>
                    <Button
                      class="flex-1"
                      disabled={starting() || personaId() === "" || (targetLanguage() !== "" && learnerBand() === "")}
                      loading={starting()}
                      onClick={() => void start(configuration())}
                    >
                      Start
                    </Button>
                  </div>
                </div>
                );
              }}
            </Show>
          </Show>
        </Show>
      </Show>
    </main>
  );
}
