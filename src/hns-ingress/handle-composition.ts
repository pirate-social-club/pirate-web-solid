import type { GetPublicPersonasPersonaIdResponse } from "@pirate/api-client-handle-sales";
import type { AccessJwtValidatorV1 } from "./access-jwt.ts";
import type { HnsHandleAuthorityClientV1 } from "./handle-authority-client.ts";
import type { HnsPublicPersonaClientV1 } from "./handle-public-persona-client.ts";
import {
  CF_ACCESS_ASSERTION_HEADER,
  HNS_FORWARDER_RESERVED_HEADERS,
  HNS_PROFILE_MAX_REQUEST_FIELDS,
  HNS_PROFILE_MAX_REQUEST_HEADER_BYTES,
  HNS_PROFILE_MAX_RESPONSE_BYTES,
  HNS_PROFILE_UPSTREAM_DEADLINE_MS,
  HnsIngressFailure,
  hasReservedHnsIngressHeader,
  sha256Hex,
  type HnsForwarderClockV1,
  type HnsForwarderKeyRegistryV1,
  type HnsForwarderLimitsV1,
} from "./wire.ts";
import {
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1,
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_BYTES,
  HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256,
  readHnsHandleForwarderEnvelopeV3,
  verifyHnsHandleForwarderEnvelopeV3,
} from "./handle-wire.ts";
import { makeInterruptDeadline } from "./interrupt-deadline.ts";

export interface HnsHandlePersonaDispatchV1 {
  readonly ssr: (
    request: Request,
    persona: GetPublicPersonasPersonaIdResponse,
  ) => Promise<Response>;
}

export interface EnabledHnsHandlePersonaIngressCompositionV1 {
  readonly enabled: true;
  readonly ingressOrigin: string;
  readonly fetch: (request: Request) => Promise<Response>;
}

export interface DisabledHnsHandlePersonaIngressCompositionV1 {
  readonly enabled: false;
  readonly rejectReservedHeaders: (request: Request) => Response | null;
}

const encoder = new TextEncoder();
const requiredIncomingHeaders = new Set<string>([
  ...HNS_FORWARDER_RESERVED_HEADERS,
  CF_ACCESS_ASSERTION_HEADER,
]);
// Cloudflare adds or overwrites these after the gateway constructs its closed
// subrequest. They are transport metadata only and are consumed here; browser
// fields and extra Access fields remain invalid and none reaches SSR.
const cloudflareTransportHeaders = new Set([
  "accept-encoding", "cdn-loop", "connection", "content-length", "x-forwarded-for", "x-forwarded-proto", "x-real-ip",
]);
const safeResponseHeaders = new Set([
  "content-type", "content-language", "content-encoding", "etag", "last-modified",
  "content-security-policy", "content-security-policy-report-only", "referrer-policy",
  "permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy",
  "x-content-type-options",
]);
export const HNS_HANDLE_STATIC_CONTENT_SECURITY_POLICY =
  "default-src 'none'; style-src https://pirate.sc; img-src https://pirate.sc; font-src https://pirate.sc; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" as const;

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

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

function assertion(headers: Headers): string {
  const value = headers.get(CF_ACCESS_ASSERTION_HEADER);
  if (value === null || value === "" || value.includes(",")) throw new HnsIngressFailure("access_denied");
  return value;
}

function validateClosedHeaders(headers: Headers): void {
  let count = 0;
  let bytes = 0;
  for (const [name, value] of headers) {
    count += 1;
    bytes += encoder.encode(name).byteLength + encoder.encode(value).byteLength;
    const lower = name.toLowerCase();
    const platformAdded = cloudflareTransportHeaders.has(lower) ||
      (lower.startsWith("cf-") && !lower.startsWith("cf-access-"));
    if ((!requiredIncomingHeaders.has(lower) && !platformAdded) || count > HNS_PROFILE_MAX_REQUEST_FIELDS ||
      bytes > HNS_PROFILE_MAX_REQUEST_HEADER_BYTES) throw new HnsIngressFailure("invalid_request");
  }
  for (const name of requiredIncomingHeaders) {
    if (!headers.has(name)) throw new HnsIngressFailure("invalid_request");
  }
}

async function readEmptyBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && declared !== "0") throw new HnsIngressFailure("invalid_request");
  if (request.body === null) return new Uint8Array();
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== 0) throw new HnsIngressFailure("invalid_request");
  return bytes;
}

