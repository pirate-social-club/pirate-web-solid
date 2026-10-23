import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { establishSessionAuthority } from "../../api/browser-session-events";
import { VideoCaptureError } from "../posts/video-submission/capture-failure";
import { VideoPlaybackSeamsContext } from "../posts/video-submission/video-playback-seams";
import { reviewPlaybackMint, reviewPosterPath } from "../posts/feed/public-feed-fixtures";
import { createDanceReviewFixtureStore } from "./dance-review.fixtures";
import { createDanceCameraFixtureApi, createDanceCameraFixtureRecorder, danceCameraContext, danceCameraSession, danceCameraResult } from "./dance-camera.fixtures";
import { DanceSongPage } from "./dance-song-page";
import type { createDanceRecorder } from "./dance-recorder";

const meta = { title: "Flows/Dance/Recording", parameters: { layout: "fullscreen", a11y: { test: "error" },
  docs: { description: { component: "Production entry and recording screens with fictional API/recorder responses and a canvas preview. This does not exercise real camera, persistence, uploads or provider acceptance." } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function fixture(mode: "camera" | "saved" | "pending" | "owner" | "denied" = "camera") {
  const api = createDanceCameraFixtureApi(), { store } = createDanceReviewFixtureStore();
  if (mode === "owner") api.owner = async () => true;
  if (mode === "pending") api.latest = async () => ({ object: "latest_moderated_dance_review", latest_submitted: danceCameraResult("awaiting"), active_session_id: danceCameraContext.session.session_id });
  let refused = false;
  const recorder: typeof createDanceRecorder = options => {
    const base = createDanceCameraFixtureRecorder(options);
    if (mode === "saved") return { ...base, prepare: async () => ({ kind: "recovery", session: danceCameraContext.session }) };
    if (mode === "denied") return { ...base, enter: async (...input) => { if (!refused) { refused = true; throw new VideoCaptureError("camera_denied", "Fictional permission refusal"); } return base.enter(...input); }, recover: base.prepare };
    return base;
  };
  return <VideoPlaybackSeamsContext value={{ posterPath: reviewPosterPath, mint: reviewPlaybackMint, attach: async () => () => {} }}>
    <DanceSongPage communityId="test-community" postId="test-song" api={api} store={store} recorder={recorder}
      session={async () => { establishSessionAuthority(); return danceCameraSession; }} />
  </VideoPlaybackSeamsContext>;
}
export const ChooseAndFrame: Story = {
  render: () => fixture(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Open dance 1" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Do this dance" })); await canvas.findByRole("button", { name: "Record" });
    await expect(canvas.getByText("Dancer")).toBeVisible();
  },
};
export const RecordAndRecover: Story = {
  render: () => fixture(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Open dance 1" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Do this dance" })); await userEvent.click(await canvas.findByRole("button", { name: "Record" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Check recording" }));
    await expect(await canvas.findByRole("link", { name: "Review recording" })).toHaveAttribute("href", "/dance/test-community/reviews/test-capture-review/recording");
  },
};
export const SavedOriginal: Story = {
  render: () => fixture("saved"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Open dance 1" })); await userEvent.click(await canvas.findByRole("button", { name: "Do this dance" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Resume upload" })); await canvas.findByText("Your recording is being prepared.");
    await expect(canvas.queryByRole("button", { name: "Record" })).toBeNull();
  },
};
export const AlreadyWaiting: Story = {
  render: () => fixture("pending"),
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Open dance 1" })); await canvas.findByRole("link", { name: "Waiting for review" }); await expect(canvas.queryByRole("button", { name: "Do this dance" })).toBeNull(); },
};
export const OwnerCannotRecord: Story = {
  render: () => fixture("owner"),
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Open dance 1" })); await canvas.findByText("You review recordings for this community."); await expect(canvas.queryByRole("button", { name: "Do this dance" })).toBeNull(); },
};
export const PermissionRefused: Story = {
  render: () => fixture("denied"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await userEvent.click(await canvas.findByRole("button", { name: "Open dance 1" })); await userEvent.click(await canvas.findByRole("button", { name: "Do this dance" }));
    await canvas.findByText(/Camera or microphone access is off/); await userEvent.click(await canvas.findByRole("button", { name: "Check recording" })); await canvas.findByRole("button", { name: "Record" });
  },
};
