export const VERIFICATION_CONFIG_PATH = "/internal/verification/config" as const;

export interface VerificationConfigEnvironment {
  readonly VERIFICATION_UI_ENABLED?: string;
  readonly PRIVY_APP_ID?: string;
  readonly PRIVY_CLIENT_ID?: string;
}

export interface VerificationPublicConfig {
  readonly enabled: true;
  readonly privyAppId: string;
  readonly privyClientId?: string;
}

interface MutableVerificationPublicConfig {
  enabled: true;
  privyAppId: string;
  privyClientId?: string;
}

function validIdentifier(value: string | undefined): value is string {
  return value !== undefined && value.length > 0 && value.length <= 256 && value === value.trim();
}

export function publicVerificationConfig(
  env: VerificationConfigEnvironment,
): VerificationPublicConfig | undefined {
  if (env.VERIFICATION_UI_ENABLED !== "true" || !validIdentifier(env.PRIVY_APP_ID)) return undefined;
  if (env.PRIVY_CLIENT_ID !== undefined && !validIdentifier(env.PRIVY_CLIENT_ID)) return undefined;
  const config: MutableVerificationPublicConfig = {
    enabled: true,
    privyAppId: env.PRIVY_APP_ID,
  };
  if (env.PRIVY_CLIENT_ID !== undefined) config.privyClientId = env.PRIVY_CLIENT_ID;
  return config;
}

export function verificationConfigResponse(request: Request, env: VerificationConfigEnvironment): Response {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const config = publicVerificationConfig(env);
  if (config === undefined) return new Response(null, { status: 404 });
  return Response.json(config, {
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export type VerificationConfigFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchVerificationConfig(fetchImpl: VerificationConfigFetch = fetch): Promise<VerificationPublicConfig> {
  const response = await fetchImpl(VERIFICATION_CONFIG_PATH, {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("verification_unavailable");
  const value: unknown = await response.json();
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("verification_unavailable");
  // SAFETY: object/null/array representation was checked above; every accepted
  // property is independently parsed before the named config is constructed.
  const input = value as { enabled?: unknown; privyAppId?: unknown; privyClientId?: unknown };
  const keys = Object.keys(value).sort().join(",");
  const appId = typeof input.privyAppId === "string" ? input.privyAppId : undefined;
  const clientId = typeof input.privyClientId === "string" ? input.privyClientId : undefined;
  if (
    input.enabled !== true || !validIdentifier(appId) ||
    (keys !== "enabled,privyAppId" && keys !== "enabled,privyAppId,privyClientId") ||
    (input.privyClientId !== undefined && !validIdentifier(clientId))
  ) throw new Error("verification_unavailable");
  const config: MutableVerificationPublicConfig = {
    enabled: true,
    privyAppId: appId,
  };
  if (clientId !== undefined) config.privyClientId = clientId;
  return config;
}
