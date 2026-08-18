import { badRequest, internalError } from "./errors.ts";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class ApiNextOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiNextOriginError";
  }
}

/**
 * Accept only an origin, never a URL with a path or credentials. HTTPS is
 * valid for injected/staging/production configuration; HTTP is deliberately
 * limited to loopback development origins.
 */
export function validateApiNextOrigin(value: string | undefined): URL {
  if (value === undefined || value.trim() !== value || value === "") {
    throw new ApiNextOriginError("API_NEXT_ORIGIN is missing");
  }
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new ApiNextOriginError("API_NEXT_ORIGIN is not a URL");
  }
  if (
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && LOOPBACK_HOSTNAMES.has(origin.hostname))) ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) {
    throw new ApiNextOriginError("API_NEXT_ORIGIN must be an origin");
  }
  return origin;
}

export function apiNextOriginOrError(value: string | undefined): URL {
  try {
    return validateApiNextOrigin(value);
  } catch {
    throw internalError("API transport is not configured");
  }
}

export function stripApiPrefix(pathname: string): string {
  if (pathname === "/api") return "/";
  if (pathname.startsWith("/api/")) return pathname.slice("/api".length);
  throw badRequest("Invalid API path");
}

export function upstreamUrl(requestUrl: URL, apiNextOrigin: URL): URL {
  const path = stripApiPrefix(requestUrl.pathname);
  // Concatenating the original search string retains duplicate query keys and
  // the exact encoded query rather than reserializing URLSearchParams.
  return new URL(`${apiNextOrigin.origin}${path}${requestUrl.search}`);
}

export function sameOrigin(value: string | URL): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiNextOriginError("Client origin is not a URL");
  }
  if (url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new ApiNextOriginError("Client origin must be an origin");
  }
  return url.origin;
}
