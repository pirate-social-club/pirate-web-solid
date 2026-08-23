import { describe, expect, it, vi } from "vitest";

import { createBobCommunityHnsWallet } from "./community-hns-wallet";

describe("Bob community HNS wallet", () => {
  it("signs the server message with the root key", async () => {
    const signWithName = vi.fn().mockResolvedValue("name-signature");
    const wallet = createBobCommunityHnsWallet({ bob3: { connect: async () => ({ signWithName, sendUpdate: vi.fn() }) } });

    await expect(wallet.signRootOwnership("dankmemes", "server-bound-message")).resolves.toBe("name-signature");
    expect(signWithName).toHaveBeenCalledWith("dankmemes", "server-bound-message");
  });

  it("publishes the complete resource through one wallet update", async () => {
    const sendUpdate = vi.fn().mockResolvedValue(undefined);
    const wallet = createBobCommunityHnsWallet({ bob3: { connect: async () => ({ signWithName: vi.fn(), sendUpdate }) } });
    const records = [
      { type: "NS" as const, ns: "ns1.pirate." },
      { type: "TXT" as const, txt: ["pirate-verification=fixture"] },
    ];

    await wallet.publishCompleteResource("dankmemes", records);
    expect(sendUpdate).toHaveBeenCalledOnce();
    expect(sendUpdate).toHaveBeenCalledWith("dankmemes", records);
  });

  it("fails closed when the injected provider is missing", async () => {
    const missing = createBobCommunityHnsWallet({});

    expect(missing.isAvailable()).toBe(false);
    await expect(missing.signRootOwnership("dankmemes", "message")).rejects.toThrow("bob_wallet_unavailable");
  });
});
