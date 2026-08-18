import { describe, expect, it, vi } from "vitest";
import {
  MAX_REQUEST_BODY_BYTES,
  ZkPassportClientError,
  compileZkPassportQuery,
  createZkPassportCeremony,
  parseZkPassportPresentation,
  type ZkPassportQueryBuilder,
  type ZkPassportQueryBuilderResult,
  type ZkPassportProofResult,
  type ZkPassportQuery,
  type ZkPassportQueryResult,
} from "./index.ts";

const sessionId = "session-1";
const requestHash = "a".repeat(64);
const customData = JSON.stringify({ proof_session_id: sessionId, request_hash: requestHash });

function presentation() {
  return {
    proof_session_id: sessionId,
    provider_id: "zkpassport",
    presentation: {
      kind: "embedded_sdk",
      session_id: sessionId,
      protocol: "zkpassport",
      version: "0.14.2",
      payload: {
        domain: "staging.pirate.sc",
        name: "Pirate",
        logo: "https://staging.pirate.sc/logo.png",
        purpose: "Verify document attributes for Pirate community access",
        scope: "pirate-social",
        validity_seconds: 3_600,
        dev_mode: true,
        unique_identifier_type: 0,
        uniqueIdentifierType: 0,
        request: {
          name: "Pirate",
          logo: "https://staging.pirate.sc/logo.png",
          purpose: "Verify document attributes for Pirate community access",
          scope: "pirate-social",
          validity: 3_600,
          devMode: true,
          uniqueIdentifierType: 0,
        },
        query: {
          bind: { custom_data: customData },
          age: { gte: 18 },
          nationality: { in: ["GEO", "USA"] },
        },
      },
    },
    expires_at: "2099-08-18T12:00:00.000Z",
    replayed: false,
  };
}

function callbacks() {
  let proof: ((value: ZkPassportProofResult) => void) | undefined;
  let result: ((value: {
    uniqueIdentifier?: string;
    uniqueIdentifierType?: string | number | boolean | null;
    verified: boolean;
    result: ZkPassportQueryResult;
  }) => void) | undefined;
  let reject: (() => void) | undefined;
  let error: ((value: string) => void) | undefined;
  return {
    get proof() { return proof; },
    get result() { return result; },
    get reject() { return reject; },
    get error() { return error; },
    wire: {
      onProofGenerated(callback: typeof proof) { proof = callback; },
      onResult(callback: typeof result) { result = callback; },
      onReject(callback: typeof reject) { reject = callback; },
      onError(callback: typeof error) { error = callback; },
    },
  };
}

function builderResult(
  callbackState = callbacks(),
  compiledQuery: ZkPassportQuery = presentation().presentation.payload.query,
) {
  return {
    result: {
      url: "https://zkpassport.id/r/request-1",
      query: compiledQuery,
      requestId: "request-1",
      ...callbackState.wire,
    },
    callbacks: callbackState,
  } satisfies { result: ZkPassportQueryBuilderResult; callbacks: ReturnType<typeof callbacks> };
}

function queryBuilder(result: ZkPassportQueryBuilderResult) {
  const calls: unknown[][] = [];
  const builder: ZkPassportQueryBuilder = {
    bind(...args) { calls.push(["bind", ...args]); return builder; },
    gte(...args) { calls.push(["gte", ...args]); return builder; },
    in(...args) { calls.push(["in", ...args]); return builder; },
    done() { calls.push(["done"]); return result; },
  };
  return { builder, calls };
}

function validQueryResult(): ZkPassportQueryResult {
  // SAFETY: this fixture is the exact SDK 0.14.2 result for the presentation query.
  return {
    bind: { custom_data: customData },
    age: { gte: { expected: 18, result: true } },
    nationality: { in: { expected: ["GEO", "USA"], result: true } },
  } as ZkPassportQueryResult;
}

describe("ZKPassport embedded presentation", () => {
  it("strictly validates the provider-owned session, SDK options, binding, and query", () => {
    expect(parseZkPassportPresentation(presentation())).toEqual({
      proofSessionId: sessionId,
      domain: "staging.pirate.sc",
      request: presentation().presentation.payload.request,
      query: presentation().presentation.payload.query,
    });

    const extra = structuredClone(presentation());
    Object.assign(extra.presentation.payload.query.age, { gt: 17 });
    expect(() => parseZkPassportPresentation(extra)).toThrowError(
      expect.objectContaining({ code: "invalid_presentation" }),
    );

    const rebound = structuredClone(presentation());
    rebound.presentation.payload.query.bind.custom_data = JSON.stringify({
      proof_session_id: "another-session",
      request_hash: requestHash,
    });
    expect(() => parseZkPassportPresentation(rebound)).toThrowError(ZkPassportClientError);

    const divergent = structuredClone(presentation());
    divergent.presentation.payload.request.devMode = false;
    expect(() => parseZkPassportPresentation(divergent)).toThrowError(ZkPassportClientError);

    const stale = structuredClone(presentation());
    stale.expires_at = "2020-01-01T00:00:00.000Z";
    expect(() => parseZkPassportPresentation(stale)).toThrowError(ZkPassportClientError);
  });

  it("compiles only the supported query operators in canonical order and checks SDK output", () => {
    const built = builderResult();
    const compiler = queryBuilder(built.result);
    expect(compileZkPassportQuery(
      compiler.builder,
      parseZkPassportPresentation(presentation()).query,
    )).toBe(built.result);
    expect(compiler.calls).toEqual([
      ["bind", "custom_data", customData],
      ["gte", "age", 18],
      ["in", "nationality", ["GEO", "USA"]],
      ["done"],
    ]);

    const changed = builderResult(callbacks(), {
      bind: { custom_data: customData },
      age: { gte: 21 },
      nationality: { in: ["GEO", "USA"] },
    });
    expect(() => compileZkPassportQuery(
      queryBuilder(changed.result).builder,
      parseZkPassportPresentation(presentation()).query,
    )).toThrowError(expect.objectContaining({ code: "query_mismatch" }));
  });
});

