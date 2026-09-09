import {
  createPirateApiClient,
  type PirateApiClient,
  type PostCommunitiesCommunityIdHnsRootImportsResponse,
} from "@pirate/api-client";
import {
  createGeneratedApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../../api/client";
import type { ApiFetch } from "../../../api/proxy";
import type {
  CommunityNamespaceSettingsPort,
  HnsWalletResourceRecord,
  NamespaceAttachment,
  NamespaceLifecycle,
  NamespaceRecoveryReasonCode,
  NamespaceResourceRecord,
  NamespaceSettingsCommand,
  NamespaceSettingsSnapshot,
} from "./owner-settings-model";

type RootImportSnapshot = PostCommunitiesCommunityIdHnsRootImportsResponse;
type LifecycleBlock = NonNullable<RootImportSnapshot["lifecycle"]>;
type HnsApiResourceRecord = NonNullable<RootImportSnapshot["publish_plan"]>["replacement_records"][number];
type RootImportClient = Pick<
  PirateApiClient,
  | "post_communitiesCommunityIdHnsRootImports"
  | "get_communitiesCommunityIdHnsRootImports"
  | "get_communitiesCommunityIdHnsRootImportsSessionId"
  | "post_communitiesCommunityIdHnsRootImportsSessionIdPoll"
  | "post_communitiesCommunityIdHnsRootImportsSessionIdActivate"
>;

export interface HnsSessionLocator {
  clear: () => void;
  read: () => string | null;
  write: (sessionId: string) => void;
}

export interface CommunityNamespaceSettingsApiOptions {
  client?: RootImportClient;
  communityId: string;
  communityPath: string;
  fetchImpl?: ApiFetch;
  locator?: HnsSessionLocator;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
}

const SESSION_QUERY = "hns_import_session";

function browserSessionLocator(): HnsSessionLocator {
  return {
    read: () => {
      if (typeof location === "undefined") return null;
      const value = new URL(location.href).searchParams.get(SESSION_QUERY);
      return value !== null && value.length > 0 && value.length <= 256 ? value : null;
    },
    write: (sessionId) => {
      if (typeof location === "undefined" || typeof history === "undefined") return;
      const url = new URL(location.href);
      url.searchParams.set(SESSION_QUERY, sessionId);
      history.replaceState(history.state, "", url);
    },
    clear: () => {
      if (typeof location === "undefined" || typeof history === "undefined") return;
      const url = new URL(location.href);
      url.searchParams.delete(SESSION_QUERY);
      history.replaceState(history.state, "", url);
    },
  };
}

function validJson(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => validJson(entry, depth + 1));
  if (typeof value !== "object") return false;
  return Object.entries(value).every(([key, entry]) => key.length > 0 && validJson(entry, depth + 1));
}

function walletRecord(value: HnsApiResourceRecord): HnsWalletResourceRecord | undefined {
  const supportedRecord =
    (value.type === "NS" && typeof value.ns === "string")
    || (value.type === "TXT" && Array.isArray(value.txt) && value.txt.every((part) => typeof part === "string"))
    || (value.type === "DS"
      && Number.isInteger(value.keyTag)
      && Number.isInteger(value.algorithm)
      && Number.isInteger(value.digestType)
      && typeof value.digest === "string")
    || ((value.type === "GLUE4" || value.type === "GLUE6")
      && typeof value.ns === "string"
      && typeof value.address === "string")
    || ((value.type === "SYNTH4" || value.type === "SYNTH6") && typeof value.address === "string");
  // SAFETY: The generated-client record has been checked against Bob's closed record union and JSON limits.
  return supportedRecord && validJson(value)
    && new TextEncoder().encode(JSON.stringify(value)).byteLength <= 65_536
    ? structuredClone(value) as HnsWalletResourceRecord
    : undefined;
}

