import { afterEach, describe, expect, it, vi } from "vitest";
import { createPirateApiClient, type GetPublicPersonasPersonaIdResponse } from "@pirate/api-client";
import {
  makeHnsPublicPersonaClientV1,
  type HnsHandleAuthorityResolutionV1,
  type HnsHandlePersonaAuthorityV1,
} from "./index.ts";

import { isPublicPersonaResponse } from "./public-persona-validator/public-persona-validator.ts";

const authorityTuple = [
  "handle_persona_v1",
  ["sale_namespace_activation_01", 3],
  ["verified_namespace_v1", "route_evidence_7", 7],
  ["handle_grant_01", 2],
  "persona_public_01",
] as const satisfies HnsHandlePersonaAuthorityV1;
const authority: HnsHandleAuthorityResolutionV1 = {
  normalizedHost: "name.xn--pokmon-dva",
  canonicalRoot: "xn--pokmon-dva",
  canonicalHandleLabel: "name",
  communityId: "com_cmt_public_namespace_test",
  ownerPersonaId: "persona_public_01",
  hostAuthority: authorityTuple,
  gatewayDeploymentReference: "gateway-deployment-handle-v1",
};
const persona = {
  persona_id: "persona_public_01",
  object: "persona" as const,
  display_name: "Name",
  avatar_ref: null,
  primary_public_handle: null,
};

type HnsGrant = Extract<GetPublicPersonasPersonaIdResponse["handle_grants"][number], { handle: { family: "hns" } }>;

function body(): GetPublicPersonasPersonaIdResponse & { handle_grants: HnsGrant[] } {
  return {
    persona,
    profile: { revision: 1, cover_ref: null, bio: "Public bio" },
    handle_grants: [{
      grant_id: "handle_grant_01",
      grant_generation: 2,
      community_id: "com_cmt_public_namespace_test",
      owner_persona: { ...persona },
      sale_namespace_activation_id: "sale_namespace_activation_01",
      sale_namespace_activation_generation: 3,
      fulfillment: { kind: "hosted_persona_v1" },
      handle: { family: "hns", namespace_root: "xn--pokmon-dva", handle_label: "name" },
      display_identifier: "name.xn--pokmon-dva",
      host: {
        kind: "available",
        normalized_host: "name.xn--pokmon-dva",
        sale_namespace_activation_generation: 3,
        grant_generation: 2,
      },
      issued_at: "2026-08-26T00:00:00.000Z",
    }],
  };
}

afterEach(() => vi.useRealTimers());

describe("bounded public-persona client", () => {
  it("uses one anonymous manual request and accepts one exact active grant", async () => {
    let calls = 0;
    const client = makeHnsPublicPersonaClientV1({
      origin: "https://api-next.pirate.sc",
      fetchImpl: async (input, init) => {
        calls += 1;
        expect(String(input)).toBe("https://api-next.pirate.sc/public-personas/persona_public_01");
        expect(init?.method).toBe("GET");
        expect(init?.credentials).toBe("omit");
        expect(init?.redirect).toBe("manual");
        expect(new Headers(init?.headers).get("cookie")).toBeNull();
        return new Response(JSON.stringify(body()), { headers: { "content-type": "application/json" } });
      },
    });
    await expect(client.loadExact(authority)).resolves.toEqual(body());
    expect(calls).toBe(1);
  });

  it("accepts immutable grant lineage under a newer active namespace authority", async () => {
    const current = body();
    const grant = current.handle_grants[0]!;
    if (grant.host.kind !== "available") throw new Error("expected available host fixture");
    const historicalGrant = {
      ...grant,
      sale_namespace_activation_generation: 1,
      host: {
        ...grant.host,
        sale_namespace_activation_generation: 1,
      },
    };
    const response = { ...current, handle_grants: [historicalGrant] };
    const client = makeHnsPublicPersonaClientV1({
      origin: "https://api-next.pirate.sc",
      fetchImpl: async () => new Response(JSON.stringify(response), {
        headers: { "content-type": "application/json" },
      }),
    });
    await expect(client.loadExact(authority)).resolves.toEqual(response);
  });

  it("rejects missing, duplicate, unavailable, unsorted, mismatched, and oversized grant projections", async () => {
    const fails = async (response: GetPublicPersonasPersonaIdResponse) => {
      const client = makeHnsPublicPersonaClientV1({
        origin: "https://api-next.pirate.sc",
        fetchImpl: async () => new Response(JSON.stringify(response), { headers: { "content-type": "application/json" } }),
      });
      await expect(client.loadExact(authority)).rejects.toMatchObject({ reason: "upstream_unavailable" });
    };
    await fails({ ...body(), handle_grants: [] });
    await fails({ ...body(), handle_grants: [body().handle_grants[0]!, body().handle_grants[0]!] });
    await fails({ ...body(), handle_grants: [{ ...body().handle_grants[0]!, host: { kind: "unavailable", reason: "host_not_activated" } }] });
    await fails({ ...body(), persona: { ...persona, persona_id: "persona_other" } });
    const grant = body().handle_grants[0]!;
    if (grant.host.kind !== "available") throw new Error("expected available host fixture");
    await fails({
      ...body(),
      handle_grants: [{
        ...grant,
        sale_namespace_activation_generation: 4,
        host: { ...grant.host, sale_namespace_activation_generation: 4 },
      }],
    });
    await fails({
      ...body(),
      handle_grants: [{
        ...grant,
        sale_namespace_activation_generation: 1,
        host: { ...grant.host, sale_namespace_activation_generation: 2 },
      }],
    });
    const other = {
      ...body().handle_grants[0]!,
      grant_id: "aaa",
      handle: { family: "hns" as const, namespace_root: "aaa", handle_label: "aaa" },
      host: { kind: "not_applicable" as const },
    };
    await fails({ ...body(), handle_grants: [body().handle_grants[0]!, other] });
    const oversized = makeHnsPublicPersonaClientV1({
      origin: "https://api-next.pirate.sc",
      fetchImpl: async () => new Response("x", {
        headers: { "content-type": "application/json", "content-length": "1048577" },
      }),
    });
    await expect(oversized.loadExact(authority)).rejects.toMatchObject({ reason: "upstream_unavailable" });
    const missing = makeHnsPublicPersonaClientV1({
      origin: "https://api-next.pirate.sc",
      fetchImpl: async () => new Response(null, { status: 404 }),
    });
    await expect(missing.loadExact(authority)).rejects.toMatchObject({ reason: "not_found" });
  });

  it("enforces its two-second deadline", async () => {
    vi.useFakeTimers();
    const client = makeHnsPublicPersonaClientV1({
      origin: "https://api-next.pirate.sc",
      fetchImpl: () => new Promise<Response>(() => undefined),
    });
    const timedOut = expect(client.loadExact(authority)).rejects.toMatchObject({ reason: "upstream_unavailable" });
    await vi.advanceTimersByTimeAsync(2_000);
    await timedOut;
  });
});


