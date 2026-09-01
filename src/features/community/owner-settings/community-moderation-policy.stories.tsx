import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fn } from "storybook/test";
import { CommunityModerationPolicyPanel, type CommunityModerationPolicyPanelProps } from "./community-moderation-settings-panel";
import { MODERATION_POLICY, MODERATION_VIEW_AND_ACT, MODERATION_VIEW_ONLY } from "./community-moderation-settings-fixtures";
import { moderationPolicyDecisions, type CommunityModerationPolicyDecisions } from "./community-moderation-settings-model";

const defaultDecisions = moderationPolicyDecisions(MODERATION_POLICY);
const baseArgs: CommunityModerationPolicyPanelProps = {
  capabilities: MODERATION_VIEW_AND_ACT,
  onPolicyDecisionChange: fn(),
  onPolicySave: fn(),
  policy: MODERATION_POLICY,
  policyDecisions: defaultDecisions,
};

const DIRTY_POLICY_DECISIONS = {
  ...defaultDecisions,
  harassment: "block",
} satisfies CommunityModerationPolicyDecisions;

const meta = {
  title: "Screens/Community/OwnerSettings/ContentPolicy",
  component: CommunityModerationPolicyPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto min-h-screen w-full max-w-6xl bg-background p-4 text-foreground md:p-8"><Story /></main>],
  args: baseArgs,
} satisfies Meta<typeof CommunityModerationPolicyPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dirty: Story = { args: { policyDecisions: DIRTY_POLICY_DECISIONS, policyDirty: true } };
export const ViewOnly: Story = { args: { capabilities: MODERATION_VIEW_ONLY } };
export const Loading: Story = { args: { loading: true } };
export const Error: Story = { args: { errorMessage: "Content policy could not be loaded." } };
