import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";
import { NotificationsInbox } from "./notifications-inbox.tsx";
import { CommentEntry } from "./comment-entry.tsx";
import { PublicPostRouteView } from "../posts/public-post/public-post-route-view.tsx";
import { resolvePublicPostPreflight, publicPostResponsePolicy } from "../posts/public-post/public-post-preflight.ts";

test("SSR inbox and resolving alias expose no private rows, perform no GET or read command", () => {
  const list = vi.fn(), markRead = vi.fn(), session = vi.fn();
  const inbox = renderToString(() => <NotificationsInbox api={{ list, markRead }} session={session} />);
  expect(inbox).toContain("Notifications"); expect(inbox).not.toContain("data-notification-id");
  expect(list).not.toHaveBeenCalled(); expect(markRead).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
  const alias = renderToString(() => <CommentEntry id="retained-comment" />);
  expect(alias).toContain("Finding comment"); expect(alias).not.toContain("data-comment-id");
});
test("targeted SSR/HEAD keep only validated ownership, no authenticated windows or detail", async () => {
  const fetchImpl = vi.fn();
  for (const method of ["GET", "HEAD"]) {
    const result = await resolvePublicPostPreflight(new Request("https://pirate.sc/posts/thread?comment=branch-8", { method, headers: { cookie: "__Host-pirate_session=synthetic" } }), "https://api-next-staging.pirate.sc", "https://pirate.sc", fetchImpl);
    if (!result) throw new Error("Expected preflight");
    const html = renderToString(() => <PublicPostRouteView state={result.state} />);
    expect(html).toContain("Loading comment thread"); expect(html).not.toContain("Authorized branch"); expect(html).not.toContain("data-public-post-state=\"content\"");
    expect(JSON.stringify(result)).not.toContain("windows"); expect(JSON.stringify(result)).not.toContain("synthetic");
    expect(publicPostResponsePolicy(result.state).headers.get("cache-control")).toBe("private, no-store");
  }
  expect(fetchImpl).not.toHaveBeenCalled();
});
test("duplicate selectors refuse before SSR or private lookup", async () => {
  const fetchImpl = vi.fn();
  const result = await resolvePublicPostPreflight(new Request("https://pirate.sc/posts/thread?comment=one&comment=two"), "https://api-next-staging.pirate.sc", "https://pirate.sc", fetchImpl);
  expect(result?.state).toEqual({ kind: "invalid", status: 400 }); expect(fetchImpl).not.toHaveBeenCalled();
});
