import { describe, expect, it } from "vitest";
import {
  HNS_COMMUNITY_APP_SOLID_REPLAY_SCOPE,
  makeDurableObjectHnsReplayStore,
} from "./replay-store.ts";

describe("Solid forwarder replay-store adapter", () => {
  it("shards by the Solid consumer scope and key id with bounded retention", async () => {
    const calls: unknown[][] = [];
    const store = makeDurableObjectHnsReplayStore({
      namespace: {
        getByName: (name) => ({
          consume: async (...args) => {
            calls.push([name, ...args]);
            return true;
          },
        }),
      },
      consumerScope: HNS_COMMUNITY_APP_SOLID_REPLAY_SCOPE,
      clock: { nowUnixSeconds: () => 1_770_000_000 },
      retentionSeconds: 66,
    });
    await expect(store.consume("gateway-key-01", "nonce-01")).resolves.toBe(true);
    expect(calls).toEqual([
      [
        `${HNS_COMMUNITY_APP_SOLID_REPLAY_SCOPE}:gateway-key-01`,
        "nonce-01",
        1_770_000_066,
        1_770_000_000,
      ],
    ]);
    expect(HNS_COMMUNITY_APP_SOLID_REPLAY_SCOPE).not.toContain("api-next-community-app-api");
  });

  it("rejects malformed keys and nonces without reaching storage", async () => {
    let reached = false;
    const store = makeDurableObjectHnsReplayStore({
      namespace: {
        getByName: () => {
          reached = true;
          return { consume: async () => true };
        },
      },
      consumerScope: HNS_COMMUNITY_APP_SOLID_REPLAY_SCOPE,
      clock: { nowUnixSeconds: () => 1_770_000_000 },
      retentionSeconds: 66,
    });
    await expect(store.consume("bad key", "nonce-01")).resolves.toBe(false);
    await expect(store.consume("gateway-key-01", "bad nonce")).resolves.toBe(false);
    expect(reached).toBe(false);
  });
});
