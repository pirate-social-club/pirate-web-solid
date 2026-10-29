import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { establishSessionAuthority } from "../../api/browser-session-events";
import { VideoPlaybackSeamsContext } from "../posts/video-submission/video-playback-seams";
import { reviewCanplayAttach, reviewPlaybackMint, reviewPosterPath } from "../posts/feed/public-feed-fixtures";
import { DanceOwnerPage } from "./dance-owner-page";
import { createDanceOwnerFixtureApi, danceOwnerScope as scope } from "./dance-owner.fixtures";
import { createDanceReviewFixtureStore } from "./dance-review.fixtures";
const meta = { title: "Screens/Dance/Owner review", parameters: { layout: "fullscreen", a11y: { test: "error" }, docs: { description: { component: "Production owner queue and review with fictional API projections and no real media/provider, verdict, qualification or publication effect." } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function fixture(reviewId?: string, lost = false, noPose = false) {
  const { store } = createDanceReviewFixtureStore();
  return <VideoPlaybackSeamsContext value={{ posterPath: reviewPosterPath, mint: reviewPlaybackMint, attach: reviewCanplayAttach }}><DanceOwnerPage communityId={scope.communityId} reviewId={reviewId} store={store} api={createDanceOwnerFixtureApi(lost, noPose)} session={async () => { establishSessionAuthority(); return { status: "authenticated", userId: scope.accountId, personas: [] }; }} /></VideoPlaybackSeamsContext>;
}
export const Queue: Story = { render: () => fixture(), play: async ({ canvasElement }) => { const canvas = within(canvasElement); await expect(await canvas.findByRole("link", { name: "Review recording" })).toHaveAttribute("href", "/dance/community/owner-reviews/review"); } };
export const CapturedRubric: Story = { render: () => fixture("review"), play: async ({ canvasElement }) => { const canvas = within(canvasElement); await canvas.findByRole("heading", { name: "What to review" }); await expect(canvas.getByText(/By choosing Pass/)).toBeVisible(); } };
export const Pass: Story = { render: () => fixture("review"), play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Pass" })); await canvas.findByRole("heading", { name: "Decision recorded" }); } };
export const NotPassed: Story = { render: () => fixture("review"), play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Not passed" })); await canvas.findByRole("heading", { name: "Decision recorded" }); await expect(canvas.getByText(/Your Not passed decision/)).toBeVisible(); } };
export const RecoverLostVerdict: Story = { render: () => fixture("review", true), play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Pass" })); await userEvent.click(await canvas.findByRole("button", { name: "Check again" })); await canvas.findByRole("heading", { name: "Decision recorded" }); } };
export const NoPoseRubric: Story = { render: () => fixture("review", false, true), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect((await canvas.findAllByText(/No opening cue is required/))[0]).toBeVisible();
  await expect(canvas.queryByText(/saw the assigned cue/)).toBeNull();
  await userEvent.click(await canvas.findByRole("button", { name: "Pass" })); await canvas.findByRole("heading", { name: "Decision recorded" });
} };
