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

export function communityCreationCanUsePersona(
  session: AuthenticatedSession | undefined,
  choice: CommunityPersonaChoice | undefined,
): boolean {
  return session !== undefined && choice?.kind === "existing"
    && communityCreationCandidates(session.personas).some(persona => persona.personaId === choice.personaId);
}

export function CommunityCreationRouteView(props: CommunityCreationRouteViewProps) {
  const api = props.api ?? createCommunityCreationApi();
  const [session, setSession] = createSignal<RouteSession>("resolving");
  const [draft, setDraft] = createSignal<CreateCommunityDraft>(createEmptyDraft(undefined));
  const [displayPersonas, setDisplayPersonas] = createSignal<AuthenticatedSession["personas"]>([]);
  let intentOwnerId: string | undefined;
  let continueAfterSignIn = false;
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

  const loadIntent = async (intentId: string, preserveStaleRevision = false, owner = signedIn(session())) => {
    if (!owner) return;
    const request = sessionRequest;
    try {
      const latest = await api.getIntent({ intentId });
      if (!active || request !== sessionRequest) return;
      intentOwnerId = owner.userId;
      setIntent(latest);
      if (!preserveStaleRevision) setStaleRevision(null);
      setMessage("");
    } catch (error) {
      if (active && request === sessionRequest) setMessage(safeError(error, "Could not refresh this community draft. Try again."));
    }
  };

  const startSessionResolution = () => {
    const request = ++sessionRequest;
    void (props.resolveSession ?? resolveSession)()
      .then((result) => {
        if (!active || request !== sessionRequest) return;
        setSession(result);
        setMessage("");
        if (result === "anonymous") {
          setDisplayPersonas([]);
          setDraft(current => ({ ...current, persona: undefined }));
          setIntent(undefined);
        } else {
          const changedOwner = intentOwnerId !== undefined && intentOwnerId !== result.userId;
          if (changedOwner) setIntent(undefined);
          setDisplayPersonas(result.personas);
          // Minting stays unavailable until post-mint wallet activation exists.
          const choice = defaultCommunityPersonaChoice(communityCreationCandidates(result.personas));
          setDraft((current) => {
            const selected = current.persona;
            const eligible = selected?.kind === "existing"
              && communityCreationCandidates(result.personas).some(persona => persona.personaId === selected.personaId);
            return { ...current, persona: eligible ? selected : choice?.kind === "existing" ? choice : undefined };
          });
          const resumeId = props.intentId?.trim();
          if (resumeId && (!intent() || changedOwner)) void loadIntent(resumeId, false, result);
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
    () => ({ current: intent(), authenticated: signedIn(session()) !== undefined }),
    ({ current, authenticated }) => {
    if (!authenticated || current?.nextAction.kind !== "wait") return;
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
    const owner = signedIn(session());
    if (!owner || (intentOwnerId && intentOwnerId !== owner.userId)) {
      setMessage("Check your account before finishing this community. Your saved draft is still here.");
      return;
    }
    if (intent()?.nextAction.kind === "blocked") return;
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
    if (busy() || props.intentId?.trim()) return;
    const owner = signedIn(session());
    if (!owner) {
      continueAfterSignIn = true;
      if (session() === "anonymous") requestGlobalSignIn();
      else if (session() === "failed") retrySessionResolution();
      else setMessage("Your draft is ready. Your account must be checked before it can be created.");
      return;
    }
    if (!communityCreationCanUsePersona(owner, currentDraft.persona)) {
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
      intentOwnerId = owner.userId;
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
  createEffect(
    () => ({ current: currentSession(), persona: draft().persona }),
    ({ current, persona }) => {
      if (!continueAfterSignIn || !current) return;
      continueAfterSignIn = false;
      if (persona?.kind === "existing") void submit();
      else setMessage("Choose an eligible community profile, then create your community.");
    },
  );
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
      <Show when={message()}>{(error) => (
        <FormNote class="mx-auto mt-4 max-w-2xl" tone="destructive">{error()}</FormNote>
      )}</Show>
      <Show when={intent()} fallback={(
        <Show when={!props.intentId?.trim()} fallback={(
          <section class="mx-auto max-w-2xl space-y-4 px-5 py-8" data-community-creation-resume>
            <Type as="h1" variant="h2">Resume community creation</Type>
            <Type as="p" variant="body">Your saved draft will appear here once your account and draft are checked.</Type>
            <Show when={currentSession() && message()}>
              <Button onClick={() => void loadIntent(props.intentId!.trim())}>Retry saved draft</Button>
            </Show>
          </section>
        )}>
          <CreateCommunityView
            draft={draft()}
            onClose={() => navigate("/")}
            onDraftChange={(patch) => setDraft(current => ({ ...current, ...patch }))}
            onSubmit={() => void submit()}
            personaControl={(
              <CommunityPersonaChoiceControl
                createNewUnavailable
                disabled={!currentSession()}
                choice={draft().persona}
                createNewLabel="Create a new owner persona"
                label="Community profile"
                note="Your account owns this community. The persona you choose is its public face here; your private Study progress and streaks stay with your account either way."
                onChoose={(choice: CommunityPersonaChoice) => setDraft(current => ({ ...current, persona: choice }))}
                personas={communityCreationCandidates(displayPersonas())}
                placeholder="Choose a persona"
              />
            )}
            showMediaFields={false}
            submitting={busy()}
            requirePersona={!!currentSession()}
            submitLabel={session() === "anonymous" ? "Sign in to create" : session() === "failed" ? "Try again" : undefined}
            submitNote={!currentSession() ? "Your draft stays here while you sign in or check your account." : undefined}
          />
        </Show>
      )}>
        {(currentIntent) => (
          <div class="px-5 py-8">
            <Show when={!currentSession()}>
              <FormNote class="mx-auto mb-5 max-w-2xl" tone="muted">Check your account before finishing this community. Your saved draft is still here.</FormNote>
            </Show>
            <CommunityCreationProgressView
              committing={busy()}
              commitDisabled={!currentSession() || intentOwnerId !== currentSession()?.userId}
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
