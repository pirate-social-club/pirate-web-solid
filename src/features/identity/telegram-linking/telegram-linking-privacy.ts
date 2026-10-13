export function isTelegramLinkPage(pathname: string): boolean {
  return pathname === "/telegram/link" || pathname === "/telegram/link/callback" || pathname === "/telegram/link/account";
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
