import type { Meta, StoryObj } from "storybook-solidjs-vite";

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
  render: () => <OriginalVideoCaptureSurface songLabel={song} status="camera_denied" />,
  parameters: {
    docs: {
      description: {
        story:
          "Camera permission is denied, but upload remains available instead of dead-ending the author.",
      },
    },
  },
};

export const CapabilityUnavailable: Story = {
  name: "1. Capture / Codec unavailable",
  globals: mobileViewport,
  render: () => <OriginalVideoCaptureSurface songLabel={song} status="capability_unavailable" />,
  parameters: {
    docs: {
      description: {
        story:
          "The typed pre-capture failure for a browser without usable H.264 and AAC encoding. There is no WebM recorder, so capture fails before creating unusable bytes.",
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
