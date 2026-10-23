import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { establishSessionAuthority } from "../../api/browser-session-events";
import { VideoPlaybackSeamsContext } from "../posts/video-submission/video-playback-seams";
import { reviewPlaybackMint, reviewPosterPath } from "../posts/feed/public-feed-fixtures";
import { DanceReferencePage } from "./dance-reference-page";
import { danceReferenceJournalKey } from "./dance-reference-controller";
import { createDanceReferenceFixtureApi, danceReferenceCommand, danceReferenceSession as session, danceReferenceStatus, danceReferenceTarget as target } from "./dance-reference.fixtures";
import { createDanceReviewFixtureStore } from "./dance-review.fixtures";

const meta = { title: "Screens/Dance/Create from video", parameters: { layout: "fullscreen", a11y: { test: "error" }, docs: { description: { component: "Production reference authoring and original-request recovery with fictional account, video and API projections. No real media processing, admission or rewards." } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function fixture(mode: "draft" | "ready" | "unknown" | "failed" | "pending_video" | "anonymous" = "draft") {
  const { store, entries } = createDanceReviewFixtureStore(), api = createDanceReferenceFixtureApi();
  if (mode === "ready" || mode === "failed" || mode === "unknown") entries.set(danceReferenceJournalKey(target.scope), JSON.stringify({
    ...target.scope, version: 1, bodyJson: JSON.stringify(danceReferenceCommand), choreographyId: mode === "unknown" ? null : danceReferenceStatus.choreography_id,
  }));
  if (mode === "ready" || mode === "failed") api.status = async () => ({ ...danceReferenceStatus, status: mode });
  if (mode === "pending_video") api.target = async () => ({ ...target, playable: false, delivery: { playback: "pending", thumbnail: "pending" } });
  return <VideoPlaybackSeamsContext value={{ posterPath: reviewPosterPath, mint: reviewPlaybackMint }}><DanceReferencePage referencePostId={target.scope.referencePostId} api={api} store={store}
    session={async () => { if (mode === "anonymous") return "anonymous"; establishSessionAuthority(); return session; }} /></VideoPlaybackSeamsContext>;
}
export const CreateFromOwnVideo: Story = { render: () => fixture(), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await canvas.findByText("Song profile"); await userEvent.click(await canvas.findByRole("button", { name: "Create dance" }));
  await canvas.findByRole("heading", { name: "Preparing your dance" }); await userEvent.click(canvas.getByRole("button", { name: "Check progress" }));
  await expect(await canvas.findByRole("heading", { name: "Preparing your dance" })).toBeVisible();
} };
export const Prepared: Story = { render: () => fixture("ready"), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect(await canvas.findByRole("link", { name: "View dances" })).toHaveAttribute("href", "/dance/song-community/songs/song-post");
  await expect(canvas.queryByRole("button", { name: "Create dance" })).toBeNull();
} };
export const RecoverOriginalRequest: Story = { render: () => fixture("unknown"), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await canvas.findByText("We couldn’t confirm whether your dance was created.");
  await userEvent.click(await canvas.findByRole("button", { name: "Check request" })); await canvas.findByRole("heading", { name: "Preparing your dance" });
} };
export const ProcessingFailed: Story = { render: () => fixture("failed"), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await canvas.findByRole("heading", { name: "This video couldn’t be prepared as a dance." });
  await expect(canvas.queryByRole("button", { name: "Create dance" })).toBeNull();
} };
export const VideoStillPreparing: Story = { render: () => fixture("pending_video"), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect(await canvas.findByRole("button", { name: "Create dance" })).toBeDisabled();
  await expect(await canvas.findByText("Your video isn’t playable yet.")).toBeVisible();
} };
export const SignIn: Story = { render: () => fixture("anonymous"), play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect(await canvas.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in?return_to=%2Fdance%2Fnew%2Fvideo-post");
} };
