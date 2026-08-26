import { describe, expect, it } from "vitest";
import { disabledProductionHnsCommunityAppIngressCompositionV2 } from "./composition.ts";
import { disabledProductionHnsHandlePersonaIngressCompositionV1 } from "./handle-composition.ts";
import { HNS_FORWARDER_HOST_HEADER } from "./wire.ts";
import { routeHnsCommunityAppIngressRequest, routeHnsIngressRequest } from "./worker-router.ts";

const enabled = {
  enabled: true as const,
  ingressOrigin: "https://solid-hns-ingress.test",
  fetch: async () => new Response("hns"),
};

describe("Worker HNS ingress router", () => {
  it("keeps community-app and handle-persona origins in separate compositions", async () => {
    const community = { ...enabled, fetch: async () => new Response("community") };
    const handle = {
      enabled: true as const,
      ingressOrigin: "https://solid-handle-ingress.test",
      fetch: async () => new Response("handle"),
    };
    const ordinary = async () => new Response("ordinary");
    expect(await (await routeHnsIngressRequest({
      request: new Request("https://solid-hns-ingress.test/c/example"), community, handle, ordinary,
    })).text()).toBe("community");
    expect(await (await routeHnsIngressRequest({
      request: new Request("https://solid-handle-ingress.test/"), community, handle, ordinary,
    })).text()).toBe("handle");
    const rejected = await routeHnsIngressRequest({
      request: new Request("https://pirate.sc/", { headers: { [HNS_FORWARDER_HOST_HEADER]: "name.example" } }),
      community, handle, ordinary,
    });
    expect(rejected.status).toBe(400);
    const disabled = await routeHnsIngressRequest({
      request: new Request("https://solid-handle-ingress.test/", { headers: { [HNS_FORWARDER_HOST_HEADER]: "name.example" } }),
      community: disabledProductionHnsCommunityAppIngressCompositionV2,
      handle: disabledProductionHnsHandlePersonaIngressCompositionV1,
      ordinary,
    });
    expect(disabled.status).toBe(400);
  });

  it("dispatches only the exact configured ingress origin", async () => {
    const exact = await routeHnsCommunityAppIngressRequest({
      request: new Request("https://solid-hns-ingress.test/c/example"),
      composition: enabled,
      ordinary: async () => new Response("ordinary"),
    });
    expect(await exact.text()).toBe("hns");

    const other = await routeHnsCommunityAppIngressRequest({
      request: new Request("https://pirate.sc/c/example"),
      composition: enabled,
      ordinary: async () => new Response("ordinary"),
    });
    expect(await other.text()).toBe("ordinary");
  });

  it("rejects reserved fields on canonical, preview, and workers.dev origins", async () => {
    for (const origin of ["https://pirate.sc", "https://preview.example", "https://worker.workers.dev"]) {
      let ordinaryReached = false;
      const response = await routeHnsCommunityAppIngressRequest({
        request: new Request(`${origin}/c/example`, {
          headers: { [HNS_FORWARDER_HOST_HEADER]: "app.example" },
        }),
        composition: enabled,
        ordinary: async () => {
          ordinaryReached = true;
          return new Response("ordinary");
        },
      });
      expect(response.status).toBe(400);
      expect(ordinaryReached).toBe(false);
    }
  });

  it("keeps the exact ingress inert while disabled", async () => {
    let ordinaryReached = false;
    const response = await routeHnsCommunityAppIngressRequest({
      request: new Request("https://solid-hns-ingress.test/c/example", {
        headers: { [HNS_FORWARDER_HOST_HEADER]: "app.example" },
      }),
      composition: disabledProductionHnsCommunityAppIngressCompositionV2,
      ordinary: async () => {
        ordinaryReached = true;
        return new Response("ordinary");
      },
    });
    expect(response.status).toBe(400);
    expect(ordinaryReached).toBe(false);
  });
});
