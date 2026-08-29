import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import type { CommunityPageSuccess } from "../community-page/community-page.model";
import { HandleStorefront } from "./handle-storefront";
import type {
  HandleStorefrontPublicState,
  SupportedHandleOffering,
} from "./handle-storefront.model";

const community: CommunityPageSuccess = {
  kind: "success",
  status: 200,
  requestedPathSegment: "night-shift",
  canonicalPath: "/c/night-shift",
  canonicalUrl: "https://pirate.sc/c/night-shift",
  communityId: "community_2f1c9a10-1b2c-4d3e-8f90-abcdef012345",
  routeFamily: "hns",
  routeDisplay: "night-shift",
  community: {
    displayName: "Night Shift",
    description: "A late-night space for music, ideas, and people building after dark.",
    membershipMode: "open",
    memberCount: 1_270,
    followerCount: 18_400,
    rules: [],
  },
};

function offering(overrides: Partial<SupportedHandleOffering> = {}): SupportedHandleOffering {
  return {
    offering_id: "offering_open_claims",
    offering_revision: 1,
    offering_hash: "hash_1",
    community_id: community.communityId,
    family: "hns",
    namespace_root: "nightshift",
    display_root: "nightshift",
    sale_namespace_activation_id: "act_1",
    sale_namespace_activation_generation: 1,
    label_scope: {
      kind: "label_rule_v2",
      label_grammar_id: "hns_ascii_ldh_1_63_v1",
      reserved_labels_id: "reserved_v1",
      reserved_labels_revision: 1,
      reserved_labels_hash: "hash_reserved",
      availability: { kind: "length_band_v1", min_label_length: 3, max_label_length: 32 },
    },
    allocation: { kind: "first_come_v1" },
    max_active_grants_per_account: 1,
    fulfillment: { kind: "hosted_persona_v1" },
    qualification_policy: {
      kind: "none_v1",
      policy_id: "policy_none",
      policy_revision: 1,
      policy_hash: "hash_policy",
    },
    pricing: {
      kind: "free_v1",
      pricing_id: "pricing_free",
      pricing_revision: 1,
      pricing_hash: "hash_pricing",
      atomic_amount: "0",
    },
    issuance: { family: "hns", driver_id: "hns_driver", driver_version: "1" },
    quote_ttl_seconds: 300,
    reservation_ttl_seconds: 900,
    status: "active",
    created_at: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

function success(
  offerings: readonly SupportedHandleOffering[] = [offering()],
): HandleStorefrontPublicState {
  return { kind: "success", status: 200, community, offerings };
}

const meta = {
  title: "Screens/Community/HandleStorefront",
  component: HandleStorefront,
  args: { pathSegment: "night-shift", data: success() },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof HandleStorefront>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "One open offering",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1 })).toBeInTheDocument();
  },
};

/** An exact-label offering reserves a single name rather than a rule. */
export const ExactLabel: Story = {
  name: "Exact-label offering",
  args: {
    data: success([
      offering({
        offering_id: "offering_exact",
        label_scope: {
          kind: "exact_label_v2",
          label_grammar_id: "hns_ascii_ldh_1_63_v1",
          handle_label: "aster",
          reserved_labels_id: "reserved_v1",
          reserved_labels_revision: 1,
          reserved_labels_hash: "hash_reserved",
        },
      }),
    ]),
  },
};

export const MultipleOfferings: Story = {
  name: "Several offerings",
  args: {
    data: success([
      offering(),
      offering({ offering_id: "offering_direct", allocation: { kind: "direct_grant_v1" } }),
    ]),
  },
};

/** A community can be routable with nothing currently for sale. */
export const NoOfferings: Story = {
  name: "No offerings",
  args: { data: success([]) },
};

export const PausedOffering: Story = {
  name: "Paused offering",
  args: { data: success([offering({ status: "paused" })]) },
};

/** A requested label arrives from the query string and prefills the claim. */
export const WithRequestedLabel: Story = {
  name: "Label prefilled from the URL",
  args: { data: success(), initialLabel: "aster" },
};

export const NotFound: Story = {
  name: "Not found",
  args: { data: { kind: "not-found", status: 404 } },
};

export const Invalid: Story = {
  name: "Invalid route",
  args: { pathSegment: "not a route", data: { kind: "invalid", status: 400 } },
};

export const Unavailable: Story = {
  name: "Unavailable",
  args: { data: { kind: "unavailable", status: 502 } },
};

export const Mobile: Story = {
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
