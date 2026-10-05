import { createRequestEvent } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { expect, test } from "vitest";
import { currentApplicationNavigationScope } from "./application-navigation-scope.ts";

test("a host name and browser-supplied scope header do not establish a community app", () => {
  const event = createRequestEvent(new Request("https://app.example/", { headers: { "x-community-app-id": "forged" } }));
  expect(provideRequestEvent(event, currentApplicationNavigationScope)).toEqual({ kind: "platform" });
});
test("verified request context selects the community's own home and survives route changes", () => {
  const event = createRequestEvent(new Request("https://pirate.sc/songs"));
  // SAFETY: entry-server supplies this field only from the verified Worker dispatch.
  (event.locals as typeof event.locals & { verifiedCommunityAppId?: string }).verifiedCommunityAppId = "community-1";
  expect(provideRequestEvent(event, currentApplicationNavigationScope)).toEqual({ kind: "community", community: { communityId: "community-1", displayName: "Community", href: "/c/community-1" } });
});
