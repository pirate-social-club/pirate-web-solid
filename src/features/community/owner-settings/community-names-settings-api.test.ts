import { describe, expect, test } from "vitest";

import {
  NAMES_ACTIVE,
  NAMES_READY,
  NAMES_SUSPENDED,
} from "./community-names-settings-fixtures";
import {
  CommunityNamesSettingsApiError,
  CommunityNamesSettingsProtocolError,
  createCommunityNamesSettingsApi,
} from "./community-names-settings-api";
import {
  broadNamesOfferingInput,
  namesOfferingRevisionInput,
  saleNamespaceActivationInput,
  saleNamespaceRevisionInput,
} from "./community-names-settings-model";

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function readyCandidate() {
  const candidate = NAMES_READY.context.sale_namespace_candidates[0];
  if (candidate?.kind !== "ready_v1") throw new Error("expected ready fixture");
  return candidate;
}

describe("createCommunityNamesSettingsApi", () => {
  test("loads the owner-only context, namespaces and offerings through the generated client", async () => {
    const requests: Request[] = [];
    const api = createCommunityNamesSettingsApi({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/handle-sales-management")) return response(NAMES_ACTIVE.context);
        if (request.url.includes("/sale-namespaces")) {
          return response({ items: NAMES_ACTIVE.saleNamespaces, next_cursor: null });
        }
        return response({ items: NAMES_ACTIVE.offerings, next_cursor: null });
      },
      origin: "https://web.test",
    });

    await expect(api.getSnapshot({ communityId: "community_midnight" })).resolves.toEqual(NAMES_ACTIVE);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://web.test/api/communities/community_midnight/handle-sales-management",
      "GET https://web.test/api/communities/community_midnight/handle-sales-management/sale-namespaces?limit=50",
      "GET https://web.test/api/communities/community_midnight/handle-sales-management/offerings?limit=50",
    ]);
  });

  test("preserves generated write bodies, revision fences, idempotency and CSRF", async () => {
    const requests: Request[] = [];
    const activation = NAMES_ACTIVE.saleNamespaces[0]!.activation;
    const offering = NAMES_ACTIVE.offerings[0]!.offering;
    const suspended = NAMES_SUSPENDED.saleNamespaces[0]!.activation;
    const activateInput = saleNamespaceActivationInput({
      candidate: readyCandidate(),
      communityId: "community_midnight",
      idempotencyKey: "activate-1",
    });
    const offeringInput = broadNamesOfferingInput({
      activation,
      context: NAMES_ACTIVE.context,
      idempotencyKey: "offering-1",
    });
    const offeringRevision = namesOfferingRevisionInput({
      communityId: "community_midnight",
      idempotencyKey: "pause-1",
      offering,
      status: "paused",
    });
    const namespaceRevision = saleNamespaceRevisionInput({
      activation: suspended,
      communityId: "community_midnight",
      idempotencyKey: "resume-hosting-1",
      status: "active",
    });
    const api = createCommunityNamesSettingsApi({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/handle-sale-namespaces")) {
          return response({ activation, replayed: false }, 201);
        }
        if (request.url.includes("handle-sale-namespaces/") && request.url.endsWith("/revisions")) {
          return response({ activation: { ...suspended, status: "active" }, replayed: false });
        }
        if (request.url.includes("handle-offerings/") && request.url.endsWith("/revisions")) {
          return response({ offering: { ...offering, status: "paused" }, replayed: false });
        }
        return response({ offering, replayed: false }, 201);
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });

    await api.activateSaleNamespace(activateInput);
    await api.createOffering(offeringInput);
    await api.reviseOffering(offeringRevision);
    await api.reviseSaleNamespace(namespaceRevision);

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "POST https://web.test/api/communities/community_midnight/handle-sale-namespaces",
      "POST https://web.test/api/communities/community_midnight/handle-offerings",
      "POST https://web.test/api/communities/community_midnight/handle-offerings/offering_midnight_free/revisions",
      "POST https://web.test/api/communities/community_midnight/handle-sale-namespaces/sale_namespace_midnight/revisions",
    ]);
    expect(requests.every((request) => request.headers.get("x-csrf-token") === "csrf-1")).toBe(true);
    await expect(requests[0]!.json()).resolves.toEqual(activateInput.body);
    await expect(requests[1]!.json()).resolves.toEqual(offeringInput.body);
    await expect(requests[2]!.json()).resolves.toEqual(offeringRevision.body);
    await expect(requests[3]!.json()).resolves.toEqual(namespaceRevision.body);
  });

  test("fails closed for cross-community responses and unreadable CSRF", async () => {
    const mismatched = createCommunityNamesSettingsApi({
      fetchImpl: async () => response({ ...NAMES_READY.context, community_id: "community_other" }),
      origin: "https://web.test",
    });
    await expect(mismatched.getSnapshot({ communityId: "community_midnight" }))
      .rejects.toBeInstanceOf(CommunityNamesSettingsProtocolError);

    let requested = false;
    const noCsrf = createCommunityNamesSettingsApi({
      fetchImpl: async () => {
        requested = true;
        return response({});
      },
      origin: "https://web.test",
      readCsrfToken: () => undefined,
    });
    await expect(noCsrf.activateSaleNamespace(saleNamespaceActivationInput({
      candidate: readyCandidate(),
      communityId: "community_midnight",
      idempotencyKey: "activate-1",
    }))).rejects.toBeInstanceOf(CommunityNamesSettingsApiError);
    expect(requested).toBe(false);
  });
});
