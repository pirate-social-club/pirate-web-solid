import { ApiClientError } from "@pirate/api-client-handle-sales";
import { Link, Meta, Title } from "@solidjs/meta";
import { getRequestEvent } from "@solidjs/web";
import {
  For,
  Loading,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";

import { createPublicCommunityRouteClient } from "../../../api/community-route-client.ts";
import {
  createPublicHandleSalesClient,
  createSessionHandleSalesClient,
  handleSalesMutationOptions,
  readHandleSalesCsrfCookie,
  type PublicHandleSalesApiClient,
  type SessionHandleSalesApiClient,
} from "../../../api/handle-sales-client.ts";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Type,
  buttonVariants,
} from "../../../design-system.ts";
import { resolveRequestUiLocale } from "../../../lib/ui-locale-core.ts";
import { getLocaleMessages, interpolateMessage } from "../../../locales/index.ts";
import { SignInModal } from "../../auth/sign-in-modal.tsx";
import { createSignInSession } from "../../auth/sign-in-session.ts";
import {
  HandleStorefrontProtocolError,
  createHandleStorefrontAttemptKeys,
  runFreeHandleClaim,
  type HandleStorefrontAttemptKeys,
  type HandleStorefrontProgress,
} from "./handle-storefront.flow.ts";
import {
  initialHandleLabel,
  initialSaleNamespaceActivationId,
  loadHandleStorefrontPublic,
  normalizeDesiredHandleLabel,
  projectPersonaChoices,
  projectSaleNamespaceChoices,
  selectHandleOffering,
  type HandleStorefrontPublicState,
  type HandleStorefrontPublicSuccess,
  type PersonaChoice,
  type SupportedHandleOffering,
} from "./handle-storefront.model.ts";

export interface HandleStorefrontProps {
  readonly pathSegment: string;
  readonly initialLabel?: string | null;
  readonly requestedOfferingId?: string | null;
  readonly publicClient?: PublicHandleSalesApiClient;
  readonly sessionClient?: SessionHandleSalesApiClient;
  /** Test seam; production reads the readable double-submit cookie. */
  readonly readCsrf?: () => string | undefined;
  readonly data?: HandleStorefrontPublicState | PromiseLike<HandleStorefrontPublicState>;
}

type PersonaSessionState =
  | Readonly<{ readonly kind: "loading" }>
  | Readonly<{ readonly kind: "anonymous" }>
  | Readonly<{ readonly kind: "error" }>
  | Readonly<{ readonly kind: "ready"; readonly personas: readonly PersonaChoice[] }>;

type ClaimUiState =
  | Readonly<{ readonly kind: "idle" }>
  | Readonly<{ readonly kind: "progress"; readonly progress: HandleStorefrontProgress }>
  | Readonly<{ readonly kind: "issued"; readonly identifier: string; readonly persona: string }>
  | Readonly<{ readonly kind: "pending" }>
  | Readonly<{ readonly kind: "error"; readonly message: string }>;

function currentUrl(): URL | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url);
  return typeof location === "undefined" ? undefined : new URL(location.href);
}

function requestOrigin(): string | undefined {
  return currentUrl()?.origin;
}