describe("ZKPassport ceremony", () => {
  it("rejects SSR use before starting a verification session", async () => {
    const start = vi.fn();
    await expect(createZkPassportCeremony({
      // SAFETY: only the start spy can be reached before the SSR guard fails.
      apiClient: {
        post_verificationSessions: start,
        post_verificationSessionsProofSessionIdComplete: vi.fn(),
      // SAFETY: the fake implements exactly the generated methods consumed here.
      } as never,
      csrfToken: "csrf-token",
    })).rejects.toMatchObject({ code: "browser_required" });
    expect(start).not.toHaveBeenCalled();
  });

  it("submits exactly once and excludes SDK verdict and identifiers", async () => {
    const callbackState = callbacks();
    const built = builderResult(callbackState);
    const compiler = queryBuilder(built.result);
    const start = vi.fn(async () => presentation());
    const complete = vi.fn(async (_input: unknown, _options?: unknown) => ({
      proof_session_id: sessionId,
      status: "completed" as const,
      replayed: false,
    }));
    const request = vi.fn(async () => compiler.builder);
    const ceremony = await createZkPassportCeremony({
      // SAFETY: the fake implements exactly the two generated methods consumed by the ceremony.
      apiClient: {
        post_verificationSessions: start,
        post_verificationSessionsProofSessionIdComplete: complete,
      } as never,
      csrfToken: "csrf-token",
      idempotencyKey: () => "idem-1",
      loadSdk: async () => () => ({ request }),
    });

    expect(ceremony).toMatchObject({
      proofSessionId: sessionId,
      requestId: "request-1",
      url: "https://zkpassport.id/r/request-1",
    });
    expect(start).toHaveBeenCalledWith(
      { body: { intent_id: "platform.document.age-18", provider_id: "zkpassport" } },
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(request).toHaveBeenCalledWith(presentation().presentation.payload.request);

    callbackState.proof?.({ proof: "one" });
    callbackState.proof?.({ proof: "two" });
    const queryResult = validQueryResult();
    callbackState.result?.({
      uniqueIdentifier: "must-not-leave-browser-callback",
      uniqueIdentifierType: 0,
      verified: true,
      result: queryResult,
    });
    callbackState.result?.({ verified: true, result: queryResult });

    await expect(ceremony.completion).resolves.toMatchObject({
      proofSessionId: sessionId,
      status: "completed",
      replayed: false,
    });
    expect(complete).toHaveBeenCalledTimes(1);
    const completionInput = complete.mock.calls[0]?.[0];
    expect(completionInput).toEqual({
      body: {
        idempotency_key: "idem-1",
        payload: { proofs: [{ proof: "one" }, { proof: "two" }], queryResult },
      },
      path: { proofSessionId: sessionId },
    });
    expect(JSON.stringify(completionInput)).not.toContain("must-not-leave-browser-callback");
    expect((await ceremony.completion).requestBodyBytes).toBeLessThanOrEqual(MAX_REQUEST_BODY_BYTES);
  });

  it("fails locally before transport when proofs exceed the proxy ingress limit", async () => {
    const callbackState = callbacks();
    const built = builderResult(callbackState);
    const complete = vi.fn();
    const cancelRequest = vi.fn();
    const ceremony = await createZkPassportCeremony({
      // SAFETY: the fake implements exactly the two generated methods consumed by the ceremony.
      apiClient: {
        post_verificationSessions: vi.fn(async () => presentation()),
        post_verificationSessionsProofSessionIdComplete: complete,
      } as never,
      csrfToken: "csrf-token",
      idempotencyKey: () => "idem-2",
      loadSdk: async () => () => ({
        async request() { return queryBuilder(built.result).builder; },
        cancelRequest,
      }),
    });
    callbackState.proof?.({ proof: "x".repeat(MAX_REQUEST_BODY_BYTES) });
    callbackState.result?.({
      verified: true,
      result: {
        bind: { custom_data: customData },
        age: { gte: { expected: 18, result: true } },
        nationality: { in: { expected: ["GEO", "USA"], result: true } },
      },
    });
    await expect(ceremony.completion).rejects.toMatchObject({ code: "submission_too_large" });
    expect(complete).not.toHaveBeenCalled();
    expect(cancelRequest).toHaveBeenCalledWith("request-1");
  });

  it("maps provider rejection without retaining or submitting proofs", async () => {
    const callbackState = callbacks();
    const built = builderResult(callbackState);
    const complete = vi.fn();
    const ceremony = await createZkPassportCeremony({
      // SAFETY: the fake implements exactly the two generated methods consumed by the ceremony.
      apiClient: {
        post_verificationSessions: vi.fn(async () => presentation()),
        post_verificationSessionsProofSessionIdComplete: complete,
      } as never,
      csrfToken: "csrf-token",
      loadSdk: async () => () => ({
        async request() { return queryBuilder(built.result).builder; }
      }),
    });
    callbackState.proof?.({ proof: "private" });
    callbackState.reject?.();
    callbackState.result?.({ verified: true, result: {} });
    await expect(ceremony.completion).rejects.toMatchObject({ code: "proof_rejected" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("treats SDK proof errors as terminal and ignores a later result", async () => {
    const callbackState = callbacks();
    const built = builderResult(callbackState);
    const complete = vi.fn();
    const ceremony = await createZkPassportCeremony({
      // SAFETY: the fake implements exactly the two generated methods consumed by the ceremony.
      apiClient: {
        post_verificationSessions: vi.fn(async () => presentation()),
        post_verificationSessionsProofSessionIdComplete: complete,
      } as never,
      csrfToken: "csrf-token",
      loadSdk: async () => () => ({
        async request() { return queryBuilder(built.result).builder; },
      }),
    });
    callbackState.proof?.({ proof: "partial" });
    callbackState.error?.("Cannot generate proof");
    callbackState.result?.({
      verified: false,
      result: {
        bind: { custom_data: customData },
        age: { gte: { expected: 18, result: false } },
        nationality: { in: { expected: ["GEO", "USA"], result: false } },
      },
    });
    await expect(ceremony.completion).rejects.toMatchObject({ code: "proof_generation_failed" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("caps proof collection and rejects extra query-result disclosures", async () => {
    const callbackState = callbacks();
    const built = builderResult(callbackState);
    const complete = vi.fn();
    const ceremony = await createZkPassportCeremony({
      // SAFETY: the fake implements exactly the two generated methods consumed by the ceremony.
      apiClient: {
        post_verificationSessions: vi.fn(async () => presentation()),
        post_verificationSessionsProofSessionIdComplete: complete,
      } as never,
      csrfToken: "csrf-token",
      loadSdk: async () => () => ({
        async request() { return queryBuilder(built.result).builder; },
      }),
    });
    callbackState.proof?.({ proof: "one" });
    const disclosedResult = {
      bind: { custom_data: customData },
      age: { gte: { expected: 18, result: true } },
      nationality: { in: { expected: ["GEO", "USA"], result: true } },
      fullname: { disclose: { result: "must-not-leave-browser" } },
    };
    // SAFETY: this deliberately hostile runtime value tests the SDK type boundary.
    callbackState.result?.({ verified: true, result: disclosedResult as ZkPassportQueryResult });
    await expect(ceremony.completion).rejects.toMatchObject({ code: "invalid_presentation" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("caps proof collection before a bridge can retain an unbounded set", async () => {
    const callbackState = callbacks();
    const built = builderResult(callbackState);
    const complete = vi.fn();
    const ceremony = await createZkPassportCeremony({
      // SAFETY: the fake implements exactly the two generated methods consumed by the ceremony.
      apiClient: {
        post_verificationSessions: vi.fn(async () => presentation()),
        post_verificationSessionsProofSessionIdComplete: complete,
      } as never,
      csrfToken: "csrf-token",
      loadSdk: async () => () => ({
        async request() { return queryBuilder(built.result).builder; },
      }),
    });
    for (let index = 0; index < 65; index += 1) callbackState.proof?.({ index });
    await expect(ceremony.completion).rejects.toMatchObject({ code: "proof_count_invalid" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("cancels the provider bridge and makes cancellation terminal", async () => {
    const callbackState = callbacks();
    const built = builderResult(callbackState);
    const cancelRequest = vi.fn();
    const complete = vi.fn();
    const ceremony = await createZkPassportCeremony({
      // SAFETY: the fake implements exactly the generated methods consumed here.
      apiClient: {
        post_verificationSessions: vi.fn(async () => presentation()),
        post_verificationSessionsProofSessionIdComplete: complete,
      } as never,
      csrfToken: "csrf-token",
      loadSdk: async () => () => ({
        async request() { return queryBuilder(built.result).builder; },
        cancelRequest,
      }),
    });
    callbackState.proof?.({ proof: "private" });
    ceremony.cancel();
    ceremony.cancel();
    callbackState.result?.({ verified: true, result: validQueryResult() });
    await expect(ceremony.completion).rejects.toMatchObject({ code: "ceremony_cancelled" });
    expect(cancelRequest).toHaveBeenCalledTimes(1);
    expect(cancelRequest).toHaveBeenCalledWith("request-1");
    expect(complete).not.toHaveBeenCalled();
  });
});
