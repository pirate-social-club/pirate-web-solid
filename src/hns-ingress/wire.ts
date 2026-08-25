export const HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2 =
  '["pirate-hns-community-app-interactive-gateway-v2","pirate-hns-forwarder-v3","community_app_v1",["GET","HEAD","POST","PATCH"],["root_to_canonical_community_v2","preserve_other_path_and_query_v1"],["accept","accept-language","cache-control","content-language","content-type","cookie","if-match","if-modified-since","if-none-match","if-unmodified-since","idempotency-key","origin","range","referer","x-csrf-token","x-request-id"],["__Host-pirate_session","__Host-pirate_csrf"],["pirate-hns-solid-host-authority-request-v2","pirate-hns-solid-host-authority-response-v2"],8192,128,32768,1048576,16384,16777216,15000,4096,2000]' as const;
export const HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_BYTES = 622 as const;
export const HNS_COMMUNITY_APP_INTERACTIVE_PROFILE_V2_SHA256 =
  "f49ac37bd45da71bdf1e1cc65f184729d85f9d72ce811f0551a70f7785aa8d86" as const;

export const HNS_FORWARDER_V3 = "pirate-hns-forwarder-v3" as const;
export const HNS_FORWARDER_HOST_HEADER = "x-pirate-hns-host" as const;
export const HNS_FORWARDER_KEY_ID_HEADER = "x-pirate-hns-forwarder-key-id" as const;
export const HNS_FORWARDER_TIMESTAMP_HEADER = "x-pirate-hns-forwarder-timestamp" as const;
export const HNS_FORWARDER_PATH_HEADER = "x-pirate-hns-forwarder-path" as const;
export const HNS_FORWARDER_BODY_SHA256_HEADER = "x-pirate-hns-forwarder-body-sha256" as const;
export const HNS_FORWARDER_NONCE_HEADER = "x-pirate-hns-forwarder-nonce" as const;
export const HNS_FORWARDER_SIGNATURE_HEADER = "x-pirate-hns-forwarder-signature" as const;
export const HNS_FORWARDER_AUTHORITY_HEADER = "x-pirate-hns-forwarder-authority" as const;
export const CF_ACCESS_ASSERTION_HEADER = "cf-access-jwt-assertion" as const;
export const CF_ACCESS_CLIENT_ID_HEADER = "cf-access-client-id" as const;
export const CF_ACCESS_CLIENT_SECRET_HEADER = "cf-access-client-secret" as const;

export const HNS_FORWARDER_RESERVED_HEADERS = Object.freeze([
  HNS_FORWARDER_HOST_HEADER,
  HNS_FORWARDER_KEY_ID_HEADER,
  HNS_FORWARDER_TIMESTAMP_HEADER,
  HNS_FORWARDER_PATH_HEADER,
  HNS_FORWARDER_BODY_SHA256_HEADER,
  HNS_FORWARDER_NONCE_HEADER,
  HNS_FORWARDER_SIGNATURE_HEADER,
  HNS_FORWARDER_AUTHORITY_HEADER,
] as const);

export const HNS_PROFILE_MAX_TARGET_BYTES = 8_192 as const;
export const HNS_PROFILE_MAX_REQUEST_FIELDS = 128 as const;
export const HNS_PROFILE_MAX_REQUEST_HEADER_BYTES = 32_768 as const;
export const HNS_PROFILE_MAX_REQUEST_BODY_BYTES = 1_048_576 as const;
export const HNS_PROFILE_MAX_COOKIE_VALUE_BYTES = 16_384 as const;
export const HNS_PROFILE_MAX_RESPONSE_BYTES = 16_777_216 as const;
export const HNS_PROFILE_UPSTREAM_DEADLINE_MS = 15_000 as const;
export const HNS_PROFILE_AUTHORITY_MAX_BYTES = 4_096 as const;
export const HNS_PROFILE_AUTHORITY_DEADLINE_MS = 2_000 as const;

export type HnsRouteAuthorityV1 = readonly [
  kind: "verified_namespace_v1" | "operator_managed_route_v1",
  reference: string,
  generation: number,
];

export type HnsCommunityAppAuthorityV1 = readonly [
  tag: "community_app_v1",
  appHostActivation: readonly [id: string, generation: number],
  routeBindingId: string,
  routeAuthority: HnsRouteAuthorityV1,
];