function namesCopy() {
  const event = getRequestEvent();
  if (event !== undefined) {
    return getLocaleMessages(
      resolveRequestUiLocale(new URL(event.request.url), event.request.headers.get("accept-language")),
      "routes",
    ).names;
  }
  if (typeof location === "undefined") return getLocaleMessages("en", "routes").names;
  return getLocaleMessages(
    resolveRequestUiLocale(
      new URL(location.href),
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
    "routes",
  ).names;
}

export function canonicalNamesUrl(state: HandleStorefrontPublicSuccess): string {
  const path = `${state.community.canonicalPath}/names`;
  try {
    return new URL(path, state.community.canonicalUrl).toString();
  } catch {
    return path;
  }
}

function isHnsServedOrigin(state: HandleStorefrontPublicSuccess): boolean {
  if (typeof location === "undefined" || state.community.routeFamily !== "hns") return false;
  return location.hostname === `app.${state.community.requestedPathSegment}`;
}

function LoadingState() {
  const copy = namesCopy();
  return <main aria-busy="true" aria-live="polite" data-handle-storefront-state="loading">
    <Type as="h1" variant="h2">{copy.loading}</Type>
    <p role="status">{copy.loading}</p>
  </main>;
}

function MessageState(props: { readonly state: HandleStorefrontPublicState }) {
  const copy = namesCopy();
  const state = untrack(() => props.state);
  const message = () => state.kind === "invalid"
    ? copy.invalid
    : state.kind === "not-found" ? copy.notFound : copy.error;
  return <main data-handle-storefront-state={state.kind}>
    <Title>{message()}</Title>
    <Type as="h1" variant="h2">{message()}</Type>
    <p role="alert">{message()}</p>
  </main>;
}

function offeringBand(offering: SupportedHandleOffering | undefined) {
  return offering?.label_scope.kind === "label_rule_v2"
    ? offering.label_scope.availability
    : undefined;
}

function blockedMessage(reason: string, copy: ReturnType<typeof namesCopy>): string {
  switch (reason) {
    case "handle_unavailable": return copy.handleUnavailable;
    case "account_grant_limit_reached": return copy.limitReached;
    case "public_linking_confirmation_required": return copy.linkRequired;
    case "offering_unavailable":
    case "offering_not_applicable":
    case "not_offered":
    case "sale_namespace_inactive":
    case "dns_delegation_required": return copy.offeringChanged;
    default: return copy.unavailable;
  }
}

function apiFailureMessage(error: unknown, copy: ReturnType<typeof namesCopy>): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return copy.sessionExpired;
    if (error.status === 429) return copy.rateLimited;
    const reason = error.details?.reason;
    if (typeof reason === "string") return blockedMessage(reason, copy);
  }
  return copy.unavailable;
}

function progressMessage(progress: HandleStorefrontProgress, copy: ReturnType<typeof namesCopy>): string {
  switch (progress) {
    case "confirming_link": return copy.progressConfirming;
    case "quoting": return copy.progressQuoting;
    case "reserving": return copy.progressReserving;
    case "claiming": return copy.progressClaiming;
    case "waiting_for_issuance": return copy.progressWaiting;
  }
}

function PersonaOption(props: {
  readonly persona: PersonaChoice;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
}) {
  return <label class="flex cursor-pointer items-center gap-3 rounded-xl border border-border-soft p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
    <input
      type="radio"
      name="handle-owner-persona"
      value={props.persona.personaId}
      checked={props.selected}
      disabled={props.disabled}
      onInput={props.onSelect}
    />
    <Avatar
      fallback={props.persona.displayName}
      size="sm"
      src={props.persona.avatarRef ?? undefined}
    />
    <span class="min-w-0">
      <span class="block truncate font-semibold">{props.persona.displayName}</span>
      <span class="block truncate text-sm text-muted-foreground">
        {props.persona.primaryPublicHandle ?? "No public handle"} · {props.persona.shortId}
      </span>
    </span>
  </label>;
}

