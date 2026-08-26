import {
  HNS_FORWARDER_AUTHORITY_HEADER,
  HNS_FORWARDER_BODY_SHA256_HEADER,
  HNS_FORWARDER_HOST_HEADER,
  HNS_FORWARDER_KEY_ID_HEADER,
  HNS_FORWARDER_NONCE_HEADER,
  HNS_FORWARDER_PATH_HEADER,
  HNS_FORWARDER_SIGNATURE_HEADER,
  HNS_FORWARDER_TIMESTAMP_HEADER,
  HNS_FORWARDER_V3,
  HnsIngressFailure,
  isCanonicalHnsRoot,
  sha256Hex,
  type HnsForwarderClockV1,
  type HnsForwarderKeyRegistryV1,
  type HnsForwarderLimitsV1,
} from "./wire.ts";

export const HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1 =
  '["pirate-hns-community-handle-persona-public-gateway-v1","pirate-hns-forwarder-v3","handle_persona_v1",["GET","HEAD"],["preserve_signed_root_v1","render_canonical_persona_v1"],[],[],["pirate-hns-solid-handle-host-authority-request-v1","pirate-hns-solid-handle-host-authority-response-v1"],["/internal/hns/solid-handle-host-authority/v1/resolve","/public-personas/:personaId","/p/:personaId"],8192,128,32768,0,16777216,15000,4096,2000,1048576,2000]' as const;
export const HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_BYTES = 447 as const;
export const HNS_HANDLE_PERSONA_PUBLIC_PROFILE_V1_SHA256 =
  "156487e5aff120efa08c1af0dce5a54d42ce32100f1cfb93de350ceac446c37b" as const;
export const HNS_HANDLE_PUBLIC_PERSONA_MAX_BYTES = 1_048_576 as const;
export const HNS_HANDLE_PUBLIC_PERSONA_DEADLINE_MS = 2_000 as const;

export type HnsHandlePersonaAuthorityV1 = readonly [
  tag: "handle_persona_v1",
  saleActivation: readonly [id: string, generation: number],
  namespaceAuthority: readonly [kind: "verified_namespace_v1", reference: string, generation: number],
  grant: readonly [id: string, generation: number],
  ownerPersonaId: string,
];

export interface HnsHandleAuthorityResolutionV1 {
  readonly normalizedHost: string;
  readonly canonicalRoot: string;
  readonly canonicalHandleLabel: string;
  readonly communityId: string;
  readonly ownerPersonaId: string;
  readonly hostAuthority: HnsHandlePersonaAuthorityV1;
  readonly gatewayDeploymentReference: string;
}

export interface HnsHandleForwarderEnvelopeV3 {
  readonly normalizedHost: string;
  readonly keyId: string;
  readonly timestamp: string;
  readonly pathAndQuery: "/";
  readonly bodySha256: string;
  readonly nonce: "";
  readonly signature: string;
  readonly hostAuthority: HnsHandlePersonaAuthorityV1;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const dnsLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const keyIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const timestampPattern = /^(?:0|[1-9][0-9]{0,19})$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const signaturePattern = /^v3=[0-9a-f]{64}$/u;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/u;

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && identityPattern.test(value) && encoder.encode(value).byteLength <= 256;
}

function validGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isHnsHandlePersonaAuthorityV1(value: unknown): value is HnsHandlePersonaAuthorityV1 {
  return Array.isArray(value) && value.length === 5 && value[0] === "handle_persona_v1" &&
    Array.isArray(value[1]) && value[1].length === 2 && validIdentity(value[1][0]) && validGeneration(value[1][1]) &&
    Array.isArray(value[2]) && value[2].length === 3 && value[2][0] === "verified_namespace_v1" &&
    validIdentity(value[2][1]) && validGeneration(value[2][2]) &&
    Array.isArray(value[3]) && value[3].length === 2 && validIdentity(value[3][0]) && validGeneration(value[3][1]) &&
    validIdentity(value[4]);
}

export function isCanonicalHandleHost(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.toLowerCase() || value.endsWith(".")) return false;
  const labels = value.split(".");
  return labels.length === 2 && dnsLabelPattern.test(labels[0] ?? "") && isCanonicalHnsRoot(labels[1]);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!base64UrlPattern.test(value)) throw new HnsIngressFailure("invalid_request");
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), character => character.charCodeAt(0));
    if (encodeBase64Url(bytes) !== value) throw new Error("noncanonical");
    return bytes;
  } catch {
    throw new HnsIngressFailure("invalid_request");
  }
}

export function encodeHnsHandleAuthorityHeader(authority: HnsHandlePersonaAuthorityV1): string {
  if (!isHnsHandlePersonaAuthorityV1(authority)) throw new HnsIngressFailure("invalid_request");
  const bytes = encoder.encode(JSON.stringify(authority));
  if (bytes.byteLength > 2_048) throw new HnsIngressFailure("invalid_request");
  return encodeBase64Url(bytes);
}

