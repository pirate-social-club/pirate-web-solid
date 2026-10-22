import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { establishSessionAuthority } from "../../api/browser-session-events";
import type { DanceResult } from "./dance-result-api";
import type { DanceReviewApi, DanceReviewReceipt } from "./dance-review-api";
import { DanceReviewPage } from "./dance-review-page";
import { createDanceReviewFixtureStore, danceReviewFixtureReceipt, danceReviewFixtures as f, danceReviewScope as scope } from "./dance-review.fixtures";

const meta = { title: "Screens/Dance/Recording review", parameters: { layout: "fullscreen", a11y: { test: "error" },
  docs: { description: { component: "The production recording-management page with fictional private review responses. No recording, provider, publication or reward operation." } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function fixture(initial: DanceResult, loseReply = false) {
  let result = initial, lost = false;
  const { store } = createDanceReviewFixtureStore(), receipts = new Map<string, DanceReviewReceipt>();
  const api: DanceReviewApi = {
    read: async () => result, disclosure: async () => "disclosure-v1", media: async () => { throw new Error("No real media in this fixture"); },
    command: async (_scope, body) => {
      const prior = receipts.get(body.idempotency_key); if (prior) return prior;
      result = body.operation === "withdraw" ? f.withdrawn : { ...f.awaiting, review_revision: result.review_revision + 1,
        show_publicly_if_passed: body.show_publicly_if_passed, initial_submit_receipt: { ...f.awaiting.initial_submit_receipt, show_publicly_if_passed: body.show_publicly_if_passed } };
      const receipt = danceReviewFixtureReceipt(body, result); receipts.set(body.idempotency_key, receipt);
      if (loseReply && !lost) { lost = true; throw new Error("Fictional lost reply"); }
      return receipt;
    },
  };
  return <DanceReviewPage communityId={scope.communityId} reviewId={scope.reviewId} api={api} store={store}
    session={async () => { establishSessionAuthority(); return { status: "authenticated", userId: scope.accountId, personas: [] }; }} />;
}
export const ReadyToSubmit: Story = {
  render: () => fixture(f.uploaded),
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await canvas.findByRole("button", { name: "Submit" }); await expect(canvas.getByRole("checkbox", { name: "Show publicly if it passes" })).toBeChecked(); },
};
export const SubmitPrivately: Story = {
  render: () => fixture(f.uploaded),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("checkbox", { name: "Show publicly if it passes" })); await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await canvas.findByRole("heading", { name: "Waiting for review" }); await expect(canvas.getByRole("checkbox", { name: "Show publicly if it passes" })).not.toBeChecked();
  },
};
export const ChangePendingChoice: Story = {
  render: () => fixture(f.awaiting),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("checkbox", { name: "Show publicly if it passes" })); await userEvent.click(canvas.getByRole("button", { name: "Save publication choice" }));
    await canvas.findByRole("heading", { name: "Waiting for review" }); await expect(canvas.getByRole("checkbox", { name: "Show publicly if it passes" })).toBeChecked();
    await expect(canvas.getByRole("button", { name: "Save publication choice" })).toBeDisabled();
  },
};
export const CancelPendingReview: Story = {
  render: () => fixture(f.awaiting),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Cancel review" }));
    const dialog = within(await within(document.body).findByRole("dialog")); await userEvent.click(dialog.getByRole("button", { name: "Cancel review" }));
    await canvas.findByRole("heading", { name: "Withdrawn" }); await expect(canvas.queryByRole("checkbox")).toBeNull();
  },
};
export const RecoverLostSubmit: Story = {
  render: () => fixture(f.uploaded, true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Submit" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Check again" })); await canvas.findByRole("heading", { name: "Waiting for review" });
    await expect(canvas.getByRole("checkbox", { name: "Show publicly if it passes" })).toBeChecked();
  },
};
