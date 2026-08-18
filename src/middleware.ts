import { getRequestEvent } from "@solidjs/web";

function makeNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function standaloneMiddleware(_request: Request, next: () => Promise<Response>) {
  const event = getRequestEvent();
  if (!event) return next();
  const nonce = makeNonce();
  event.locals.cspNonce = nonce;
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set(
    "content-security-policy",
    `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'none'`,
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default [standaloneMiddleware];
