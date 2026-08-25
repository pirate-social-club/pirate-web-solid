import {
  CF_ACCESS_CLIENT_ID_HEADER,
  CF_ACCESS_CLIENT_SECRET_HEADER,
  HNS_PROFILE_AUTHORITY_DEADLINE_MS,
  HNS_PROFILE_AUTHORITY_MAX_BYTES,
  HnsIngressFailure,
  type HnsAuthorityResolutionV2,
  type HnsCommunityAppAuthorityV1,
  isCanonicalCommunityAppHost,
  isCanonicalHnsRoot,
  isHnsCommunityAppAuthorityV1,
} from "./wire.ts";

export const HNS_SOLID_HOST_AUTHORITY_V2_PATH = "/internal/hns/solid-host-authority/v2/resolve" as const;
export const HNS_SOLID_HOST_AUTHORITY_REQUEST_V2 = "pirate-hns-solid-host-authority-request-v2" as const;
export const HNS_SOLID_HOST_AUTHORITY_RESPONSE_V2 = "pirate-hns-solid-host-authority-response-v2" as const;

export type HnsAuthorityFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface HnsAuthorityClientV2 {
  readonly resolve: (
    normalizedHost: string,
    hostAuthority: HnsCommunityAppAuthorityV1,
    signal?: AbortSignal,
  ) => Promise<HnsAuthorityResolutionV2>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const credentialPattern = /^[\x21-\x7e]{1,4096}$/u;

function exactHttpsOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new HnsIngressFailure("misconfigured");
  }
  return parsed.origin;
}

interface AuthorityDeadline {
  readonly signal: AbortSignal;
  readonly interrupt: Promise<never>;
  readonly didTimeout: () => boolean;
  readonly finish: () => void;
}

function deadline(parent: AbortSignal | undefined): AuthorityDeadline {
  const controller = new AbortController();
  let timedOut = false;
  let rejectInterrupt: ((reason?: unknown) => void) | undefined;
  const interrupt = new Promise<never>((_resolve, reject) => {
    rejectInterrupt = reject;
  });
  void interrupt.catch(() => undefined);
  const onAbort = (): void => {
    const reason = parent?.reason ?? new DOMException("Aborted", "AbortError");
    controller.abort(reason);
    rejectInterrupt?.(reason);
  };
  if (parent?.aborted) onAbort();
  else parent?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    const reason = new DOMException("Authority request timed out", "TimeoutError");
    controller.abort(reason);
    rejectInterrupt?.(reason);
  }, HNS_PROFILE_AUTHORITY_DEADLINE_MS);
  return {
    signal: controller.signal,
    interrupt,
    didTimeout: () => timedOut,
    finish: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

async function readBounded(response: Response, interrupt: Promise<never>): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > HNS_PROFILE_AUTHORITY_MAX_BYTES) {
      throw new HnsIngressFailure("authority_unavailable");
    }
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await Promise.race([reader.read(), interrupt]);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > HNS_PROFILE_AUTHORITY_MAX_BYTES) {
        await reader.cancel();
        throw new HnsIngressFailure("authority_unavailable");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseResolution(
  bytes: Uint8Array,
  expectedHost: string,
  expectedAuthority: HnsCommunityAppAuthorityV1,
  expectedDeployment: string,
): HnsAuthorityResolutionV2 {
  try {
    const text = decoder.decode(bytes);
    const value: unknown = JSON.parse(text);
    if (
      !Array.isArray(value) ||
      value.length !== 7 ||
      value[0] !== HNS_SOLID_HOST_AUTHORITY_RESPONSE_V2 ||
      value[1] !== "active" ||
      value[2] !== expectedHost ||
      !isCanonicalCommunityAppHost(value[2]) ||
      !isCanonicalHnsRoot(value[3]) ||
      typeof value[4] !== "string" ||
      !identityPattern.test(value[4]) ||
      !isHnsCommunityAppAuthorityV1(value[5]) ||
      JSON.stringify(value[5]) !== JSON.stringify(expectedAuthority) ||
      value[6] !== expectedDeployment ||
      value[2] !== `app.${value[3]}` ||
      JSON.stringify(value) !== text
    ) {
      throw new Error("invalid authority response");
    }
    return Object.freeze({
      normalizedHost: value[2],
      canonicalRoot: value[3],
      communityId: value[4],
      hostAuthority: value[5],
      gatewayDeploymentReference: value[6],
    });
  } catch {
    throw new HnsIngressFailure("authority_unavailable");
  }
}

export function makeHnsAuthorityClientV2(options: {
  readonly origin: string;
  readonly accessClientId: string;
  readonly accessClientSecret: string;
  readonly gatewayDeploymentReference: string;
  readonly fetchImpl?: HnsAuthorityFetch;
}): HnsAuthorityClientV2 {
  const origin = exactHttpsOrigin(options.origin);
  if (
    !credentialPattern.test(options.accessClientId) ||
    !credentialPattern.test(options.accessClientSecret) ||
    !identityPattern.test(options.gatewayDeploymentReference)
  ) {
    throw new HnsIngressFailure("misconfigured");
  }
  const endpoint = `${origin}${HNS_SOLID_HOST_AUTHORITY_V2_PATH}`;

  return Object.freeze({
    resolve: async (
      normalizedHost: string,
      hostAuthority: HnsCommunityAppAuthorityV1,
      signal?: AbortSignal,
    ): Promise<HnsAuthorityResolutionV2> => {
      if (!isCanonicalCommunityAppHost(normalizedHost) || !isHnsCommunityAppAuthorityV1(hostAuthority)) {
        throw new HnsIngressFailure("invalid_request");
      }
      const requestBytes = encoder.encode(
        JSON.stringify([
          HNS_SOLID_HOST_AUTHORITY_REQUEST_V2,
          normalizedHost,
          hostAuthority,
          options.gatewayDeploymentReference,
        ]),
      );
      if (requestBytes.byteLength > HNS_PROFILE_AUTHORITY_MAX_BYTES) {
        throw new HnsIngressFailure("authority_unavailable");
      }
      const bounded = deadline(signal);
      try {
        const response = await Promise.race([
          (options.fetchImpl ?? fetch)(endpoint, {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              [CF_ACCESS_CLIENT_ID_HEADER]: options.accessClientId,
              [CF_ACCESS_CLIENT_SECRET_HEADER]: options.accessClientSecret,
            },
            body: requestBytes,
            redirect: "manual",
            signal: bounded.signal,
          }),
          bounded.interrupt,
        ]);
        if (
          response.status !== 200 ||
          response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
        ) {
          throw new HnsIngressFailure("authority_unavailable");
        }
        return parseResolution(
          await readBounded(response, bounded.interrupt),
          normalizedHost,
          hostAuthority,
          options.gatewayDeploymentReference,
        );
      } catch (error) {
        if (signal?.aborted && !bounded.didTimeout()) throw signal.reason ?? error;
        if (error instanceof HnsIngressFailure) throw error;
        throw new HnsIngressFailure("authority_unavailable");
      } finally {
        bounded.finish();
      }
    },
  });
}
