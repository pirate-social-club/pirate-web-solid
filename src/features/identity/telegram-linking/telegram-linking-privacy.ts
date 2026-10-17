const TELEGRAM_PRIVATE_PATHS: readonly string[] = ["/telegram/link", "/telegram/link/callback", "/telegram/link/account"];

/**
 * The spelling @solidjs/router matches a pathname by: leading and repeated trailing slashes
 * trimmed, one trailing slash dropped, percent-decoded with decodeURI and case-folded. Every
 * privacy decision uses this key, so no spelling the router routes can bypass it.
 */
export function routerPathKey(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|(\/)\/+$/g, "$1");
  const comparable = (trimmed ? `/${trimmed}` : "").toLowerCase().replace(/\/$/, "");
  try { return decodeURI(comparable).toLowerCase(); } catch { return comparable; }
}

export function isTelegramLinkPage(pathname: string): boolean {
  return TELEGRAM_PRIVATE_PATHS.includes(routerPathKey(pathname));
}

/** Another spelling of a private Telegram route. It is refused before routing or rendering. */
export function isTelegramPageAlias(pathname: string): boolean {
  return isTelegramLinkPage(pathname) && !TELEGRAM_PRIVATE_PATHS.includes(pathname);
}

/** SSR must not serialize callbacks into router state, metadata or HTML. */
export function telegramPageRequest(request: Request): Request {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return new Request(url.href, request);
}

export function telegramPageResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
