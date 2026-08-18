import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import {
  CommunityMembershipRequestsPage,
  type CommunityMembershipRequestsPageProps,
  type MembershipRequestSummary,
} from "./community-membership-requests-page";

const REQUESTS: MembershipRequestSummary[] = [
  { id: "mreq_1", object: "membership_request_summary", community: "cmt_signal", applicant_user: "usr_1", applicant_handle: "maya.pirate", applicant_avatar_ref: null, status: "pending", note: "I have been following the community and would like to participate.", created: 1777024800 },
  { id: "mreq_2", object: "membership_request_summary", community: "cmt_signal", applicant_user: "usr_2", applicant_handle: "noor.pirate", applicant_avatar_ref: null, status: "pending", note: null, created: 1776958200 },
];

const baseArgs: CommunityMembershipRequestsPageProps = {
  onApprove: () => undefined,
  onReject: () => undefined,
  processingRequestId: null,
  requests: REQUESTS,
};

function MembershipRequestsStory(props: { initialRequests: MembershipRequestSummary[]; loading?: boolean; processingRequestId?: string | null }) {
  const [approved, setApproved] = createSignal<MembershipRequestSummary[]>([]);
  const [rejected, setRejected] = createSignal<MembershipRequestSummary[]>([]);
  const report = () => {
    const lastApproved = approved().at(-1);
    const lastRejected = rejected().at(-1);
    return [`Approved ${approved().length}`, `Rejected ${rejected().length}`, `Last approved ${lastApproved ? JSON.stringify(lastApproved) : "None"}`, `Last rejected ${lastRejected ? JSON.stringify(lastRejected) : "None"}`].join("; ");
  };
  return (
    <main class="min-h-[640px] bg-background p-6 text-foreground" dir="rtl">
      <CommunityMembershipRequestsPage
        loading={props.loading}
        onApprove={(request) => setApproved((current) => [...current, request])}
        onReject={(request) => setRejected((current) => [...current, request])}
        processingRequestId={props.processingRequestId}
        requests={props.initialRequests}
      />
      <Type aria-live="polite" class="sr-only" data-testid="request-action-report" variant="caption">{report()}</Type>
    </main>
  );
}

const meta = {
  title: "Compositions/Community/Moderation/MembershipRequestsPage",
  component: CommunityMembershipRequestsPage,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityMembershipRequestsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Multiple: Story = {
  name: "Multiple",
  args: baseArgs,
  globals: { direction: "rtl" },
  render: (args) => <MembershipRequestsStory initialRequests={args.requests} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: /maya\.pirate/ })).toHaveAttribute("href", "/u/maya.pirate");
    await expect(canvas.getByRole("link", { name: /noor\.pirate/ })).toHaveAttribute("href", "/u/noor.pirate");
    await expect(canvas.getByText("No message.")).toBeInTheDocument();
    await expect(canvas.getByText("Apr 24, 2026")).toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "Approve" })[0]!);
    await userEvent.click(canvas.getAllByRole("button", { name: "Reject" })[1]!);
    await expect(canvas.getByTestId("request-action-report")).toHaveTextContent("Approved 1; Rejected 1");
  },
};

export const Empty: Story = {
  name: "Empty",
  args: { ...baseArgs, requests: [] },
  globals: { direction: "rtl" },
  render: (args) => <MembershipRequestsStory initialRequests={args.requests} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("No pending requests.")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  },
};

export const Processing: Story = {
  name: "Processing",
  args: { ...baseArgs, processingRequestId: "mreq_1" },
  globals: { direction: "rtl" },
  render: (args) => <MembershipRequestsStory initialRequests={args.requests} processingRequestId={args.processingRequestId} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approveButtons = canvas.getAllByRole("button", { name: "Approve" });
    await expect(approveButtons[0]!).toBeDisabled();
    await expect(approveButtons[0]!).toHaveAttribute("aria-busy", "true");
    await expect(approveButtons[1]!).not.toBeDisabled();
  },
};