async function readRendered(response: Response, interrupt: Promise<never>): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > HNS_PROFILE_MAX_RESPONSE_BYTES)) {
    throw new HnsIngressFailure("upstream_unavailable");
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
      if (total > HNS_PROFILE_MAX_RESPONSE_BYTES) throw new HnsIngressFailure("upstream_unavailable");
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

function responseHeaders(upstream: Response, length: number): Headers {
  const headers = new Headers({ "cache-control": "no-store", "content-length": String(length) });
  for (const [name, value] of upstream.headers) {
    if (safeResponseHeaders.has(name.toLowerCase())) headers.set(name, value);
  }
  headers.set("content-security-policy", HNS_HANDLE_STATIC_CONTENT_SECURITY_POLICY);
  headers.set("referrer-policy", "no-referrer");
  return headers;
}

function redactedFailure(error: unknown): Response {
  const reason = error instanceof HnsIngressFailure ? error.reason : "upstream_unavailable";
  const status = reason === "access_denied" ? 401 : reason === "not_found" ? 404 : reason === "upstream_unavailable" ||
    reason === "authority_unavailable" ? 503 : 421;
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

export async function makeHnsHandlePersonaIngressCompositionV1(options: {
  readonly profile: string;
  readonly profileSha256: string;
  readonly ingressOrigin: string;
  readonly canonicalOrigin: string;
  readonly accessJwtValidator: AccessJwtValidatorV1;
  readonly authorityClient: HnsHandleAuthorityClientV1;
  readonly publicPersonaClient: HnsPublicPersonaClientV1;
  readonly keyRegistry: HnsForwarderKeyRegistryV1;
  readonly clock: HnsForwarderClockV1;
  readonly limits: HnsForwarderLimitsV1;
  readonly dispatch: HnsHandlePersonaDispatchV1;
}): Promise<EnabledHnsHandlePersonaIngressCompositionV1> {
  const ingressOrigin = exactHttpsOrigin(options.ingressOrigin);
  const canonicalOrigin = exactHttpsOrigin(options.canonicalOrigin);
  if (
    canonicalOrigin !== "https://pirate.sc" || ingressOrigin === canonicalOrigin ||
    options.profile !== HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1 ||
    options.profileSha256 !== HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256 ||
    encoder.encode(options.profile).byteLength !== HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_BYTES ||
    await sha256Hex(encoder.encode(options.profile)) !== options.profileSha256 ||
    typeof options.accessJwtValidator?.verify !== "function" ||
    typeof options.authorityClient?.resolve !== "function" ||
    typeof options.publicPersonaClient?.loadExact !== "function" ||
    typeof options.keyRegistry?.verificationKey !== "function" ||
    typeof options.clock?.nowUnixSeconds !== "function" || typeof options.dispatch?.ssr !== "function"
  ) throw new HnsIngressFailure("misconfigured");

  return Object.freeze({
    enabled: true as const,
    ingressOrigin,
    fetch: async (request: Request): Promise<Response> => {
      try {
        if (new URL(request.url).origin !== ingressOrigin) throw new HnsIngressFailure("invalid_request");
        validateClosedHeaders(request.headers);
        await options.accessJwtValidator.verify(assertion(request.headers), request.signal);
        const envelope = readHnsHandleForwarderEnvelopeV3(request);
        const bodyBytes = await readEmptyBody(request);
        const authority = await options.authorityClient.resolve(
          envelope.normalizedHost,
          envelope.hostAuthority,
          request.signal,
        );
        await verifyHnsHandleForwarderEnvelopeV3({
          request, bodyBytes, resolution: authority, keyRegistry: options.keyRegistry,
          clock: options.clock, limits: options.limits,
        });
        const persona = await options.publicPersonaClient.loadExact(authority, request.signal);
        const bounded = makeInterruptDeadline(request.signal, HNS_PROFILE_UPSTREAM_DEADLINE_MS);
        try {
          const canonicalRequest = new Request(
            `${canonicalOrigin}/p/${encodeURIComponent(authority.ownerPersonaId)}`,
            { method: request.method, redirect: "manual", signal: bounded.signal },
          );
          const rendered = await Promise.race([
            options.dispatch.ssr(canonicalRequest, persona),
            bounded.interrupt,
          ]);
          if (rendered.status !== 200) throw new HnsIngressFailure("upstream_unavailable");
          const bytes = await readRendered(rendered, bounded.interrupt);
          const outgoing = request.method === "HEAD" ? new Uint8Array() : bytes;
          return new Response(ownedArrayBuffer(outgoing), { status: 200, headers: responseHeaders(rendered, outgoing.byteLength) });
        } finally {
          bounded.finish();
        }
      } catch (error) {
        if (request.signal.aborted) throw error;
        return redactedFailure(error);
      }
    },
  });
}

export const disabledProductionHnsHandlePersonaIngressCompositionV1 = Object.freeze({
  enabled: false as const,
  rejectReservedHeaders: (request: Request): Response | null => hasReservedHnsIngressHeader(request.headers)
    ? new Response(JSON.stringify({ error: "invalid_request" }), {
        status: 400,
        headers: { "cache-control": "no-store", "content-type": "application/json" },
      })
    : null,
}) satisfies DisabledHnsHandlePersonaIngressCompositionV1;
