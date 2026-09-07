import { Title } from "@solidjs/meta";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import {
  onSessionRefreshed,
  refreshSession,
  resolveSession,
  type AuthenticatedSession,
  type SessionResolution,
} from "../../api/session";
import { Button, FormNote, Type } from "../../design-system";
import { preloadGlobalSignInAssets, prepareGlobalSignIn, requestGlobalSignIn } from "../auth/global-sign-in-host";
import {
  defaultCommunityPersonaChoice,
  communityCreationCandidates,
  PERSONA_CREATION_UNAVAILABLE,
  type CommunityPersonaChoice,
} from "../identity/community-persona-choice";
import { CommunityPersonaChoiceControl } from "../identity/community-persona-choice-sheet";
import {
  CommunityCreationApiError,
  createCommunityCreationApi,
  type CommunityCreationApi,
} from "./community-creation-api";
import { CommunityCreationProgressView } from "./community-creation-progress/community-creation-progress";
import type { CommunityCreationIntentView } from "./community-creation-progress/community-creation-progress-model";
import { CreateCommunityView } from "./create-community/create-community";
import { createEmptyDraft, type CreateCommunityDraft } from "./create-community/create-community-model";

type RouteSession = "resolving" | "failed" | SessionResolution;

export interface CommunityCreationRouteViewProps {
  api?: CommunityCreationApi;
  intentId?: string;
  navigate?: (href: string, options?: { replace?: boolean }) => void;
  resolveSession?: () => Promise<SessionResolution>;
}

function idempotencyKey(scope: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `community:${scope}:${random}`;
}

function rejectionStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

function safeError(error: unknown, fallback: string): string {
  if (error instanceof CommunityCreationApiError && error.code === "csrf_required") {
    return "Refresh the page, then try again.";
  }
  return fallback;
}

function signedIn(session: RouteSession): AuthenticatedSession | undefined {
  return typeof session === "object" && session.status === "authenticated" ? session : undefined;
}