export interface HnsAuthorityResolutionV2 {
  readonly normalizedHost: string;
  readonly canonicalRoot: string;
  readonly communityId: string;
  readonly hostAuthority: HnsCommunityAppAuthorityV1;
  readonly gatewayDeploymentReference: string;
}

export interface HnsForwarderKeyRecordV1 {
  readonly keyId: string;
  readonly keyBytes: Uint8Array;
  readonly verifyNotBefore: number;
  readonly verifyNotAfter: number;
}

export interface HnsForwarderKeyRegistryV1 {
  readonly verificationKey: (keyId: string, nowSeconds: number) => HnsForwarderKeyRecordV1 | null;
}

export interface HnsReplayStoreV1 {
  readonly consume: (keyId: string, nonce: string) => Promise<boolean>;
}

export interface HnsForwarderClockV1 {
  readonly nowUnixSeconds: () => number;
}

export interface HnsForwarderLimitsV1 {
  readonly freshnessWindowSeconds: number;
  readonly futureClockSkewSeconds: number;
}

export type HnsIngressFailureReason =
  | "misconfigured"
  | "invalid_request"
  | "body_too_large"
  | "invalid_signature"
  | "stale"
  | "replayed"
  | "authority_unavailable"
  | "access_denied"
  | "upstream_unavailable";

export class HnsIngressFailure extends Error {
  readonly name = "HnsIngressFailure";

  constructor(readonly reason: HnsIngressFailureReason) {
    super(`HNS ingress failed: ${reason}`);
  }
}

interface HnsForwarderEnvelopeV3 {
  readonly normalizedHost: string;
  readonly keyId: string;
  readonly timestamp: string;
  readonly pathAndQuery: string;
  readonly bodySha256: string;
  readonly nonce: string;
  readonly signature: string;
  readonly hostAuthority: HnsCommunityAppAuthorityV1;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const dnsLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const keyIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const timestampPattern = /^(?:0|[1-9][0-9]{0,19})$/u;
const noncePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const signaturePattern = /^v3=[0-9a-f]{64}$/u;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/u;
const safeMethods = new Set(["GET", "HEAD"]);
const acceptedMethods = new Set(["GET", "HEAD", "POST", "PATCH"]);
const reservedForwarderHeaders = new Set<string>(HNS_FORWARDER_RESERVED_HEADERS);

function utf8Length(value: string): number {
  return encoder.encode(value).byteLength;
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && identityPattern.test(value) && utf8Length(value) <= 256;
}

function validGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validRouteAuthority(value: unknown): value is HnsRouteAuthorityV1 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    (value[0] === "verified_namespace_v1" || value[0] === "operator_managed_route_v1") &&
    validIdentity(value[1]) &&
    validGeneration(value[2])
  );
}

export function isHnsCommunityAppAuthorityV1(value: unknown): value is HnsCommunityAppAuthorityV1 {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value[0] === "community_app_v1" &&
    Array.isArray(value[1]) &&
    value[1].length === 2 &&
    validIdentity(value[1][0]) &&
    validGeneration(value[1][1]) &&
    validIdentity(value[2]) &&
    validRouteAuthority(value[3])
  );
}

export function isCanonicalHnsRoot(value: unknown): value is string {
  return typeof value === "string" && value !== "pirate" && dnsLabelPattern.test(value);
}

export function isCanonicalCommunityAppHost(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.toLowerCase() || value.endsWith(".")) return false;
  if (utf8Length(value) > 253 || !value.startsWith("app.")) return false;
  return isCanonicalHnsRoot(value.slice(4));
}

export function isCanonicalPathAndQuery(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.includes("#") ||
    value.includes("\\") ||
    utf8Length(value) > HNS_PROFILE_MAX_TARGET_BYTES
  ) {
    return false;
  }
  const query = value.indexOf("?");
  const pathname = query < 0 ? value : value.slice(0, query);
  if (
    pathname.includes("//") ||
    /%(?:2f|5c)/iu.test(pathname) ||
    /%(?![0-9a-f]{2})/iu.test(value)
  ) {
    return false;
  }
  return [...value].every((character) => {
    const point = character.codePointAt(0) ?? 0;
    return point >= 0x20 && point !== 0x7f;
  });
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!base64UrlPattern.test(value)) throw new HnsIngressFailure("invalid_request");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (encodeBase64Url(bytes) !== value) throw new Error("noncanonical base64url");
    return bytes;
  } catch {
    throw new HnsIngressFailure("invalid_request");
  }
}

