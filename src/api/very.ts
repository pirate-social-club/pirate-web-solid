import type { PirateApiClient, PirateApiRequestOptions } from "@pirate/api-client";

import {
  createSessionApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "./client.ts";

export const VERY_WEB_PROVIDER_ID = "very.web" as const;
const VERY_WEB_PROTOCOL = "very-widget" as const;
const VERY_WEB_VERSION = "1" as const;
const VERY_WEB_POLL_INTERVAL_MS = 3_000;
const VERY_WEB_MAX_STRING_LENGTH = 16_384;
const VERY_WEB_MAX_PROVIDER_PAYLOAD_REF_LENGTH = 1_048_576;

export type VeryWebClientErrorCode =
  | "browser_required"
  | "csrf_required"
  | "invalid_presentation"
  | "ceremony_cancelled"
  | "ceremony_expired"
  | "join_not_ready"
  | "provider_rejected"
  | "provider_unavailable";

export class VeryWebClientError extends Error {
  readonly code: VeryWebClientErrorCode;

  constructor(code: VeryWebClientErrorCode) {
    super(code);
    this.name = "VeryWebClientError";
    this.code = code;
  }
}

type JsonValue = string | number | boolean | null | JsonObject | readonly JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };

export type VeryWebPresentation = Readonly<{
  proofSessionId: string;
  expiresAt: string;
  appId: string;
  apiUrl: string;
  context: string;
  typeId: string;
  query: string;
  verifyUrl: string;
  mobileUri: string;
  pollUrl: string;
}>;

export type VeryWebCompletion = Readonly<{
  proofSessionId: string;
  status: "completed";
  replayed: boolean;
}>;

type VerificationApiClient = Pick<
  PirateApiClient,
  | "get_communitiesCommunityIdJoinEligibility"
  | "post_verificationSessions"
  | "post_verificationSessionsProofSessionIdComplete"
>;

export type CreateVeryWebCeremonyOptions = Readonly<{
  /** Internal escape hatch for an already-resolved server intent. */
  intentId?: string;
  /** User-facing target; the server resolves its opaque join intent. */
  communityId?: string;
  apiClient?: VerificationApiClient;
  csrfToken?: string;
  idempotencyKey?: () => string;
  requestOptions?: PirateApiRequestOptions;
}>;

export type VeryWebCeremony = Readonly<{
  proofSessionId: string;
  presentation: VeryWebPresentation | undefined;
  initialCompletion: VeryWebCompletion | undefined;
  /** Complete with the provider result as an opaque server-owned reference. */
  completeWithWidget: (providerPayloadRef: string) => Promise<VeryWebCompletion>;
  pollBridge: () => Promise<VeryWebCompletion>;
  cancel: () => void;
}>;

function invalidPresentation(): never {
  throw new VeryWebClientError("invalid_presentation");
}

function record(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidPresentation();
  }
  // SAFETY: callers use this only after the object/null/array boundary check above.
  return value as JsonObject;
}

function exactKeys(value: JsonObject, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    invalidPresentation();
  }
}

function boundedString(value: unknown, maximum = VERY_WEB_MAX_STRING_LENGTH): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value) {
    return invalidPresentation();
  }
  return value;
}

function opaqueProviderPayloadRef(value: unknown): string {
  return boundedString(value, VERY_WEB_MAX_PROVIDER_PAYLOAD_REF_LENGTH);
}

function futureInstant(value: unknown): string {
  const instant = boundedString(value, 64);
  const timestamp = Date.parse(instant);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return invalidPresentation();
  return instant;
}

function httpsUrl(value: unknown): string {
  const candidate = boundedString(value, 2_048);
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
      return invalidPresentation();
    }
  } catch {
    return invalidPresentation();
  }
  return candidate;
}

function mobileUri(value: unknown): string {
  const candidate = boundedString(value, 8_192);
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "veros:" ||
      parsed.hostname !== "verify" ||
      parsed.searchParams.get("action") !== "verify" ||
      boundedString(parsed.searchParams.get("sessionId")) === "" ||
      boundedString(parsed.searchParams.get("key")) === ""
    ) {
      return invalidPresentation();
    }
  } catch {
    return invalidPresentation();
  }
  return candidate;
}

