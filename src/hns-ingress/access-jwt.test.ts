import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ACCESS_JWKS_CACHE_MAX_SECONDS,
  ACCESS_JWKS_MAX_BYTES,
  makeCloudflareAccessJwtValidatorV1,
} from "./index.ts";

const issuer = "https://pirate-test.cloudflareaccess.com";
const audience = "access-application-audience-01";
const jwksUrl = `${issuer}/cdn-cgi/access/certs`;
let oldKey: CryptoKeyPair;
let rotatedKey: CryptoKeyPair;
let unknownKey: CryptoKeyPair;

beforeAll(async () => {
  // SAFETY: RSASSA key generation with both sign and verify usages returns a
  // CryptoKeyPair under the WebCrypto contract.
  oldKey = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  // SAFETY: the same pinned generation parameters return a CryptoKeyPair.
  rotatedKey = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  // SAFETY: the same pinned generation parameters return a CryptoKeyPair.
  unknownKey = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
});

afterEach(() => vi.useRealTimers());

interface JwtClaimOverrides {
  readonly iss?: string;
  readonly aud?: string | readonly string[];
  readonly iat?: number;
  readonly exp?: number;
  readonly nbf?: number;
}

interface TestJwk extends JsonWebKey {
  readonly kid: string;
  readonly alg: "RS256";
  readonly use: "sig";
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

async function jwt(
  pair: CryptoKeyPair,
  kid: string,
  claims: JwtClaimOverrides = {},
): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid })));
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({ iss: issuer, aud: audience, iat: 1_770_000_000, exp: 1_770_000_300, ...claims }),
    ),
  );
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(signature))}`;
}

async function jwk(pair: CryptoKeyPair, kid: string): Promise<TestJwk> {
  return { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid, alg: "RS256", use: "sig" };
}

describe("Cloudflare Access JWT policy v1", () => {
  it("validates RS256 issuer, audience, and time claims", async () => {
    const key = await jwk(oldKey, "old-key");
    const validator = makeCloudflareAccessJwtValidatorV1({
      issuer,
      audience,
      jwksUrl,
      clock: { nowUnixSeconds: () => 1_770_000_010 },
      fetchImpl: async () => new Response(JSON.stringify({ keys: [key] }), { headers: { "content-type": "application/json" } }),
    });
    await expect(validator.verify(await jwt(oldKey, "old-key"))).resolves.toBeUndefined();
    await expect(validator.verify(await jwt(oldKey, "old-key", { aud: "wrong" }))).rejects.toMatchObject({
      reason: "access_denied",
    });
    await expect(validator.verify(await jwt(oldKey, "old-key", { iss: "https://wrong.cloudflareaccess.com" }))).rejects.toMatchObject({
      reason: "access_denied",
    });
    await expect(validator.verify(await jwt(oldKey, "old-key", { exp: 1_769_999_949 }))).rejects.toMatchObject({
      reason: "access_denied",
    });
    await expect(validator.verify(await jwt(oldKey, "old-key", { nbf: 1_770_000_071 }))).rejects.toMatchObject({
      reason: "access_denied",
    });
  });

  it("caches for at most one hour and performs one forced rotation fetch", async () => {
    const oldJwk = await jwk(oldKey, "old-key");
    const rotatedJwk = await jwk(rotatedKey, "rotated-key");
    let now = 1_770_000_010;
    let calls = 0;
    let served = oldJwk;
    const validator = makeCloudflareAccessJwtValidatorV1({
      issuer,
      audience,
      jwksUrl,
      clock: { nowUnixSeconds: () => now },
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ keys: [served] }), { headers: { "content-type": "application/json" } });
      },
    });
    await validator.verify(await jwt(oldKey, "old-key", { exp: 1_770_010_000 }));
    await validator.verify(await jwt(oldKey, "old-key", { exp: 1_770_010_000 }));
    expect(calls).toBe(1);
    served = rotatedJwk;
    await validator.verify(await jwt(rotatedKey, "rotated-key", { exp: 1_770_010_000 }));
    expect(calls).toBe(2);
    await expect(validator.verify(await jwt(unknownKey, "still-unknown", { exp: 1_770_010_000 }))).rejects.toMatchObject({
      reason: "access_denied",
    });
    expect(calls).toBe(3);
    now += ACCESS_JWKS_CACHE_MAX_SECONDS;
    await validator.verify(await jwt(rotatedKey, "rotated-key", { iat: now - 1, exp: now + 300 }));
    expect(calls).toBe(4);
  });

  it("does not retain failed JWKS results and fails redirects, HTML, and oversized sets closed", async () => {
    const key = await jwk(oldKey, "old-key");
    let calls = 0;
    let response = new Response("not-json", { headers: { "content-type": "application/json" } });
    const validator = makeCloudflareAccessJwtValidatorV1({
      issuer,
      audience,
      jwksUrl,
      clock: { nowUnixSeconds: () => 1_770_000_010 },
      fetchImpl: async () => {
        calls += 1;
        return response.clone();
      },
    });
    const token = await jwt(oldKey, "old-key");
    await expect(validator.verify(token)).rejects.toMatchObject({ reason: "access_denied" });
    response = new Response(JSON.stringify({ keys: [key] }), { headers: { "content-type": "application/json" } });
    await expect(validator.verify(token)).resolves.toBeUndefined();
    expect(calls).toBe(2);

    for (const invalid of [
      new Response(null, { status: 302, headers: { location: "https://example.test" } }),
      new Response("<html>", { headers: { "content-type": "text/html" } }),
      new Response("x", {
        headers: { "content-type": "application/json", "content-length": String(ACCESS_JWKS_MAX_BYTES + 1) },
      }),
    ]) {
      const rejected = makeCloudflareAccessJwtValidatorV1({
        issuer,
        audience,
        jwksUrl,
        clock: { nowUnixSeconds: () => 1_770_000_010 },
        fetchImpl: async () => invalid,
      });
      await expect(rejected.verify(token)).rejects.toMatchObject({ reason: "access_denied" });
    }
  });

  it("enforces the JWKS deadline even when fetch ignores abort and propagates caller abort", async () => {
    vi.useFakeTimers();
    const validator = makeCloudflareAccessJwtValidatorV1({
      issuer,
      audience,
      jwksUrl,
      clock: { nowUnixSeconds: () => 1_770_000_010 },
      fetchImpl: () => new Promise<Response>(() => undefined),
    });
    const token = await jwt(oldKey, "old-key");
    const timedOut = validator.verify(token);
    const timeoutExpectation = expect(timedOut).rejects.toMatchObject({ reason: "access_denied" });
    await vi.advanceTimersByTimeAsync(2_000);
    await timeoutExpectation;

    const controller = new AbortController();
    const aborted = validator.verify(token, controller.signal);
    const abortExpectation = expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(new DOMException("cancelled", "AbortError"));
    await abortExpectation;
  });
});