function BuyerPanel(props: {
  readonly state: HandleStorefrontPublicSuccess;
  readonly initialLabel?: string | null;
  readonly requestedOfferingId?: string | null;
  readonly sessionClient?: SessionHandleSalesApiClient;
  readonly readCsrf?: () => string | undefined;
}) {
  const copy = namesCopy();
  const state = untrack(() => props.state);
  const initialLabelValue = untrack(() => props.initialLabel);
  const requestedOfferingId = untrack(() => props.requestedOfferingId);
  const readCsrf = untrack(() => props.readCsrf) ?? readHandleSalesCsrfCookie;
  const client = untrack(() => props.sessionClient)
    ?? createSessionHandleSalesClient({ origin: requestOrigin() });
  const [session, setSession] = createSignal<PersonaSessionState>({ kind: "loading" });
  const namespaceChoices = projectSaleNamespaceChoices(state.offerings);
  const [selectedActivationId, setSelectedActivationId] = createSignal<string | null>(
    initialSaleNamespaceActivationId(state.offerings, requestedOfferingId),
  );
  const [selectedPersonaId, setSelectedPersonaId] = createSignal<string | null>(null);
  const [label, setLabel] = createSignal(initialHandleLabel(
    state.offerings,
    initialLabelValue,
    requestedOfferingId,
  ));
  const [linkConfirmed, setLinkConfirmed] = createSignal(false);
  const [claimState, setClaimState] = createSignal<ClaimUiState>({ kind: "idle" });
  const [authOpen, setAuthOpen] = createSignal(false);
  const [hnsServed, setHnsServed] = createSignal(false);
  let sessionGeneration = 0;
  let activeAttempt: AbortController | undefined;
  let attemptSignature: string | undefined;
  let attemptKeys: HandleStorefrontAttemptKeys | undefined;

  const activeOffering = createMemo(() => selectHandleOffering(
    state.offerings,
    label(),
    selectedActivationId(),
  ));
  const selectedNamespace = createMemo(() => namespaceChoices.find(
    choice => choice.activationId === selectedActivationId(),
  ));
  const availableBand = createMemo(() => offeringBand(activeOffering())
    ?? offeringBand(state.offerings.find(offering =>
      offering.sale_namespace_activation_id === selectedActivationId()
      && offering.label_scope.kind === "label_rule_v2",
    )));
  const selectedPersona = createMemo(() => {
    const current = session();
    return current.kind === "ready"
      ? current.personas.find(persona => persona.personaId === selectedPersonaId())
      : undefined;
  });
  const normalizedLabel = createMemo(() => normalizeDesiredHandleLabel(label()));
  const identifier = createMemo(() => {
    const offering = activeOffering();
    const desired = normalizedLabel();
    return offering === undefined || desired === null
      ? undefined
      : `${desired}.${offering.display_root}`;
  });
  const busy = createMemo(() => claimState().kind === "progress");
  const canClaim = createMemo(() =>
    session().kind === "ready"
    && selectedPersona() !== undefined
    && activeOffering() !== undefined
    && normalizedLabel() !== null
    && linkConfirmed()
    && !busy(),
  );

  const loadPersonas = async () => {
    const generation = ++sessionGeneration;
    setSession({ kind: "loading" });
    try {
      const response = await client.get_personas(undefined);
      if (generation !== sessionGeneration) return;
      const personas = projectPersonaChoices(response);
      setSession({ kind: "ready", personas });
      if (!personas.some(persona => persona.personaId === selectedPersonaId())) {
        setSelectedPersonaId(null);
        setLinkConfirmed(false);
      }
    } catch (error: unknown) {
      if (generation !== sessionGeneration) return;
      setSession(error instanceof ApiClientError && error.status === 401
        ? { kind: "anonymous" }
        : { kind: "error" });
    }
  };

  const signInSession = createSignInSession({
    enabled: authOpen,
    onAuthenticated: () => {
      setAuthOpen(false);
      void loadPersonas();
    },
  });

  createEffect(
    () => isHnsServedOrigin(state),
    served => {
      void Promise.resolve().then(() => {
        setHnsServed(served);
        return served ? undefined : loadPersonas();
      });
    },
  );
  onCleanup(() => {
    sessionGeneration += 1;
    activeAttempt?.abort();
  });

  const selectPersona = (personaId: string) => {
    if (busy()) return;
    setSelectedPersonaId(personaId);
    setLinkConfirmed(false);
    setClaimState({ kind: "idle" });
  };

  const selectNamespace = (activationId: string) => {
    if (busy()) return;
    setSelectedActivationId(activationId === "" ? null : activationId);
    setLinkConfirmed(false);
    setClaimState({ kind: "idle" });
  };

  const claim = async () => {
    if (hnsServed()) {
      location.assign(canonicalNamesUrl(state));
      return;
    }
    const offering = activeOffering();
    const persona = selectedPersona();
    const desiredLabel = normalizedLabel();
    if (offering === undefined || persona === undefined || desiredLabel === null || !linkConfirmed()) {
      setClaimState({ kind: "error", message: copy.labelUnavailable });
      return;
    }
    const csrf = readCsrf();
    if (csrf === undefined) {
      setSession({ kind: "anonymous" });
      setClaimState({ kind: "error", message: copy.sessionExpired });
      return;
    }

    const signature = `${offering.offering_id}\u0000${persona.personaId}\u0000${desiredLabel}`;
    if (attemptKeys === undefined || attemptSignature !== signature) {
      attemptKeys = createHandleStorefrontAttemptKeys();
      attemptSignature = signature;
    }
    activeAttempt?.abort();
    const controller = new AbortController();
    activeAttempt = controller;
    try {
      const result = await runFreeHandleClaim({
        client,
        requestOptions: handleSalesMutationOptions(csrf, { signal: controller.signal }),
        communityId: state.community.communityId,
        offering,
        personaId: persona.personaId,
        desiredLabel,
        linkingConfirmed: true,
        keys: attemptKeys,
        onProgress: progress => setClaimState({ kind: "progress", progress }),
      });
      if (result.kind === "issued") {
        setClaimState({
          kind: "issued",
          identifier: result.grant.display_identifier,
          persona: persona.displayName,
        });
      } else if (result.kind === "pending") {
        setClaimState({ kind: "pending" });
      } else if (result.kind === "eligibility_required") {
        attemptKeys = undefined;
        setClaimState({ kind: "error", message: copy.eligibility });
      } else {
        attemptKeys = undefined;
        setClaimState({ kind: "error", message: blockedMessage(result.reason, copy) });
      }
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      const message = error instanceof HandleStorefrontProtocolError
        ? copy.unavailable
        : apiFailureMessage(error, copy);
      if (error instanceof ApiClientError && error.status === 401) {
        setSession({ kind: "anonymous" });
      }
      setClaimState({ kind: "error", message });
    } finally {
      if (activeAttempt === controller) activeAttempt = undefined;
    }
  };

  const readySession = createMemo(() => {
    const current = session();
    return current.kind === "ready" ? current : undefined;
  });
  const currentProgress = createMemo(() => {
    const current = claimState();
    return current.kind === "progress" ? current.progress : undefined;
  });
  const issuedClaim = createMemo(() => {
    const current = claimState();
    return current.kind === "issued" ? current : undefined;
  });
  const claimError = createMemo(() => {
    const current = claimState();
    return current.kind === "error" ? current : undefined;
  });
  const exactOfferedIdentifier = createMemo(() => {
    const offering = activeOffering();
    return offering?.label_scope.kind === "exact_label_v2"
      ? `${offering.label_scope.handle_label}.${offering.display_root}`
      : undefined;
  });

  return <>
    <Show when={hnsServed()}>
      <Card data-handle-storefront-canonical-only>
        <CardHeader>
          <CardTitle>{copy.continueCanonical}</CardTitle>
          <CardDescription>{copy.canonicalOnly}</CardDescription>
        </CardHeader>
        <CardContent>
          <a class={buttonVariants({ variant: "default" })} href={canonicalNamesUrl(state)}>
            {copy.continueCanonical}
          </a>
        </CardContent>
      </Card>
    </Show>

    <Show when={!hnsServed()}>
      <Show when={session().kind === "loading"}>
        <p aria-live="polite" role="status">{copy.personasLoading}</p>
      </Show>

      <Show when={session().kind === "anonymous"}>
        <Card data-handle-storefront-auth="anonymous">
          <CardHeader>
            <CardTitle>{copy.signInTitle}</CardTitle>
            <CardDescription>{copy.signInDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setAuthOpen(true)}>{copy.signIn}</Button>
          </CardContent>
        </Card>
      </Show>

      <Show when={session().kind === "error"}>
        <Card data-handle-storefront-auth="error">
          <CardHeader><CardTitle>{copy.personasError}</CardTitle></CardHeader>
          <CardContent><Button variant="outline" onClick={() => void loadPersonas()}>{copy.retry}</Button></CardContent>
        </Card>
      </Show>

      <Show when={readySession()}>
        {ready => <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{copy.personaHeading}</CardTitle>
                <CardDescription>{copy.personaDescription}</CardDescription>
              </CardHeader>
              <CardContent class="flex flex-col gap-3">
                <Show when={ready().personas.length > 0} fallback={<p role="status">{copy.noPersonas}</p>}>
                  <fieldset class="flex flex-col gap-3" disabled={busy()}>
                    <legend class="sr-only">{copy.personaHeading}</legend>
                    <For each={ready().personas}>{persona =>
                      <PersonaOption
                        persona={persona}
                        selected={selectedPersonaId() === persona.personaId}
                        disabled={busy()}
                        onSelect={() => selectPersona(persona.personaId)}
                      />
                    }</For>
                  </fieldset>
                </Show>
                <Button disabled variant="outline" class="w-full justify-start">
                  {copy.newPersona}
                </Button>
                <p class="text-sm text-muted-foreground">{copy.newPersonaUnavailable}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{selectedNamespace() === undefined
                      ? copy.headingMultiple
                      : interpolateMessage(copy.heading, { root: selectedNamespace()?.displayRoot ?? "" })}</CardTitle>
                    <CardDescription>{copy.intro}</CardDescription>
                  </div>
                  <span class="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary-text">{copy.free}</span>
                </div>
              </CardHeader>
              <CardContent class="flex flex-col gap-5">
                <Show when={namespaceChoices.length > 1}>
                  <div class="flex w-full flex-col gap-1.5">
                    <label class="text-base font-medium text-foreground" for="community-handle-namespace">
                      {copy.namespaceLabel}
                    </label>
                    <select
                      id="community-handle-namespace"
                      class="h-11 rounded-xl border border-input bg-background px-3 text-base text-foreground"
                      disabled={busy()}
                      value={selectedActivationId() ?? ""}
                      onChange={event => selectNamespace(event.currentTarget.value)}
                    >
                      <option value="">{copy.namespacePlaceholder}</option>
                      <For each={namespaceChoices}>{choice =>
                        <option value={choice.activationId}>.{choice.displayRoot}</option>
                      }</For>
                    </select>
                  </div>
                </Show>
                <div class="flex w-full flex-col gap-1.5">
                  <label class="text-base font-medium text-foreground" for="community-handle-label">
                    {copy.label}
                  </label>
                  <Input
                    id="community-handle-label"
                    autocomplete="off"
                    disabled={busy()}
                    inputmode="text"
                    maxlength={63}
                    onInput={event => {
                      if (!busy()) {
                        setLabel(event.currentTarget.value.toLowerCase());
                        setClaimState({ kind: "idle" });
                      }
                    }}
                    placeholder={copy.labelPlaceholder}
                    spellcheck={false}
                    value={label()}
                    aria-invalid={label() !== "" && activeOffering() === undefined ? "true" : undefined}
                  />
                  <Show when={exactOfferedIdentifier()}>
                    {exactIdentifier => <p class="text-base text-muted-foreground">{interpolateMessage(copy.labelExact, {
                      identifier: exactIdentifier(),
                    })}</p>}
                  </Show>
                  <Show when={availableBand()}>
                    {band => <p class="text-base text-muted-foreground">{interpolateMessage(copy.labelBand, {
                      min: band().min_label_length,
                      max: band().max_label_length,
                    })}</p>}
                  </Show>
                  <Show when={label() !== "" && activeOffering() === undefined}>
                    <p class="text-base text-destructive-text">{copy.labelUnavailable}</p>
                  </Show>
                </div>

                <label class="flex items-start gap-2 text-sm leading-5">
                  <input
                    type="checkbox"
                    class="mt-0.5 size-5 shrink-0 accent-primary"
                    checked={linkConfirmed()}
                    disabled={busy() || selectedPersonaId() === null}
                    onChange={event => {
                      setLinkConfirmed(event.currentTarget.checked);
                      setClaimState({ kind: "idle" });
                    }}
                  />
                  <span>{copy.linkingConfirmation}</span>
                </label>

                <Button
                  class="w-full"
                  disabled={!canClaim()}
                  loading={busy()}
                  onClick={() => void claim()}
                >
                  {busy()
                    ? progressMessage(currentProgress() ?? "confirming_link", copy)
                    : interpolateMessage(copy.claim, { identifier: identifier() ?? copy.label })}
                </Button>

                <Show when={issuedClaim()}>
                  {issued => <div role="status" class="rounded-xl bg-success/10 p-4" data-handle-claim-state="issued">
                      <p class="font-semibold">{copy.successTitle}</p>
                      <p>{interpolateMessage(copy.successDescription, {
                        identifier: issued().identifier,
                        persona: issued().persona,
                      })}</p>
                    </div>}
                </Show>
                <Show when={claimState().kind === "pending"}>
                  <div role="status" class="rounded-xl bg-muted p-4" data-handle-claim-state="pending">
                    <p class="font-semibold">{copy.pendingTitle}</p>
                    <p>{copy.pendingDescription}</p>
                    <Button class="mt-3" variant="outline" onClick={() => void claim()}>{copy.retry}</Button>
                  </div>
                </Show>
                <Show when={claimError()}>
                  {errorState => <p role="alert" class="text-destructive-text">{errorState().message}</p>}
                </Show>
              </CardContent>
            </Card>
          </div>}
      </Show>
    </Show>
    <SignInModal open={authOpen()} onOpenChange={setAuthOpen} session={signInSession} />
  </>;
}

