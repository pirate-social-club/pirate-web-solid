import { getRequestEvent } from "@solidjs/web";

function makeNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function standaloneMiddleware(request: Request, next: () => Promise<Response>) {
  const event = getRequestEvent();
  if (!event) return next();
  const nonce = makeNonce();
  event.locals.cspNonce = nonce;
  const response = await next();
  const headers = new Headers(response.headers);
  const verificationRoute = new URL(request.url).pathname === "/verify/zkpassport";
  const policy = verificationRoute
    ? `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'; img-src 'self' data:; frame-src https://auth.privy.io https://challenges.cloudflare.com; connect-src 'self' https://auth.privy.io wss://bridge.zkpassport.id https://certificates.zkpassport.id https://circuits2.zkpassport.id https://ipfs.zkpassport.id https://eth-sepolia.g.alchemy.com; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
    : `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
  headers.set("content-security-policy", policy);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default [standaloneMiddleware];
