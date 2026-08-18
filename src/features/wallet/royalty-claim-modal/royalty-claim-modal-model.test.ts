import { describe, expect, test } from "bun:test";

import {
  claimableWipLabel,
  formatWalletAddress,
  formatWipAmount,
  isRoyaltyClaimBusy,
  royaltyPrimaryAction,
} from "./royalty-claim-modal-model";

describe("royalty claim modal model", () => {
  test("formats deterministic WIP amounts without floating point drift", () => {
    expect(formatWipAmount("12450000000000000000")).toBe("12.45");
    expect(formatWipAmount("1")).toBe("<0.000001");
    expect(formatWipAmount("not-a-number")).toBe("0");
    expect(claimableWipLabel("0", true)).toBe("...");
  });

  test("formats only valid EVM-style wallet addresses", () => {
    expect(formatWalletAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe("0x742d...f44e");
    expect(formatWalletAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")).toBe("0xabcd...abcd");
    expect(formatWalletAddress(null)).toBe("No wallet connected");
    expect(formatWalletAddress("not-an-address")).toBe("No wallet connected");
    expect(formatWalletAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44")).toBe("No wallet connected");
    expect(formatWalletAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44g")).toBe("No wallet connected");
  });

  test("keeps pending and terminal action semantics explicit", () => {
    expect(isRoyaltyClaimBusy("preparing")).toBe(true);
    expect(isRoyaltyClaimBusy("signing")).toBe(true);
    expect(isRoyaltyClaimBusy("submitting")).toBe(true);
    expect(isRoyaltyClaimBusy("ready")).toBe(false);
    expect(royaltyPrimaryAction({ status: "ready" }, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toEqual({ disabled: false, label: "Claim" });
    expect(royaltyPrimaryAction({ status: "success" }, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toEqual({ disabled: true, label: "Royalties claimed" });
    expect(royaltyPrimaryAction({ status: "preparing" }, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toEqual({ disabled: true, label: "Preparing claim" });
    expect(royaltyPrimaryAction({ status: "submitting" }, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toEqual({ disabled: true, label: "Submitting claim" });
    expect(royaltyPrimaryAction({ status: "ready" }, null)).toEqual({ disabled: false, label: "Connect wallet" });
  });
});