function SuccessState(props: {
  readonly state: HandleStorefrontPublicSuccess;
  readonly initialLabel?: string | null;
  readonly requestedOfferingId?: string | null;
  readonly sessionClient?: SessionHandleSalesApiClient;
  readonly readCsrf?: () => string | undefined;
}) {
  const copy = namesCopy();
  const state = untrack(() => props.state);
  const initialLabel = untrack(() => props.initialLabel);
  const requestedOfferingId = untrack(() => props.requestedOfferingId);
  const sessionClient = untrack(() => props.sessionClient);
  const readCsrf = untrack(() => props.readCsrf);
  const canonicalUrl = canonicalNamesUrl(state);
  const title = interpolateMessage(copy.title, { name: state.community.community.displayName });
  const namespaces = projectSaleNamespaceChoices(state.offerings);
  const storefrontHeading = namespaces.length === 1
    ? interpolateMessage(copy.heading, { root: namespaces[0]?.displayRoot ?? "" })
    : copy.headingMultiple;
  return <main data-handle-storefront-state="success" class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8">
    <Title>{title}</Title>
    <Meta name="description" content={copy.intro} />
    <Meta property="og:title" content={title} />
    <Meta property="og:description" content={copy.intro} />
    <Meta property="og:url" content={canonicalUrl} />
    <Link rel="canonical" href={canonicalUrl} />
    <div>
      <a class="text-sm font-medium text-primary-text underline-offset-4 hover:underline" href={state.community.canonicalUrl}>
        {interpolateMessage(copy.backToCommunity, { name: state.community.community.displayName })}
      </a>
      <Type as="h1" variant="h1" class="mt-3">
        {storefrontHeading}
      </Type>
      <Type as="p" variant="body" class="mt-2 text-muted-foreground">{copy.intro}</Type>
    </div>
    <Show when={state.offerings.length > 0} fallback={
      <Card><CardContent class="p-6"><p role="status">{copy.noOfferings}</p></CardContent></Card>
    }>
      <BuyerPanel
        state={state}
        initialLabel={initialLabel}
        requestedOfferingId={requestedOfferingId}
        sessionClient={sessionClient}
        readCsrf={readCsrf}
      />
    </Show>
  </main>;
}