function recordDisplay(record: HnsApiResourceRecord): string {
  if (record.type === "NS" && typeof record.ns === "string") return record.ns;
  if (record.type === "TXT" && Array.isArray(record.txt) && record.txt.every((part) => typeof part === "string")) {
    return record.txt.join("");
  }
  if (
    record.type === "DS" && typeof record.keyTag === "number" && typeof record.algorithm === "number"
    && typeof record.digestType === "number" && typeof record.digest === "string"
  ) {
    return `${record.keyTag} ${record.algorithm} ${record.digestType} ${record.digest}`;
  }
  return JSON.stringify(record);
}

function resourceRecords(records: ReadonlyArray<HnsApiResourceRecord>): ReadonlyArray<NamespaceResourceRecord> {
  return records.map((record) => {
    const wallet = walletRecord(record);
    return {
      record_type: typeof record.type === "string" ? record.type : "UNKNOWN",
      supported: wallet !== undefined,
      value: recordDisplay(record),
      ...(wallet === undefined ? {} : { wallet_record: wallet }),
    };
  });
}

function chooseSnapshot(communityId: string): NamespaceSettingsSnapshot {
  return {
    community_id: communityId,
    family: null,
    generation: 1,
    next_action: { kind: "choose_namespace" },
    root_label: "",
  };
}

function lifecycleProjection(response: RootImportSnapshot): NamespaceLifecycle | null {
  const block: LifecycleBlock | null | undefined = response.lifecycle;
  if (block === null || block === undefined) return null;
  return {
    deadline: block.deadline === null ? null : { at: block.deadline.at, kind: block.deadline.kind },
    next_check_at: block.next_check_at,
    observation: block.observation === null ? null : { ...block.observation },
    pending_reason: block.pending_reason,
    permitted_actions: [...block.permitted_actions],
    phase: block.phase,
    retry_hint_seconds: block.retry_hint_seconds,
    server_time: block.server_time,
  };
}

/**
 * Exact record differences for a publication mismatch, derived only from the
 * two server-provided lists in the same response: the planned complete
 * resource and the records the server last read on the name. Missing is what
 * the plan requires but the name did not hold; unexpected is what the name
 * held but the plan replaces. No chain state is inferred locally.
 */
function publicationDifferences(plan: NonNullable<RootImportSnapshot["publish_plan"]>) {
  const key = (record: HnsApiResourceRecord) => JSON.stringify(record);
  const current = new Set(plan.current_records.map(key));
  const planned = new Set(plan.replacement_records.map(key));
  return {
    missing: resourceRecords(plan.replacement_records.filter((record) => !current.has(key(record)))),
    unexpected: resourceRecords(plan.current_records.filter((record) => !planned.has(key(record)))),
  };
}

function recoveryReason(pendingReason: string | null): NamespaceRecoveryReasonCode {
  if (pendingReason === "publication_deadline_reached") return "publication_deadline_reached";
  if (pendingReason === "finality_deadline_reached") return "finality_deadline_reached";
  if (pendingReason === "superseded") return "superseded";
  return "other";
}

