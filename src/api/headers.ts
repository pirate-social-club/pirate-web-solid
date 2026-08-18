const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// These are end-to-end request headers used by the generated contract and
// ordinary browser navigation. Authorization and Host are intentionally not
// in this set; browser session auth is carried by the host-only Cookie.
const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "content-language",
  "content-type",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-unmodified-since",
  "idempotency-key",
  "origin",
  "prefer",
  "range",
  "referer",
  "x-csrf-token",
  "x-request-id",
]);

export const MAX_REQUEST_BODY_BYTES = 1_048_576;
export const MAX_COOKIE_HEADER_BYTES = 16 * 1024;
export const MAX_COOKIE_VALUE_BYTES = 16 * 1024;

export const SESSION_COOKIE_NAME = "__Host-pirate_session";
export const CSRF_COOKIE_NAME = "__Host-pirate_csrf";

const SENSITIVE_COOKIE_NAMES = new Set([SESSION_COOKIE_NAME, CSRF_COOKIE_NAME]);

export function isHopByHopHeader(name: string): boolean {
  return HOP_BY_HOP_HEADERS.has(name.toLowerCase());
}

/**
 * Copy only browser-safe request headers. Cookie is copied as one raw value;
 * parsing or rebuilding it here would turn duplicate sensitive cookie pairs
 * into a last-write-wins map and change their security meaning.
 */
export function safeRequestHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    const lower = name.toLowerCase();
    if (lower === "cookie") {
      headers.append(name, value);
    } else if (SAFE_REQUEST_HEADERS.has(lower) && !isHopByHopHeader(lower) && lower !== "content-length") {
      headers.append(name, value);
    }
  }
  return headers;
}

function setCookieValues(headers: Headers): string[] {
  // SAFETY: Workers and modern Fetch implementations expose getSetCookie on
  // Headers; the optional member is feature-detected immediately below.
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const values = withGetSetCookie.getSetCookie?.();
  if (values !== undefined) return [...values];
  const combined = headers.get("set-cookie");
  if (combined === null || combined === "") return [];
  // Commas in Expires attributes are followed by a day, not a cookie name.
  return combined.split(/,\s*(?=[^;,\s=]+\s*=)/u).map((value) => value.trim()).filter(Boolean);
}

/** Copy response metadata while preserving every Set-Cookie line. */
export function safeResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  for (const [name, value] of response.headers) {
    const lower = name.toLowerCase();
    if (lower !== "set-cookie" && !isHopByHopHeader(lower)) headers.append(name, value);
  }
  for (const value of setCookieValues(response.headers)) headers.append("set-cookie", value);
  return headers;
}

export function cookieHeaderWithinLimits(value: string | null): boolean {
  if (value === null) return true;
  if (value.length > MAX_COOKIE_HEADER_BYTES) return false;
  for (const pair of value.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const raw = pair.slice(separator + 1).trim();
    if (SENSITIVE_COOKIE_NAMES.has(name) && raw.length > MAX_COOKIE_VALUE_BYTES) return false;
  }
  return true;
}
