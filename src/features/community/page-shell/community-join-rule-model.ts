import type { GetCommunitiesCommunityIdPreviewResponse } from "@pirate/api-client";
import { normalizeIdentityCountryAlpha2 } from "../../verification/nationality-country-codes.ts";

type Gate = GetCommunitiesCommunityIdPreviewResponse["membership_gate_summaries"][number];
export type CommunityJoinRule = { readonly kind: "open" } | { readonly kind: "palm" } | { readonly kind: "unsupported" } | { readonly kind: "nationality"; readonly countries: readonly string[] };
/** Only a plain conjunction can be reduced to the three drawn policy rows. */
export function projectCommunityJoinRule(preview: Pick<GetCommunitiesCommunityIdPreviewResponse, "membership_mode" | "membership_gate_summaries" | "membership_gate_expression" | "gate_match_mode" | "human_verification_lane">): CommunityJoinRule {
  if (preview.membership_mode === "request") return { kind: "unsupported" };
  if (preview.membership_mode === "open" && preview.membership_gate_summaries.length === 0) return { kind: "open" };
  if (preview.gate_match_mode === "any" || (preview.membership_gate_expression && preview.membership_gate_expression.op !== "gate" && (preview.membership_gate_expression.op !== "and" || preview.membership_gate_expression.children.some(child => child.op !== "gate")))) return { kind: "unsupported" };
  const gates = preview.membership_gate_summaries;
  const countries = (gate: Gate) => (gate.required_values ?? (gate.required_value ? [gate.required_value] : [])).map(normalizeIdentityCountryAlpha2);
  const nationality = gates.filter(gate => gate.gate_type === "nationality");
  if (nationality.length === 1 && gates.every(gate => ["nationality", "human_verification", "unique_human"].includes(gate.gate_type))) {
    const values = countries(nationality[0]);
    if (values.length && values.every((value): value is string => value !== null) && !nationality[0].excluded_values?.length) return { kind: "nationality", countries: [...new Set(values)] };
  }
  if (gates.every(gate => gate.gate_type === "human_verification" || gate.gate_type === "unique_human") && preview.human_verification_lane === "very") return { kind: "palm" };
  return { kind: "unsupported" };
}
export function communityJoinText(rule: CommunityJoinRule): string {
  if (rule.kind === "open") return "Anyone can join";
  if (rule.kind === "palm") return "Palm scan to join";
  if (rule.kind === "unsupported") return "Check the requirements to join";
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const countries = rule.countries.map(code => names.of(code) ?? code);
  // The country name remains explicit for any country, rather than guessing a demonym.
  return countries.length === 1 && rule.countries[0] === "PT" ? "Portuguese citizens can join" : `Citizens of ${new Intl.ListFormat("en", { style: "long", type: "disjunction" }).format(countries)} can join`;
}
