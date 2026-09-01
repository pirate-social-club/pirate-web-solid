import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fn } from "storybook/test";
import { CommunityModerationSettingsPanel, type CommunityModerationSettingsPanelProps } from "./community-moderation-settings-panel";
import {
  EMPTY_MODERATION_CASES,
  HIDDEN_MODERATION_CASES,
  LOCKED_MODERATION_CASE_DETAIL,
  MODERATION_CASE_DETAIL,
  MODERATION_POLICY,
  MODERATION_VIEW_AND_ACT,
  MODERATION_VIEW_ONLY,
  OPEN_MODERATION_CASES,
} from "./community-moderation-settings-fixtures";
import { moderationPolicyDecisions, type CommunityModerationPolicyDecisions } from "./community-moderation-settings-model";

const baseArgs: CommunityModerationSettingsPanelProps = {
  capabilities: MODERATION_VIEW_AND_ACT,
  caseActionIdempotencyKey: "storybook-case-action-1042",
  cases: OPEN_MODERATION_CASES,
  caseView: "open",
  detail: MODERATION_CASE_DETAIL,
  onCaseAction: fn(),
  onCaseSelect: fn(),
  onCaseViewChange: fn(),
  onPaneChange: fn(),
  onPolicyDecisionChange: fn(),
  onPolicySave: fn(),
  pane: "cases",
  policy: MODERATION_POLICY,
  policyDecisions: moderationPolicyDecisions(MODERATION_POLICY),
};

const DIRTY_POLICY_DECISIONS = {
  ...moderationPolicyDecisions(MODERATION_POLICY),
  harassment: "block",
} satisfies CommunityModerationPolicyDecisions;

const meta = {
  title: "Screens/Community/OwnerSettings/Moderation",
  component: CommunityModerationSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto min-h-screen w-full max-w-6xl bg-background p-4 text-foreground md:p-8"><Story /></main>],
  args: baseArgs,
} satisfies Meta<typeof CommunityModerationSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QueueDefault: Story = {};
export const QueueEmpty: Story = { args: { cases: EMPTY_MODERATION_CASES, detail: undefined } };
export const HiddenCases: Story = { args: { cases: HIDDEN_MODERATION_CASES, caseView: "hidden", detail: undefined } };
export const LockedPreview: Story = { args: { detail: LOCKED_MODERATION_CASE_DETAIL } };
export const ViewOnly: Story = { args: { capabilities: MODERATION_VIEW_ONLY } };
export const ActionPending: Story = { args: { actionBusy: "reject" } };
export const Loading: Story = { args: { loading: true } };
export const Error: Story = { args: { errorMessage: "Moderation cases could not be loaded." } };
export const PolicyDefault: Story = { args: { pane: "policy" } };
export const PolicyViewOnly: Story = { args: { capabilities: MODERATION_VIEW_ONLY, pane: "policy" } };
export const PolicyDirty: Story = { args: { pane: "policy", policyDecisions: DIRTY_POLICY_DECISIONS, policyDirty: true } };
