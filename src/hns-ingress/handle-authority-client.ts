import {
  CF_ACCESS_CLIENT_ID_HEADER,
  CF_ACCESS_CLIENT_SECRET_HEADER,
  HNS_PROFILE_AUTHORITY_DEADLINE_MS,
  HNS_PROFILE_AUTHORITY_MAX_BYTES,
  HnsIngressFailure,
} from "./wire.ts";
import {
  isCanonicalHandleHost,
  isHnsHandlePersonaAuthorityV1,
  type HnsHandleAuthorityResolutionV1,
  type HnsHandlePersonaAuthorityV1,
} from "./handle-wire.ts";
import { makeInterruptDeadline } from "./interrupt-deadline.ts";

export const HNS_SOLID_HANDLE_HOST_AUTHORITY_V1_PATH =
  "/internal/hns/solid-handle-host-authority/v1/resolve" as const;
export const HNS_SOLID_HANDLE_HOST_AUTHORITY_REQUEST_V1 =
  "pirate-hns-solid-handle-host-authority-request-v1" as const;
export const HNS_SOLID_HANDLE_HOST_AUTHORITY_RESPONSE_V1 =
  "pirate-hns-solid-handle-host-authority-response-v1" as const;

export type HnsHandleAuthorityFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface HnsHandleAuthorityClientV1 {
  readonly resolve: (
    normalizedHost: string,
    authority: HnsHandlePersonaAuthorityV1,
    signal?: AbortSignal,
  ) => Promise<HnsHandleAuthorityResolutionV1>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const credentialPattern = /^[\x21-\x7e]{1,4096}$/u;

function exactHttpsOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("invalid");
    }
    return parsed.origin;
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
}

async function boundedBytes(response: Response, interrupt: Promise<never>): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > HNS_PROFILE_AUTHORITY_MAX_BYTES)) {
    throw new HnsIngressFailure("authority_unavailable");
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await Promise.race([reader.read(), interrupt]);
      if (part.done) break;
      total += part.value.byteLength;
      if (total > HNS_PROFILE_AUTHORITY_MAX_BYTES) throw new HnsIngressFailure("authority_unavailable");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function parseResponse(
  bytes: Uint8Array,
  expectedHost: string,
  expectedAuthority: HnsHandlePersonaAuthorityV1,
  expectedDeployment: string,
): HnsHandleAuthorityResolutionV1 {
  try {
    const text = decoder.decode(bytes);
    const value: unknown = JSON.parse(text);
    if (
      !Array.isArray(value) || value.length !== 9 || value[0] !== HNS_SOLID_HANDLE_HOST_AUTHORITY_RESPONSE_V1 ||
      value[1] !== "active" || value[2] !== expectedHost || !isCanonicalHandleHost(value[2]) ||
      typeof value[3] !== "string" || !labelPattern.test(value[3]) || typeof value[4] !== "string" ||
      !labelPattern.test(value[4]) || typeof value[5] !== "string" || !identityPattern.test(value[5]) ||
      typeof value[6] !== "string" || !identityPattern.test(value[6]) || !isHnsHandlePersonaAuthorityV1(value[7]) ||
      JSON.stringify(value[7]) !== JSON.stringify(expectedAuthority) || value[8] !== expectedDeployment ||
      value[2] !== `${value[4]}.${value[3]}` || value[6] !== value[7][4] || JSON.stringify(value) !== text
    ) throw new Error("invalid");
    return Object.freeze({
      normalizedHost: value[2], canonicalRoot: value[3], canonicalHandleLabel: value[4],
      communityId: value[5], ownerPersonaId: value[6], hostAuthority: value[7],
      gatewayDeploymentReference: value[8],
    });
  } catch {
    throw new HnsIngressFailure("authority_unavailable");
  }
}

export function makeHnsHandleAuthorityClientV1(options: {
  readonly origin: string;
  readonly accessClientId: string;
  readonly accessClientSecret: string;
  readonly gatewayDeploymentReference: string;
  readonly fetchImpl?: HnsHandleAuthorityFetch;
}): HnsHandleAuthorityClientV1 {
  const origin = exactHttpsOrigin(options.origin);
  if (!credentialPattern.test(options.accessClientId) || !credentialPattern.test(options.accessClientSecret) ||
    !identityPattern.test(options.gatewayDeploymentReference)) throw new HnsIngressFailure("misconfigured");
  return Object.freeze({
    resolve: async (
      normalizedHost: string,
      authority: HnsHandlePersonaAuthorityV1,
      parentSignal?: AbortSignal,
    ) => {
      if (!isCanonicalHandleHost(normalizedHost) || !isHnsHandlePersonaAuthorityV1(authority)) {
        throw new HnsIngressFailure("invalid_request");
      }
      const bytes = encoder.encode(JSON.stringify([
        HNS_SOLID_HANDLE_HOST_AUTHORITY_REQUEST_V1,
        normalizedHost,
        authority,
        options.gatewayDeploymentReference,
      ]));
      if (bytes.byteLength > HNS_PROFILE_AUTHORITY_MAX_BYTES) throw new HnsIngressFailure("authority_unavailable");
      const bounded = makeInterruptDeadline(parentSignal, HNS_PROFILE_AUTHORITY_DEADLINE_MS);
      try {
        const response = await Promise.race([
          (options.fetchImpl ?? fetch)(`${origin}${HNS_SOLID_HANDLE_HOST_AUTHORITY_V1_PATH}`, {
            method: "POST",
            headers: {
              accept: "application/json", "content-type": "application/json",
              [CF_ACCESS_CLIENT_ID_HEADER]: options.accessClientId,
              [CF_ACCESS_CLIENT_SECRET_HEADER]: options.accessClientSecret,
            },
            body: bytes,
            redirect: "manual",
            signal: bounded.signal,
          }),
          bounded.interrupt,
        ]);
        if (response.status === 404) throw new HnsIngressFailure("not_found");
        if (response.status !== 200 || response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
          throw new HnsIngressFailure("authority_unavailable");
        }
        return parseResponse(await boundedBytes(response, bounded.interrupt), normalizedHost, authority, options.gatewayDeploymentReference);
      } catch (error) {
        if (parentSignal?.aborted && !bounded.didTimeout()) throw parentSignal.reason ?? error;
        if (error instanceof HnsIngressFailure) throw error;
        throw new HnsIngressFailure("authority_unavailable");
      } finally {
        bounded.finish();
      }
    },
  });
}
