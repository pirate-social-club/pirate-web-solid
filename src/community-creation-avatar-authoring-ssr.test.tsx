import { describe, expect, test } from "vitest";

import { applicationRequest } from "./worker.ts";

const stagingOrigin = "https://web-next-staging.pirate.sc";

async function renderCreationRoute(
  origin: string,
  canonicalOrigin: string,
  configured: "true" | "false",
): Promise<string> {
  // SAFETY: applicationRequest reads only these three typed render-context
  // bindings before dispatching to the faithful SSR integration handler.
  const response = await applicationRequest(
    new Request(`${origin}/communities/new`),
    {
      API_NEXT_ORIGIN: "https://api-next-staging.pirate.sc",
      PUBLIC_APP_CANONICAL_ORIGIN: canonicalOrigin,
      COMMUNITY_CREATION_AVATAR_AUTHORING_ENABLED: configured,
    } as never,
  );
  expect(response.status).toBe(200);
  return response.text();
}

describe("community creation avatar authoring SSR conduit", () => {
  test("carries the exact staging Worker flag into the route prop and keeps production disabled", async () => {
    const staging = await renderCreationRoute(stagingOrigin, stagingOrigin, "true");
    expect(staging).toContain('data-community-creation-avatar-authoring="enabled"');
    expect(staging).toContain('data-community-creation-route-avatar-authoring="enabled"');

    const production = await renderCreationRoute("https://pirate.sc", "https://pirate.sc", "false");
    expect(production).toContain('data-community-creation-avatar-authoring="disabled"');
    expect(production).toContain('data-community-creation-route-avatar-authoring="disabled"');

    const wrongOrigin = await renderCreationRoute("https://pirate.sc", "https://pirate.sc", "true");
    expect(wrongOrigin).toContain('data-community-creation-avatar-authoring="enabled"');
    expect(wrongOrigin).toContain('data-community-creation-route-avatar-authoring="disabled"');
  });
});