function pollPath(value: unknown, proofSessionId: string): string {
  const candidate = boundedString(value, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(candidate, "https://solid.invalid");
  } catch {
    return invalidPresentation();
  }
  if (
    parsed.origin !== "https://solid.invalid" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.pathname !== `/verification/sessions/${proofSessionId}/complete`
  ) {
    return invalidPresentation();
  }
  return candidate;
}

function parseQuery(value: unknown): string {
  const query = boundedString(value, VERY_WEB_MAX_STRING_LENGTH);
  try {
    const parsed = record(JSON.parse(query));
    if (Object.keys(parsed).length === 0) return invalidPresentation();
  } catch {
    return invalidPresentation();
  }
  return query;
}

export function parseVeryJoinEligibility(value: unknown): string {
  const response = record(value);
  const nextAction = record(response.next_action);
  if (
    response.status !== "verification_required" ||
    response.human_verification_lane !== "very" ||
    nextAction.kind !== "start_verification" ||
    nextAction.provider_id !== VERY_WEB_PROVIDER_ID
  ) {
    throw new VeryWebClientError("join_not_ready");
  }
  return boundedString(nextAction.intent_id);
}

export function parseVeryWebPresentation(started: unknown):
  | { readonly kind: "pending"; readonly presentation: VeryWebPresentation }
  | { readonly kind: "completed"; readonly completion: VeryWebCompletion } {
  const response = record(started);
  if (response.status === "completed") {
    exactKeys(response, ["proof_session_id", "provider_id", "status", "replayed"]);
    if (response.provider_id !== VERY_WEB_PROVIDER_ID || response.replayed !== true) {
      return invalidPresentation();
    }
    return {
      kind: "completed",
      completion: {
        proofSessionId: boundedString(response.proof_session_id),
        status: "completed",
        replayed: true,
      },
    };
  }

  exactKeys(response, ["proof_session_id", "provider_id", "presentation", "expires_at", "replayed"]);
  const proofSessionId = boundedString(response.proof_session_id);
  if (response.provider_id !== VERY_WEB_PROVIDER_ID || typeof response.replayed !== "boolean") {
    return invalidPresentation();
  }
  const expiresAt = futureInstant(response.expires_at);
  const presentation = record(response.presentation);
  exactKeys(presentation, ["kind", "session_id", "protocol", "version", "payload"]);
  if (
    presentation.kind !== "embedded_sdk" ||
    presentation.session_id !== proofSessionId ||
    presentation.protocol !== VERY_WEB_PROTOCOL ||
    presentation.version !== VERY_WEB_VERSION
  ) {
    return invalidPresentation();
  }
  const payload = record(presentation.payload);
  exactKeys(payload, ["app_id", "api_url", "context", "type_id", "query", "verify_url", "mobile"]);
  const mobile = record(payload.mobile);
  exactKeys(mobile, ["uri", "poll_url"]);
  return {
    kind: "pending",
    presentation: {
      proofSessionId,
      expiresAt,
      appId: boundedString(payload.app_id),
      apiUrl: httpsUrl(payload.api_url),
      context: boundedString(payload.context),
      typeId: boundedString(payload.type_id),
      query: parseQuery(payload.query),
      verifyUrl: httpsUrl(payload.verify_url),
      mobileUri: mobileUri(mobile.uri),
      pollUrl: pollPath(mobile.poll_url, proofSessionId),
    },
  };
}

function providerUnavailable(error: unknown): boolean {
  // SAFETY: the assertion reads only the optional tag/code fields after the object check.
  const candidate = error as { readonly _tag?: unknown; readonly code?: unknown };
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    candidate._tag === "ApiClientError" &&
    candidate.code === "provider_unavailable"
  );
}

