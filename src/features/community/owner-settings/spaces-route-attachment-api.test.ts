import { describe, expect, test } from "vitest";

import { createSpacesRouteAttachmentApi } from "./spaces-route-attachment-api";

const attempt = {
  contract: "pirate-spaces-community-route-attachment-v1", attachment_intent_id: `sroute_${"a".repeat(32)}`,
  ceremony_intent_id: `srcer_${"b".repeat(32)}`, generation: 1, community_id: "community-1", network: "mainnet",
  purpose: "first_attachment", canonical_root: "yahoo", status: "awaiting_signature",
  root_outpoint: `${"c".repeat(64)}:1`, owner_public_key_hex: "d".repeat(64), public_origin: "https://web.test",
  canonical_href: "https://web.test/c/@yahoo", challenge_message: "[\"message\"]", challenge_digest_hex: "e".repeat(64),
  expires_at: "2030-01-01T00:15:00.000Z", route_binding_id: null, replayed: false,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
const notFound = () => json({ error: { code: "not_found", message: "Not found", retryable: false } }, 404);

function recording(reply: (request: Request) => Response) {
  const requests: Request[] = [];
  const api = createSpacesRouteAttachmentApi({ origin: "https://web.test", readCsrfToken: () => "csrf-test",
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return reply(request);
    } });
  return { api, requests };
}

describe("Spaces route attachment API", () => {
  test("uses the same-origin session, CSRF token and exact bodies for every step", async () => {
    const { api, requests } = recording((request) =>
      json(request.url.endsWith("/commit") ? { ...attempt, status: "committed", route_binding_id: "srbind_1" } : attempt,
        request.method === "POST" && request.url.endsWith("/spaces-route-attachments") ? 201 : 200));
    const id = attempt.attachment_intent_id;
    await expect(api.start({ communityId: "community-1", canonicalRoot: "yahoo", idempotencyKey: "key-1" }))
      .resolves.toMatchObject({ status: "awaiting_signature", purpose: "first_attachment" });
    await expect(api.current({ communityId: "community-1" })).resolves.toMatchObject({ attachment_intent_id: id });
    await api.prove({ communityId: "community-1", attachmentIntentId: id, signatureHex: "f".repeat(128) });
    await expect(api.commit({ communityId: "community-1", attachmentIntentId: id, generation: 1 }))
      .resolves.toMatchObject({ status: "committed" });
    const base = "https://web.test/api/communities/community-1/spaces-route-attachments";
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST ${base}`, `GET ${base}/current`, `POST ${base}/${id}/prove`, `POST ${base}/${id}/commit`,
    ]);
    expect(requests.every((request) => request.credentials === "same-origin")).toBe(true);
    expect(requests.filter((request) => request.method === "POST").every((request) =>
      request.headers.get("x-csrf-token") === "csrf-test")).toBe(true);
    await expect(requests[0]!.text()).resolves.toBe(JSON.stringify({ idempotency_key: "key-1", canonical_root: "yahoo" }));
    await expect(requests[2]!.text()).resolves.toBe(JSON.stringify({ signature_hex: "f".repeat(128) }));
    await expect(requests[3]!.text()).resolves.toBe(JSON.stringify({ generation: 1 }));
  });

  test("reads no attempt as null and refuses to write without a CSRF token", async () => {
    const { api } = recording(notFound);
    await expect(api.current({ communityId: "community-1" })).resolves.toBeNull();
    const noToken = createSpacesRouteAttachmentApi({ origin: "https://web.test", readCsrfToken: () => undefined,
      fetchImpl: async () => { throw new Error("Not reached"); } });
    expect(() => noToken.start({ communityId: "community-1", canonicalRoot: "yahoo", idempotencyKey: "key-1" }))
      .toThrow("Refresh the page");
  });

  test("asks whether the address works through the public lookup with the literal @", async () => {
    const working = recording(() => json({ authority_version: "optional_route_v2", community_id: "community_1",
      href: "/c/community_1", canonical_route: null }));
    await working.api.resolves({ canonicalRoot: "yahoo" }).catch(() => undefined);
    expect(working.requests[0]?.url).toBe("https://web.test/api/c/@yahoo");
    expect(working.requests[0]?.headers.get("x-csrf-token")).toBeNull();
    const stopped = recording(notFound);
    await expect(stopped.api.resolves({ canonicalRoot: "csca" })).resolves.toBe(false);
    expect(stopped.requests[0]?.url).toBe("https://web.test/api/c/@csca");
  });
});
