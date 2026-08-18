import type { PirateApiClient, PirateApiRequestOptions } from "@pirate/api-client";
import type { ProofResult, QueryResult } from "@zkpassport/sdk";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "./client.ts";
import { MAX_REQUEST_BODY_BYTES } from "./headers.ts";

export const ZKPASSPORT_PROVIDER_ID = "zkpassport" as const;
export const ZKPASSPORT_PRESENTATION_PROTOCOL = "zkpassport" as const;
export const ZKPASSPORT_PRESENTATION_VERSION = "0.14.2" as const;
export const ZKPASSPORT_AGE_18_INTENT_ID = "platform.document.age-18" as const;

export type ZkPassportClientErrorCode =
  | "browser_required"
  | "csrf_required"
  | "invalid_presentation"
  | "query_mismatch"
  | "proof_rejected"
  | "proof_generation_failed"
  | "proof_count_invalid"
  | "submission_too_large";

export class ZkPassportClientError extends Error {
  readonly code: ZkPassportClientErrorCode;

  constructor(code: ZkPassportClientErrorCode) {
    super(code);
    this.name = "ZkPassportClientError";
    this.code = code;
  }
}

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;
interface JsonObject {
  readonly [key: string]: JsonValue;
}
interface MutableJsonObject {
  [key: string]: JsonValue;
}

export type ZkPassportQuery = Readonly<{
  bind: Readonly<{ custom_data: string }>;
  age?: Readonly<{ gte: number }>;
  nationality?: Readonly<{ in: readonly string[] }>;
}>;

export type ZkPassportRequest = Readonly<{
  name: string;
  logo?: string;
  purpose: string;
  scope: string;
  validity: number;
  devMode: boolean;
  uniqueIdentifierType: 0;
}>;

interface ParsedZkPassportRequest {
  name: string;
  logo?: string;
  purpose: string;
  scope: string;
  validity: number;
  devMode: boolean;
  uniqueIdentifierType: 0;
}

interface ParsedZkPassportQuery {
  bind: { custom_data: string };
  age?: Readonly<{ gte: number }>;
  nationality?: Readonly<{ in: readonly string[] }>;
}

export type ZkPassportPresentation = Readonly<{
  proofSessionId: string;
  domain: string;
  request: ZkPassportRequest;
  query: ZkPassportQuery;
}>;

export type ZkPassportProofResult = ProofResult;
export type ZkPassportQueryResult = QueryResult;

export interface ZkPassportQueryBuilderResult {
  readonly url: string;
  readonly query: ZkPassportQuery;
  readonly requestId: string;
  readonly onProofGenerated: (callback: (proof: ZkPassportProofResult) => void) => void;
  readonly onResult: (callback: (response: Readonly<{
    readonly uniqueIdentifier?: string;
    readonly uniqueIdentifierType?: JsonPrimitive;
    readonly verified: boolean;
    readonly result: ZkPassportQueryResult;
  }>) => void) => void;
  readonly onReject: (callback: () => void) => void;
  readonly onError: (callback: (error: string) => void) => void;
}

export interface ZkPassportQueryBuilder {
  bind(key: "custom_data", value: string): ZkPassportQueryBuilder;
  gte(key: "age", value: number): ZkPassportQueryBuilder;
  in(key: "nationality", value: string[]): ZkPassportQueryBuilder;
  done(): ZkPassportQueryBuilderResult;
}

export interface ZkPassportSdk {
  request(options: ZkPassportRequest & { readonly logo: string }): Promise<ZkPassportQueryBuilder>;
}

export type ZkPassportSdkFactory = (domain: string) => ZkPassportSdk;

type VerificationApiClient = Pick<
  PirateApiClient,
  "post_verificationSessions" | "post_verificationSessionsProofSessionIdComplete"
>;

export interface CreateZkPassportCeremonyOptions {
  readonly apiClient?: VerificationApiClient;
  readonly csrfToken?: string;
  readonly idempotencyKey?: () => string;
  readonly loadSdk?: () => Promise<ZkPassportSdkFactory>;
  readonly requestOptions?: PirateApiRequestOptions;
}

export interface ZkPassportCompletion {
  readonly proofSessionId: string;
  readonly status: "completed";
  readonly replayed: boolean;
  /** Exact UTF-8 byte count of the JSON body sent through the 1 MiB proxy. */
  readonly requestBodyBytes: number;
}

export interface ZkPassportCeremony {
  readonly proofSessionId: string;
  readonly requestId: string;
  readonly url: string;
  readonly completion: Promise<ZkPassportCompletion>;
}

function invalidPresentation(): never {
  throw new ZkPassportClientError("invalid_presentation");
}

