import { describe, expect, it } from "vitest";
import { selectAssignedEmbeddedWallet } from "./privy-session.ts";
import { sender, recipient } from "../../test/fixtures/reward-funding.ts";
const wallets = [
  { wallet_index: 0, address: recipient, providerMetadata: "root" },
  { wallet_index: 3, address: sender, providerMetadata: "assigned" },
];
describe("Privy embedded account selection boundary", () => {
  it("retains the exact SDK account matching both assigned index and address", () => {
    expect(selectAssignedEmbeddedWallet(wallets, 3, sender)).toBe(wallets[1]);
  });
  it("rejects an address on the wrong index without falling back to index zero", () => {
    expect(() => selectAssignedEmbeddedWallet(wallets, 3, recipient)).toThrow("wallet_assignment_mismatch");
    expect(() => selectAssignedEmbeddedWallet(wallets, 0, sender)).toThrow("wallet_assignment_mismatch");
  });
  it("rejects an unprovisioned assignment", () => {
    expect(() => selectAssignedEmbeddedWallet(wallets, 9, sender)).toThrow("wallet_assignment_mismatch");
    expect(() => selectAssignedEmbeddedWallet([], 0, sender)).toThrow("wallet_assignment_mismatch");
  });
});
