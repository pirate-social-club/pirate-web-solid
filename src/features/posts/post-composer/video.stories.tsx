import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  OriginalVideoCaptureSurface,
  OriginalVideoReviewSurface,
} from "./video-original-audio-surface";

const meta = {
  title: "Flows/Posts/VideoPost/OriginalAudio",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Phase-one original-audio video posting. These are presentational states only: no story opens a camera, records, uploads, probes, moderates or publishes. The accepted source is a 3–180 second MP4 or MOV containing H.264 video and AAC audio. There is no title, description, trim, guide song, client-selected poster, paid access or author-selected licence.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const mobileViewport = { viewport: { value: "mobile1", isRotated: false } } as const;

export const CameraReady: Story = {
  name: "1. Capture / Camera ready",
  globals: mobileViewport,
  render: () => (
    <OriginalVideoCaptureSurface durationLabel="3:00" elapsedLabel="0:00" status="idle" />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Mobile capture after capability probing succeeds. The 9:16 viewfinder and safe-area controls reuse the reviewed Dance capture decisions.",
      },
    },
  },
};

export const Recording: Story = {
  name: "1. Capture / Recording",
  globals: mobileViewport,
  render: () => (
    <OriginalVideoCaptureSurface durationLabel="3:00" elapsedLabel="0:14" status="recording" />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "The host owns the MediaStream and recorder. Backgrounding alone does not end the take; the elapsed timeline resumes when the page returns.",
      },
    },
  },
};

export const CameraDenied: Story = {
  name: "1. Capture / Camera denied",
  globals: mobileViewport,
  render: () => <OriginalVideoCaptureSurface status="camera_denied" />,
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
  render: () => <OriginalVideoCaptureSurface status="capability_unavailable" />,
  parameters: {
    docs: {
      description: {
        story:
          "The typed pre-capture failure for a browser without usable H.264 and AAC encoding. Phase one does not offer a WebM recorder and fails before creating unusable bytes.",
      },
    },
  },
};

export const OrientationLost: Story = {
  name: "1. Capture / Orientation changed",
  globals: mobileViewport,
  render: () => <OriginalVideoCaptureSurface status="orientation_lost" />,
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
  render: () => <OriginalVideoCaptureSurface channel="upload" />,
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
  render: () => <OriginalVideoReviewSurface caption="A short take from today." />,
  parameters: {
    docs: {
      description: {
        story:
          "The only authored text is an optional caption. Source, poster and rights are read-only summaries: the server extracts the poster and checks the recorded soundtrack.",
      },
    },
  },
};

export const ReviewMobileKeyboard: Story = {
  name: "2. Review / Mobile keyboard and safe area",
  globals: mobileViewport,
  render: () => <OriginalVideoReviewSurface caption="Caption stays above the pinned publish action." />,
  parameters: {
    docs: {
      description: {
        story:
          "The scrolling body owns the caption field while ActionFooterShell pins publication above the bottom safe area on short or keyboard-reduced viewports.",
      },
    },
  },
};
