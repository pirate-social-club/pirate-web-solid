import type { PirateApiClient } from "@pirate/api-client";

import {
  createSessionApiClient,
  readCsrfCookie,
  sessionRequestOptions,
  type PirateApiRequestOptions,
} from "./client.ts";

export const SELF_PASS_PROVIDER_ID = "self.pass";
export const SELF_AGE_18_INTENT_ID = "platform.document.age-18";

const SELF_REDIRECT_URL = "https://redirect.self.xyz";
const SELF_CHAIN_MAINNET = 42220;
const SELF_CHAIN_TESTNET = 11142220;

export interface SelfLaunchPresentation {
  readonly sessionId: string;
  readonly href: string;
  readonly expiresAt: string;
}

export class SelfLaunchError extends Error {
  constructor(readonly code: "csrf_required" | "unexpected_response" | "invalid_presentation") {
    super(code);
    this.name = "SelfLaunchError";
  }
}

export interface SelfLaunchOptions {
  readonly apiClient?: Pick<PirateApiClient, "post_verificationSessions">;
  readonly csrfToken?: string;
  readonly requestOptions?: PirateApiRequestOptions;
}

type LaunchPayload = {
  readonly app_name: string;
  readonly endpoint: string;
  readonly endpoint_type: string;
  readonly scope: string;
  readonly session_id: string;
  readonly user_id: string;
  readonly user_id_type: string;
  readonly disclosures: unknown;
  readonly dev_mode: boolean;
  readonly user_defined_data: string;
  readonly version: number;
};

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    ? value
    : undefined;
}

function parseLaunchPayload(value: unknown): LaunchPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SelfLaunchError("invalid_presentation");
  }
  // SAFETY: the object boundary above was checked; every field is validated
  // before the launch configuration is constructed.
  const input = value as {
    readonly app_name?: unknown;
    readonly endpoint?: unknown;
    readonly endpoint_type?: unknown;
    readonly scope?: unknown;
    readonly session_id?: unknown;
    readonly user_id?: unknown;
    readonly user_id_type?: unknown;
    readonly disclosures?: unknown;
    readonly dev_mode?: unknown;
    readonly user_defined_data?: unknown;
    readonly version?: unknown;
  };
  const appName = asNonEmptyString(input.app_name);
  const endpoint = asNonEmptyString(input.endpoint);
  const endpointType = asNonEmptyString(input.endpoint_type);
  const scope = asNonEmptyString(input.scope);
  const sessionId = asNonEmptyString(input.session_id);
  const userId = asNonEmptyString(input.user_id);
  const userIdType = asNonEmptyString(input.user_id_type);
  const userDefinedData = input.user_defined_data;
  if (
    appName === undefined || endpoint === undefined || endpointType === undefined ||
    scope === undefined || sessionId === undefined || userId === undefined ||
    userIdType === undefined || input.disclosures === undefined ||
    typeof input.dev_mode !== "boolean" || typeof userDefinedData !== "string" ||
    typeof input.version !== "number"
  ) {
    throw new SelfLaunchError("invalid_presentation");
  }
  return {
    app_name: appName,
    endpoint,
    endpoint_type: endpointType,
    scope,
    session_id: sessionId,
    user_id: userId,
    user_id_type: userIdType,
    disclosures: input.disclosures,
    dev_mode: input.dev_mode,
    user_defined_data: userDefinedData,
    version: input.version,
  };
}

/**
 * Maps the server-issued embedded_sdk launch payload onto the Self universal
 * link shape (the builder encoding used by the legacy verified flow) without
 * trusting any browser-supplied field.
 */
export function selfUniversalLink(payload: LaunchPayload): string {
  const selfApp = {
    appName: payload.app_name,
    chainID: payload.dev_mode ? SELF_CHAIN_TESTNET : SELF_CHAIN_MAINNET,
    deeplinkCallback: "",
    devMode: payload.dev_mode,
    endpoint: payload.endpoint,
    endpointType: payload.endpoint_type,
    header: "",
    logoBase64: "",
    disclosures: payload.disclosures,
    scope: payload.scope,
    sessionId: payload.session_id,
    userDefinedData: payload.user_defined_data,
    userId: payload.user_id,
    userIdType: payload.user_id_type,
    version: payload.version,
  };
  return `${SELF_REDIRECT_URL}?selfApp=${encodeURIComponent(JSON.stringify(selfApp))}`;
}

export function createSelfLaunch(options: SelfLaunchOptions = {}) {
  return {
    async start(): Promise<SelfLaunchPresentation> {
      const csrfToken = options.csrfToken ?? readCsrfCookie();
      if (csrfToken === undefined) throw new SelfLaunchError("csrf_required");
      const client = options.apiClient ?? createSessionApiClient();
      const started: unknown = await client.post_verificationSessions(
        { body: { intent_id: SELF_AGE_18_INTENT_ID, provider_id: SELF_PASS_PROVIDER_ID } },
        sessionRequestOptions(csrfToken, options.requestOptions),
      );
      if (started === null || typeof started !== "object" || Array.isArray(started)) {
        throw new SelfLaunchError("unexpected_response");
      }
      // SAFETY: the object boundary above was checked; each field is validated
      // before use.
      const response = started as { readonly expires_at?: unknown; readonly presentation?: unknown };
      const expiresAt = asNonEmptyString(response.expires_at);
      if (expiresAt === undefined) throw new SelfLaunchError("unexpected_response");
      const presentation = response.presentation;
      if (presentation === null || typeof presentation !== "object" || Array.isArray(presentation)) {
        throw new SelfLaunchError("invalid_presentation");
      }
      // SAFETY: the object boundary above was checked; kind and session_id are
      // validated before use and the payload is parsed separately.
      const record = presentation as {
        readonly kind?: unknown;
        readonly session_id?: unknown;
        readonly payload?: unknown;
      };
      const sessionId = asNonEmptyString(record.session_id);
      if (record.kind !== "embedded_sdk" || sessionId === undefined) {
        throw new SelfLaunchError("invalid_presentation");
      }
      const payload = parseLaunchPayload(record.payload);
      return {
        sessionId,
        href: selfUniversalLink(payload),
        expiresAt,
      };
    },
  };
}