export async function createVeryWebCeremony(
  options: CreateVeryWebCeremonyOptions,
): Promise<VeryWebCeremony> {
  if (typeof window === "undefined") throw new VeryWebClientError("browser_required");
  const hasIntentId = options.intentId !== undefined;
  const hasCommunityId = options.communityId !== undefined;
  if (hasIntentId === hasCommunityId) {
    throw new VeryWebClientError("invalid_presentation");
  }
  if (hasIntentId && (options.intentId?.trim() !== options.intentId || options.intentId.length === 0)) {
    throw new VeryWebClientError("invalid_presentation");
  }
  if (hasCommunityId && (options.communityId?.trim() !== options.communityId || options.communityId.length === 0)) {
    throw new VeryWebClientError("invalid_presentation");
  }
  const csrfToken = options.csrfToken ?? readCsrfCookie();
  if (csrfToken === undefined) throw new VeryWebClientError("csrf_required");
  const requestOptions = sessionRequestOptions(csrfToken, options.requestOptions);
  const apiClient = options.apiClient ?? createSessionApiClient();
  let intentId = options.intentId;
  if (intentId === undefined && options.communityId !== undefined) {
    try {
      const eligibility = await apiClient.get_communitiesCommunityIdJoinEligibility(
        { path: { communityId: options.communityId } },
        requestOptions,
      );
      intentId = parseVeryJoinEligibility(eligibility);
    } catch (error) {
      if (error instanceof VeryWebClientError) throw error;
      throw new VeryWebClientError("join_not_ready");
    }
  }
  if (intentId === undefined) throw new VeryWebClientError("invalid_presentation");
  const started = await apiClient.post_verificationSessions(
    { body: { intent_id: intentId, provider_id: VERY_WEB_PROVIDER_ID } },
    requestOptions,
  );
  const parsed = parseVeryWebPresentation(started);
  if (parsed.kind === "completed") {
    return {
      proofSessionId: parsed.completion.proofSessionId,
      presentation: undefined,
      initialCompletion: parsed.completion,
      completeWithWidget: async () => parsed.completion,
      pollBridge: async () => parsed.completion,
      cancel: () => undefined,
    };
  }

  let cancelled = false;
  let terminal = false;
  let idempotencyKey: string | undefined;
  const complete = async (
    payload: Readonly<{ mode: "bridge" } | { mode: "widget"; proof: string }>,
  ) => {
    if (cancelled) throw new VeryWebClientError("ceremony_cancelled");
    if (terminal) throw new VeryWebClientError("ceremony_cancelled");
    if (Date.parse(parsed.presentation.expiresAt) <= Date.now()) {
      terminal = true;
      throw new VeryWebClientError("ceremony_expired");
    }
    idempotencyKey ??= (options.idempotencyKey ?? (() => crypto.randomUUID()))();
    try {
      const completed = await apiClient.post_verificationSessionsProofSessionIdComplete(
        {
          path: { proofSessionId: parsed.presentation.proofSessionId },
          body: { idempotency_key: idempotencyKey, payload },
        },
        requestOptions,
      );
      if (
        completed.status !== "completed" ||
        completed.proof_session_id !== parsed.presentation.proofSessionId
      ) {
        throw new VeryWebClientError("invalid_presentation");
      }
      terminal = true;
      return {
        proofSessionId: completed.proof_session_id,
        status: "completed" as const,
        replayed: completed.replayed,
      };
    } catch (error) {
      if (providerUnavailable(error)) throw new VeryWebClientError("provider_unavailable");
      if (error instanceof VeryWebClientError) throw error;
      throw new VeryWebClientError("provider_rejected");
    }
  };

  return {
    proofSessionId: parsed.presentation.proofSessionId,
    presentation: parsed.presentation,
    initialCompletion: undefined,
    completeWithWidget: (providerPayloadRef) =>
      complete({ mode: "widget", proof: opaqueProviderPayloadRef(providerPayloadRef) }),
    pollBridge: () => complete({ mode: "bridge" }),
    cancel: () => {
      cancelled = true;
    },
  };
}

export { VERY_WEB_POLL_INTERVAL_MS };
