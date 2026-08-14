import { getRequestEvent } from "@solidjs/web";
import { env } from "cloudflare:workers";

function makeNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function classifyHost(host: string): "apex" | "app" | "other" {
  const hostname = host.split(":", 1)[0].toLowerCase();
  if (hostname.startsWith("app.")) return "app";
  if (hostname.endsWith(".hns") || hostname === "localhost") return "apex";
  return "other";
}

export default async function seamMiddleware(request: Request, next: () => Promise<Response>) {
  const event = getRequestEvent();
  const nonce = makeNonce();
  const host = request.headers.get("host") ?? "";
  const surface = classifyHost(host);
  event.locals.cspNonce = nonce;
  event.locals.seamHost = surface;

  if (new URL(request.url).pathname === "/seam/binding") {
    const binding = (env as { PUBLIC?: Fetcher }).PUBLIC;
    if (!binding) {
      event.locals.bindingResult = JSON.stringify({ ok: false, error: "PUBLIC binding missing" });
    } else {
      const upstream = await binding.fetch("https://public.internal/seam/ping");
      event.locals.bindingResult = JSON.stringify({ ok: true, upstream: await upstream.json() });
    }
  }

  if (surface === "apex" && new URL(request.url).pathname === "/") {
    const target = new URL(request.url);
    target.hostname = `app.${target.hostname}`;
    return Response.redirect(target, 307);
  }

  const response = await next();
  const headers = new Headers(response.headers);
  headers.set(
    "content-security-policy",
    `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'none'`,
  );
  headers.set("x-seam-host-surface", surface);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
