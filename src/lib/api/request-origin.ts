import { getRequestEvent } from "@solidjs/web";
import { resolveApiOriginFromHostname } from "./origin";

export function resolveApiOriginForRequest(request?: Request): string {
  const eventOrigin = getRequestEvent()?.locals?.apiOrigin;
  if (eventOrigin) return eventOrigin;

  const hostname = request
    ? new URL(request.url).hostname
    : typeof window !== "undefined"
      ? window.location.hostname
      : "localhost";
  return resolveApiOriginFromHostname(hostname);
}

export function resolveApiUrl(pathname: string, request?: Request): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(path, `${resolveApiOriginForRequest(request)}/`).toString();
}
