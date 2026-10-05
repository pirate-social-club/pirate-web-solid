import { createRequestEvent } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { expect, test } from "vitest";
import { currentApplicationNavigationScope } from "./application-navigation-scope.ts";

test("a host name and browser-supplied scope header do not establish a community app", () => {
  const event = createRequestEvent(new Request("https://app.example/", { headers: { "x-community-app-id": "forged" } }));
  expect(provideRequestEvent(event, currentApplicationNavigationScope)).toEqual({ kind: "platform" });
});
test("inactive request fields do not enable deferred community scope", () => {
  const event = createRequestEvent(new Request("https://pirate.sc/songs"));
  // SAFETY: this fixture injects the retired field to prove it cannot activate scope.
  (event.locals as typeof event.locals & { verifiedCommunityAppId?: string }).verifiedCommunityAppId = "community-1";
  expect(provideRequestEvent(event, currentApplicationNavigationScope)).toEqual({ kind: "platform" });
});
