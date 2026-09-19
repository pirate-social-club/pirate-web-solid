import { getRequestEvent } from "@solidjs/web";

// One R2 account host serves the ingress upload target and the immutable
// originals bucket whose signed GET grants song playback in the audio element.
const MEDIA_R2_ORIGIN = "https://08a4c22cf52e2ecae883e36f80a33f4a.r2.cloudflarestorage.com";

function makeNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * The karaoke route connects directly to the api-next WebSocket issued by the
 * session response (`websocket_url`), so its exact origin must be admitted by
 * `connect-src`. The origin comes from the configured API origin per
 * environment; a malformed or absent value adds nothing and keeps the policy
 * closed. This is an exact origin, never a wildcard.
 */
function apiNextWebSocketOrigin(apiNextOrigin: string | undefined): string | null {
  if (apiNextOrigin === undefined || apiNextOrigin.trim() === "") return null;
  try {
    const url = new URL(apiNextOrigin);
    if (url.protocol === "https:") return `wss://${url.host}`;
    if (url.protocol === "http:") return `ws://${url.host}`;
    return null;
  } catch {
    return null;
  }
}

async function standaloneMiddleware(request: Request, next: () => Promise<Response>) {
  const event = getRequestEvent();
  if (!event) return next();
  const nonce = makeNonce();
  event.locals.cspNonce = nonce;
  const response = await next();
  const headers = new Headers(response.headers);
  // SAFETY: this request-local value comes directly from the typed Worker
  // render context and is read only as that same optional string.
  const locals = event.locals as typeof event.locals & { apiNextOrigin?: string };
  const policy = securityPolicy(new URL(request.url).pathname, nonce, locals.apiNextOrigin);
  headers.set("content-security-policy", policy);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function securityPolicy(pathname: string, nonce: string, apiNextOrigin?: string): string {
  const verificationRoute = pathname === "/verify/zkpassport";
  const veryRoute = pathname === "/verify/very";
  const signInRoute = pathname === "/auth/sign-in";
  const apiSocketOrigin = apiNextWebSocketOrigin(apiNextOrigin);
  const karaokeConnectSrc = `connect-src 'self' https://auth.privy.io ${MEDIA_R2_ORIGIN} https://*.cloudflarestream.com${
    apiSocketOrigin === null ? "" : ` ${apiSocketOrigin}`
  }`;
  return verificationRoute
    ? `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'; img-src 'self' data:; frame-src https://auth.privy.io https://challenges.cloudflare.com; connect-src 'self' https://auth.privy.io wss://bridge.zkpassport.id https://certificates.zkpassport.id https://circuits2.zkpassport.id https://ipfs.zkpassport.id https://eth-sepolia.g.alchemy.com; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
    : veryRoute
      // Route-scoped compatibility exception: pinned @veryai/widget 1.0.22
      // injects its bundled stylesheet at runtime, which requires unsafe-inline.
      ? `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://assets.very.org; frame-src https://auth.privy.io; connect-src 'self' https://auth.privy.io https://bridge.very.org https://verify.very.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
      : signInRoute
        ? `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; img-src 'self' data: https://auth.privy.io; frame-src https://auth.privy.io; connect-src 'self' https://auth.privy.io; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
        : `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; frame-src https://auth.privy.io; ${karaokeConnectSrc}; media-src 'self' blob: ${MEDIA_R2_ORIGIN} https://*.cloudflarestream.com; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
}

export default [standaloneMiddleware];