describe("frozen public-persona wire-validator conformance", () => {
  it("matches the generated endpoint validator on valid unions and malformed wire values", async () => {
    const hns = body();
    const spaces = {
      ...hns.handle_grants[0],
      grant_id: "spaces_grant_01",
      fulfillment: { kind: "spaces_native_v1" },
      handle: { family: "spaces", namespace_root: "workspace_root", handle_label: "operator" },
      display_identifier: "operator",
      host: { kind: "not_applicable" },
    };
    const variants: unknown[] = [
      hns,
      { ...hns, handle_grants: [spaces] },
      { ...hns, handle_grants: [...hns.handle_grants, spaces] },
      { ...hns, handle_grants: [{ ...hns.handle_grants[0], fulfillment: { kind: "delegated_zone_v1" } }] },
      null, [], {},
      { ...hns, unexpected_private_field: "refuse" },
      { ...hns, persona: { ...hns.persona, unexpected: true } },
      { ...hns, profile: { ...hns.profile, revision: null } },
      { ...hns, profile: { ...hns.profile, revision: 0 } },
      { ...hns, profile: { ...hns.profile, revision: Number.MAX_SAFE_INTEGER + 1 } },
      { ...hns, profile: { ...hns.profile, revision: 1.5 } },
      { ...hns, handle_grants: [{ ...hns.handle_grants[0], host: { kind: "unknown" } }] },
      { ...hns, handle_grants: [{ ...hns.handle_grants[0], grant_generation: 0 }] },
      { ...hns, handle_grants: [{ ...spaces, fulfillment: { kind: "hosted_persona_v1" } }] },
    ];
    for (const value of variants) {
      const serialized = JSON.stringify(value);
      const generated = createPirateApiClient("https://api-next.pirate.sc/", {
        fetchImpl: Object.assign(
          async () => new Response(serialized, { headers: { "content-type": "application/json" } }),
          { preconnect: () => undefined },
        ),
      });
      let accepted = false;
      try {
        await generated.get_publicPersonasPersonaId({ path: { personaId: "persona_public_01" } });
        accepted = true;
      } catch { /* The generated validator's rejection is the comparison outcome. */ }
      expect(isPublicPersonaResponse(JSON.parse(serialized))).toBe(accepted);
    }
    expect(isPublicPersonaResponse(hns)).toBe(true);
    expect(isPublicPersonaResponse({ ...hns, handle_grants: [...hns.handle_grants, spaces] })).toBe(true);
    expect(isPublicPersonaResponse({ ...hns, unexpected_private_field: "refuse" })).toBe(false);
  });
});
