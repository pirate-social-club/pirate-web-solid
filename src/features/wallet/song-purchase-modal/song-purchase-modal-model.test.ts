import { describe, expect, test } from "bun:test";

import {
  formatSavingsPercent,
  purchaseButtonLabel,
  selfVerificationLabel,
  stateDefaults,
} from "./song-purchase-modal-model";

describe("song purchase modal model", () => {
  test("preserves exact discount copy and numeric formatting", () => {
    expect(formatSavingsPercent(20)).toBe("20");
    expect(formatSavingsPercent(12.5)).toBe("12.5");
    expect(selfVerificationLabel(20)).toBe("Save up to 20% with Self.xyz");
    expect(selfVerificationLabel(0)).toBeNull();
  });

  test("maps each Storybook state to deterministic presentation flags", () => {
    expect(stateDefaults("mobile").forceMobile).toBe(true);
    expect(stateDefaults("processing").processing).toBe(true);
    expect(stateDefaults("verified").confirmedDiscountPercent).toBe(20);
    expect(stateDefaults("vinyl-available").vinylReleaseAvailable).toBe(true);
    expect(stateDefaults("error").error).toBe("Checkout transaction was rejected.");
    expect(stateDefaults("desktop").error).toBeNull();
  });

  test("keeps confirm action callback-only", () => {
    expect(purchaseButtonLabel("$3.99", false)).toBe("Unlock for $3.99");
    expect(purchaseButtonLabel("$3.99", true)).toBe("Processing purchase");
  });
});
