import { Title } from "@solidjs/meta";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import { resolveSession, type AuthenticatedSession, type SessionResolution } from "../../api/session";
import { Button, Card, CardContent, FormNote, Spinner, Type } from "../../design-system";
import { preloadGlobalSignInAssets, prepareGlobalSignIn, requestGlobalSignIn } from "../auth/global-sign-in-host";
import { OperationPersonaControl } from "../identity/operation-persona-control/operation-persona-control";
import {
  CommunityCreationApiError,
  createCommunityCreationApi,
  type CommunityCreationApi,
} from "./community-creation-api";
import { CommunityCreationProgressView } from "./community-creation-progress/community-creation-progress";
import type { CommunityCreationIntentView } from "./community-creation-progress/community-creation-progress-model";
import { CreateCommunityView } from "./create-community/create-community";
import { createEmptyDraft, type CreateCommunityDraft } from "./create-community/create-community-model";
import { MediaShell } from "../shell/media-shell/media-shell";

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
  const [draft, setDraft] = createSignal<CreateCommunityDraft>();
  const [intent, setIntent] = createSignal<CommunityCreationIntentView>();
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [staleRevision, setStaleRevision] = createSignal<{ expectedRevision: number } | null>(null);
  const commandKeys = new Map<string, string>();
  let active = true;
  let sessionStarted = false;

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

  createEffect(
    () => true,
    () => {
    if (sessionStarted || typeof window === "undefined") return;
    sessionStarted = true;
    void (props.resolveSession ?? resolveSession)()
      .then((result) => {
        if (!active) return;
        setSession(result);
        if (result !== "anonymous" && result.personas.length > 0) {
          setDraft(createEmptyDraft(result.personas[0]!.personaId));
          const resumeId = props.intentId?.trim();
          if (resumeId) void loadIntent(resumeId);
        }
      })
      .catch(() => {
        if (active) setSession("failed");
      });
    },
  );

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

  const submit = async () => {
    const currentDraft = draft();
    if (!currentDraft || busy()) return;
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
    } catch (error) {
      if (active) setMessage(safeError(error, "Could not create this community draft. Try again."));
    } finally {
      if (active) setBusy(false);
    }
  };

  const commit = async (expectedRevision: number, intentId: string) => {
    if (busy()) return;
    setBusy(true);
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
    } catch (error) {
      if (!active) return;
      if (rejectionStatus(error) === 409) {
        setStaleRevision({ expectedRevision });
        await loadIntent(intentId, true);
      } else {
        setMessage(safeError(error, "Could not finish creating this community. Try again."));
      }
    } finally {
      if (active) setBusy(false);
    }
  };

  const currentSession = () => signedIn(session());
  const personas = () => currentSession()?.personas ?? [];

  return (
    <MediaShell activeItemId="communities" signedIn={currentSession() !== undefined}>
      <main data-route-path="/communities/new" class="min-h-[24rem] bg-background text-foreground">
      <Title>Create community · Pirate</Title>
      <Show when={session() !== "resolving"} fallback={(
        <div aria-label="Loading community creation" class="grid min-h-[24rem] place-items-center" role="status">
          <div class="flex items-center gap-3 text-muted-foreground">
            <Spinner class="size-5" decorative />
            <Type as="span" variant="body">Preparing community creation…</Type>
          </div>
        </div>
      )}>
        <Show when={session() !== "anonymous" && session() !== "failed"} fallback={(
          <div class="mx-auto flex min-h-[24rem] max-w-xl items-center px-5">
            <Card class="w-full"><CardContent class="space-y-4 p-6">
              <Type as="h1" variant="h2">Sign in to create a community</Type>
              <Type as="p" class="text-muted-foreground" variant="body">
                Community ownership is attached to your signed-in account and public persona.
              </Type>
              <Button onClick={requestGlobalSignIn} onFocus={prepareGlobalSignIn} onPointerDown={prepareGlobalSignIn} onPointerEnter={preloadGlobalSignInAssets}>Sign in</Button>
            </CardContent></Card>
          </div>
        )}>
          <Show when={personas().length > 0} fallback={(
            <div class="mx-auto flex min-h-[24rem] max-w-xl items-center px-5">
              <Card class="w-full"><CardContent class="space-y-4 p-6">
                <Type as="h1" variant="h2">Create a persona first</Type>
                <Type as="p" class="text-muted-foreground" variant="body">
                  A community needs one active public persona to present its owner role.
                </Type>
                <Button onClick={() => navigate("/settings")}>Open settings</Button>
              </CardContent></Card>
            </div>
          )}>
            <Show when={intent()} fallback={(
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
                        <OperationPersonaControl
                          label="Community profile"
                          personas={personas().map((persona) => ({
                            avatarSrc: persona.avatarRef,
                            displayName: persona.displayName ?? persona.primaryPublicHandle ?? persona.personaId,
                            personaId: persona.personaId,
                            publicHandle: persona.primaryPublicHandle,
                          }))}
                          selectedPersonaId={currentDraft().personaId}
                          onSelect={(personaId) => setDraft((current) => current ? { ...current, personaId } : current)}
                        />
                      )}
                      showMediaFields={false}
                      submitting={busy()}
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
                    onStartVerification={({ ceremonyIntentId, intentId }) => navigate(
                      `/verify/very?intent_id=${encodeURIComponent(ceremonyIntentId)}&return_to=${encodeURIComponent(`/communities/new?intent_id=${intentId}`)}`,
                    )}
                    onView={() => currentIntent().committedHref && navigate(currentIntent().committedHref!)}
                  />
                </div>
              )}
            </Show>
          </Show>
        </Show>
      </Show>
      </main>
    </MediaShell>
  );
}
