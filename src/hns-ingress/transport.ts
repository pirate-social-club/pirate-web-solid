import {
  CF_ACCESS_ASSERTION_HEADER,
  CF_ACCESS_CLIENT_ID_HEADER,
  CF_ACCESS_CLIENT_SECRET_HEADER,
  HNS_FORWARDER_RESERVED_HEADERS,
  HNS_PROFILE_MAX_COOKIE_VALUE_BYTES,
  HNS_PROFILE_MAX_REQUEST_BODY_BYTES,
  HNS_PROFILE_MAX_REQUEST_FIELDS,
  HNS_PROFILE_MAX_REQUEST_HEADER_BYTES,
  HNS_PROFILE_MAX_RESPONSE_BYTES,
  HNS_PROFILE_UPSTREAM_DEADLINE_MS,
  HnsIngressFailure,
} from "./wire.ts";

export type HnsUpstreamFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const encoder = new TextEncoder();
const allowedRequestHeaders = new Set([
  "accept",
  "accept-language",
  "cache-control",
  "content-language",
  "content-type",
  "cookie",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-unmodified-since",
  "idempotency-key",
  "origin",
  "range",
  "referer",
  "x-csrf-token",
  "x-request-id",
]);
const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const acceptedCookieNames = new Set(["__Host-pirate_session", "__Host-pirate_csrf"]);
const acceptedCookieAttributes = new Set(["secure", "httponly", "path", "samesite", "expires", "max-age"]);

function utf8Length(value: string): number {
  return encoder.encode(value).byteLength;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

function reserved(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower === CF_ACCESS_ASSERTION_HEADER ||
    lower === CF_ACCESS_CLIENT_ID_HEADER ||
    lower === CF_ACCESS_CLIENT_SECRET_HEADER ||
    lower.startsWith("cf-access-") ||
    lower.startsWith("x-pirate-gateway-") ||
    lower.startsWith("x-pirate-hns-forwarder-")
  );
}

export function validateHnsIngressRequestHeaders(headers: Headers): void {
  let fields = 0;
  let bytes = 0;
  for (const [name, value] of headers) {
    fields += 1;
    bytes += utf8Length(name) + utf8Length(value);
    if (fields > HNS_PROFILE_MAX_REQUEST_FIELDS || bytes > HNS_PROFILE_MAX_REQUEST_HEADER_BYTES) {
      throw new HnsIngressFailure("invalid_request");
    }
    if (name.toLowerCase() === "cookie") {
      for (const pair of value.split(";")) {
        const separator = pair.indexOf("=");
        if (separator <= 0) continue;
        const cookieName = pair.slice(0, separator).trim();
        const cookieValue = pair.slice(separator + 1).trim();
        if (acceptedCookieNames.has(cookieName) && utf8Length(cookieValue) > HNS_PROFILE_MAX_COOKIE_VALUE_BYTES) {
          throw new HnsIngressFailure("invalid_request");
        }
      }
    }
  }
}

export async function readHnsIngressBody(request: Request): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declared)) throw new HnsIngressFailure("invalid_request");
    if (Number(declared) > HNS_PROFILE_MAX_REQUEST_BODY_BYTES) throw new HnsIngressFailure("body_too_large");
  }
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const onAbort = (): void => {
    void reader.cancel(request.signal.reason).catch(() => undefined);
  };
  if (request.signal.aborted) onAbort();
  else request.signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      if (request.signal.aborted) throw request.signal.reason ?? new DOMException("Aborted", "AbortError");
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > HNS_PROFILE_MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new HnsIngressFailure("body_too_large");
      }
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    request.signal.removeEventListener("abort", onAbort);
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

export function cleanHnsApplicationHeaders(headers: Headers): Headers {
  const cleaned = new Headers();
  for (const [name, value] of headers) {
    const lower = name.toLowerCase();
    if (allowedRequestHeaders.has(lower) && !reserved(lower) && !hopByHopHeaders.has(lower)) {
      cleaned.append(lower, value);
    }
  }
  return cleaned;
}

export function makeCleanHnsApplicationRequest(
  request: Request,
  bodyBytes: Uint8Array,
  canonicalOrigin: string,
): Request {
  const source = new URL(request.url);
  const target = new URL(`${source.pathname}${source.search}`, canonicalOrigin);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : ownedArrayBuffer(bodyBytes);
  return new Request(target, {
    method: request.method,
    headers: cleanHnsApplicationHeaders(request.headers),
    ...(body === undefined ? {} : { body }),
    signal: request.signal,
    redirect: "manual",
  });
}

function setCookieValues(headers: Headers): string[] {
  // SAFETY: Fetch implementations may expose the standard getSetCookie
  // extension; it is feature-detected before invocation.
  const values = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (values !== undefined) return [...values];
  const combined = headers.get("set-cookie");
  if (combined === null || combined === "") return [];
  return combined.split(/,\s*(?=[^;,\s=]+\s*=)/u).map((value) => value.trim()).filter(Boolean);
}