function record(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidPresentation();
  }
  // SAFETY: null and arrays were rejected, leaving an object whose properties
  // are subsequently parsed before use.
  return value as JsonObject;
}

function exactKeys(value: JsonObject, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    invalidPresentation();
  }
}

function boundedString(value: unknown, maximum = 4096): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) {
    return invalidPresentation();
  }
  return value;
}

function optionalBoundedString(value: unknown): string | undefined {
  return value === undefined ? undefined : boundedString(value);
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return invalidPresentation();
  }
  return value;
}

function literalZero(value: unknown): 0 {
  if (value !== 0) return invalidPresentation();
  return 0;
}

function canonicalFutureInstant(value: unknown): string {
  const instant = boundedString(value, 64);
  const epoch = Date.parse(instant);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== instant || epoch <= Date.now()) {
    return invalidPresentation();
  }
  return instant;
}

function parseDomain(value: unknown): string {
  const domain = boundedString(value, 253);
  if (domain !== domain.trim() || domain !== domain.toLowerCase()) return invalidPresentation();
  try {
    const parsed = new URL(`https://${domain}`);
    if (
      parsed.hostname !== domain || parsed.port !== "" || parsed.pathname !== "/" ||
      parsed.search !== "" || parsed.hash !== ""
    ) {
      return invalidPresentation();
    }
  } catch {
    return invalidPresentation();
  }
  return domain;
}

function parseRequest(value: unknown): ZkPassportRequest {
  const input = record(value);
  exactKeys(
    input,
    ["name", "purpose", "scope", "validity", "devMode", "uniqueIdentifierType"],
    ["logo"],
  );
  if (typeof input.devMode !== "boolean") return invalidPresentation();
  const request: ParsedZkPassportRequest = {
    name: boundedString(input.name),
    purpose: boundedString(input.purpose),
    scope: boundedString(input.scope, 128),
    validity: positiveInteger(input.validity),
    devMode: input.devMode,
    uniqueIdentifierType: literalZero(input.uniqueIdentifierType),
  };
  const logo = optionalBoundedString(input.logo);
  if (logo !== undefined) request.logo = logo;
  return request;
}

function parseQuery(value: unknown, proofSessionId: string): ZkPassportQuery {
  const input = record(value);
  exactKeys(input, ["bind"], ["age", "nationality"]);

  const bind = record(input.bind);
  exactKeys(bind, ["custom_data"]);
  const customData = boundedString(bind.custom_data, 16 * 1024);
  try {
    const binding = record(JSON.parse(customData));
    exactKeys(binding, ["proof_session_id", "request_hash"]);
    if (
      binding.proof_session_id !== proofSessionId ||
      typeof binding.request_hash !== "string" ||
      !/^[0-9a-f]{64}$/u.test(binding.request_hash)
    ) {
      return invalidPresentation();
    }
  } catch (error) {
    if (error instanceof ZkPassportClientError) throw error;
    return invalidPresentation();
  }

  let age: ZkPassportQuery["age"];
  if (input.age !== undefined) {
    const candidate = record(input.age);
    exactKeys(candidate, ["gte"]);
    const minimum = positiveInteger(candidate.gte);
    // SDK 0.14.2 accepts age predicates only in the inclusive 1..99 range.
    if (minimum > 99) return invalidPresentation();
    age = { gte: minimum };
  }

  let nationality: ZkPassportQuery["nationality"];
  if (input.nationality !== undefined) {
    const candidate = record(input.nationality);
    exactKeys(candidate, ["in"]);
    if (!Array.isArray(candidate.in) || candidate.in.length === 0 || candidate.in.length > 249) {
      return invalidPresentation();
    }
    const countries = candidate.in.map((country) => {
      if (typeof country !== "string" || !/^[A-Z]{3}$/u.test(country)) {
        return invalidPresentation();
      }
      return country;
    });
    if (new Set(countries).size !== countries.length) return invalidPresentation();
    if ([...countries].sort((left, right) => left.localeCompare(right)).join("\0") !== countries.join("\0")) {
      return invalidPresentation();
    }
    nationality = { in: countries };
  }

  const query: ParsedZkPassportQuery = { bind: { custom_data: customData } };
  if (age !== undefined) query.age = age;
  if (nationality !== undefined) query.nationality = nationality;
  return query;
}

