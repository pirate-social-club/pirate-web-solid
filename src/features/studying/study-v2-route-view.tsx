import { MegapotShareStatus } from "../rewards/megapot-participant.tsx";
import { SharedSongParticipationStatus } from "../rewards/shared-song-participation.tsx";
import { ActivityCompletion } from "../activity/activity-completion.tsx";
import { ActivityLeaderboard } from "../activity/activity-leaderboard.tsx";
import type { verifyAdultViewing } from "../verification/age-verification.ts";
import { AgeAccessPrompt } from "../verification/age-access-prompt.tsx";
import { Title } from "@solidjs/meta";
import { isServer } from "@solidjs/web";
import { ApiClientError } from "@pirate/api-client";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import { onSessionRefreshed, resolveSession, sessionPersonasUnavailable, type ActivePersonaPublicProjection, type AuthenticatedSession, type SessionResolution } from "../../api/session";
import { Button, FormNote, Type } from "../../design-system";
import { preloadGlobalSignInAssets, prepareGlobalSignIn, requestGlobalSignIn } from "../auth/global-sign-in-host";
import { communityOperationPersonas, defaultOperationPersonaId, toOperationPersonas } from "../identity/community-persona-choice";
import {
  activityPreparationCandidates,
  activityPreparationMessage,
  createActivityPersonaPreparationApi,
  type ActivityPersonaPreparationApi,
} from "../identity/activity-persona-preparation";
import { createCommunityProfileAttempt } from "../identity/community-profile-attempt.ts";
import { CommunityProfilePreparationError, createCommunityProfilePreparation } from "../identity/community-profile-preparation.ts";
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
  | { kind: "lesson"; session: StudySession; accountId: string };

export interface StudyV2RouteViewProps {
  verifyAge?: typeof verifyAdultViewing;
  api?: StudyV2Api;
  preparationApi?: ActivityPersonaPreparationApi;
  prepareProfile?: ReturnType<typeof createCommunityProfileAttempt>;
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
    case "stems_missing": return "This song's audio is still being prepared for Study. Try again later.";
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

export function StudyV2RouteView(props: StudyV2RouteViewProps) {
  const api = props.api ?? createStudyV2Api();
  const prepareProfile = props.prepareProfile ?? createCommunityProfileAttempt(createCommunityProfilePreparation({
    api: props.preparationApi ?? createActivityPersonaPreparationApi(),
    resolve: props.resolveSession,
  }), { resolve: props.resolveSession });
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
  const [message, setMessage] = createSignal("");
  let active = true;
  let loadStarted = false;
  let loadInFlight = false;
  let requestGeneration = 0;
  let lastStartScope: StudySessionStartScope | undefined;
  let preparationController: AbortController | undefined;

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
    const generation = requestGeneration;
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
    if (!active || generation !== requestGeneration) return;
    if (result.status === "unavailable") {
      setState({ kind: "unavailable", message: result.message });
      return;
    }
    try {
      const session = await api.getSession({
        communityId: input.communityId,
        sessionId: result.sessionId,
      });
      if (active && generation === requestGeneration) setState({ kind: "lesson", session, accountId: input.session.userId });
    } catch {
      if (active && generation === requestGeneration) {
        setState({ kind: "failed", message: "Study could not open the started session. Retry once the connection is stable." });
      }
    }
  };

