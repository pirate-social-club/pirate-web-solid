import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { SpacesRouteAttachmentApi, SpacesRouteAttachmentState } from "./spaces-route-attachment-api";
import { SpacesRouteAttachmentPanel } from "./spaces-route-attachment-panel";

const attempt = (change: Partial<SpacesRouteAttachmentState> = {}): SpacesRouteAttachmentState => ({
  status: "awaiting_signature", attachment_intent_id: "sroute_1234567890abcdef1234567890abcdef", generation: 1,
  purpose: "first_attachment", canonical_root: "yahoo", public_origin: "https://pirate.sc",
  canonical_href: "https://pirate.sc/c/@yahoo",
  challenge_message: '["pirate-spaces-community-route-owner-v1","preview","mainnet","@yahoo","https://pirate.sc/c/@yahoo"]',
  expires_at: "2030-01-01T00:15:00.000Z", route_binding_id: null, replayed: false, ...change,
});

const api = (current: SpacesRouteAttachmentState | null, working = true): SpacesRouteAttachmentApi => ({
  async current() { return current; },
  async start({ canonicalRoot }) {
    return attempt({ canonical_root: canonicalRoot, canonical_href: `https://pirate.sc/c/@${canonicalRoot}`,
      purpose: current === null ? "first_attachment" : "revalidation" });
  },
  async prove() { return { status: "verification_pending", retry_after_seconds: 30 }; },
  async commit() { return { status: "verification_pending", retry_after_seconds: 30 }; },
  async resolves() { return working; },
});

const meta = {
  title: "Flows/Community owner settings/Spaces community address",
  component: SpacesRouteAttachmentPanel,
} satisfies Meta<typeof SpacesRouteAttachmentPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NotConnected: Story = { args: { api: api(null), communityId: "community-preview" } };
export const WaitingForSignature: Story = { args: { api: api(attempt()), communityId: "community-preview" } };
export const SignatureAccepted: Story = {
  args: { api: api(attempt({ status: "proved" })), communityId: "community-preview" },
};
export const Connected: Story = {
  args: { api: api(attempt({ status: "committed", route_binding_id: "srbind_preview" })), communityId: "community-preview" },
};
export const StoppedWorking: Story = {
  args: { api: api(attempt({ status: "committed", route_binding_id: "srbind_preview" }), false), communityId: "community-preview" },
};
