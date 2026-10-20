import { createRequestEvent, renderToString } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { expect, test, vi } from "vitest";
import type { SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import { ApplicationSessionProvider } from "../../shell/application-session.tsx";
import { HandleStorefront } from "./handle-storefront.tsx";
import type { HandleStorefrontPublicSuccess, SupportedHandleOffering } from "./handle-storefront.model.ts";

const offering = {
  offering_id: "offering-ssr", offering_revision: 1, offering_hash: "a".repeat(64), community_id: "community-ssr",
  family: "spaces", namespace_root: "first-root", display_root: "first-root",
  sale_namespace_activation_id: "activation-first", sale_namespace_activation_generation: 1,
  current_availability: { kind: "temporarily_unavailable" },
  label_scope: { kind: "label_rule_v2", label_grammar_id: "spaces_subspace_label_v1", reserved_labels_id: "reserved-1",
    reserved_labels_revision: 1, reserved_labels_hash: "a".repeat(64),
    availability: { kind: "length_band_v1", min_label_length: 1, max_label_length: 62 } },
  allocation: { kind: "first_come_v1" }, max_active_grants_per_account: 1,
  fulfillment: { kind: "spaces_native_v1" },
  qualification_policy: { kind: "curated_policy_v1", policy_id: "policy-ssr", policy_revision: 1,
    policy_hash: "a".repeat(64), provider_binding_hash: "a".repeat(64) },
  pricing: { kind: "free_v1", pricing_id: "free-ssr", pricing_revision: 1, pricing_hash: "a".repeat(64), atomic_amount: "0" },
  issuance: { family: "spaces", driver_id: "spaces-native", driver_version: "1" },
  quote_ttl_seconds: 120, reservation_ttl_seconds: 300, status: "active", created_at: "2026-10-20T00:00:00.000Z",
} as const satisfies SupportedHandleOffering;
const state: HandleStorefrontPublicSuccess = {
  kind: "success", status: 200, offerings: [offering],
  community: { kind: "success", status: 200, requestedPathSegment: "community-ssr", canonicalPath: "/c/community-ssr",
    canonicalUrl: "https://pirate.test/c/community-ssr", communityId: "community-ssr", routeFamily: "spaces", routeDisplay: "first-root",
    community: { displayName: "Test community", description: null, membershipMode: "open", memberCount: 2, followerCount: 0, rules: [] } },
};

test("server HTML preserves the unavailable Spaces storefront and recovery link without private effects", () => {
  const client = {
    get_personas: vi.fn<SessionHandleSalesApiClient["get_personas"]>(),
    get_handleClaimsClaimId: vi.fn<SessionHandleSalesApiClient["get_handleClaimsClaimId"]>(),
    post_handlePersonaLinkConfirmations: vi.fn<SessionHandleSalesApiClient["post_handlePersonaLinkConfirmations"]>(),
    post_handleQuotes: vi.fn<SessionHandleSalesApiClient["post_handleQuotes"]>(),
    post_handleReservations: vi.fn<SessionHandleSalesApiClient["post_handleReservations"]>(),
    post_handleClaims: vi.fn<SessionHandleSalesApiClient["post_handleClaims"]>(),
  };
  const event = createRequestEvent(new Request("https://pirate.test/c/community-ssr/names"));
  const html = provideRequestEvent(event, () => renderToString(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "private-account-ssr" })}>
    <HandleStorefront pathSegment="community-ssr" data={state} sessionClient={client} />
  </ApplicationSessionProvider>));
  expect(html).toContain("Claim a name in @first-root");
  expect(html).toContain("Temporarily unavailable");
  expect(html).toContain('href="/spaces-name-requests"');
  expect(html).not.toContain("private-account-ssr");
  for (const method of Object.values(client)) expect(method).not.toHaveBeenCalled();
});