function mapSnapshot(
  response: RootImportSnapshot,
  communityPath: string,
  attachment: NamespaceAttachment | null = null,
): NamespaceSettingsSnapshot {
  const lifecycle = lifecycleProjection(response);
  const common = {
    attachment,
    community_id: response.community_id,
    expires_at: response.expires_at,
    family: "hns" as const,
    generation: response.revision,
    lifecycle,
    root_label: response.root_label,
  };
  // The signature ceremony precedes lifecycle admission and carries the
  // proof message; it is projected from the coarse status in both shapes.
  if (response.status === "awaiting_ownership") {
    return { ...common, next_action: {
      kind: "sign_ownership",
      expires_at: response.provisioning_authorization.expires_at,
      message: response.provisioning_authorization.message,
      root_label: response.root_label,
    } };
  }
  // With the lifecycle block present, the server's phase is the authority
  // for progress, recovery, and terminal state (spec 012, 2026-09-09).
  if (lifecycle !== null) {
    const retryAfter = lifecycle.retry_hint_seconds ?? response.retry_after_seconds ?? 2;
    if (lifecycle.phase === "preparing") {
      return { ...common, next_action: { kind: "wait", reason_code: "preparation_pending", retry_after_seconds: retryAfter } };
    }
    if (lifecycle.phase === "awaiting_publication" || lifecycle.phase === "checking_publication") {
      const plan = response.publish_plan;
      if (lifecycle.phase === "checking_publication" && lifecycle.pending_reason === "resource_mismatch_hold") {
        const differences = plan === null ? { missing: [], unexpected: [] } : publicationDifferences(plan);
        return { ...common, next_action: {
          kind: "repair",
          reason_code: "resource_mismatch",
          ...(differences.missing.length > 0 ? { missing_records: differences.missing } : {}),
          ...(differences.unexpected.length > 0 ? { unexpected_records: differences.unexpected } : {}),
        } };
      }
      const pending = lifecycle.phase === "checking_publication";
      if (plan === null) {
        // The phase says a plan was exposed and this response does not carry
        // it. The client cannot show an owner which records to publish, and
        // must not invent a list; it waits for a response that has one.
        return { ...common, next_action: {
          kind: "wait", reason_code: "preparation_pending", retry_after_seconds: retryAfter,
        } };
      }
      return { ...common, next_action: {
        kind: "publish_resource",
        acknowledgement_required: true,
        replacement_semantics: "complete_resource",
        records: resourceRecords(plan.replacement_records),
        preserved_records: resourceRecords(plan.preserved_records ?? []),
        added_records: resourceRecords(plan.added_records ?? []),
        removed_records: resourceRecords(plan.removed_conflicts ?? []),
        preserved_unknown_record_types: [...(plan.preserved_unknown_record_types ?? [])],
        ...(pending ? { check_pending: true, retry_after_seconds: retryAfter } : {}),
      } };
    }
    if (lifecycle.phase === "waiting_safe_commitment") {
      return { ...common, next_action: { kind: "wait", reason_code: "tree_commitment_pending", retry_after_seconds: retryAfter } };
    }
    if (lifecycle.phase === "checking_authority") {
      return { ...common, next_action: { kind: "wait", reason_code: "delegation_insecure", retry_after_seconds: retryAfter } };
    }
    if (lifecycle.phase === "ready") {
      // Activation carries both digests to the server. Without them there is
      // nothing to activate against, so the action is not offered at all
      // rather than offered with values the client would have to make up.
      const planHash = response.publish_plan_sha256;
      const readinessHash = response.readiness_result_sha256;
      if (planHash === null || readinessHash === null) {
        return { ...common, next_action: {
          kind: "wait", reason_code: "delegation_insecure", retry_after_seconds: retryAfter,
        } };
      }
      return { ...common, next_action: {
        kind: "ready_to_activate",
        app_host: `app.${response.root_label}`,
        publish_plan_sha256: planHash,
        readiness_result_sha256: readinessHash,
      } };
    }
    if (lifecycle.phase === "activated") {
      return { ...common, next_action: verifiedAction(response, communityPath) };
    }
    if (lifecycle.phase === "recovery_required") {
      return { ...common, next_action: {
        kind: "recovery_required",
        deadline_kind: lifecycle.deadline === null ? null : lifecycle.deadline.kind,
        reason_code: recoveryReason(lifecycle.pending_reason),
        server_reason: lifecycle.pending_reason,
      } };
    }
    return { ...common, next_action: {
      kind: "failed",
      reason_code:
        lifecycle.pending_reason !== null && lifecycle.pending_reason.startsWith("operational_failure_budget_exhausted")
          ? "provider_unavailable"
          : "root_import_failed",
      retryable: true,
    } };
  }
  // Degraded shape — the deployed API without the lifecycle block. The
  // coarse states keep rendering exactly as before; expiry and every other
  // terminal decision still comes from the server's status, never from a
  // local clock.
  if (response.status === "provisioning") {
    return { ...common, next_action: {
      kind: "wait", reason_code: "preparation_pending", retry_after_seconds: response.retry_after_seconds,
    } };
  }
  if (response.status === "awaiting_owner_update" || response.status === "observing") {
    const pending = response.status === "observing" || response.publication_check_pending === true;
    const plan = response.publish_plan;
    return { ...common, next_action: {
      kind: "publish_resource",
      acknowledgement_required: true,
      replacement_semantics: "complete_resource",
      records: resourceRecords(plan.replacement_records),
      preserved_records: resourceRecords(plan.preserved_records ?? []),
      added_records: resourceRecords(plan.added_records ?? []),
      removed_records: resourceRecords(plan.removed_conflicts ?? []),
      preserved_unknown_record_types: [...(plan.preserved_unknown_record_types ?? [])],
      ...(pending ? { check_pending: true, retry_after_seconds: response.retry_after_seconds } : {}),
    } };
  }
  if (response.status === "ready") {
    return { ...common, next_action: {
      kind: "ready_to_activate",
      app_host: `app.${response.root_label}`,
      publish_plan_sha256: response.publish_plan_sha256,
      readiness_result_sha256: response.readiness_result_sha256,
    } };
  }
  if (response.status === "activated") {
    return { ...common, next_action: verifiedAction(response, communityPath) };
  }
  if (response.status === "expired") return { ...common, next_action: { kind: "expired" } };
  return {
    ...common,
    next_action: {
      kind: "failed",
      reason_code:
        response.status === "failed"
          ? (response.failure_reason ?? "root_import_failed")
          : "root_import_failed",
      retryable: true,
    },
  };
}