export function decodeHnsHandleAuthorityHeader(value: string): HnsHandlePersonaAuthorityV1 {
  const bytes = decodeBase64Url(value);
  if (bytes.byteLength > 2_048) throw new HnsIngressFailure("invalid_request");
  try {
    const text = decoder.decode(bytes);
    const decoded: unknown = JSON.parse(text);
    if (!isHnsHandlePersonaAuthorityV1(decoded) || JSON.stringify(decoded) !== text) throw new Error("invalid");
    return decoded;
  } catch {
    throw new HnsIngressFailure("invalid_request");
  }
}

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (value === null || value.includes(",")) throw new HnsIngressFailure("invalid_request");
  return value;
}

export function readHnsHandleForwarderEnvelopeV3(request: Request): HnsHandleForwarderEnvelopeV3 {
  const url = new URL(request.url);
  const normalizedHost = requiredHeader(request.headers, HNS_FORWARDER_HOST_HEADER);
  const keyId = requiredHeader(request.headers, HNS_FORWARDER_KEY_ID_HEADER);
  const timestamp = requiredHeader(request.headers, HNS_FORWARDER_TIMESTAMP_HEADER);
  const pathAndQuery = requiredHeader(request.headers, HNS_FORWARDER_PATH_HEADER);
  const bodySha256 = requiredHeader(request.headers, HNS_FORWARDER_BODY_SHA256_HEADER);
  const nonce = requiredHeader(request.headers, HNS_FORWARDER_NONCE_HEADER);
  const signature = requiredHeader(request.headers, HNS_FORWARDER_SIGNATURE_HEADER);
  if (
    (request.method !== "GET" && request.method !== "HEAD") || url.pathname !== "/" || url.search !== "" ||
    pathAndQuery !== "/" || !isCanonicalHandleHost(normalizedHost) || !keyIdPattern.test(keyId) ||
    !timestampPattern.test(timestamp) || !sha256Pattern.test(bodySha256) || nonce !== "" ||
    !signaturePattern.test(signature)
  ) throw new HnsIngressFailure("invalid_request");
  return {
    normalizedHost,
    keyId,
    timestamp,
    pathAndQuery: "/",
    bodySha256,
    nonce: "",
    signature,
    hostAuthority: decodeHnsHandleAuthorityHeader(requiredHeader(request.headers, HNS_FORWARDER_AUTHORITY_HEADER)),
  };
}

export function hnsHandleForwarderV3Preimage(
  envelope: HnsHandleForwarderEnvelopeV3,
  resolution: HnsHandleAuthorityResolutionV1,
  method: "GET" | "HEAD",
): string {
  if (
    resolution.normalizedHost !== envelope.normalizedHost ||
    JSON.stringify(resolution.hostAuthority) !== JSON.stringify(envelope.hostAuthority) ||
    resolution.hostAuthority[4] !== resolution.ownerPersonaId ||
    resolution.normalizedHost !== `${resolution.canonicalHandleLabel}.${resolution.canonicalRoot}` ||
    !dnsLabelPattern.test(resolution.canonicalHandleLabel) || !isCanonicalHnsRoot(resolution.canonicalRoot) ||
    !validIdentity(resolution.communityId) || !validIdentity(resolution.ownerPersonaId)
  ) throw new HnsIngressFailure("authority_unavailable");
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

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

async function verifyHmac(keyBytes: Uint8Array, signature: string, preimage: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.slice(3).match(/.{2}/gu) ?? [], value => Number.parseInt(value, 16));
  return crypto.subtle.verify("HMAC", key, ownedArrayBuffer(bytes), encoder.encode(preimage));
}

export async function verifyHnsHandleForwarderEnvelopeV3(options: {
  readonly request: Request;
  readonly bodyBytes: Uint8Array;
  readonly resolution: HnsHandleAuthorityResolutionV1;
  readonly keyRegistry: HnsForwarderKeyRegistryV1;
  readonly clock: HnsForwarderClockV1;
  readonly limits: HnsForwarderLimitsV1;
}): Promise<HnsHandleForwarderEnvelopeV3> {
  const { request, bodyBytes, resolution, keyRegistry, clock, limits } = options;
  if (
    bodyBytes.byteLength !== 0 || !Number.isSafeInteger(limits.freshnessWindowSeconds) ||
    limits.freshnessWindowSeconds <= 0 || !Number.isSafeInteger(limits.futureClockSkewSeconds) ||
    limits.futureClockSkewSeconds < 0
  ) throw new HnsIngressFailure("invalid_request");
  const envelope = readHnsHandleForwarderEnvelopeV3(request);
  if (envelope.bodySha256 !== await sha256Hex(bodyBytes)) throw new HnsIngressFailure("invalid_request");
  const now = clock.nowUnixSeconds();
  const timestamp = Number(envelope.timestamp);
  if (
    !Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(timestamp) ||
    timestamp < now - limits.freshnessWindowSeconds || timestamp > now + limits.futureClockSkewSeconds
  ) throw new HnsIngressFailure("stale");
  const key = keyRegistry.verificationKey(envelope.keyId, now);
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") throw new HnsIngressFailure("invalid_request");
  const preimage = hnsHandleForwarderV3Preimage(envelope, resolution, method);
  if (key === null || !(await verifyHmac(key.keyBytes, envelope.signature, preimage))) {
    throw new HnsIngressFailure("invalid_signature");
  }
  return envelope;
}