  const load = async (preserveChoices = false) => {
    const generation = ++requestGeneration;
    preparationController?.abort();
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
        const candidates = activityPreparationCandidates(resolved.personas);
        setPreparePersonaId(defaultOperationPersonaId(candidates) ?? "");
        const preparationState: Extract<RouteState, { kind: "prepare" }> = {
          availability: loaded.availability,
          candidates,
          communityId: loaded.communityId,
          kind: "prepare",
          session: resolved,
        };
        // Opening Study is the activity-entry action. Only an actual choice
        // between profiles needs another screen; preparation retains its exact
        // command keys through reloads and uncertain responses.
        if (candidates.length <= 1) await prepareIdentity(preparationState);
        else setState(preparationState);
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
  onCleanup(() => { active = false; preparationController?.abort(); });

  const start = async (configuration: Extract<RouteState, { kind: "configure" }>) => {
    const language = targetLanguage();
    const band = learnerBand();
    if (language !== "" && band === "") {
      setMessage("Choose a learner level for translated practice.");
      return;
    }
    if (!communityOperationPersonas(configuration.session.personas, configuration.communityId)
      .some(persona => persona.personaId === personaId())) {
      setMessage("Choose your profile for this community.");
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
    const choice = candidates.length > 1 && preparePersonaId() !== ""
      ? { kind: "existing" as const, personaId: preparePersonaId() }
      : undefined;
    if (candidates.length > 1 && choice === undefined) {
      setMessage("Choose your profile for this community.");
      return;
    }
    if (preparing()) return;
    setPreparing(true);
    setState({ kind: "starting" });
    setMessage("");
    const controller = new AbortController();
    preparationController = controller;
    try {
      const profile = await prepareProfile({
        session: preparationState.session,
        communityId: preparationState.communityId,
        ...(choice === undefined ? {} : { choice }),
        signal: controller.signal,
      });
      if (!active || controller.signal.aborted) return;
      await beginSession({
        availability: preparationState.availability,
        communityId: preparationState.communityId,
        learnerBand: null,
        personaId: profile.personaId,
        session: preparationState.session,
        targetLanguage: null,
      });
    } catch (error) {
      if (!active || controller.signal.aborted) return;
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
        setState({ kind: "auth-required" });
      } else {
        setState({ kind: "failed", message: error instanceof CommunityProfilePreparationError
          ? error.reason === "activation_required" ? "Sign in to continue Study."
            : "We couldn't confirm your profile. Retry to continue Study."
          : activityPreparationMessage(error) });
      }
    } finally {
      if (preparationController === controller) preparationController = undefined;
      if (active) setPreparing(false);
    }
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
      <Title>Study</Title>
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
                          rewardSlot={<div class="space-y-4"><ActivityCompletion communityId={lesson().session.community_id} postId={props.postId} personaId={lesson().session.persona_id} ownerAccountId={lesson().accountId} dependencies={{ resolveSession: props.resolveSession }} attempt={{ kind: "study", session_id: lesson().session.session_id }} /><MegapotShareStatus communityId={lesson().session.community_id} postId={props.postId} /><SharedSongParticipationStatus communityId={lesson().session.community_id} postId={props.postId} /><ActivityLeaderboard communityId={lesson().session.community_id} postId={props.postId} /></div>}
                          onExit={() => navigate(props.exitPath ?? "/")}
                          onKaraoke={() => navigate(props.karaokePath ?? `/p/${encodeURIComponent(props.postId)}/karaoke`)}
                          onStudyAgain={async () => {
                            if (lastStartScope !== undefined) await startCoordinator.forget(lastStartScope, lesson().session.session_id);
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
                          <Type as="h1" variant="h1">Choose a profile</Type>
                          <Type as="p" class="text-muted-foreground" variant="body">
                            Choose how you appear in this community.
                          </Type>
                        </header>
                        <Show when={candidates().length > 0}>
                          <OperationPersonaControl
                            label="Continue as"
                            personas={toOperationPersonas(candidates())}
                            placeholder="Choose a profile"
                            selectedPersonaId={preparePersonaId()}
                            onSelect={(id) => {
                              setPreparePersonaId(id);
                            }}
                          />
                        </Show>
                        <p class="text-sm text-muted-foreground" data-persona-consequence-note>
                          The profile you choose stays with this community. Your progress stays with
                          your account.
                        </p>
                        <Show when={message()}>{(error) => <FormNote tone="destructive">{error()}</FormNote>}</Show>
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
                    placeholder="Choose a profile"
                    selectedPersonaId={personaId()}
                    onSelect={setPersonaId}
                  />
                  <p class="text-sm text-muted-foreground" data-persona-consequence-note>
                    Your progress stays with your account. This profile is how you appear in this
                    community.
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
