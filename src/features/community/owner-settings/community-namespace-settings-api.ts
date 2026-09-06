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
  NamespaceResourceRecord,
  NamespaceSettingsCommand,
  NamespaceSettingsSnapshot,
} from "./owner-settings-model";

type RootImportSnapshot = PostCommunitiesCommunityIdHnsRootImportsResponse;
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

function mapSnapshot(
  response: RootImportSnapshot,
  communityPath: string,
  attachment: NamespaceAttachment | null = null,
): NamespaceSettingsSnapshot {
  const common = {
    attachment,
    community_id: response.community_id,
    family: "hns" as const,
    generation: response.revision,
    root_label: response.root_label,
  };
  if (response.status === "awaiting_ownership") {
    return { ...common, next_action: {
      kind: "sign_ownership",
      expires_at: response.provisioning_authorization.expires_at,
      message: response.provisioning_authorization.message,
      root_label: response.root_label,
    } };
  }
  if (response.status === "provisioning") {
    return { ...common, next_action: {
      kind: "wait", reason_code: "verification_pending", retry_after_seconds: response.retry_after_seconds,
    } };
  }
  if (response.status === "awaiting_owner_update" && response.publication_check_pending === true) {
    return { ...common, next_action: {
      kind: "wait", reason_code: "verification_pending", retry_after_seconds: response.retry_after_seconds,
    } };
  }
  if (response.status === "awaiting_owner_update") {
    return { ...common, next_action: {
      kind: "publish_resource",
      acknowledgement_required: true,
      replacement_semantics: "complete_resource",
      records: resourceRecords(response.publish_plan.replacement_records),
    } };
  }
  if (response.status === "observing") {
    return { ...common, next_action: {
      kind: "wait", reason_code: "delegation_insecure", retry_after_seconds: response.retry_after_seconds,
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
    return { ...common, next_action: {
      kind: "verified",
      canonical_route: `https://app.${response.root_label}/`,
      canonical_route_label: `app.${response.root_label}`,
      fallback_route: communityPath,
      fallback_route_label: `pirate.sc${communityPath}`,
    } };
  }
  if (response.status === "expired") return { ...common, next_action: { kind: "expired" } };
  return { ...common, next_action: { kind: "failed", reason_code: "root_import_failed", retryable: true } };
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
    currentSessionId = sessionId;
    current = mapSnapshot(response, options.communityPath, attachment);
    return current;
  };

  return {
    read: async () => {
      const sessionId = locator.read();
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
        locator.write(response.session.root_import_session_id);
        current = mapSnapshot(response.session, options.communityPath, attachment);
      } else {
        current = { ...chooseSnapshot(options.communityId), attachment,
          next_action: { kind: "choose_namespace", no_account_import: true } };
      }
      return current;
    },
    execute: async (command: NamespaceSettingsCommand) => {
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
      if (command.kind === "restart") {
        locator.clear();
        currentSessionId = null;
        current = { ...current, generation: current.generation + 1, next_action: {
          kind: "start_verification", family: "hns", root_label: current.root_label,
        } };
        return current;
      }
      if (command.kind === "start_verification") {
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
      const response = await client().post_communitiesCommunityIdHnsRootImportsSessionIdPoll({
        path: { communityId: options.communityId, sessionId },
        body: {
          expected_revision: command.expected_generation,
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
