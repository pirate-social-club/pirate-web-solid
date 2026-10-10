import { createEffect, createSignal, onCleanup } from "solid-js";
import { ApiClientError, type GetPersonasPersonaIdHandleGrantsResponse } from "@pirate/api-client";
import { createPublicHandleSalesClient, createSessionHandleSalesClient, handleSalesMutationOptions, readHandleSalesCsrfCookie, type PublicHandleSalesApiClient, type PublicHandleGrantApiClient, type SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import { resolveSession, refreshSession, sessionPersonasUnavailable, type AuthenticatedSession } from "../../../api/session.ts";
import { toast } from "../../../design-system.ts";
import { usePageUiLocale, type UiLocaleCode } from "../../../lib/ui-locale.tsx";
import { getLocaleMessages } from "../../../locales/index.ts";
import { communityOperationPersonas } from "../../identity/community-persona-choice.ts";
import { createCommunityProfileAttempt } from "../../identity/community-profile-attempt.ts";
import { isSupportedHandleOffering, normalizeDesiredHandleLabel, offeringAppliesToLabel, type SupportedHnsOffering } from "../handle-storefront/handle-storefront.model.ts";
import { communityNameStorageKey, createCommunityNameAttempt, readCommunityNameAttempt, saveCommunityNameAttempt, runCommunityNameAcquisition, type CommunityNameAttempt } from "./community-name-acquisition.ts";
import type { CommunityJoinNameState } from "./community-join-name.tsx";
import type { RunFreeHandleClaimInput } from "../handle-storefront/handle-storefront.flow.ts";

/** The mounted community owns UI only; server reads own account, profile and issuance. */
export interface CommunityNameControllerOptions {
  readonly communityId: string;
  readonly root?: string;
  readonly publicClient: PublicHandleSalesApiClient;
  readonly accountId: () => string | null | undefined;
  readonly joined: () => boolean;
  readonly preferredPersonaId: () => string | undefined;
  readonly resolve?: typeof resolveSession;
  readonly grantClient?: PublicHandleGrantApiClient;
  readonly claimClient?: SessionHandleSalesApiClient;
  readonly prepare?: ReturnType<typeof createCommunityProfileAttempt>;
  readonly csrf?: typeof readHandleSalesCsrfCookie;
  readonly refresh?: typeof refreshSession;
  readonly claimPolling?: Pick<RunFreeHandleClaimInput, "maxPolls" | "sleep">;
  readonly locale?: UiLocaleCode;
}
export type CommunityNameClients = Pick<CommunityNameControllerOptions, "claimClient" | "grantClient" | "csrf" | "claimPolling">;

export function createCommunityNameController(options: CommunityNameControllerOptions) {
  const copy = getLocaleMessages(options.locale ?? usePageUiLocale(), "routes").communityJoinName;
  const [offering, setOffering] = createSignal<SupportedHnsOffering>();
  const [open, setOpen] = createSignal(false);
  const [recoverable, setRecoverable] = createSignal(false);
  const [state, setState] = createSignal<CommunityJoinNameState>({ kind: "editing", label: "" });
  const prepare = options.prepare ?? createCommunityProfileAttempt();
  const grantClient = () => options.grantClient ?? createPublicHandleSalesClient();
  let request: AbortController | undefined;
  let active = true;
  let busy = false;
  let owner: string | null | undefined;
  const ownSession = async (signal: AbortSignal): Promise<AuthenticatedSession> => {
    const accountId = options.accountId();
    if (typeof accountId !== "string" || !options.joined()) throw new Error("membership_required");
    const session = await (options.resolve ?? resolveSession)();
    signal.throwIfAborted();
    if (session === "anonymous" || session.userId !== accountId || options.accountId() !== accountId || sessionPersonasUnavailable(session)) throw new Error("identity_unavailable");
    return session;
  };
  const loadOffering = async (signal: AbortSignal) => {
    const supported: SupportedHnsOffering[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 100; page += 1) {
      const response = await options.publicClient.get_communitiesCommunityIdHandleOfferings({ path: { communityId: options.communityId }, query: { limit: "100", ...(cursor === undefined ? {} : { cursor }) } }, { signal });
      signal.throwIfAborted();
      for (const item of response.items) if (isSupportedHandleOffering(item) && item.family === "hns" && item.fulfillment.kind === "hosted_persona_v1"
        && item.community_id === options.communityId && item.namespace_root === options.root && item.label_scope.kind === "label_rule_v2" && item.qualification_policy.kind === "none_v1") supported.push(item);
      if (response.next_cursor === null) {
        if (supported.length !== 1) throw new Error("name_offering_unavailable");
        return supported[0]!;
      }
      if (!response.next_cursor || seen.has(response.next_cursor)) throw new Error("offering_pagination_invalid");
      seen.add(response.next_cursor); cursor = response.next_cursor;
    }
    throw new Error("offering_pagination_exceeded");
  };
  // Public discovery is read-only. No modal, preparation or consent on load.
  const publicRequest = new AbortController();
  if (typeof window !== "undefined" && options.root !== undefined) void loadOffering(publicRequest.signal).then(next => { if (active) setOffering(next); }).catch(() => undefined);
  createEffect(() => options.accountId(), next => {
    queueMicrotask(() => {
      if (!active || next === undefined || next === owner) return;
      request?.abort(); busy = false; setOpen(false); setState({ kind: "editing", label: "" });
      try { setRecoverable(typeof next === "string" && readCommunityNameAttempt(sessionStorage, next, options.communityId) !== undefined); }
      catch { setRecoverable(false); }
      // Retain correlation keys under their original account. Another account
      // cannot access them, and signing back in can recover an uncertain write.
      owner = next;
    });
  });
  onCleanup(() => { active = false; request?.abort(); publicRequest.abort(); });

  const start = () => { request?.abort(); request = new AbortController(); return request.signal; };
  const findIssued = async (session: AuthenticatedSession, currentOffering: SupportedHnsOffering, signal: AbortSignal) => {
    const matches: GetPersonasPersonaIdHandleGrantsResponse["items"][number][] = [];
    for (const profile of communityOperationPersonas(session.personas, options.communityId)) {
      let cursor: string | undefined;
      const seen = new Set<string>();
      for (let page = 0; page < 100; page += 1) {
        const grants = await grantClient().get_personasPersonaIdHandleGrants({ path: { personaId: profile.personaId }, query: { limit: "100", ...(cursor === undefined ? {} : { cursor }) } }, { signal });
        signal.throwIfAborted();
        for (const grant of grants.items) if (grant.community_id === options.communityId && grant.owner_persona.persona_id === profile.personaId
          && grant.handle.family === "hns" && grant.handle.namespace_root === currentOffering.namespace_root
          && grant.sale_namespace_activation_id === currentOffering.sale_namespace_activation_id && grant.sale_namespace_activation_generation === currentOffering.sale_namespace_activation_generation
          && grant.fulfillment.kind === "hosted_persona_v1") matches.push(grant);
        if (grants.next_cursor === null) break;
        if (!grants.next_cursor || seen.has(grants.next_cursor) || page === 99) throw new Error("grant_pagination_invalid");
        seen.add(grants.next_cursor); cursor = grants.next_cursor;
      }
    }
    if (matches.length > 1) throw new Error("multiple_community_names");
    const grant = matches[0];
    if (grant === undefined) return undefined;
    const intent = createCommunityNameAttempt({ accountId: session.userId, communityId: options.communityId, personaId: grant.owner_persona.persona_id, label: grant.handle.handle_label, offering: currentOffering });
    await verifyHost(intent, signal, grantClient(), grant);
    return grant;
  };
  const show = async () => {
    if (busy || !options.joined() || options.root === undefined) return;
    busy = true;
    const signal = start();
    try {
      const session = await ownSession(signal);
      const attempt = readCommunityNameAttempt(sessionStorage, session.userId, options.communityId);
      if (attempt !== undefined) {
        // Old offering revisions cannot transfer intent. Their submitted claim
        // can still be checked after an offer is changed or withdrawn.
        if (!communityOperationPersonas(session.personas, options.communityId).some(profile => profile.personaId === attempt.personaId)) throw new Error("saved_profile_unavailable");
        if (attempt.offering.namespace_root !== options.root) throw new Error("saved_namespace_changed");
        setOffering(attempt.offering); setRecoverable(true);
        setState({ kind: "pending", label: attempt.label, claimId: attempt.claim?.claim.claim_id ?? "", unconfirmed: attempt.claim?.claim.state !== "issuance_pending" });
      } else {
        const currentOffering = await loadOffering(signal);
        setOffering(currentOffering);
        const issued = await findIssued(session, currentOffering, signal);
        await ownSession(signal);
        setState(issued === undefined ? { kind: "editing", label: "" } : { kind: "issued", label: issued.handle.handle_label, identifier: issued.display_identifier });
      }
      setOpen(true);
    } catch { if (!signal.aborted) toast.error(copy.loadFailed); }
    finally { if (request?.signal === signal) busy = false; }
  };

  const submit = async (resume = false) => {
    if (busy || !options.joined()) return;
    const current = state();
    const label = normalizeDesiredHandleLabel(current.label);
    const initialOffering = offering();
    if (label === null || initialOffering === undefined || !offeringAppliesToLabel(initialOffering, label)) return;
    busy = true;
    const signal = start();
    setState({ kind: "submitting", stage: "profile", label });
    try {
      const session = await ownSession(signal);
      let attempt = readCommunityNameAttempt(sessionStorage, session.userId, options.communityId);
      if (resume && attempt === undefined) throw new Error("name_attempt_unavailable");
      // A known reservation/claim stays bound to its original commands and
      // keys. A fresh offering is needed only before reaching that milestone.
      const currentOffering = attempt?.reservation !== undefined ? attempt.offering : await loadOffering(signal);
      if (!sameOffering(initialOffering, currentOffering)) {
        if (attempt?.reservation === undefined && attempt?.claim === undefined) {
          sessionStorage.removeItem(communityNameStorageKey(session.userId, options.communityId)); setRecoverable(false);
          setOffering(currentOffering); setState({ kind: "editing", label });
          toast.error(copy.offerChanged); return;
        }
        throw new Error("offering_changed");
      }
      if (attempt === undefined) {
        const issued = await findIssued(session, currentOffering, signal);
        await ownSession(signal);
        if (issued !== undefined) { setState({ kind: "issued", label: issued.handle.handle_label, identifier: issued.display_identifier }); return; }
        const profile = await prepare({ session, communityId: options.communityId, preferredPersonaId: options.preferredPersonaId(), signal });
        await ownSession(signal);
        attempt = createCommunityNameAttempt({ accountId: session.userId, communityId: options.communityId, personaId: profile.personaId, offering: currentOffering, label });
      } else {
        const savedPersonaId = attempt.personaId;
        if (attempt.label !== label || !sameOffering(attempt.offering, currentOffering)
          || attempt.offering.namespace_root !== options.root
          || !communityOperationPersonas(session.personas, options.communityId).some(profile => profile.personaId === savedPersonaId)) throw new Error("name_attempt_changed");
      }
      const token = (options.csrf ?? readHandleSalesCsrfCookie)();
      const readOnlyClaim = attempt.claim !== undefined && attempt.confirmation !== undefined && attempt.quote !== undefined && attempt.reservation !== undefined;
      if (!readOnlyClaim && token === undefined) throw new Error("csrf_required");
      setState({ kind: "submitting", stage: "issuing", label });
      const result = await runCommunityNameAcquisition({ client: options.claimClient ?? createSessionHandleSalesClient(), attempt,
        requestOptions: readOnlyClaim ? { credentials: "same-origin", signal } : handleSalesMutationOptions(token!, { signal }), ...options.claimPolling,
        save: value => { signal.throwIfAborted(); saveCommunityNameAttempt(sessionStorage, value); setRecoverable(true); } });
      await ownSession(signal);
      if (result.kind === "issued") {
        await verifyHost(attempt, signal, grantClient(), result.grant);
        setState({ kind: "issued", label, identifier: result.grant.display_identifier });
        (options.refresh ?? refreshSession)();
      } else if (result.kind === "pending") setState({ kind: "pending", label, claimId: result.claim.claim_id });
      else if (result.kind === "blocked" && result.claim.state === "blocked" && result.reason === "handle_unavailable") {
        sessionStorage.removeItem(communityNameStorageKey(session.userId, options.communityId));
        setRecoverable(false);
        setState({ kind: "editing", label, issue: "taken" });
      } else setState({ kind: "failed", label, joined: true });
    } catch (error) {
      if (!signal.aborted) {
        const reason = error instanceof ApiClientError ? error.details?.reason : undefined;
        const accountId = options.accountId();
        let retained: CommunityNameAttempt | undefined;
        try { if (typeof accountId === "string") retained = readCommunityNameAttempt(sessionStorage, accountId, options.communityId); } catch { /* An unreadable attempt cannot prove an outcome. */ }
        if ((reason === "handle_unavailable" || reason === "invalid_handle") && retained?.reservation === undefined && retained?.claim === undefined) {
          // A definitive pre-claim label refusal is safe to replace on a later explicit submission.
          if (typeof accountId === "string") {
            sessionStorage.removeItem(communityNameStorageKey(accountId, options.communityId));
            setRecoverable(false);
          }
          setState({ kind: "editing", label, issue: reason === "handle_unavailable" ? "taken" : "invalid" });
        } else if (typeof accountId === "string" && retained?.claim === undefined
          && (((reason === "quote_expired" || reason === "public_linking_confirmation_required") && retained?.reservation === undefined)
            || reason === "reservation_expired")) {
          // No claim command can run before the reservation is durably saved.
          // Claim replay precedes reservation expiry checks on the server.
          // A new explicit Get name press supplies fresh consent after expiry.
          sessionStorage.removeItem(communityNameStorageKey(accountId, options.communityId)); setRecoverable(false);
          setState({ kind: "editing", label }); toast.error(copy.requestExpired);
        } else {
          setState(retained === undefined ? { kind: "failed", label, joined: true } : { kind: "pending", label: retained.label, claimId: retained.claim?.claim.claim_id ?? "", unconfirmed: true });
          if (error instanceof ApiClientError && error.status === 401) toast.error(copy.signInRetry);
        }
      }
    } finally { if (request?.signal === signal) busy = false; }
  };

  return { offering, state, open, available: () => options.root !== undefined && (offering() !== undefined || recoverable()) && options.joined() && typeof options.accountId() === "string",
    show, submit: () => submit(), resume: () => submit(true), setOpen: (next: boolean) => setOpen(next),
    setLabel: (label: string) => { if (!busy && state().kind !== "pending" && state().kind !== "issued") setState({ kind: "editing", label }); } };
}

function sameOffering(left: SupportedHnsOffering, right: SupportedHnsOffering) {
  return left.offering_id === right.offering_id && left.offering_revision === right.offering_revision && left.offering_hash === right.offering_hash
    && left.sale_namespace_activation_id === right.sale_namespace_activation_id && left.sale_namespace_activation_generation === right.sale_namespace_activation_generation
    && left.namespace_root === right.namespace_root && left.display_root === right.display_root;
}

async function verifyHost(attempt: CommunityNameAttempt, signal: AbortSignal, client: Pick<PublicHandleGrantApiClient, "get_handlesFamilyNamespaceRootHandleLabel">, expected: { readonly grant_id: string; readonly grant_generation: number }) {
  const response = await client.get_handlesFamilyNamespaceRootHandleLabel({ path: { family: "hns", namespaceRoot: attempt.offering.namespace_root, handleLabel: attempt.label } }, { signal });
  signal.throwIfAborted();
  if (response.grant_id !== expected.grant_id || response.grant_generation !== expected.grant_generation
    || response.community_id !== attempt.communityId || response.owner_persona.persona_id !== attempt.personaId
    || response.sale_namespace_activation_id !== attempt.offering.sale_namespace_activation_id
    || response.sale_namespace_activation_generation !== attempt.offering.sale_namespace_activation_generation
    || response.handle.family !== "hns" || response.handle.namespace_root !== attempt.offering.namespace_root || response.handle.handle_label !== attempt.label
    || response.fulfillment.kind !== "hosted_persona_v1" || response.display_identifier !== `${attempt.label}.${attempt.offering.display_root}`
    || response.host.kind !== "available" || response.host.normalized_host !== `${attempt.label}.${attempt.offering.namespace_root}`
    || response.host.grant_generation !== response.grant_generation || response.host.sale_namespace_activation_generation !== response.sale_namespace_activation_generation) throw new Error("issued_host_unavailable");
}
