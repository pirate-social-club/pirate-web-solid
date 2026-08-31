import { resolve } from "node:path";
import { buildRouteTree, PageFileSystemRouter } from "filesystem-routing";
import { describe, expect, test } from "vitest";

describe("community file-route structure", () => {
  test("keeps the community page and names page as independently matchable leaves", async () => {
    const router = new PageFileSystemRouter({
      dir: resolve("src/routes"),
      extensions: ["js", "jsx", "ts", "tsx"],
    });
    const communityRoutes = buildRouteTree(await router.getRoutes())
      .filter(route => route.path.startsWith("/c/:path_segment"));

    expect(communityRoutes.map(route => ({ path: route.path, children: route.children }))).toEqual([
      { path: "/c/:path_segment/", children: undefined },
      { path: "/c/:path_segment/names", children: undefined },
    ]);
  });

  test("exposes Study beside Karaoke on a song post", async () => {
    const router = new PageFileSystemRouter({
      dir: resolve("src/routes"),
      extensions: ["js", "jsx", "ts", "tsx"],
    });
    const paths = buildRouteTree(await router.getRoutes()).map(route => route.path);

    expect(paths).toContain("/p/:postId/karaoke/");
    expect(paths).toContain("/p/:postId/study/");
  });

  test("gives community creation one unambiguous new route", async () => {
    const router = new PageFileSystemRouter({
      dir: resolve("src/routes"),
      extensions: ["js", "jsx", "ts", "tsx"],
    });
    const paths = buildRouteTree(await router.getRoutes()).map(route => route.path);

    expect(paths).not.toContain("/communities/");
    expect(paths).toContain("/communities/new");
  });
});
