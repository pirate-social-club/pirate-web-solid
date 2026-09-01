import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fn } from "storybook/test";
import type { CommunityModerationCaseView } from "./community-moderation-settings-model";
import { CommunityModerationQueuePanel, type CommunityModerationQueuePanelProps } from "./community-moderation-settings-panel";
import {
  EMPTY_MODERATION_CASES,
  HIDDEN_MODERATION_CASES,
  HIDDEN_MODERATION_CASE_DETAILS,
  LOCKED_MODERATION_CASE_DETAIL,
  MODERATION_VIEW_AND_ACT,
  MODERATION_VIEW_ONLY,
  OPEN_MODERATION_CASE_DETAILS,
  OPEN_MODERATION_CASES,
} from "./community-moderation-settings-fixtures";

const baseArgs: CommunityModerationQueuePanelProps = {
  capabilities: MODERATION_VIEW_AND_ACT,
  caseActionIdempotencyKey: (caseRef) => `storybook-action-${caseRef}`,
  cases: OPEN_MODERATION_CASES,
  caseView: "open",
  details: OPEN_MODERATION_CASE_DETAILS,
  onCaseAction: fn(),
  onCaseViewChange: fn(),
};

const meta = {
  title: "Screens/Community/OwnerSettings/ModerationQueue",
  component: CommunityModerationQueuePanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto min-h-screen w-full max-w-6xl bg-background p-4 text-foreground md:p-8"><Story /></main>],
  args: baseArgs,
} satisfies Meta<typeof CommunityModerationQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function InteractiveQueue(props: CommunityModerationQueuePanelProps) {
  const [view, setView] = createSignal<CommunityModerationCaseView>(props.caseView);
  const hidden = () => view() === "hidden";
  return (
    <CommunityModerationQueuePanel
      {...props}
      cases={hidden() ? HIDDEN_MODERATION_CASES : OPEN_MODERATION_CASES}
      caseView={view()}
      details={hidden() ? HIDDEN_MODERATION_CASE_DETAILS : OPEN_MODERATION_CASE_DETAILS}
      onCaseViewChange={setView}
    />
  );
}

export const Default: Story = { render: (args) => <InteractiveQueue {...args} /> };
export const Empty: Story = { args: { cases: EMPTY_MODERATION_CASES, details: [] } };
export const HiddenCases: Story = { args: { cases: HIDDEN_MODERATION_CASES, caseView: "hidden", details: HIDDEN_MODERATION_CASE_DETAILS } };
export const LockedPreview: Story = { args: { cases: { ...OPEN_MODERATION_CASES, items: [LOCKED_MODERATION_CASE_DETAIL.case] }, details: [LOCKED_MODERATION_CASE_DETAIL] } };
export const ViewOnly: Story = { args: { capabilities: MODERATION_VIEW_ONLY } };
export const ActionPending: Story = { args: { actionBusy: { action: "reject", caseRef: "case_report_1042" } } };
export const Loading: Story = { args: { loading: true } };
export const Error: Story = { args: { errorMessage: "Moderation cases could not be loaded." } };
