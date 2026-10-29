import reviewVideoUrl from "../../../packages/solid-ui/src/patterns/engagement/vertical-feed/fixtures/clip-1.mp4";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { establishSessionAuthority } from "../../api/browser-session-events";
import type { DanceResult } from "./dance-result-api";
import type { DancePostingEligibility, DanceReviewApi, DanceReviewReceipt } from "./dance-review-api";
import { DanceReviewPage } from "./dance-review-page";
import { createDanceReviewFixtureStore, danceReviewFixtureReceipt, danceReviewFixtures as f, danceReviewScope as scope } from "./dance-review.fixtures";

const meta = { title: "Screens/Dance/Recording review", parameters: { layout: "fullscreen", a11y: { test: "error" },
  docs: { description: { component: "The production recording-management page with fictional private review responses. No recording, provider, publication or reward operation." } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function fixture(initial: DanceResult, loseReply = false, posting: DancePostingEligibility = { kind: "eligible" }) {
  let result = initial, lost = false;
  const { store } = createDanceReviewFixtureStore(), receipts = new Map<string, DanceReviewReceipt>();
  const api: DanceReviewApi = {
    postingEligibility: async () => posting, read: async () => result, disclosure: async () => "disclosure-v1", media: async () => { throw new Error("No real media in this fixture"); },
    command: async (_scope, body) => {
      const prior = receipts.get(body.idempotency_key); if (prior) return prior;
      result = body.operation === "withdraw" ? f.withdrawn : { ...f.awaiting, review_revision: result.review_revision + 1,
        show_publicly_if_passed: body.show_publicly_if_passed, initial_submit_receipt: { ...f.awaiting.initial_submit_receipt, show_publicly_if_passed: body.show_publicly_if_passed } };
      const receipt = danceReviewFixtureReceipt(body, result); receipts.set(body.idempotency_key, receipt);
      if (loseReply && !lost) { lost = true; throw new Error("Fictional lost reply"); }
      return receipt;
    },
  };
  return <DanceReviewPage communityId={scope.communityId} reviewId={scope.reviewId} api={api} store={store} localPreview={reviewVideoUrl}
    session={async () => { establishSessionAuthority(); return { status: "authenticated", userId: scope.accountId, personas: [] }; }} />;
}
export const ReadyToSubmit: Story = {
  render: () => fixture(f.uploaded),
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await canvas.findByRole("button", { name: "Submit for review" }); await expect(canvas.getByRole("switch", { name: "Show publicly if it passes" })).toBeChecked(); },
};
export const SubmitPrivately: Story = {
  render: () => fixture(f.uploaded),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("switch", { name: "Show publicly if it passes" })); await userEvent.click(canvas.getByRole("button", { name: "Submit for review" }));
    await canvas.findByRole("heading", { name: "Waiting for review" }); await expect(canvas.getByRole("switch", { name: "Show publicly if it passes" })).not.toBeChecked();
  },
};
export const ChangePendingChoice: Story = {
  render: () => fixture(f.awaiting),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("switch", { name: "Show publicly if it passes" })); await userEvent.click(canvas.getByRole("button", { name: "Save publication choice" }));
    await canvas.findByRole("heading", { name: "Waiting for review" }); await expect(canvas.getByRole("switch", { name: "Show publicly if it passes" })).toBeChecked();
    await expect(canvas.getByRole("button", { name: "Save publication choice" })).toBeDisabled();
  },
};
export const CancelPendingReview: Story = {
  render: () => fixture(f.awaiting),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Cancel review" }));
    const dialog = within(await within(document.body).findByRole("dialog")); await userEvent.click(dialog.getByRole("button", { name: "Cancel review" }));
    await canvas.findByRole("heading", { name: "Withdrawn" }); await expect(canvas.queryByRole("switch")).toBeNull();
  },
};
export const RecoverLostSubmit: Story = {
  render: () => fixture(f.uploaded, true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Submit for review" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Resume submission" })); await canvas.findByRole("heading", { name: "Waiting for review" });
    await expect(canvas.getByRole("switch", { name: "Show publicly if it passes" })).toBeChecked();
  },
};

export const VerifyBeforePublicSubmission: Story = {
  render: () => fixture(f.uploaded, false, { kind: "unavailable", join: { kind: "verify", providerId: "very.web", intentId: "fictional-intent" } }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("link", { name: "Verify to join" })).toHaveAttribute("href", "/c/community");
    await expect(canvas.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("switch", { name: "Show publicly if it passes" }));
    await userEvent.click(canvas.getByRole("button", { name: "Submit for review" }));
    await canvas.findByRole("heading", { name: "Waiting for review" });
    await expect(canvas.getByRole("switch")).not.toBeChecked();
  },
};

export const PostingAccessUnknown: Story = {
  render: () => fixture(f.uploaded, false, { kind: "unknown" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/We couldn’t confirm public posting access/u);
    await expect(canvas.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Check posting access" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("switch"));
    await expect(canvas.getByRole("button", { name: "Submit for review" })).toBeEnabled();
  },
};