export function CommunityCreationRouteView(props: CommunityCreationRouteViewProps) {
  const api = props.api ?? createCommunityCreationApi();
  const [session, setSession] = createSignal<RouteSession>("resolving");
  const [draft, setDraft] = createSignal<CreateCommunityDraft>(createEmptyDraft(undefined));
  const [intent, setIntent] = createSignal<CommunityCreationIntentView>();
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [staleRevision, setStaleRevision] = createSignal<{ expectedRevision: number } | null>(null);
  const commandKeys = new Map<string, string>();
  let active = true;
  let sessionStarted = false;
  let refreshingAfterCommit = false;
  let sessionRequest = 0;

  const navigate = (href: string, options?: { replace?: boolean }) => {
    if (props.navigate) {
      props.navigate(href, options);
      return;
    }
    if (typeof window !== "undefined") window.location.assign(href);
  };

  const commandKey = (scope: string): string => {
    const existing = commandKeys.get(scope);
    if (existing) return existing;
    const created = idempotencyKey(scope);
    commandKeys.set(scope, created);
    return created;
  };

  const loadIntent = async (intentId: string, preserveStaleRevision = false) => {
    try {
      const latest = await api.getIntent({ intentId });
      if (!active) return;
      setIntent(latest);
      if (!preserveStaleRevision) setStaleRevision(null);
      setMessage("");
    } catch (error) {
      if (active) setMessage(safeError(error, "Could not refresh this community draft. Try again."));
    }
  };

  const startSessionResolution = () => {
    const request = ++sessionRequest;
    void (props.resolveSession ?? resolveSession)()
      .then((result) => {
        if (!active || request !== sessionRequest) return;
        setSession(result);
        if (result !== "anonymous") {
          // Minting stays unavailable until post-mint wallet activation exists.
          const choice = defaultCommunityPersonaChoice(communityCreationCandidates(result.personas));
          setDraft((current) => {
            const selected = current.persona;
            const eligible = selected?.kind === "existing"
              && communityCreationCandidates(result.personas).some(persona => persona.personaId === selected.personaId);
            return { ...current, persona: eligible ? selected : choice?.kind === "existing" ? choice : undefined };
          });
          const resumeId = props.intentId?.trim();
          if (resumeId) void loadIntent(resumeId);
        }
      })
      .catch(() => {
        if (active && request === sessionRequest) setSession("failed");
      });
  };

  const retrySessionResolution = () => {
    setSession("resolving");
    // Dropping the store notifies this route and the application shell. Their
    // subscribers then coalesce onto the same fresh account request.
    refreshSession();
  };

  createEffect(
    () => typeof window !== "undefined",
    (isBrowser) => {
    if (!isBrowser || sessionStarted) return;
    sessionStarted = true;
    startSessionResolution();
    },
  );

  if (typeof window !== "undefined") {
    onCleanup(onSessionRefreshed(() => {
      if (refreshingAfterCommit) return;
      setSession("resolving");
      startSessionResolution();
    }));
  }

  onCleanup(() => { active = false; });

  createEffect(
    () => intent(),
    (current) => {
    if (current?.nextAction.kind !== "wait") return;
    const delay = Math.max(1, current.nextAction.retryAfterSeconds ?? 3) * 1_000;
    const timer = window.setTimeout(() => void loadIntent(current.intentId), delay);
    onCleanup(() => window.clearTimeout(timer));
    },
  );

  const runCommit = async (
    expectedRevision: number,
    intentId: string,
    navigateOnSuccess = false,
  ): Promise<void> => {
    if (!signedIn(session()) || intent()?.nextAction.kind === "blocked") return;
    setMessage("");
    try {
      const committed = await api.commitIntent({
        expectedRevision,
        idempotencyKey: commandKey(`commit:${intentId}:${expectedRevision}`),
        intentId,
      });
      if (!active) return;
      setIntent(committed);
      setStaleRevision(null);
      if (committed.committedHref) {
        refreshingAfterCommit = true;
        try { refreshSession(); } finally { refreshingAfterCommit = false; }
      }
      if (navigateOnSuccess && committed.committedHref) navigate(committed.committedHref);
    } catch (error) {
      if (!active) return;
      if (rejectionStatus(error) === 409) {
        setStaleRevision({ expectedRevision });
        await loadIntent(intentId, true);
      } else {
        setMessage(safeError(error, "Could not finish creating this community. Try again."));
      }
    }
  };

  const submit = async () => {
    const currentDraft = draft();
    if (busy() || !signedIn(session()) || props.intentId?.trim()) return;
    const selected = currentDraft.persona;
    if (selected?.kind !== "existing"
      || !personas().some(persona => persona.personaId === selected.personaId)) {
      setMessage(PERSONA_CREATION_UNAVAILABLE);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const created = await api.createIntent({
        draft: currentDraft,
        idempotencyKey: commandKey("create"),
      });
      if (!active) return;
      setIntent(created);
      navigate(`/communities/new?intent_id=${encodeURIComponent(created.intentId)}`, { replace: true });
      if (created.nextAction.kind === "commit") {
        await runCommit(created.revision, created.intentId, true);
      }
    } catch (error) {
      if (active) setMessage(safeError(error, "Could not create this community draft. Try again."));
    } finally {
      if (active) setBusy(false);
    }
  };

  const commit = async (expectedRevision: number, intentId: string) => {
    if (busy()) return;
    setBusy(true);
    try {
      await runCommit(expectedRevision, intentId);
    } finally {
      if (active) setBusy(false);
    }
  };

  const currentSession = () => signedIn(session());
  const personas = () => communityCreationCandidates(currentSession()?.personas ?? []);
  // Session state is diagnostic only; it never gates the editable form.
  const creationState = (): "ready" | "resolving" | "signed-out" | "unavailable" => {
    const current = session();
    if (current === "resolving") return "resolving";
    if (current === "failed") return "unavailable";
    if (current === "anonymous") return "signed-out";
    return "ready";
  };

  return (
    <main data-creation-state={creationState()} data-route-path="/communities/new" class="min-h-[calc(100dvh-4rem)] bg-background text-foreground">
      <Title>Create community · Pirate</Title>
      <Show when={session() === "failed"}>
        <div class="mx-auto flex max-w-2xl items-center gap-3 px-5 pt-4">
          <FormNote tone="destructive">Could not check your account. Your draft is still here.</FormNote>
          <Button onClick={retrySessionResolution} type="button">Try again</Button>
        </div>
      </Show>
      <Show when={session() === "anonymous"}>
        <div class="mx-auto flex max-w-2xl items-center gap-3 px-5 pt-4">
          <Type as="p" variant="body">Sign in to create a community</Type>
          <Button onClick={requestGlobalSignIn} onFocus={prepareGlobalSignIn} onPointerDown={prepareGlobalSignIn} onPointerEnter={preloadGlobalSignInAssets} type="button">Sign in</Button>
        </div>
      </Show>
      <Show when={currentSession() && intent()} fallback={(
        <Show when={draft()}>
          {(currentDraft) => (
            <>
              <Show when={message()}>{(error) => (
                <FormNote class="mx-auto mt-4 max-w-2xl" tone="destructive">{error()}</FormNote>
              )}</Show>
              <CreateCommunityView
                draft={currentDraft()}
                onClose={() => navigate("/")}
                onDraftChange={(patch) => setDraft((current) => current ? { ...current, ...patch } : current)}
                onSubmit={() => void submit()}
                personaControl={(
                  <CommunityPersonaChoiceControl
                    createNewUnavailable={!!currentSession()}
                    disabled={!currentSession()}
                    choice={currentSession() ? currentDraft().persona : undefined}
                    createNewLabel="Create a new owner persona"
                    label="Community profile"
                    note="Your account owns this community. The persona you choose is its public face here; your private Study progress and streaks stay with your account either way."
                    onChoose={(choice: CommunityPersonaChoice) => setDraft((current) => current ? { ...current, persona: choice } : current)}
                    personas={personas()}
                    placeholder="Choose a persona"
                  />
                )}
                showMediaFields={false}
                submitting={busy()}
                submitDisabled={!currentSession() || !!props.intentId?.trim()}
              />
            </>
          )}
        </Show>
      )}>
        {(currentIntent) => (
          <div class="px-5 py-8">
            <Show when={message()}>{(error) => (
              <FormNote class="mx-auto mb-5 max-w-2xl" tone="destructive">{error()}</FormNote>
            )}</Show>
            <CommunityCreationProgressView
              committing={busy()}
              intent={currentIntent()}
              staleRevision={staleRevision()}
              onCommit={({ expectedRevision, intentId }) => void commit(expectedRevision, intentId)}
              onRetry={() => void loadIntent(currentIntent().intentId)}
              onView={() => currentIntent().committedHref && navigate(currentIntent().committedHref!)}
            />
          </div>
        )}
      </Show>
    </main>
  );
}
