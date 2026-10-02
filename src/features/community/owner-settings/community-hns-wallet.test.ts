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
    const hash = "B".repeat(64);
    const sendUpdate = vi.fn().mockResolvedValue({ hash, hex: "unretained-wallet-details" });
    const wallet = createBobCommunityHnsWallet({ bob3: { connect: async () => ({ signWithName: vi.fn(), sendUpdate }) } });
    const records = [
      { type: "NS" as const, ns: "ns1.pirate." },
      { type: "TXT" as const, txt: ["pirate-verification=fixture"] },
    ];

    await expect((await wallet.connectForPublication()).publishCompleteResource("dankmemes", records)).resolves.toEqual({ txid: hash.toLowerCase() });
    expect(sendUpdate).toHaveBeenCalledOnce();
    expect(sendUpdate).toHaveBeenCalledWith("dankmemes", records);
  });

  it.each([undefined, null, {}, { hash: "invalid" }, "a".repeat(64)])("treats a missing transaction hash as ambiguous", async (result) => {
    const wallet = createBobCommunityHnsWallet({ bob3: { connect: async () => ({ signWithName: vi.fn(), sendUpdate: vi.fn().mockResolvedValue(result) }) } });
    await expect((await wallet.connectForPublication()).publishCompleteResource("midnight", [])).resolves.toEqual({ txid: null });
  });

  it("fails closed when the injected provider is missing", async () => {
    const missing = createBobCommunityHnsWallet({});

    expect(missing.isAvailable()).toBe(false);
    await expect(missing.connectForPublication()).rejects.toThrow("bob_wallet_unavailable");
    await expect(missing.signRootOwnership("dankmemes", "message")).rejects.toThrow("bob_wallet_unavailable");
  });
});