function verifiedAction(response: RootImportSnapshot, communityPath: string) {
  return {
    kind: "verified" as const,
    canonical_route: `https://app.${response.root_label}/`,
    canonical_route_label: `app.${response.root_label}`,
    fallback_route: communityPath,
    fallback_route_label: `pirate.sc${communityPath}`,
  };
}

export class CommunityNamespaceSettingsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunityNamespaceSettingsApiError";
  }
}

export function createCommunityNamespaceSettingsApi(
  options: CommunityNamespaceSettingsApiOptions,
): CommunityNamespaceSettingsPort {
  let generatedClient = options.client;
  const client = (): RootImportClient => {
    generatedClient ??= createGeneratedApiClient(
      createPirateApiClient,
      { fetchImpl: options.fetchImpl, origin: options.origin },
      { credentials: "same-origin" },
    );
    return generatedClient;
  };
  const locator = options.locator ?? browserSessionLocator();
  const csrfToken = options.readCsrfToken ?? readCsrfCookie;
  let current = chooseSnapshot(options.communityId);
  let attachment: NamespaceAttachment | null = null;
  let currentSessionId: string | null = null;

  const acceptSession = (response: RootImportSnapshot): NamespaceSettingsSnapshot => {
    const mapped = mapSnapshot(response, options.communityPath, attachment);
    if (mapped.next_action.kind === "expired") {
      locator.clear();
      currentSessionId = null;
      current = { ...chooseSnapshot(options.communityId), attachment };
      return current;
    }
    currentSessionId = response.root_import_session_id;
    locator.write(response.root_import_session_id);
    current = mapped;
    return current;
  };

  const writeOptions = () => {
    const token = csrfToken();
    if (token === undefined) throw new CommunityNamespaceSettingsApiError("Refresh the page before changing the community address.");
    return sessionRequestOptions(token);
  };
  const load = async (sessionId: string): Promise<NamespaceSettingsSnapshot> => {
    const response = await client().get_communitiesCommunityIdHnsRootImportsSessionId({
      path: { communityId: options.communityId, sessionId },
    }, { credentials: "same-origin" });
    if (response.community_id !== options.communityId || response.root_import_session_id !== sessionId) {
      throw new CommunityNamespaceSettingsApiError("The HNS verification response did not match this community.");
    }
    return acceptSession(response);
  };

  return {
    read: async () => {
      const sessionId = currentSessionId ?? locator.read();
      if (sessionId !== null) return load(sessionId);
      const response = await client().get_communitiesCommunityIdHnsRootImports({
        path: { communityId: options.communityId },
      }, { credentials: "same-origin" });
      if (response.community_id !== options.communityId
        || (response.session !== null && response.session.community_id !== options.communityId)) {
        throw new CommunityNamespaceSettingsApiError("The HNS verification response did not match this community.");
      }
      attachment = response.attachment === null ? null : {
        root_label: response.attachment.canonical_route.root_label_display,
        status: response.attachment.status,
      };
      currentSessionId = response.session?.root_import_session_id ?? null;
      if (response.session !== null) {
        current = acceptSession(response.session);
      } else {
        current = { ...chooseSnapshot(options.communityId), attachment,
          next_action: { kind: "choose_namespace", no_account_import: true } };
      }
      return current;
    },
    execute: async (command: NamespaceSettingsCommand) => {
      if (command.kind === "poll") {
        const sessionId = currentSessionId ?? locator.read();
        if (sessionId === null) throw new CommunityNamespaceSettingsApiError("The HNS verification session is missing.");
        return load(sessionId);
      }

      if (command.expected_generation !== current.generation) {
        throw new CommunityNamespaceSettingsApiError("The community address changed. Refresh and try again.");
      }
      if (command.kind === "change_namespace") {
        locator.clear();
        currentSessionId = null;
        current = { ...chooseSnapshot(options.communityId), attachment };
        return current;
      }
      if (command.kind === "select_namespace") {
        current = {
          attachment,
          community_id: options.communityId,
          family: "hns",
          generation: current.generation + 1,
          root_label: command.root_label.trim().toLowerCase(),
          next_action: { kind: "start_verification", family: "hns", root_label: command.root_label.trim().toLowerCase() },
        };
        return current;
      }
      // Restart is a real new attempt. Retain the expired snapshot and locator
      // until admission succeeds so failed authentication never loses recovery.
      if (command.kind === "restart" || command.kind === "start_verification") {
        const response = await client().post_communitiesCommunityIdHnsRootImports({
          path: { communityId: options.communityId },
          body: { root_label: current.root_label, idempotency_key: command.idempotency_key },
        }, writeOptions());
        if (response.community_id !== options.communityId) {
          throw new CommunityNamespaceSettingsApiError("The HNS verification response did not match this community.");
        }
        currentSessionId = response.root_import_session_id;
        locator.write(response.root_import_session_id);
        current = mapSnapshot(response, options.communityPath, attachment);
        return current;
      }
      const sessionId = currentSessionId ?? locator.read();
      if (sessionId === null) throw new CommunityNamespaceSettingsApiError("The HNS verification session is missing.");
      if (command.kind === "activate") {
        const response = await client().post_communitiesCommunityIdHnsRootImportsSessionIdActivate({
          path: { communityId: options.communityId, sessionId },
          body: {
            expected_revision: command.expected_generation,
            idempotency_key: command.idempotency_key,
            publish_plan_sha256: command.publish_plan_sha256,
            readiness_result_sha256: command.readiness_result_sha256,
            acknowledged_complete_resource_replacement: true,
          },
        }, writeOptions());
        current = mapSnapshot({
          community_id: response.community_id,
          attachment_intent_id: response.attachment_intent_id,
          root_import_session_id: response.root_import_session_id,
          root_label: response.root_label,
          revision: response.revision,
          expires_at: new Date().toISOString(),
          replayed: response.replayed,
          status: "activated",
          publish_plan: null,
          publish_plan_sha256: null,
          readiness_result_sha256: null,
          retry_after_seconds: null,
        }, options.communityPath, attachment);
        return current;
      }
      if (command.kind === "acknowledge_complete_resource") {
        await load(sessionId);
        if (current.next_action.kind !== "publish_resource" || current.next_action.check_pending) return current;
      }
      const response = await client().post_communitiesCommunityIdHnsRootImportsSessionIdPoll({
        path: { communityId: options.communityId, sessionId },
        body: {
          expected_revision: command.kind === "acknowledge_complete_resource" ? current.generation : command.expected_generation,
          idempotency_key: command.idempotency_key,
          ...(command.kind === "submit_name_signature"
            ? { provisioning_name_signature: command.signature }
            : {}),
        },
      }, writeOptions());
      current = mapSnapshot(response, options.communityPath, attachment);
      return current;
    },
  };
}