export function encodeHnsCommunityAuthorityHeader(authority: HnsCommunityAppAuthorityV1): string {
  if (!isHnsCommunityAppAuthorityV1(authority)) throw new HnsIngressFailure("invalid_request");
  const bytes = encoder.encode(JSON.stringify(authority));
  if (bytes.byteLength > 2_048) throw new HnsIngressFailure("invalid_request");
  return encodeBase64Url(bytes);
}

export function decodeHnsCommunityAuthorityHeader(value: string): HnsCommunityAppAuthorityV1 {
  const bytes = decodeBase64Url(value);
  if (bytes.byteLength > 2_048) throw new HnsIngressFailure("invalid_request");
  try {
    const text = decoder.decode(bytes);
    const decoded: unknown = JSON.parse(text);
    if (!isHnsCommunityAppAuthorityV1(decoded) || JSON.stringify(decoded) !== text) {
      throw new Error("noncanonical authority");
    }
    return decoded;
  } catch (error) {
    if (error instanceof HnsIngressFailure) throw error;
    throw new HnsIngressFailure("invalid_request");
  }
}

function header(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (value === null) throw new HnsIngressFailure("invalid_request");
  return value;
}

function pathAndQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    throw new HnsIngressFailure("invalid_request");
  }
}

export function readHnsForwarderEnvelopeV3(request: Request): HnsForwarderEnvelopeV3 {
  const envelope = {
    normalizedHost: header(request.headers, HNS_FORWARDER_HOST_HEADER),
    keyId: header(request.headers, HNS_FORWARDER_KEY_ID_HEADER),
    timestamp: header(request.headers, HNS_FORWARDER_TIMESTAMP_HEADER),
    pathAndQuery: header(request.headers, HNS_FORWARDER_PATH_HEADER),
    bodySha256: header(request.headers, HNS_FORWARDER_BODY_SHA256_HEADER),
    nonce: header(request.headers, HNS_FORWARDER_NONCE_HEADER),
    signature: header(request.headers, HNS_FORWARDER_SIGNATURE_HEADER),
    hostAuthority: decodeHnsCommunityAuthorityHeader(header(request.headers, HNS_FORWARDER_AUTHORITY_HEADER)),
  };
  if (
    !isCanonicalCommunityAppHost(envelope.normalizedHost) ||
    !keyIdPattern.test(envelope.keyId) ||
    !timestampPattern.test(envelope.timestamp) ||
    !isCanonicalPathAndQuery(envelope.pathAndQuery) ||
    envelope.pathAndQuery !== pathAndQuery(request.url) ||
    !sha256Pattern.test(envelope.bodySha256) ||
    !signaturePattern.test(envelope.signature) ||
    !acceptedMethods.has(request.method)
  ) {
    throw new HnsIngressFailure("invalid_request");
  }
  if (safeMethods.has(request.method)) {
    if (envelope.nonce !== "") throw new HnsIngressFailure("invalid_request");
  } else if (!noncePattern.test(envelope.nonce)) {
    throw new HnsIngressFailure("invalid_request");
  }
  if (request.method === "POST" || request.method === "PATCH") {
    const pathname = new URL(request.url).pathname;
    if (pathname !== "/api" && !pathname.startsWith("/api/")) {
      throw new HnsIngressFailure("invalid_request");
    }
  } else if (new URL(request.url).pathname === "/") {
    // The gateway must apply the one root rewrite before signing. A signed
    // community-host root reaching Solid unchanged is a mapping failure.
    throw new HnsIngressFailure("invalid_request");
  }
  return envelope;
}

export function hnsForwarderV3Preimage(
  envelope: HnsForwarderEnvelopeV3,
  resolution: HnsAuthorityResolutionV2,
  method: string,
): string {
  if (
    resolution.normalizedHost !== envelope.normalizedHost ||
    resolution.hostAuthority[0] !== "community_app_v1" ||
    JSON.stringify(resolution.hostAuthority) !== JSON.stringify(envelope.hostAuthority) ||
    !isCanonicalHnsRoot(resolution.canonicalRoot) ||
    !validIdentity(resolution.communityId) ||
    resolution.normalizedHost !== `app.${resolution.canonicalRoot}`
  ) {
    throw new HnsIngressFailure("authority_unavailable");
  }
  return JSON.stringify([
    HNS_FORWARDER_V3,
    envelope.keyId,
    envelope.timestamp,
    method,
    envelope.normalizedHost,
    envelope.pathAndQuery,
    resolution.canonicalRoot,
    resolution.communityId,
    envelope.hostAuthority,
    envelope.bodySha256,
    envelope.nonce,
  ]);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes))));
}