/** Strictly validate api-next's provider-owned embedded presentation. */
export function parseZkPassportPresentation(started: unknown): ZkPassportPresentation {
  const response = record(started);
  if (response.status === "completed") return invalidPresentation();
  exactKeys(response, ["proof_session_id", "provider_id", "presentation", "expires_at", "replayed"]);
  const proofSessionId = boundedString(response.proof_session_id);
  if (response.provider_id !== ZKPASSPORT_PROVIDER_ID || typeof response.replayed !== "boolean") {
    return invalidPresentation();
  }
  canonicalFutureInstant(response.expires_at);

  const presentation = record(response.presentation);
  exactKeys(presentation, ["kind", "session_id", "protocol", "version", "payload"]);
  if (
    presentation.kind !== "embedded_sdk" || presentation.session_id !== proofSessionId ||
    presentation.protocol !== ZKPASSPORT_PRESENTATION_PROTOCOL ||
    presentation.version !== ZKPASSPORT_PRESENTATION_VERSION
  ) {
    return invalidPresentation();
  }

  const payload = record(presentation.payload);
  exactKeys(
    payload,
    [
      "domain", "name", "purpose", "scope", "validity_seconds", "dev_mode",
      "unique_identifier_type", "uniqueIdentifierType", "request", "query",
    ],
    ["logo"],
  );
  const request = parseRequest(payload.request);
  const logo = optionalBoundedString(payload.logo);
  if (
    payload.name !== request.name || payload.purpose !== request.purpose ||
    payload.scope !== request.scope || payload.validity_seconds !== request.validity ||
    payload.dev_mode !== request.devMode || literalZero(payload.unique_identifier_type) !== request.uniqueIdentifierType ||
    literalZero(payload.uniqueIdentifierType) !== request.uniqueIdentifierType || logo !== request.logo
  ) {
    return invalidPresentation();
  }

  return {
    proofSessionId,
    domain: parseDomain(payload.domain),
    request,
    query: parseQuery(payload.query, proofSessionId),
  };
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  // SAFETY: primitive and array cases returned above, so this is the JsonObject branch.
  const input = value as JsonObject;
  return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(input[key])}`).join(",")}}`;
}

export function compileZkPassportQuery(
  builder: ZkPassportQueryBuilder,
  query: ZkPassportQuery,
): ZkPassportQueryBuilderResult {
  let current = builder.bind("custom_data", query.bind.custom_data);
  if (query.age !== undefined) current = current.gte("age", query.age.gte);
  if (query.nationality !== undefined) current = current.in("nationality", [...query.nationality.in]);
  const compiled = current.done();
  if (canonicalJson(compiled.query) !== canonicalJson(query)) {
    throw new ZkPassportClientError("query_mismatch");
  }
  return compiled;
}

async function defaultSdkLoader(): Promise<ZkPassportSdkFactory> {
  if (typeof window === "undefined") throw new ZkPassportClientError("browser_required");
  const module = await import("@zkpassport/sdk");
  return (domain) => {
    const sdk = new module.ZKPassport(domain);
    return {
      request: async (options) => {
        const builder = await sdk.request(options);
        const providerBuilder: unknown = builder;
        // SAFETY: this adapter exposes the exact 0.14.2 builder subset used
        // here; all provider query values and the compiled query are checked locally.
        return providerBuilder as ZkPassportQueryBuilder;
      },
    };
  };
}

function requestBodyBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    throw new ZkPassportClientError("submission_too_large");
  }
}

function resultCheck(value: JsonValue | undefined, expected: JsonValue): JsonObject {
  const check = record(value);
  exactKeys(check, ["expected", "result"]);
  if (canonicalJson(check.expected ?? null) !== canonicalJson(expected) || typeof check.result !== "boolean") {
    throw new ZkPassportClientError("query_mismatch");
  }
  return check;
}

function projectQueryResult(result: ZkPassportQueryResult, query: ZkPassportQuery): ZkPassportQueryResult {
  const source = record(result);
  const optional = [
    ...(query.age === undefined ? [] : ["age"]),
    ...(query.nationality === undefined ? [] : ["nationality"]),
  ];
  exactKeys(source, ["bind"], optional);
  const bind = record(source.bind);
  exactKeys(bind, ["custom_data"]);
  if (bind.custom_data !== query.bind.custom_data) {
    throw new ZkPassportClientError("query_mismatch");
  }

  const projected: MutableJsonObject = { bind: { custom_data: query.bind.custom_data } };
  if (query.age !== undefined) {
    const age = record(source.age);
    exactKeys(age, ["gte"]);
    projected.age = { gte: resultCheck(age.gte, query.age.gte) };
  }
  if (query.nationality !== undefined) {
    const nationality = record(source.nationality);
    exactKeys(nationality, ["in"]);
    projected.nationality = { in: resultCheck(nationality.in, query.nationality.in) };
  }
  // SAFETY: the projected object is the strict QueryResult subset for the
  // server-authored bind/age/nationality query supported by this client.
  return projected as ZkPassportQueryResult;
}

