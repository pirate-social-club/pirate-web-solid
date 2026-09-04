import { createPirateApiClient, type GetPublicPostsSitemapResponse } from "@pirate/api-client";
import { validateApiNextOrigin } from "../../../api/origin.ts";
import type { ApiFetch } from "../../../api/proxy.ts";
import { logicalSlugFromCanonicalPublicPostPath, PUBLIC_APP_ORIGIN } from "./public-post-route.model.ts";

const PAGE_LIMIT = "1000";
const MAX_SHARDS = 1_000;
const shardPrefix = "/sitemaps/posts/";

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function encodeCursor(cursor: string): string {
  const bytes = new TextEncoder().encode(cursor);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeCursor(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded !== "" && encodeCursor(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

function urlset(page: GetPublicPostsSitemapResponse): string {
  const entries = page.items.map(item => {
    if (logicalSlugFromCanonicalPublicPostPath(item.canonical_path) === null) {
      throw new Error("Invalid canonical post path in sitemap page");
    }
    const location = new URL(item.canonical_path, PUBLIC_APP_ORIGIN).toString();
    return `  <url><loc>${xml(location)}</loc></url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function sitemapIndex(cursors: readonly (string | null)[]): string {
  const entries = cursors.map(cursor => {
    const token = cursor === null ? "root" : encodeCursor(cursor);
    const location = new URL(`${shardPrefix}${token}.xml`, PUBLIC_APP_ORIGIN).toString();
    return `  <sitemap><loc>${xml(location)}</loc></sitemap>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
}

function response(request: Request, body: string, status = 200): Response {
  return new Response(request.method === "HEAD" ? null : body, {
    status,
    headers: {
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

export async function publicPostSitemapResponse(
  request: Request,
  apiNextOrigin: string | undefined,
  fetchImpl: ApiFetch = fetch,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;
  const shard = /^\/sitemaps\/posts\/(root|[A-Za-z0-9_-]+)\.xml$/u.exec(pathname);
  if (pathname !== "/sitemap.xml" && shard === null) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  }

  let origin: URL;
  try {
    origin = validateApiNextOrigin(apiNextOrigin);
  } catch {
    return response(request, "Sitemap unavailable", 503);
  }
  const client = createPirateApiClient(`${origin.origin}/`, {
    credentials: "omit",
    signal: request.signal,
    // SAFETY: ApiFetch has the generated client's standard fetch call shape;
    // runtime-specific static fetch members are not used by the client.
    fetchImpl: fetchImpl as typeof fetch,
  });
  const load = (cursor: string | null) => client.get_publicPostsSitemap({
    query: { ...(cursor === null ? {} : { cursor }), limit: PAGE_LIMIT },
  });

  try {
    if (shard !== null) {
      const cursor = shard[1] === "root" ? null : decodeCursor(shard[1] ?? "");
      if (cursor === null && shard[1] !== "root") return response(request, "Invalid sitemap shard", 400);
      return response(request, urlset(await load(cursor)));
    }

    const first = await load(null);
    if (first.next_cursor === null) return response(request, urlset(first));
    const cursors: (string | null)[] = [null];
    let cursor: string | null = first.next_cursor;
    while (cursor !== null && cursors.length < MAX_SHARDS) {
      cursors.push(cursor);
      cursor = (await load(cursor)).next_cursor;
    }
    if (cursor !== null) return response(request, "Sitemap exceeds the bounded shard limit", 503);
    return response(request, sitemapIndex(cursors));
  } catch {
    return response(request, "Sitemap unavailable", 503);
  }
}