function validateCookie(line: string): string {
  const members = line.split(";").map((member) => member.trim());
  const first = members.shift() ?? "";
  const separator = first.indexOf("=");
  if (separator <= 0) throw new HnsIngressFailure("upstream_unavailable");
  const name = first.slice(0, separator);
  const value = first.slice(separator + 1);
  if (!acceptedCookieNames.has(name) || utf8Length(value) > HNS_PROFILE_MAX_COOKIE_VALUE_BYTES) {
    throw new HnsIngressFailure("upstream_unavailable");
  }
  const attributes = new Map<string, string | true>();
  for (const member of members) {
    if (member === "") throw new HnsIngressFailure("upstream_unavailable");
    const equals = member.indexOf("=");
    const attribute = (equals < 0 ? member : member.slice(0, equals)).toLowerCase();
    const attributeValue = equals < 0 ? true : member.slice(equals + 1);
    if (!acceptedCookieAttributes.has(attribute) || attributes.has(attribute)) {
      throw new HnsIngressFailure("upstream_unavailable");
    }
    attributes.set(attribute, attributeValue);
  }
  const maxAge = attributes.get("max-age");
  const expires = attributes.get("expires");
  if (
    (maxAge !== undefined && (typeof maxAge !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(maxAge))) ||
    (expires !== undefined && (typeof expires !== "string" || Number.isNaN(Date.parse(expires))))
  ) {
    throw new HnsIngressFailure("upstream_unavailable");
  }
  if (
    attributes.get("secure") !== true ||
    attributes.get("path") !== "/" ||
    typeof attributes.get("samesite") !== "string" ||
    String(attributes.get("samesite")).toLowerCase() !== "lax" ||
    (name === "__Host-pirate_session") !== (attributes.get("httponly") === true)
  ) {
    throw new HnsIngressFailure("upstream_unavailable");
  }
  return line;
}

export function validatedHnsResponseHeaders(response: Response, bodyLength: number): Headers {
  const headers = new Headers();
  for (const [name, value] of response.headers) {
    const lower = name.toLowerCase();
    if (
      lower !== "set-cookie" &&
      lower !== "content-length" &&
      !hopByHopHeaders.has(lower) &&
      !reserved(lower)
    ) {
      headers.append(lower, value);
    }
  }
  const cookies = setCookieValues(response.headers);
  const names = new Set<string>();
  for (const line of cookies) {
    const name = line.slice(0, line.indexOf("="));
    // Cloudflare Access may mint this infrastructure cookie while admitting
    // the service-token request. It is not application state and must never
    // cross onto the community origin.
    if (name === "CF_Authorization") continue;
    if (names.has(name)) throw new HnsIngressFailure("upstream_unavailable");
    names.add(name);
    headers.append("set-cookie", validateCookie(line));
  }
  headers.set("content-length", String(bodyLength));
  return headers;
}

interface UpstreamDeadline {
  readonly signal: AbortSignal;
  readonly interrupt: Promise<never>;
  readonly didTimeout: () => boolean;
  readonly finish: () => void;
}

function upstreamDeadline(parent: AbortSignal): UpstreamDeadline {
  const controller = new AbortController();
  let timedOut = false;
  let rejectInterrupt: ((reason?: unknown) => void) | undefined;
  const interrupt = new Promise<never>((_resolve, reject) => {
    rejectInterrupt = reject;
  });
  void interrupt.catch(() => undefined);
  const onAbort = (): void => {
    const reason = parent.reason ?? new DOMException("Aborted", "AbortError");
    controller.abort(reason);
    rejectInterrupt?.(reason);
  };
  if (parent.aborted) onAbort();
  else parent.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    const reason = new DOMException("HNS upstream timed out", "TimeoutError");
    controller.abort(reason);
    rejectInterrupt?.(reason);
  }, HNS_PROFILE_UPSTREAM_DEADLINE_MS);
  return {
    signal: controller.signal,
    interrupt,
    didTimeout: () => timedOut,
    finish: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
    },
  };
}

async function readBoundedUpstream(response: Response, interrupt: Promise<never>): Promise<Uint8Array> {
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
      const next = await Promise.race([reader.read(), interrupt]);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > HNS_PROFILE_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new HnsIngressFailure("upstream_unavailable");
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

export async function proxyVerifiedHnsApiRequest(options: {
  readonly request: Request;
  readonly bodyBytes: Uint8Array;
  readonly apiOrigin: string;
  readonly accessClientId: string;
  readonly accessClientSecret: string;
  readonly fetchImpl?: HnsUpstreamFetch;
}): Promise<Response> {
  const source = new URL(options.request.url);
  const target = new URL(`${source.pathname}${source.search}`, options.apiOrigin);
  const headers = cleanHnsApplicationHeaders(options.request.headers);
  for (const name of HNS_FORWARDER_RESERVED_HEADERS) {
    const value = options.request.headers.get(name);
    if (value === null) throw new HnsIngressFailure("invalid_request");
    headers.set(name, value);
  }
  headers.set(CF_ACCESS_CLIENT_ID_HEADER, options.accessClientId);
  headers.set(CF_ACCESS_CLIENT_SECRET_HEADER, options.accessClientSecret);
  const bounded = upstreamDeadline(options.request.signal);
  try {
    const upstream = await Promise.race([
      (options.fetchImpl ?? fetch)(target, {
        method: options.request.method,
        headers,
        ...(options.request.method === "GET" || options.request.method === "HEAD"
          ? {}
          : { body: ownedArrayBuffer(options.bodyBytes) }),
        redirect: "manual",
        signal: bounded.signal,
      }),
      bounded.interrupt,
    ]);
    if (upstream.status >= 300 && upstream.status < 400) throw new HnsIngressFailure("upstream_unavailable");
    const bytes = await readBoundedUpstream(upstream, bounded.interrupt);
    const responseBytes = options.request.method === "HEAD" ? new Uint8Array() : bytes;
    return new Response(ownedArrayBuffer(responseBytes), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: validatedHnsResponseHeaders(upstream, responseBytes.byteLength),
    });
  } catch (error) {
    if (options.request.signal.aborted && !bounded.didTimeout()) throw options.request.signal.reason ?? error;
    if (error instanceof HnsIngressFailure) throw error;
    throw new HnsIngressFailure("upstream_unavailable");
  } finally {
    bounded.finish();
  }
}
