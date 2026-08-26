import {
  HnsIngressFailure,
  makeStaticHnsForwarderKeyRegistryV1,
  type HnsForwarderKeyRecordV1,
  type HnsForwarderKeyRegistryV1,
} from "./wire.ts";

export const HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA =
  "pirate-hns-forwarder-v3-key-registry-v1" as const;
export const HNS_FORWARDER_V3_KEY_REGISTRY_MAX_BYTES = 65_536 as const;

const encoder = new TextEncoder();
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const keyIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const base64UrlPattern = /^[A-Za-z0-9_-]{1,1024}$/u;

interface RegistryKey {
  readonly key_id: string;
  readonly key_base64url: string;
  readonly signing_enabled: boolean;
  readonly verify_not_before: number;
  readonly verify_not_after: number;
}

interface RegistryDocument {
  readonly schema: typeof HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA;
  readonly registry_reference: string;
  readonly registry_version: string;
  readonly keys: readonly RegistryKey[];
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function wholeSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validRegistryKey(value: unknown): value is RegistryKey {
  return (
    exactKeys(value, [
      "key_id",
      "key_base64url",
      "signing_enabled",
      "verify_not_before",
      "verify_not_after",
    ]) &&
    typeof value === "object" &&
    value !== null &&
    "key_id" in value &&
    typeof value.key_id === "string" &&
    keyIdPattern.test(value.key_id) &&
    "key_base64url" in value &&
    typeof value.key_base64url === "string" &&
    base64UrlPattern.test(value.key_base64url) &&
    "signing_enabled" in value &&
    typeof value.signing_enabled === "boolean" &&
    "verify_not_before" in value &&
    wholeSeconds(value.verify_not_before) &&
    "verify_not_after" in value &&
    wholeSeconds(value.verify_not_after) &&
    value.verify_not_after > value.verify_not_before
  );
}

function validRegistryDocument(value: unknown): value is RegistryDocument {
  return (
    exactKeys(value, ["schema", "registry_reference", "registry_version", "keys"]) &&
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    value.schema === HNS_FORWARDER_V3_KEY_REGISTRY_SCHEMA &&
    "registry_reference" in value &&
    typeof value.registry_reference === "string" &&
    identityPattern.test(value.registry_reference) &&
    "registry_version" in value &&
    typeof value.registry_version === "string" &&
    identityPattern.test(value.registry_version) &&
    "keys" in value &&
    Array.isArray(value.keys) &&
    value.keys.length >= 1 &&
    value.keys.length <= 8 &&
    value.keys.every(validRegistryKey) &&
    new Set(value.keys.map((key) => key.key_id)).size === value.keys.length &&
    value.keys.filter((key) => key.signing_enabled).length === 1
  );
}

function decodeBase64Url(value: string): Uint8Array {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const canonical = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
    if (canonical !== value || bytes.byteLength < 32 || bytes.byteLength > 1_024) throw new Error("invalid");
    return bytes;
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
}

export function parseHnsForwarderV3KeyRegistry(
  source: string,
  expectedReference: string,
  expectedVersion: string,
): HnsForwarderKeyRegistryV1 {
  try {
    if (
      encoder.encode(source).byteLength > HNS_FORWARDER_V3_KEY_REGISTRY_MAX_BYTES ||
      !identityPattern.test(expectedReference) ||
      !identityPattern.test(expectedVersion)
    ) {
      throw new Error("invalid");
    }
    const parsed: unknown = JSON.parse(source);
    if (
      !validRegistryDocument(parsed) ||
      parsed.registry_reference !== expectedReference ||
      parsed.registry_version !== expectedVersion
    ) {
      throw new Error("invalid");
    }
    const records: HnsForwarderKeyRecordV1[] = parsed.keys.map((key) => ({
      keyId: key.key_id,
      keyBytes: decodeBase64Url(key.key_base64url),
      verifyNotBefore: key.verify_not_before,
      verifyNotAfter: key.verify_not_after,
    }));
    return makeStaticHnsForwarderKeyRegistryV1(records);
  } catch {
    throw new HnsIngressFailure("misconfigured");
  }
}
