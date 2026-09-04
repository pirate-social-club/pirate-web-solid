import { describe, expect, it } from "vitest";
import { publicPostSitemapResponse } from "./public-post-sitemap.ts";

function sitemapFetch(pages: Readonly<Record<string, { items: readonly string[]; next: string | null }>>) {
  return async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const key = url.searchParams.get("cursor") ?? "root";
    const page = pages[key];
    if (page === undefined) return Response.json({ error: { code: "bad_request", message: "bad", retryable: false } }, { status: 400 });
    return Response.json({
      object: "public_post_sitemap_page",
      items: page.items.map(canonical_path => ({ canonical_path })),
      next_cursor: page.next,
    });
  };
}

describe("public post sitemap", () => {
  it("emits a bounded URL set for one API page", async () => {
    const response = await publicPostSitemapResponse(
      new Request("https://pirate.sc/sitemap.xml"),
      "https://api-next.pirate.sc",
      sitemapFetch({ root: { items: ["/posts/hello", "/posts/stra%C3%9Fe"], next: null } }),
    );
    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain("<loc>https://pirate.sc/posts/stra%C3%9Fe</loc>");
  });

  it("emits an index and independently addressable shards", async () => {
    const fetchImpl = sitemapFetch({
      root: { items: ["/posts/one"], next: "cursor-2" },
      "cursor-2": { items: ["/posts/two"], next: null },
    });
    const index = await publicPostSitemapResponse(
      new Request("https://pirate.sc/sitemap.xml"),
      "https://api-next.pirate.sc",
      fetchImpl,
    );
    const body = await index!.text();
    expect(body).toContain("<sitemapindex");
    expect(body.match(/<sitemap>/gu)).toHaveLength(2);
    const second = [...body.matchAll(/<loc>([^<]+)<\/loc>/gu)][1]?.[1];
    expect(second).toBeDefined();
    const shard = await publicPostSitemapResponse(new Request(second!), "https://api-next.pirate.sc", fetchImpl);
    expect(await shard!.text()).toContain("https://pirate.sc/posts/two");
  });

  it("does not forward cookies and rejects writes", async () => {
    const rejected = await publicPostSitemapResponse(
      new Request("https://pirate.sc/sitemap.xml", { method: "POST", headers: { cookie: "secret=1" } }),
      "https://api-next.pirate.sc",
    );
    expect(rejected?.status).toBe(405);
    expect(rejected?.headers.get("allow")).toBe("GET, HEAD");
  });
});
