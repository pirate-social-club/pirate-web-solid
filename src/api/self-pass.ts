import type { PirateApiClient, PostVerificationSessionsResponse } from "@pirate/api-client";
import type { SelfApp } from "@selfxyz/sdk-common";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "./client.ts";

export class SelfPassClientError extends Error {
  constructor(readonly code: "invalid_presentation" | "csrf_required") {
    super(code);
    this.name = "SelfPassClientError";
  }
}
function invalid(): never { throw new SelfPassClientError("invalid_presentation"); }
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;
interface JsonObject { readonly [key: string]: JsonValue }
function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
  // SAFETY: object representation checked; all consumed fields are parsed below.
  return value as JsonObject;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) return invalid();
  return value;
}

/** Parse only the disclosure vocabulary this app can explain to the viewer. */
export function parseSelfPassLaunch(response: PostVerificationSessionsResponse): Partial<SelfApp> {
  if (response.provider_id !== "self.pass" || !("presentation" in response)) return invalid();
  const presentation = response.presentation;
  if (presentation.kind !== "embedded_sdk" || presentation.protocol !== "self" || presentation.version !== "2"
    || presentation.session_id !== response.proof_session_id) return invalid();
  const launch = object(presentation.payload);
  const required = ["app_name", "endpoint", "endpoint_type", "scope", "session_id", "user_id", "user_id_type", "disclosures", "dev_mode", "user_defined_data", "version"];
  if (Object.keys(launch).length !== required.length || required.some(key => !Object.hasOwn(launch, key))) return invalid();
  if (launch.session_id !== response.proof_session_id || launch.user_id_type !== "uuid" || launch.version !== 2
    || typeof launch.dev_mode !== "boolean" || (launch.endpoint_type !== "https" && launch.endpoint_type !== "staging_https")) return invalid();
  const endpoint = new URL(text(launch.endpoint));
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) return invalid();
  const disclosure = object(launch.disclosures);
  if (Object.keys(disclosure).some(key => !["nationality", "minimum_age", "expiry_date"].includes(key))
    || (disclosure.nationality !== undefined && disclosure.nationality !== true)
    || (disclosure.expiry_date !== undefined && disclosure.expiry_date !== true)
    || (disclosure.minimum_age !== undefined && (!Number.isSafeInteger(disclosure.minimum_age) || disclosure.minimum_age !== 18))
    || (disclosure.nationality !== true && disclosure.minimum_age !== 18)) return invalid();
  return {
    appName: text(launch.app_name), endpoint: endpoint.href, endpointType: launch.endpoint_type,
    scope: text(launch.scope), sessionId: text(launch.session_id), userId: text(launch.user_id), userIdType: "uuid",
    userDefinedData: text(launch.user_defined_data), version: 2, devMode: launch.dev_mode,
    chainID: launch.endpoint_type === "staging_https" ? 11142220 : 42220,
    disclosures: {
      ...(disclosure.nationality === true ? { nationality: true } : {}),
      ...(disclosure.minimum_age === 18 ? { minimumAge: 18 } : {}),
      ...(disclosure.expiry_date === true ? { expiry_date: true } : {}),
    },
  };
}

export interface SelfPassCeremony {
  readonly proofSessionId: string;
  readonly url: string;
  cancel(): void;
}
export async function createSelfPassCeremony(options: Readonly<{
  intentId: string;
  signal?: AbortSignal;
  csrfToken?: string;
  apiClient?: Pick<PirateApiClient, "post_verificationSessions">;
  loadSdk?: () => Promise<typeof import("@selfxyz/sdk-common")>;
}>): Promise<SelfPassCeremony> {
  const csrf = options.csrfToken ?? readCsrfCookie();
  if (csrf === undefined) throw new SelfPassClientError("csrf_required");
  const response = await (options.apiClient ?? createSessionApiClient()).post_verificationSessions(
    { body: { intent_id: options.intentId, provider_id: "self.pass" } },
    sessionRequestOptions(csrf, { signal: options.signal }),
  );
  // A completed replay is confirmed by the caller's authoritative requirement read.
  if ("status" in response && response.status === "completed" && response.provider_id === "self.pass") {
    return { proofSessionId: response.proof_session_id, url: "", cancel() {} };
  }
  const launch = parseSelfPassLaunch(response);
  const sdk = await (options.loadSdk ?? (() => import("@selfxyz/sdk-common")))();
  const url = sdk.getUniversalLink(new sdk.SelfAppBuilder(launch).build());
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "redirect.self.xyz" || parsed.username || parsed.password) return invalid();
  // Self sends its proof to the API callback. No URL callback or client success flag grants anything.
  return { proofSessionId: response.proof_session_id, url, cancel() {} };
}
