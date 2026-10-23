import { expect, test } from "vitest";
import { contributionCreationRequestHash, decodeContributionRefusalProof } from "./song-contribution-refusal.ts";
import { contributionFixtures as f } from "./song-contributions.fixture.ts";

// Computed through api-next's genuine129 fundingCommandPreimageV2, not this
// implementation. Empty and committed snapshots exercise both public encodings.
test("Create commitment matches the two independently computed protocol vectors", async () => {
  expect(await contributionCreationRequestHash(f.scope, f.createRequest)).toBe("00b557ada89163a27740312871818a64df648a39aa02c1ce9f134d75f5309d39");
  expect(await contributionCreationRequestHash(f.scope, { ...f.createRequest, expected_terms_kind: "committed", context_leg_snapshot_id: "fixture-leg-snapshot" })).toBe("3807d8392ede173b58ebb37c5e33eca3c681ce7a1a2051ee1f1a5311eb6299fd");
});
test("the commitment binds account, route, command key, amount and reviewed terms", async () => {
  const original = await contributionCreationRequestHash(f.scope, f.createRequest);
  for (const scope of [{ ...f.scope, accountId: "other-account" }, { ...f.scope, communityId: "other-community" }, { ...f.scope, postId: "other-post" }])
    expect(await contributionCreationRequestHash(scope, f.createRequest)).not.toBe(original);
  for (const body of [{ ...f.createRequest, idempotency_key: "other_creation_key_01" }, { ...f.createRequest, funding_amount_atomic: "3000000" }, { ...f.createRequest, expected_terms_hash: "f".repeat(64) }])
    expect(await contributionCreationRequestHash(f.scope, body)).not.toBe(original);
  await expect(contributionCreationRequestHash({ ...f.scope, personaId: "other-persona" }, f.createRequest)).rejects.toThrow("scope_changed");
});
test.each([undefined, null, {}, { command_id: "refusal", request_hash: f.receipt.request_hash, allocation: "none", instruction_issued: true }, { command_id: "refusal", request_hash: f.receipt.request_hash, allocation: "none", instruction_issued: false, extra: true }])("malformed refusal evidence cannot become a proof", value => {
  expect(() => decodeContributionRefusalProof(value)).toThrow();
});