function StorefrontState(props: {
  readonly state: HandleStorefrontPublicState;
  readonly initialLabel?: string | null;
  readonly requestedOfferingId?: string | null;
  readonly sessionClient?: SessionHandleSalesApiClient;
  readonly readCsrf?: () => string | undefined;
}) {
  const success = () => props.state.kind === "success" ? props.state : undefined;
  return <Show when={success()} fallback={<MessageState state={props.state} />}>
    {state => <SuccessState
      state={state()}
      initialLabel={props.initialLabel}
      requestedOfferingId={props.requestedOfferingId}
      sessionClient={props.sessionClient}
      readCsrf={props.readCsrf}
    />}
  </Show>;
}

function StorefrontData(props: HandleStorefrontProps) {
  const origin = requestOrigin();
  const communityClient = createPublicCommunityRouteClient({ origin });
  const publicClient = untrack(() => props.publicClient)
    ?? createPublicHandleSalesClient({ origin });
  const state = createMemo(
    () => props.data ?? loadHandleStorefrontPublic(
      communityClient,
      publicClient,
      props.pathSegment,
      origin,
    ),
    { deferStream: true },
  );
  return <StorefrontState
    state={state()}
    initialLabel={props.initialLabel}
    requestedOfferingId={props.requestedOfferingId}
    sessionClient={props.sessionClient}
    readCsrf={props.readCsrf}
  />;
}

export default function HandleStorefront(props: HandleStorefrontProps) {
  return <Loading fallback={<LoadingState />}><StorefrontData {...props} /></Loading>;
}
