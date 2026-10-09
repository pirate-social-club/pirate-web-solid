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

  test("asks whether the address works through the public lookup, with no credentials", async () => {
    // The complete response the lookup returns for a bound Spaces address.
    const bound = (root: string) => ({
      community_id: "community_00000000-0000-4000-8000-00000000d001",
      canonical_route: { family: "spaces", root_label: root, root_label_display: root,
        path_segment: `@${root}`, href: `/c/@${root}`, app_host: null },
    });
    const working = recording(() => json(bound("yahoo")));
    await expect(working.api.resolves({ canonicalRoot: "yahoo", communityId: "community_00000000-0000-4000-8000-00000000d001" })).resolves.toBe(true);
    expect(working.requests).toHaveLength(1);
    const lookup = working.requests[0]!;
    expect(`${lookup.method} ${lookup.url}`).toBe("GET https://web.test/api/c/@yahoo");
    // A visitor's request: no session cookie use, no CSRF token, no authorization.
    expect(lookup.credentials).toBe("omit");
    expect(lookup.headers.get("x-csrf-token")).toBeNull();
    expect(lookup.headers.get("authorization")).toBeNull();
    expect(lookup.headers.get("cookie")).toBeNull();

    // Reaching some other community is not this community's address working.
    const elsewhere = recording(() => json(bound("yahoo")));
    await expect(elsewhere.api.resolves({ canonicalRoot: "yahoo", communityId: "community-other" })).resolves.toBe(false);

    const stopped = recording(notFound);
    await expect(stopped.api.resolves({ canonicalRoot: "csca", communityId: "community-2" })).resolves.toBe(false);
    expect(stopped.requests[0]?.url).toBe("https://web.test/api/c/@csca");
    expect(stopped.requests[0]?.credentials).toBe("omit");

    // An outage or a malformed reply is not an answer either way.
    const failing = recording(() => json({ error: { code: "provider_unavailable", message: "Unavailable", retryable: true } }, 503));
    await expect(failing.api.resolves({ canonicalRoot: "yahoo", communityId: "community-1" })).rejects.toThrow();
    const malformed = recording(() => json({ community_id: "community_1" }));
    await expect(malformed.api.resolves({ canonicalRoot: "yahoo", communityId: "community-1" })).rejects.toThrow();
  });
});
