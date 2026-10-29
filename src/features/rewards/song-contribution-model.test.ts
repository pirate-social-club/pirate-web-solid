import { expect, test } from "vitest";
import { contributionFixtures as f } from "../../api/song-contributions.fixture.ts";
import { contextTerms, contributionAmount, contributionChainLabel, contributionStatus, maximumContribution, qualificationLines } from "./song-contribution-model.ts";

test.each([["2", "2000000"], ["0.000001", "1"], ["2.000001", "2000001"]])("amount %s retains all six decimal places", (input, atomic) => {
  expect(contributionAmount(input)).toBe(atomic);
});
test.each(["", "-1", "1.0000001", "1e6", "1,000", "0", ".5"])("invalid amount %s cannot be rounded into a payment", input => {
  expect(() => contributionAmount(input)).toThrow("amount_invalid");
});
test("both prospective and committed terms disclose three activities and categorical Dance", () => {
  for (const terms of [contextTerms(f.context), f.receipt.committed_terms]) {
    expect(qualificationLines(terms)).toEqual([
      "Study: meet the 70% qualification requirement.", "Singing: meet the 70% qualification requirement.",
      "Dance: a community-owner review must pass before the drawing closes.",
    ]);
  }
});
test("an absent numeric requirement is never presented as zero percent", () => {
  const terms = f.receipt.committed_terms;
  expect(qualificationLines({ ...terms, qualification_bindings: [{ ...terms.qualification_bindings[0], numeric_floor_bps: null }] })[0]).toContain("unavailable");
});
test("chain labels follow the bound instruction and pending payment never claims winnings", () => {
  expect(contributionChainLabel(84532)).toContain("testnet"); expect(contributionChainLabel(8453)).toBe("Base");
  expect(contributionStatus({ ...f.current, state: "broadcast_unknown" }).detail).toContain("uncertain");
  expect(contributionStatus({ ...f.current, state: "expired_reconciling" }).detail).toContain("does not prove");
  expect(contributionStatus({ ...f.current, state: "expired_reconciling" }, true).title).toBe("Confirming payment");
  expect(contributionStatus({ ...f.current, state: "pool_credited" }, true).title).toBe("Contribution added");
});
test("the displayed maximum uses remaining capacity as well as the profile ceiling", () => {
  expect(maximumContribution({ ...f.context, limits: { ...f.context.limits, usable_capacity_atomic: "3000000" } })).toBe("3000000");
});
