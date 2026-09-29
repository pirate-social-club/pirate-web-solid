import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  OriginalVideoCaptureSurface,
  OriginalVideoReviewSurface,
} from "./video-original-audio-surface";

const meta = {
  title: "Flows/Posts/VideoPost/Capture",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Capture and review for a video post. Every video uses a song, so the camera only shows once one is chosen and its name sits on the pill at the top. These are presentational states only: no story opens a camera, records, uploads, probes, moderates or publishes. The accepted source is a 3–180 second MP4 or MOV containing H.264 video and AAC audio.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const song = "Harbour Lights · 0:00 to 0:15";
// Spies shared by a story's render and its play. Each play clears them first,
// so a re-run of the story cannot add to an earlier run's calls.
const handlers = { onRetake: fn(), onUpload: fn() };
const mobileViewport = { viewport: { value: "mobile1", isRotated: false } } as const;

export const CameraReady: Story = {
  name: "1. Capture / Camera ready",
  globals: mobileViewport,
  render: () => (
    <OriginalVideoCaptureSurface onSongTap={() => {}} songLabel={song} status="idle" />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Mobile capture once a song is chosen. The camera fills the screen and the song sits on a pill in place of a title; tapping it opens the excerpt controls.",
      },
    },
  },
};

export const Recording: Story = {
  name: "1. Capture / Recording",
  globals: mobileViewport,
  render: () => (
    <OriginalVideoCaptureSurface songLabel={song} status="recording" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Stop recording" });
    expect(canvas.getByRole("button", { name: "Upload" })).toBeDisabled();
  },
  parameters: {
    docs: {
      description: {
        story:
          "Recording to the song. The take ends with the excerpt, and leaving the page ends it early because the camera picture freezes while the page is hidden.",
      },
    },
  },
};

export const CameraDenied: Story = {
  name: "1. Capture / Camera denied",
  globals: mobileViewport,
  render: () => (
    <OriginalVideoCaptureSurface onRetake={handlers.onRetake} onUpload={handlers.onUpload} songLabel={song} status="camera_denied" />
  ),
  play: async ({ canvasElement }) => {
    handlers.onRetake.mockClear();
    handlers.onUpload.mockClear();
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Camera unavailable" });
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    expect(handlers.onRetake).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Choose a video instead" }));
    expect(handlers.onUpload).toHaveBeenCalledOnce();
  },
  parameters: {
    docs: {
      description: {
        story:
          "Camera permission is denied. After allowing it in the browser's settings the author can try again, or upload a video instead.",
      },
    },
  },
};

export const CapabilityUnavailable: Story = {
  name: "1. Capture / Recording unavailable",
  globals: mobileViewport,
  render: () => (
    <OriginalVideoCaptureSurface onUpload={handlers.onUpload} songLabel={song} status="capability_unavailable" />
  ),
  play: async ({ canvasElement }) => {
    handlers.onUpload.mockClear();
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Recording isn’t available here" });
    // Trying again cannot change what a browser can do, and no codec is named.
    expect(canvas.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(canvasElement.textContent).not.toMatch(/H\.264|AAC|WebM/);
    await userEvent.click(canvas.getByRole("button", { name: "Upload a video" }));
    expect(handlers.onUpload).toHaveBeenCalledOnce();
  },
  parameters: {
    docs: {
      description: {
        story:
          "A browser that cannot record video at all fails before capture, says so plainly, and offers the upload.",
      },
    },
  },
};

export const RecordingFailed: Story = {
  name: "1. Capture / Recording stopped",
  globals: mobileViewport,
  render: () => (
    <OriginalVideoCaptureSurface onRetake={handlers.onRetake} onUpload={handlers.onUpload} songLabel={song} status="recording_failed" />
  ),
  play: async ({ canvasElement }) => {
    handlers.onRetake.mockClear();
    handlers.onUpload.mockClear();
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Recording stopped" });
    expect(canvasElement.textContent).toContain("nothing was saved");
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    expect(handlers.onRetake).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "Upload a video" }));
    expect(handlers.onUpload).toHaveBeenCalledOnce();
  },
  parameters: {
    docs: {
      description: {
        story:
          "A recording that started and then failed, for example when the camera or the encoder stopped. It is not a statement about the browser, so the author can try again as well as upload.",
      },
    },
  },
};

export const OrientationLost: Story = {
  name: "1. Capture / Orientation changed",
  globals: mobileViewport,
  render: () => <OriginalVideoCaptureSurface songLabel={song} status="orientation_lost" />,
  parameters: {
    docs: {
      description: {
        story:
          "The physical-device spike showed that rotation changes the encoded sample size and terminates fragmented-MP4 capture. The take ends with an explicit retake state.",
      },
    },
  },
};

export const UploadOnlyDesktop: Story = {
  name: "1. Capture / Desktop upload",
  render: () => <OriginalVideoCaptureSurface channel="upload" songLabel={song} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Upload a video" });
    expect(canvasElement.textContent).toContain("3 to 15 seconds");
    expect(canvasElement.textContent).not.toMatch(/H\.264|AAC/);
  },
  parameters: {
    docs: {
      description: {
        story:
          "Desktop offers file upload only and keeps the 9:16 frame. It has no shutter, timer or camera-flip affordance.",
      },
    },
  },
};

export const Review: Story = {
  name: "2. Review / Optional caption",
  globals: mobileViewport,
  render: () => <OriginalVideoReviewSurface caption="A short take from today." onSongTap={() => {}} songLabel={song} />,
  parameters: {
    docs: {
      description: {
        story:
          "The take, its song, one optional caption and Publish. There are no source, poster or rights summaries: the server extracts the poster and checks the soundtrack.",
      },
    },
  },
};

export const ReviewMobileKeyboard: Story = {
  name: "2. Review / Mobile keyboard and safe area",
  globals: mobileViewport,
  render: () => <OriginalVideoReviewSurface caption="Caption stays above the pinned publish action." songLabel={song} />,
  parameters: {
    docs: {
      description: {
        story:
          "The scrolling body owns the caption field while ActionFooterShell pins publication above the bottom safe area on short or keyboard-reduced viewports.",
      },
    },
  },
};
