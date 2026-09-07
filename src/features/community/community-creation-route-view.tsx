import { ApiClientError } from "@pirate/api-client";
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
import { preloadGlobalSignInAssets, prepareGlobalSignIn, requestGlobalSignIn, requestGlobalSignInCompletion } from "../auth/global-sign-in-host";
import {
  communityCreationCandidates,
  type CommunityPersonaChoice,
} from "../identity/community-persona-choice";
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
  confirmIdentity?: (signal: AbortSignal) => Promise<boolean>;
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
  if (error instanceof ApiClientError && (error.status === 400 || error.status === 409 || error.status === 429)) return error.message;
  return fallback;
}

function signedIn(session: RouteSession): AuthenticatedSession | undefined {
  return typeof session === "object" && session.status === "authenticated" ? session : undefined;
}

export function communityCreationCanUsePersona(
  session: AuthenticatedSession | undefined,
  choice: CommunityPersonaChoice | undefined,
): boolean {
  return session !== undefined && (choice?.kind === "create_new" || (!session.personasUnavailable && choice?.kind === "existing"
    && communityCreationCandidates(session.personas).some(persona => persona.personaId === choice.personaId)));
}

export function CommunityCreationRouteView(props: CommunityCreationRouteViewProps) {
  const api = props.api ?? createCommunityCreationApi();
  const [session, setSession] = createSignal<RouteSession>("resolving");
  const [draft, setDraft] = createSignal<CreateCommunityDraft>(createEmptyDraft(undefined));
  const [displayPersonas, setDisplayPersonas] = createSignal<AuthenticatedSession["personas"]>([]);
  const [intentOwnerId, setIntentOwnerId] = createSignal<string>();
  const [intent, setIntent] = createSignal<CommunityCreationIntentView>();
  const applyIntent = (incoming: CommunityCreationIntentView) => setIntent(current =>
    current?.intentId === incoming.intentId && current.revision > incoming.revision ? current : incoming);
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [staleRevision, setStaleRevision] = createSignal<{ expectedRevision: number } | null>(null);
  const commandKeys = new Map<string, string>();
  const activationAbort = new AbortController();
  let active = true;
  let sessionStarted = false;
  let refreshingAfterCommit = false;
  let sessionRequest = 0;
  let sessionInFlight = true;

  const navigate = (href: string, options?: { replace?: boolean }) => {
    if (props.navigate) {
      props.navigate(href, options);
      return;
    }
    if (typeof window !== "undefined") {
      if (options?.replace) window.history.replaceState(null, "", href);
      else window.location.assign(href);
    }
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
      setIntentOwnerId(owner.userId);
      applyIntent(latest);
      if (!preserveStaleRevision) setStaleRevision(null);
      return latest;
    } catch (error) {
      if (active && request === sessionRequest) setMessage(safeError(error, "Could not refresh this community draft. Try again."));
    }
  };

  const startSessionResolution = () => {
    const request = ++sessionRequest;
    sessionInFlight = true;
    void (props.resolveSession ?? resolveSession)()
      .then((result) => {
        if (!active || request !== sessionRequest) return;
        sessionInFlight = false;
        setSession(result);
        if (result === "anonymous") {
          setDisplayPersonas([]);
          setDraft(current => ({ ...current, persona: { kind: "create_new" } }));
          setIntent(undefined);
        } else {
          const changedOwner = intentOwnerId() !== undefined && intentOwnerId() !== result.userId;
          if (changedOwner) setIntent(undefined);
          if (!result.personasUnavailable) {
            setDisplayPersonas(result.personas);
            setDraft(current => {
              const selected = current.persona;
              const eligible = selected?.kind === "existing" && communityCreationCandidates(result.personas).some(persona => persona.personaId === selected.personaId);
              return { ...current, persona: selected?.kind !== "existing" || eligible ? selected : { kind: "create_new" } };
            });
          }
          const resumeId = props.intentId?.trim() ?? intent()?.intentId;
          if (resumeId) void loadIntent(resumeId, false, result);
        }
      })
      .catch(() => {
        if (active && request === sessionRequest) {
          sessionInFlight = false;
          setSession("failed");
        }
      });
  };

  const retrySessionResolution = () => {
    if (sessionInFlight) return;
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

  onCleanup(() => { active = false; activationAbort.abort(); });

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
    expectedOwnerId: string | undefined,
    navigateOnSuccess = false,
  ): Promise<void> => {
    const owner = signedIn(session());
    if (!owner || !expectedOwnerId || expectedOwnerId !== owner.userId) {
      setMessage("Check your account before finishing this community. If you switched accounts, reload this saved draft after signing in with its owner account.");
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
      if (!active || signedIn(session())?.userId !== expectedOwnerId) return;
      applyIntent(committed);
      setStaleRevision(null);
      if (committed.committedHref) {
        refreshingAfterCommit = true;
        try { refreshSession(); } finally { refreshingAfterCommit = false; }
      }
      if (navigateOnSuccess && committed.committedHref) navigate(committed.committedHref);
      else if (navigateOnSuccess && committed.nextAction.kind === "activate_profile") await activateProfile(committed, expectedOwnerId);
    } catch (error) {
      if (!active) return;
      if (rejectionStatus(error) === 409) {
        const latest = await loadIntent(intentId, true);
        if (latest && latest.revision !== expectedRevision) setStaleRevision({ expectedRevision });
        setMessage(safeError(error, "Could not finish creating this community. Your draft is saved."));
      } else {
        setMessage(safeError(error, "Could not finish creating this community. Try again."));
      }
    }
  };

  const activateProfile = async (saved: CommunityCreationIntentView, expectedOwner: string | undefined) => {
    if (!expectedOwner || signedIn(session())?.userId !== expectedOwner) return;
    setMessage("");
    try {
      // A saved active profile needs no provider ceremony. Recheck first in case
      // another tab or an interrupted sign-in has already finished activation.
      const latest = await api.getIntent({ intentId: saved.intentId });
      if (!active || signedIn(session())?.userId !== expectedOwner) return;
      applyIntent(latest);
      if (latest.nextAction.kind === "activate_profile") {
        const confirmed = await (props.confirmIdentity ?? requestGlobalSignInCompletion)(activationAbort.signal);
        if (!confirmed || !active) return;
        const resolved = await (props.resolveSession ?? resolveSession)();
        if (!active) return;
        setSession(resolved);
        if (resolved === "anonymous" || resolved.userId !== expectedOwner) {
          setMessage("Sign in with the account that saved this community to continue setup.");
          setIntent(undefined);
          return;
        }
      }
      const ready = await api.getIntent({ intentId: saved.intentId });
      if (!active || signedIn(session())?.userId !== expectedOwner) return;
      applyIntent(ready);
      if (ready.nextAction.kind === "commit") {
        await runCommit(ready.revision, ready.intentId, expectedOwner);
        const href = intent()?.committedHref;
        if (href) navigate(href);
      } else if (ready.nextAction.kind === "activate_profile") {
        setMessage("Your profile setup did not finish. Your community is still private and saved. Continue setup to try again.");
      }
    } catch (error) {
      if (active) setMessage(safeError(error, "Could not finish profile setup. Your community is still private and saved. Try again."));
    }
  };

  const submit = async () => {
    const currentDraft = draft();
    if (busy() || props.intentId?.trim()) return;
    const owner = signedIn(session());
    if (!owner) {
      if (session() === "anonymous") requestGlobalSignIn();
      else if (session() === "failed") retrySessionResolution();
      else setMessage("Your draft is ready. Your account must be checked before it can be created.");
      return;
    }
    if (owner.personasUnavailable && currentDraft.persona?.kind === "existing") {
      retrySessionResolution();
      return;
    }
    if (!communityCreationCanUsePersona(owner, currentDraft.persona)) {
      setMessage("Choose an available profile or create a new profile before continuing.");
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
      if (signedIn(session())?.userId !== owner.userId) {
        setMessage("Check your account before finishing this saved community. Sign in with the account that started it.");
        return;
      }
      setIntentOwnerId(owner.userId);
      applyIntent(created);
      navigate(`/communities/new?intent_id=${encodeURIComponent(created.intentId)}`, { replace: true });
      if (created.nextAction.kind === "commit") {
        await runCommit(created.revision, created.intentId, owner.userId, true);
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
      await runCommit(expectedRevision, intentId, intentOwnerId());
    } finally {
      if (active) setBusy(false);
    }
  };

  const currentSession = () => signedIn(session());
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
          <Button onClick={retrySessionResolution} type="button">Retry account check</Button>
        </div>
      </Show>
      <Show when={currentSession()?.personasUnavailable}>
        <div class="mx-auto max-w-2xl px-5 pt-4">
          <FormNote tone="destructive">You are signed in, but your community profiles could not be loaded. You can create a new profile, or retry before using an existing one.</FormNote>
        </div>
      </Show>
      <Show when={currentSession()?.personasUnavailable}><div class="mx-auto max-w-2xl px-5 pt-3"><Button disabled={sessionInFlight} onClick={retrySessionResolution}>Retry profiles</Button></div></Show>
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
            onDraftChange={(patch) => { commandKeys.delete("create"); setDraft(current => ({ ...current, ...patch })); }}
            onSubmit={() => void submit()}
            personas={displayPersonas()}
            profilesUnavailable={!!currentSession()?.personasUnavailable}
            showMediaFields={false}
            accountChecking={session() === "resolving"}
            submitting={busy()}
            requirePersona={!!currentSession()}
            submitLabel={currentSession()?.personasUnavailable && draft().persona?.kind === "existing" ? "Retry profiles" : session() === "anonymous" ? "Sign in to create" : session() === "failed" ? "Retry account check" : session() === "resolving" ? "Checking account" : undefined}
            submitNote={!currentSession() ? "Your draft stays here while you sign in or check your account." : undefined}
          />
        </Show>
      )}>
        {(currentIntent) => (
          <div class="px-5 py-8">
            <Show when={!currentSession()}>
              <FormNote class="mx-auto mb-5 max-w-2xl" tone="muted">Check your account before finishing this community. If you switched accounts, reload this saved draft after signing in with its owner account.</FormNote>
            </Show>
            <CommunityCreationProgressView
              committing={busy()}
              commitDisabled={!currentSession() || intentOwnerId() !== currentSession()?.userId}
              intent={currentIntent()}
              staleRevision={staleRevision()}
              onActivateProfile={() => {
                if (busy()) return;
                setBusy(true);
                void activateProfile(currentIntent(), intentOwnerId()).finally(() => { if (active) setBusy(false); });
              }}
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
