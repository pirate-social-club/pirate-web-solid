import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { establishSessionAuthority, forgetSessionAuthority, refreshSessionAuthority } from "../../api/browser-session-events";
import { assertDanceOwnerRecording, type DanceOwnerApi, type DanceOwnerRecording } from "./dance-owner-api";
import { createDanceOwnerController, danceOwnerJournalKey } from "./dance-owner-controller";
import { danceOwnerFixture as f, danceNoPoseOwnerFixture, danceOwnerFixtureReceipt, danceOwnerScope as scope } from "./dance-owner.fixtures";
import { createDanceReviewFixtureStore } from "./dance-review.fixtures";
beforeEach(establishSessionAuthority); afterEach(() => { forgetSessionAuthority(); vi.restoreAllMocks(); });
const signal = () => new AbortController().signal;
function harness() {
  const { store, entries } = createDanceReviewFixtureStore(); let selected: typeof scope | null = scope;
  const detail = vi.fn<DanceOwnerApi["detail"]>(async () => f), verdict = vi.fn<DanceOwnerApi["verdict"]>(async (_scope, body) => danceOwnerFixtureReceipt(body));
  const api: DanceOwnerApi = { queue: vi.fn(), media: vi.fn(), detail, verdict }, key = vi.fn(() => "original-verdict");
  const make = () => createDanceOwnerController({ scope, currentScope: () => selected, store, api, commandKey: key });
  return { store, entries, detail, verdict, key, make, change: (value: typeof scope | null) => { selected = value; } };
}
test.each(["passed", "not_passed"] as const)("%s is journaled before dispatch with no actor, score or fabricated cue observation", async decision => {
  const h = harness(); h.verdict.mockImplementation(async (_scope, body) => { expect(h.entries.size).toBe(1); return danceOwnerFixtureReceipt(body); });
  const result = await h.make().decide(f, decision, signal()); expect(result.kind).toBe("receipt"); expect(h.entries.size).toBe(0);
  expect(h.verdict.mock.calls[0]![1]).toEqual({ version: "dance-owner-verdict-attestation-v1", operation: "verdict", idempotency_key: "original-verdict", community_id: "community", review_id: "review", expected_review_revision: 3, verdict: decision });
});
test.each(["passed", "not_passed"] as const)("no-pose %s uses truthful v2 and replays the original command after a lost response", async decision => {
  const h = harness(); h.detail.mockResolvedValue(danceNoPoseOwnerFixture); h.verdict.mockRejectedValueOnce(new Error("lost_reply"));
  await expect(h.make().decide(danceNoPoseOwnerFixture, decision, signal())).rejects.toThrow("lost_reply");
  const original = h.verdict.mock.calls[0]![1]; expect(original.version).toBe("dance-owner-verdict-attestation-v2");
  expect(original.verdict).toBe(decision); h.detail.mockRejectedValue(new Error("closed"));
  const result = await h.make().load(signal()); expect(result.kind).toBe("receipt");
  if (result.kind === "receipt") expect(result.receipt.result.cue_attestation).toBe("not_required");
  expect(h.verdict.mock.calls[1]![1]).toEqual(original); expect(h.entries.size).toBe(0); expect(h.key).toHaveBeenCalledTimes(1);
});
test("a v1 attestation cannot conceal a no-pose review", () => {
  expect(() => assertDanceOwnerRecording({ ...danceNoPoseOwnerFixture,
    detail: { ...danceNoPoseOwnerFixture.detail, attestation_version: "dance-owner-verdict-attestation-v1" } }, scope)).toThrow("target_changed");
  expect(() => assertDanceOwnerRecording({ ...f, detail: { ...f.detail, attestation_version: "dance-owner-verdict-attestation-v2" } }, scope)).toThrow("target_changed");
});
test("lost verdict replay precedes detail even when a terminal review has left the queue", async () => {
  const h = harness(); h.verdict.mockRejectedValueOnce(new Error("lost_reply"));
  await expect(h.make().decide(f, "passed", signal())).rejects.toThrow("lost_reply"); const original = h.verdict.mock.calls[0]![1];
  h.detail.mockRejectedValue(new Error("terminal review no longer readable")); h.detail.mockClear();
  const recovered = await h.make().load(signal()); expect(recovered.kind).toBe("receipt"); expect(h.detail).not.toHaveBeenCalled();
  expect(h.verdict.mock.calls[1]![1]).toEqual(original); expect(h.key).toHaveBeenCalledTimes(1); expect(h.entries.size).toBe(0);
});
test("an outstanding Pass cannot be replaced by a Not passed click", async () => {
  const h = harness(); h.verdict.mockRejectedValueOnce(new Error("unknown")); await expect(h.make().decide(f, "passed", signal())).rejects.toThrow();
  await h.make().decide(f, "not_passed", signal()); expect(h.verdict.mock.calls[1]![1].verdict).toBe("passed"); expect(h.key).toHaveBeenCalledTimes(1);
});
test("changed rubric or review revision requires reinspection before minting a verdict", async () => {
  const h = harness(); h.detail.mockResolvedValue({ ...f, detail: { ...f.detail, review: { ...f.detail.review, review_revision: 4 } }, rubric: { ...f.rubric, review_revision: 4 } });
  await expect(h.make().decide(f, "passed", signal())).rejects.toThrow("target_changed"); expect(h.verdict).not.toHaveBeenCalled(); expect(h.entries.size).toBe(0);
});
test("deadline equality cannot dispatch a fresh verdict", async () => {
  const h = harness(), expired = { ...f, detail: { ...f.detail, review: { ...f.detail.review, review_deadline: new Date().toISOString() } } };
  h.detail.mockResolvedValue(expired); await expect(h.make().decide(expired, "passed", signal())).rejects.toThrow("deadline_reached"); expect(h.verdict).not.toHaveBeenCalled();
});
test("authority revocation while detail is in flight prevents the write", async () => {
  const h = harness(); h.detail.mockImplementation(async () => { refreshSessionAuthority(); return f; });
  await expect(h.make().decide(f, "passed", signal())).rejects.toThrow("scope_changed"); expect(h.verdict).not.toHaveBeenCalled();
});
test("an account/route replacement cannot consume the original verdict journal", async () => {
  const h = harness(); h.verdict.mockImplementationOnce(async () => { h.change(null); throw new Error("lost" ); });
  await expect(h.make().decide(f, "passed", signal())).rejects.toThrow(); expect(h.entries.size).toBe(1);
  await expect(h.make().load(signal())).rejects.toThrow("scope_changed"); expect(h.verdict).toHaveBeenCalledTimes(1);
});
test("failed durable storage prevents verdict dispatch", async () => {
  const h = harness(); vi.spyOn(h.store, "write").mockImplementation(() => { throw new Error("storage denied"); });
  await expect(h.make().decide(f, "passed", signal())).rejects.toThrow("storage denied"); expect(h.verdict).not.toHaveBeenCalled();
});
test.each(["terms", "rubric", "decision"])("a mismatched %s receipt retains the unresolved command", async kind => {
  const h = harness(); h.verdict.mockImplementation(async (_scope, body) => {
    const receipt = danceOwnerFixtureReceipt(body); return { ...receipt, result: { ...receipt.result,
      ...(kind === "terms" ? { session_terms_hash: "9".repeat(64) } : kind === "rubric" ? { captured_policy: { ...receipt.result.captured_policy, rubric_hash: "9".repeat(64) } } : { verdict: "not_passed", cue_attestation: "not_attested", qualification_ref: null }) } };
  });
  await expect(h.make().decide(f, "passed", signal())).rejects.toThrow("receipt_mismatch"); expect(h.entries.size).toBe(1);
});
test("a server refusal is an immutable refusal receipt, never a fabricated terminal result", async () => {
  const h = harness(); h.verdict.mockImplementation(async (_scope, body) => danceOwnerFixtureReceipt(body, "stale_revision"));
  const value = await h.make().decide(f, "passed", signal()); expect(value.kind === "receipt" && value.receipt.outcome).toBe("refused"); expect(h.entries.size).toBe(0);
});
test("concurrent controllers serialize and the first terminal decision prevents a second fresh verdict", async () => {
  const h = harness(); h.verdict.mockImplementation(async (_scope, body) => { h.detail.mockRejectedValue(new Error("closed")); return danceOwnerFixtureReceipt(body); });
  const results = await Promise.allSettled([h.make().decide(f, "passed", signal()), h.make().decide(f, "not_passed", signal())]);
  expect(results.map(v => v.status)).toEqual(["fulfilled", "rejected"]); expect(h.verdict).toHaveBeenCalledTimes(1);
});
test("corrupt or cross-target saved commands cannot replay", async () => {
  const h = harness(); h.entries.set(danceOwnerJournalKey(scope), '{"bodyJson":"changed"}'); await expect(h.make().load(signal())).rejects.toThrow("journal_corrupt"); expect(h.verdict).not.toHaveBeenCalled(); expect(h.detail).not.toHaveBeenCalled();
});
test.each(["community", "revision", "rubric"])("inconsistent captured %s is rejected", kind => {
  const bad: DanceOwnerRecording = { ...f, rubric: { ...f.rubric, ...(kind === "community" ? { community_id: "other" } : kind === "revision" ? { review_revision: 9 } : { rubric_hash: "f".repeat(64) }) } };
  expect(() => assertDanceOwnerRecording(bad, scope)).toThrow("target_changed");
});
