import { Title } from "@solidjs/meta";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import { resolveSession, type AuthenticatedSession, type SessionResolution } from "../../api/session";
import { Button, FormNote, Type } from "../../design-system";
import { prepareGlobalSignIn, requestGlobalSignIn } from "../auth/global-sign-in-host";
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
  | { kind: "auth-required" }
  | { kind: "failed"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "configure"; availability: ReadyAvailability; communityId: string; session: AuthenticatedSession }
  | { kind: "lesson"; session: StudySession };

export interface StudyV2RouteViewProps {
  api?: StudyV2Api;
  navigate?: (href: string) => void;
  postId: string;
  recorder?: StudyingRecorder;
  resolveSession?: () => Promise<SessionResolution>;
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

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function StudyV2RouteView(props: StudyV2RouteViewProps) {
  const api = props.api ?? createStudyV2Api();
  const recorder = props.recorder ?? createStudyingBrowserRecorder();
  const [state, setState] = createSignal<RouteState>({ kind: "loading" });
  const [personaId, setPersonaId] = createSignal("");
  const [targetLanguage, setTargetLanguage] = createSignal("");
  const [learnerBand, setLearnerBand] = createSignal<StudyLearnerBand | "">("");
  const [starting, setStarting] = createSignal(false);
  const [message, setMessage] = createSignal("");
  let active = true;
  let loadStarted = false;
  let createIdempotencyKey = sessionKey(props.postId);

  const navigate = (href: string) => {
    if (props.navigate) props.navigate(href);
    else if (typeof window !== "undefined") window.location.assign(href);
  };

  const load = async () => {
    setState({ kind: "loading" });
    setMessage("");
    try {
      const resolved = await (props.resolveSession ?? resolveSession)();
      if (!active) return;
      if (resolved === "anonymous") {
        setState({ kind: "auth-required" });
        return;
      }
      if (resolved.personas.length === 0) {
        setState({ kind: "failed", message: "Create an active public persona before starting Study." });
        return;
      }
      const loaded = await api.loadAvailability(props.postId);
      if (!active) return;
      if (loaded.availability.state !== "ready") {
        setState({ kind: "unavailable", message: availabilityMessage(loaded.availability) });
        return;
      }
      setPersonaId(resolved.personas[0]!.personaId);
      setTargetLanguage("");
      setLearnerBand("");
      setState({
        availability: loaded.availability,
        communityId: loaded.communityId,
        kind: "configure",
        session: resolved,
      });
    } catch (error) {
      if (!active) return;
      const message = safeFailure(error, "We couldn't load Study for this song.");
      setState(message.startsWith("Sign in")
        ? { kind: "auth-required" }
        : { kind: "failed", message });
    }
  };

  createEffect(
    () => true,
    () => {
      if (loadStarted || typeof window === "undefined") return;
      loadStarted = true;
      queueMicrotask(() => void load());
    },
  );
  onCleanup(() => { active = false; });

  const start = async (configuration: Extract<RouteState, { kind: "configure" }>) => {
    const language = targetLanguage();
    const band = learnerBand();
    if (language !== "" && band === "") {
      setMessage("Choose a learner level for translated practice.");
      return;
    }
    setStarting(true);
    setMessage("");
    try {
      const session = await api.createSession({
        communityId: configuration.communityId,
        idempotencyKey: createIdempotencyKey,
        learnerBand: language === "" ? null : band || null,
        personaId: personaId(),
        postId: props.postId,
        targetLanguage: language || null,
        timezone: timezone(),
      });
      if (active) setState({ kind: "lesson", session });
    } catch (error) {
      if (active) setMessage(safeFailure(error, "Could not start this Study session. Try again."));
    } finally {
      if (active) setStarting(false);
    }
  };

  const failureState = () => {
    const current = state();
    return current.kind === "failed" || current.kind === "unavailable" ? current : undefined;
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
    <main data-route-path={`/p/${props.postId}/study`} class="min-h-dvh bg-background text-foreground">
      <Title>Study · Pirate</Title>
      <Show when={state().kind !== "loading"} fallback={<StudyRouteLoadingState label="Loading study" />}>
        <Show when={state().kind !== "auth-required"} fallback={(
          <StudyAuthRequiredState
            description="Study packs follow the song's community. Sign in to start a lesson."
            onConnect={requestGlobalSignIn}
            onConnectIntent={prepareGlobalSignIn}
            onExit={() => navigate("/")}
            title="Sign in to study"
          />
        )}>
          <Show when={failureState() === undefined} fallback={(
            <StudyRouteLoadFailureState
              description={failureState()?.message ?? "We couldn't load Study for this song."}
              onGoHome={() => navigate("/")}
              onRetry={() => {
                createIdempotencyKey = sessionKey(props.postId);
                void load();
              }}
              title="Study unavailable"
            />
          )}>
            <Show
              when={configurationState()}
              fallback={(
                <Show when={lessonState()}>
                  {(lesson) => (
                    <StudyingRouteView
                      client={createStudyV2RuntimeClient({ api, initialSession: lesson().session })}
                      onExit={() => navigate("/")}
                      onKaraoke={() => navigate(`/p/${encodeURIComponent(props.postId)}/karaoke`)}
                      onStudyAgain={() => {
                        createIdempotencyKey = sessionKey(props.postId);
                        void load();
                      }}
                      postId={props.postId}
                      recorder={recorder}
                    />
                  )}
                </Show>
              )}
            >
              {(configuration) => {
                const personas = () => configuration().session.personas.map((persona) => ({
                  avatarSrc: persona.avatarRef,
                  displayName: persona.displayName ?? persona.primaryPublicHandle ?? persona.personaId,
                  personaId: persona.personaId,
                  publicHandle: persona.primaryPublicHandle,
                }));
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
                    selectedPersonaId={personaId()}
                    onSelect={setPersonaId}
                  />
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
                      disabled={starting() || (targetLanguage() !== "" && learnerBand() === "")}
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
