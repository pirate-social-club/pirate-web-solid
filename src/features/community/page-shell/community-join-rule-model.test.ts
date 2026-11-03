import { expect, test } from "vitest";
import { communityJoinText, projectCommunityJoinRule } from "./community-join-rule-model.ts";
const base = { membership_mode: "gated" as const, human_verification_lane: "very" as const, membership_gate_summaries: [] };
test("countries come from the public gate and normalize the full allowlist", () => {
  const rule = projectCommunityJoinRule({ ...base, membership_gate_summaries: [{ gate_type: "nationality", required_values: ["PRT", "PT"] }, { gate_type: "unique_human" }] });
  expect(rule).toEqual({ kind: "nationality", countries: ["PT"] }); expect(communityJoinText(rule)).toBe("Portuguese citizens can join");
});
test("multiple countries remain explicit without dropping one", () => {
  const rule = projectCommunityJoinRule({ ...base, membership_gate_summaries: [{ gate_type: "nationality", required_values: ["PRT", "CAN"] }] });
  expect(communityJoinText(rule)).toContain("Portugal or Canada");
});
test("request, OR, exclusions and unknown gates do not falsely promise open or nationality-only admission", () => {
  expect(projectCommunityJoinRule({ ...base, membership_mode: "request" })).toEqual({ kind: "unsupported" });
  expect(projectCommunityJoinRule({ ...base, gate_match_mode: "any" })).toEqual({ kind: "unsupported" });
  expect(projectCommunityJoinRule({ ...base, membership_gate_summaries: [{ gate_type: "nationality", excluded_values: ["PT"] }] })).toEqual({ kind: "unsupported" });
  expect(projectCommunityJoinRule({ ...base, membership_gate_summaries: [{ gate_type: "wallet_score" }] })).toEqual({ kind: "unsupported" });
});
test("a known Palm policy and a truly open policy map to the drawn rows", () => {
  expect(projectCommunityJoinRule(base)).toEqual({ kind: "palm" });
  expect(projectCommunityJoinRule({ ...base, membership_mode: "open" })).toEqual({ kind: "open" });
});
