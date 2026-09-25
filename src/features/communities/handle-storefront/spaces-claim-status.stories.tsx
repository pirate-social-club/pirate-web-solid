import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { SpacesClaimStateCard, type SpacesClaimDisplay } from "./spaces-claim-status.tsx";

const pending: SpacesClaimDisplay = { state: "issuance_pending", delayed: false,
  display_identifier: "alice@yahoo", grant: null };

const meta = {
  title: "Screens/Community/SpacesClaimStatus",
  component: SpacesClaimStateCard,
  parameters: { layout: "centered", a11y: { test: "error" } },
  decorators: [(Story) => <main class="w-[min(100vw-2rem,32rem)] rounded-xl border bg-background p-5 text-foreground"><Story /></main>],
  args: { claim: pending },
} satisfies Meta<typeof SpacesClaimStateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};
export const Delayed: Story = { args: { claim: { ...pending, delayed: true } } };
export const Failed: Story = { args: { claim: { ...pending, state: "issuance_failed" } } };
export const Issued: Story = { args: { claim: { ...pending, state: "issued", grant: { status: "active" } } } };
