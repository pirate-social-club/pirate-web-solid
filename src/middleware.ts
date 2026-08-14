import routes from "virtual:file-routes";
import { createAPIHandler } from "filesystem-routing/api";
import { getRequestEvent } from "@solidjs/web";
import { env } from "cloudflare:workers";
import type { HostContext, HostSurface } from "./lib/host-context";

function makeNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function classifyHost(host: string): HostSurface {
  const hostname = host.split(":", 1)[0].toLowerCase();
  if (hostname === "pirate.sc" || hostname === "www.pirate.sc" || hostname === "localhost" || hostname === "127.0.0.1") {
    return "canonical";
  }
  if (hostname.startsWith("app.") && hostname.endsWith(".hns")) return "sovereign-app";
  if (hostname.endsWith(".hns")) return "sovereign-apex";
  return "canonical";
}

function hostName(host: string): string {
  return host.split(":", 1)[0].toLowerCase().replace(/\.+$/u, "");
}

function deriveCommunitySlug(host: string, request: Request): string | null {
  const trusted = request.headers.get("x-pirate-hns-trusted-forwarder") === "1";
  const forwardedRoute = request.headers.get("x-pirate-hns-community-route")?.split(",", 1)[0]?.trim();
  if (trusted && forwardedRoute) return forwardedRoute;

  const hostname = hostName(host);
  if (!hostname.endsWith(".hns")) return null;
  const withoutSuffix = hostname.slice(0, -4);
  return withoutSuffix.startsWith("app.") ? withoutSuffix.slice(4) || null : withoutSuffix || null;
}

function makeHostContext(request: Request): HostContext {
  const host = request.headers.get("host") ?? "";
  const surface = classifyHost(host);
  const trusted = request.headers.get("x-pirate-hns-trusted-forwarder") === "1";
  const forwardingMetadataPresent = trusted && Boolean(
    request.headers.get("x-pirate-hns-community-id")?.trim()
      || request.headers.get("x-pirate-hns-community-route")?.trim(),
  );
  return {
    surface,
    communitySlug: deriveCommunitySlug(host, request),
    importedRoot: surface === "sovereign-apex",
    forwardingMetadataPresent,
  };
}

async function seamMiddleware(request: Request, next: () => Promise<Response>) {
  const event = getRequestEvent();
  const nonce = makeNonce();
  const hostContext = makeHostContext(request);
  const surface = hostContext.surface;
  const url = new URL(request.url);
  event.locals.cspNonce = nonce;
  event.locals.hostContext = hostContext;
  event.locals.seamHost = surface;

  if (surface === "sovereign-apex" && url.pathname === "/") {
    const target = new URL(request.url);
    target.hostname = `app.${hostName(request.headers.get("host") ?? "")}`;
    return Response.redirect(target, 307);
  }

  if (surface === "sovereign-apex" && !hostContext.forwardingMetadataPresent) {
    return new Response("Sovereign forwarding metadata required", {
      status: 404,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "x-solid-route-outcome": "sovereign-forwarding-metadata-required",
      },
    });
  }

  if (url.pathname === "/seam/binding") {
    const binding = (env as { PUBLIC?: Fetcher }).PUBLIC;
    if (!binding) {
      event.locals.bindingResult = JSON.stringify({ ok: false, error: "PUBLIC binding missing" });
    } else {
      const upstream = await binding.fetch("https://public.internal/seam/ping");
      event.locals.bindingResult = JSON.stringify({ ok: true, upstream: await upstream.json() });
    }
  }

  const response = await next();
  const headers = new Headers(response.headers);
  headers.set(
    "content-security-policy",
    `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'none'`,
  );
  headers.set("x-seam-host-surface", surface);
  const status = event.locals.routeStatus ?? response.status;
  return new Response(response.body, { status, statusText: response.statusText, headers });
}

export default [seamMiddleware, createAPIHandler(routes)];
