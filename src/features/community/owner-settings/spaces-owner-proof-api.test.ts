import { describe, expect, test } from "vitest";

import { createSpacesOwnerProofApi } from "./spaces-owner-proof-api";

describe("Spaces owner proof API", () => {
  test("uses the same-origin session, CSRF token and exact owner proof body", async () => {
    const requests: Request[] = [];
    const api = createSpacesOwnerProofApi({
      origin: "https://web.test", readCsrfToken: () => "csrf-test",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({ contract: "pirate-spaces-ownership-start-v1",
          status: "verification_pending", retry_after_seconds: 30 }),
        { headers: { "content-type": "application/json" }, status: 202 });
      },
    });
    await expect(api.start({ communityId: "community-1", canonicalRoot: "yahoo", idempotencyKey: "key-1" }))
      .resolves.toMatchObject({ status: "verification_pending" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://web.test/api/communities/community-1/spaces-ownership/start");
    expect(requests[0]?.credentials).toBe("same-origin");
    expect(requests[0]?.headers.get("x-csrf-token")).toBe("csrf-test");
    await expect(requests[0]?.text()).resolves.toBe('{"idempotency_key":"key-1","canonical_root":"yahoo"}');
  });
});