async function verifyHmac(keyBytes: Uint8Array, signature: string, preimage: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = Uint8Array.from(signature.slice(3).match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", key, ownedArrayBuffer(signatureBytes), encoder.encode(preimage));
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

export function makeStaticHnsForwarderKeyRegistryV1(
  records: readonly HnsForwarderKeyRecordV1[],
): HnsForwarderKeyRegistryV1 {
  if (
    records.length === 0 ||
    new Set(records.map((record) => record.keyId)).size !== records.length ||
    records.some(
      (record) =>
        !keyIdPattern.test(record.keyId) ||
        record.keyBytes.byteLength < 32 ||
        !Number.isSafeInteger(record.verifyNotBefore) ||
        !Number.isSafeInteger(record.verifyNotAfter) ||
        record.verifyNotBefore < 0 ||
        record.verifyNotAfter <= record.verifyNotBefore,
    )
  ) {
    throw new HnsIngressFailure("misconfigured");
  }
  const retained = records.map((record) => Object.freeze({ ...record, keyBytes: new Uint8Array(record.keyBytes) }));
  return Object.freeze({
    verificationKey: (keyId: string, nowSeconds: number) =>
      retained.find(
        (record) =>
          record.keyId === keyId && nowSeconds >= record.verifyNotBefore && nowSeconds <= record.verifyNotAfter,
      ) ?? null,
  });
}

export async function verifyHnsForwarderEnvelopeV3(options: {
  readonly request: Request;
  readonly bodyBytes: Uint8Array;
  readonly resolution: HnsAuthorityResolutionV2;
  readonly keyRegistry: HnsForwarderKeyRegistryV1;
  readonly replayStore: HnsReplayStoreV1;
  readonly clock: HnsForwarderClockV1;
  readonly limits: HnsForwarderLimitsV1;
}): Promise<HnsForwarderEnvelopeV3> {
  const { request, bodyBytes, resolution, keyRegistry, replayStore, clock, limits } = options;
  if (
    !Number.isSafeInteger(limits.freshnessWindowSeconds) ||
    limits.freshnessWindowSeconds <= 0 ||
    !Number.isSafeInteger(limits.futureClockSkewSeconds) ||
    limits.futureClockSkewSeconds < 0
  ) {
    throw new HnsIngressFailure("misconfigured");
  }
  if (bodyBytes.byteLength > HNS_PROFILE_MAX_REQUEST_BODY_BYTES) {
    throw new HnsIngressFailure("body_too_large");
  }
  const envelope = readHnsForwarderEnvelopeV3(request);
  if (envelope.bodySha256 !== (await sha256Hex(bodyBytes))) {
    throw new HnsIngressFailure("invalid_request");
  }
  const now = clock.nowUnixSeconds();
  const timestamp = Number(envelope.timestamp);
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < now - limits.freshnessWindowSeconds ||
    timestamp > now + limits.futureClockSkewSeconds
  ) {
    throw new HnsIngressFailure("stale");
  }
  const key = keyRegistry.verificationKey(envelope.keyId, now);
  const preimage = hnsForwarderV3Preimage(envelope, resolution, request.method);
  if (key === null || !(await verifyHmac(key.keyBytes, envelope.signature, preimage))) {
    throw new HnsIngressFailure("invalid_signature");
  }
  if (!safeMethods.has(request.method) && !(await replayStore.consume(envelope.keyId, envelope.nonce))) {
    throw new HnsIngressFailure("replayed");
  }
  return envelope;
}

export function hasReservedHnsIngressHeader(headers: Headers): boolean {
  for (const name of headers.keys()) {
    const lower = name.toLowerCase();
    if (
      reservedForwarderHeaders.has(lower) ||
      lower === CF_ACCESS_ASSERTION_HEADER ||
      lower === CF_ACCESS_CLIENT_ID_HEADER ||
      lower === CF_ACCESS_CLIENT_SECRET_HEADER ||
      lower.startsWith("cf-access-") ||
      lower.startsWith("x-pirate-gateway-") ||
      lower.startsWith("x-pirate-hns-forwarder-")
    ) {
      return true;
    }
  }
  return false;
}
