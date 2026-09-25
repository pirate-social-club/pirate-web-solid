import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { SpacesOwnerProofPanel } from "./spaces-owner-proof-panel";
import type { SpacesOwnerProofApi } from "./spaces-owner-proof-api";

const previewApi: SpacesOwnerProofApi = {
  async start({ canonicalRoot }) {
    return {
      contract: "pirate-spaces-ownership-start-v1", ceremony_id: "sowner_1234567890abcdef1234567890abcdef",
      generation: 1, network: "mainnet", canonical_root: canonicalRoot,
      root_outpoint: `${"a".repeat(64)}:1`, root_key_hex: "b".repeat(64),
      challenge_message: "Pirate Spaces owner proof for this community and root",
      challenge_digest_hex: "c".repeat(64), expires_at: "2026-09-25T21:00:00Z", replayed: false,
    };
  },
  async poll() {
    return { contract: "pirate-spaces-ownership-result-v1", ceremony_id: "sowner_1234567890abcdef1234567890abcdef",
      generation: 1, status: "verification_pending", retry_after_seconds: 30, replayed: false };
  },
};

const meta = {
  title: "Screens/Community/OwnerSettings/SpacesOwnerProof",
  component: SpacesOwnerProofPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto min-h-screen w-full max-w-3xl bg-background p-4 text-foreground md:p-8"><Story /></main>],
  args: { api: previewApi, communityId: "community-staging" },
} satisfies Meta<typeof SpacesOwnerProofPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StartAndCheck: Story = {};