/**
 * Start one browser ceremony. Raw proofs remain only in memory and the first
 * terminal SDK callback wins, preventing duplicate completion submissions.
 */
export async function createZkPassportCeremony(
  options: CreateZkPassportCeremonyOptions = {},
): Promise<ZkPassportCeremony> {
  if (options.loadSdk === undefined && typeof window === "undefined") {
    throw new ZkPassportClientError("browser_required");
  }
  const csrfToken = options.csrfToken ?? readCsrfCookie();
  if (csrfToken === undefined) throw new ZkPassportClientError("csrf_required");
  const requestOptions = sessionRequestOptions(csrfToken, options.requestOptions);
  const apiClient = options.apiClient ?? createSessionApiClient();
  const started = await apiClient.post_verificationSessions(
    { body: { intent_id: ZKPASSPORT_AGE_18_INTENT_ID, provider_id: ZKPASSPORT_PROVIDER_ID } },
    requestOptions,
  );
  const presentation = parseZkPassportPresentation(started);
  const sdkFactory = await (options.loadSdk ?? defaultSdkLoader)();
  const sdk = sdkFactory(presentation.domain);
  const builder = await sdk.request({ ...presentation.request, logo: presentation.request.logo ?? "" });
  const compiled = compileZkPassportQuery(builder, presentation.query);
  if (typeof compiled.url !== "string" || compiled.url.length === 0 || typeof compiled.requestId !== "string" || compiled.requestId.length === 0) {
    throw new ZkPassportClientError("query_mismatch");
  }

  const proofs: ZkPassportProofResult[] = [];
  let terminal = false;
  let resolveCompletion!: (value: ZkPassportCompletion) => void;
  let rejectCompletion!: (reason: ZkPassportClientError | unknown) => void;
  const completion = new Promise<ZkPassportCompletion>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  compiled.onProofGenerated((proof) => {
    if (terminal) return;
    if (proofs.length >= 64) {
      terminal = true;
      proofs.length = 0;
      rejectCompletion(new ZkPassportClientError("proof_count_invalid"));
      return;
    }
    proofs.push(proof);
  });
  compiled.onReject(() => {
    if (terminal) return;
    terminal = true;
    proofs.length = 0;
    rejectCompletion(new ZkPassportClientError("proof_rejected"));
  });
  compiled.onError(() => {
    if (terminal) return;
    // 0.14.2 reports an individual circuit-generation failure through this
    // callback. The server requires the complete proof set, so a later result
    // cannot turn that partial set into an acceptable ceremony.
    terminal = true;
    proofs.length = 0;
    rejectCompletion(new ZkPassportClientError("proof_generation_failed"));
  });
  compiled.onResult((response) => {
    if (terminal) return;
    terminal = true;
    if (proofs.length === 0 || proofs.length > 64) {
      proofs.length = 0;
      rejectCompletion(new ZkPassportClientError("proof_count_invalid"));
      return;
    }
    let idempotencyKey: string;
    let queryResult: ZkPassportQueryResult;
    try {
      idempotencyKey = (options.idempotencyKey ?? (() => crypto.randomUUID()))();
      queryResult = projectQueryResult(response.result, presentation.query);
    } catch (error) {
      proofs.length = 0;
      rejectCompletion(error);
      return;
    }
    const proofPayload = [...proofs];
    proofs.length = 0;
    const body = {
      idempotency_key: idempotencyKey,
      payload: { proofs: proofPayload, queryResult },
    };
    const bytes = requestBodyBytes(body);
    if (bytes > MAX_REQUEST_BODY_BYTES) {
      rejectCompletion(new ZkPassportClientError("submission_too_large"));
      return;
    }
    void apiClient.post_verificationSessionsProofSessionIdComplete(
      { body, path: { proofSessionId: presentation.proofSessionId } },
      requestOptions,
    ).then(
      (completed) => {
        if (
          completed.status !== "completed" ||
          completed.proof_session_id !== presentation.proofSessionId
        ) {
          rejectCompletion(new ZkPassportClientError("invalid_presentation"));
          return;
        }
        resolveCompletion({
          proofSessionId: presentation.proofSessionId,
          status: "completed",
          replayed: completed.replayed,
          requestBodyBytes: bytes,
        });
      },
      (error: unknown) => rejectCompletion(error),
    );
  });

  return {
    proofSessionId: presentation.proofSessionId,
    requestId: compiled.requestId,
    url: compiled.url,
    completion,
  };
}
