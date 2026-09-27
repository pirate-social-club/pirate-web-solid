import { describe, expect, test } from "vitest";

import { createSpacesOwnerProofApi } from "./spaces-owner-proof-api";

describe("Spaces owner proof API", () => {
  test("reads the assignment privately and confirms with the exact authority reference", async () => {
    const requests: Request[] = [];
    const candidate = { operator_assignment_id: "assignment-1", generation: 2, network: "mainnet",
      canonical_root: "yahoo", delegation_address: "bcs1poperator", replayed: false };
    const api = createSpacesOwnerProofApi({ origin: "https://web.test", readCsrfToken: () => "csrf-test",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify(request.method === "GET" ? { candidate } : candidate),
          { headers: { "content-type": "application/json" }, status: 200 });
      } });
    await expect(api.assignment({ communityId: "community-1", root: "yahoo" })).resolves.toMatchObject({ candidate });
    await expect(api.confirmAssignment({ communityId: "community-1", idempotencyKey: "key-1",
      assignmentId: "assignment-1", generation: 2, authorityReference: "authority-1", authorityGeneration: 3 }))
      .resolves.toMatchObject(candidate);
    expect(requests[0]?.url).toBe("https://web.test/api/communities/community-1/spaces-operator-assignments?root=yahoo");
    expect(requests[0]?.credentials).toBe("same-origin");
    expect(requests[1]?.headers.get("x-csrf-token")).toBe("csrf-test");
    await expect(requests[1]?.text()).resolves.toBe(JSON.stringify({ idempotency_key: "key-1",
      operator_assignment_id: "assignment-1", expected_generation: 2,
      namespace_authority_reference: "authority-1", expected_authority_generation: 3 }));
  });

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
