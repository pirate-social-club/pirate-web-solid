import { ApiClientError } from "@pirate/api-client";
import { Title } from "@solidjs/meta";
import { createEffect, createSignal, onCleanup } from "solid-js";

import {
  onSessionRefreshed,
  refreshSession,
  resolveSession,
  type AuthenticatedSession,
  type SessionResolution,
} from "../../api/session";
import { requestGlobalSignIn, requestGlobalSignInCompletion } from "../auth/global-sign-in-host";
import {
  communityCreationCandidates,
  type CommunityPersonaChoice,
} from "../identity/community-persona-choice";
import {
  CommunityCreationApiError,
  createCommunityCreationApi,
  type CommunityCreationApi,
} from "./community-creation-api";
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
  const [draftEdited, setDraftEdited] = createSignal(false);
  const [displayPersonas, setDisplayPersonas] = createSignal<AuthenticatedSession["personas"]>([]);
  const [intentOwnerId, setIntentOwnerId] = createSignal<string>();
  const [intent, setIntent] = createSignal<CommunityCreationIntentView>();
  const applyIntent = (incoming: CommunityCreationIntentView) => {
    const current = intent();
    if (current?.intentId === incoming.intentId && current.revision > incoming.revision) return current;
    setIntent(incoming);
    return incoming;
  };
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [intentReadFailed, setIntentReadFailed] = createSignal(false);
  let continuing = false;
  const [loadingSaved, setLoadingSaved] = createSignal(!!props.intentId?.trim());
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

  const loadIntent = async (intentId: string, owner = signedIn(session())) => {
    if (!owner) return;
    const request = sessionRequest;
    setLoadingSaved(true);
    setIntentReadFailed(false);
    try {
      const response = await api.getIntent({ intentId });
      if (!active || request !== sessionRequest) return;
      setIntentOwnerId(owner.userId);
      const latest = applyIntent(response);
      if (latest.draft && !draftEdited()) setDraft(latest.draft);
      if (latest.nextAction.kind === "blocked") setMessage("This saved draft cannot be completed here. Start a new community.");
      if (latest.nextAction.kind === "none" && !latest.committedHref) setMessage("This saved draft has ended. Start a new community.");
      if (latest.committedHref) navigate(latest.committedHref);
      setLoadingSaved(false);
      return latest;
    } catch (error) {
      if (active && request === sessionRequest) {
        setLoadingSaved(false);
        setIntentReadFailed(true);
        continuing = false;
        setMessage(safeError(error, "Could not load your saved draft. Try again."));
      }
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
          continuing = false;
          setLoadingSaved(false);
          setDisplayPersonas([]);
          setDraft(current => ({ ...current, persona: { kind: "create_new" } }));
          setIntent(undefined);
        } else {
          const changedOwner = intentOwnerId() !== undefined && intentOwnerId() !== result.userId;
          if (changedOwner) { continuing = false; setIntent(undefined); }
          if (!result.personasUnavailable) {
            setDisplayPersonas(result.personas);
            setDraft(current => {
              if (intent()) return current;
              const selected = current.persona;
              const eligible = selected?.kind === "existing" && communityCreationCandidates(result.personas).some(persona => persona.personaId === selected.personaId);
              return { ...current, persona: selected?.kind !== "existing" || eligible ? selected : { kind: "create_new" } };
            });
          }
          const resumeId = props.intentId?.trim() ?? intent()?.intentId;
          if (resumeId) void loadIntent(resumeId, result);
        }
      })
      .catch(() => {
        if (active && request === sessionRequest) {
          sessionInFlight = false;
          continuing = false;
          setSession("failed");
          setLoadingSaved(false);
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
    () => ({ current: intent(), authenticated: signedIn(session()) !== undefined, failed: intentReadFailed() }),
    ({ current, authenticated, failed }) => {
    if (!authenticated || failed || current?.nextAction.kind !== "wait") return;
    const delay = Math.max(1, current.nextAction.retryAfterSeconds ?? 3) * 1_000;
    const timer = window.setTimeout(() => {
      if (loadingSaved()) return;
      void loadIntent(current.intentId).then(async latest => {
        if (!latest || !continuing || !active || busy()) return;
        const owner = intentOwnerId();
        if (!owner || signedIn(session())?.userId !== owner) { continuing = false; return; }
        setBusy(true);
        try {
          if (latest.nextAction.kind === "commit") await runCommit(latest.revision, latest.intentId, owner, true);
          else if (latest.nextAction.kind === "activate_profile") await activateProfile(latest, owner);
        } finally { if (active) setBusy(false); }
      });
    }, delay);
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
      if (committed.committedHref) {
        refreshingAfterCommit = true;
        try { refreshSession(); } finally { refreshingAfterCommit = false; }
      }
      if (committed.committedHref) navigate(committed.committedHref);
      else if (navigateOnSuccess && committed.nextAction.kind === "activate_profile") await activateProfile(committed, expectedOwnerId);
    } catch (error) {
      continuing = false;
      if (!active) return;
      if (rejectionStatus(error) === 409) {
        await loadIntent(intentId);
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
        if (!confirmed || !active) {
          continuing = false;
          if (active) setMessage("Creation was not completed. Your draft is saved; try again when ready.");
          return;
        }
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
      if (ready.committedHref) {
        navigate(ready.committedHref);
      } else if (ready.nextAction.kind === "commit") {
        await runCommit(ready.revision, ready.intentId, expectedOwner);
      } else if (ready.nextAction.kind === "activate_profile") {
        setMessage("Could not finish creating your profile. Your draft is saved. Try again.");
      }
    } catch (error) {
      continuing = false;
      if (active) setMessage(safeError(error, "Could not finish profile setup. Your community is still private and saved. Try again."));
    }
  };

  const submit = async () => {
    const currentDraft = draft();
    if (busy() || loadingSaved() || sessionInFlight) return;
    const owner = signedIn(session());
    if (!owner) {
      if (session() === "anonymous") requestGlobalSignIn();
      else if (session() === "failed") retrySessionResolution();
      else setMessage("Your draft is ready. Your account must be checked before it can be created.");
      return;
    }
    continuing = true;
    const saved = intent();
    if (saved) {
      if (intentOwnerId() !== owner.userId) {
        setMessage("Sign in with the account that saved this community, then reload the draft.");
        return;
      }
      setBusy(true);
      try {
        let latest = await loadIntent(saved.intentId);
        if (!latest || !active || signedIn(session())?.userId !== owner.userId) return;
        if (latest.committedHref) return;
        if (draftEdited()) {
          const updated = await api.updateIntent({ intentId: saved.intentId, expectedRevision: saved.revision, draft: currentDraft, idempotencyKey: commandKey("update") });
          if (!active || signedIn(session())?.userId !== owner.userId) return;
          latest = applyIntent(updated);
          setDraftEdited(false);
          setMessage("");
        }
        if (latest.nextAction.kind === "activate_profile") await activateProfile(latest, owner.userId);
        else if (latest.nextAction.kind === "commit") await runCommit(latest.revision, latest.intentId, owner.userId, true);
        else if (latest.nextAction.kind !== "wait") setMessage("This saved draft cannot be created. Start a new community.");
      } catch (error) {
        continuing = false;
        if (active) setMessage(safeError(error, "Could not save your changes. Your draft is still here. Try again."));
      } finally { if (active) setBusy(false); }
      return;
    }
    if (props.intentId?.trim()) { await loadIntent(props.intentId.trim()); return; }
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
      continuing = false;
      if (active) setMessage(safeError(error, "Could not create this community draft. Try again."));
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
      <CreateCommunityView
        draft={draft()}
        onClose={() => navigate("/")}
        onDraftChange={(patch) => {
          if (busy() || loadingSaved() || (props.intentId?.trim() && !intent())) return;
          continuing = false;
          commandKeys.delete("create");
          commandKeys.delete("update");
          if (intent()) {
            setDraftEdited(true);
            setDraft(current => ({ ...current, name: patch.name ?? current.name, description: patch.description === undefined ? current.description : patch.description }));
          } else setDraft(current => ({ ...current, ...patch }));
        }}
        onSubmit={() => void submit()}
        personas={displayPersonas()}
        profilesUnavailable={!!currentSession()?.personasUnavailable}
        showMediaFields={false}
        actionOnly={((!!intent() || !!props.intentId?.trim()) && !draftEdited()) || !currentSession()}
        fieldsDisabled={loadingSaved() || (!!props.intentId?.trim() && !intent())}
        ownerDisabled={!!intent()}
        accountChecking={session() === "resolving" || loadingSaved()}
        submitting={busy() || (intent()?.nextAction.kind === "wait" && !intentReadFailed())}
        requirePersona={!!currentSession()}
        failureMessage={message() || (session() === "failed" ? "Could not check your account. Your draft is still here." : currentSession()?.personasUnavailable ? "Could not load your existing profiles. You can still create a new profile." : "")}
        onRetry={session() === "failed" || currentSession()?.personasUnavailable ? retrySessionResolution : props.intentId?.trim() && !intent() && message() ? () => void loadIntent(props.intentId!.trim()) : undefined}
        retryLabel={session() === "failed" ? "Retry account check" : currentSession()?.personasUnavailable ? "Retry profiles" : "Retry saved draft"}
      />
    </main>
  );
}
