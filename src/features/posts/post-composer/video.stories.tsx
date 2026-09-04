import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  OriginalVideoCaptureSurface,
  OriginalVideoPublicationSurface,
  OriginalVideoReviewSurface,
} from "./video-original-audio-surface";

const meta = {
  title: "Flows/Posts/VideoPost/OriginalAudio",
  parameters: {
    layout: "fullscreen",
    globals: { viewport: { value: "mobile1", isRotated: false } },
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

export const CameraReady: Story = {
  name: "1. Capture / Camera ready",
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
    globals: { viewport: { value: "responsive", isRotated: false } },
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

export const Uploading: Story = {
  name: "3. Publish / Uploading",
  render: () => <OriginalVideoPublicationSurface state="uploading" />,
};

export const Processing: Story = {
  name: "3. Publish / Processing",
  render: () => <OriginalVideoPublicationSurface state="processing" />,
};

export const KnownRecording: Story = {
  name: "3. Publish / Known recording",
  render: () => <OriginalVideoPublicationSurface state="known_recording" />,
  parameters: {
    docs: {
      description: {
        story:
          "A referenceable known recording cannot be relabelled as original audio. Phase one offers a retake and names the later song-reference restart without exposing guide-song controls here.",
      },
    },
  },
};

export const RightsReview: Story = {
  name: "3. Publish / Soundtrack review",
  render: () => <OriginalVideoPublicationSurface state="rights_review" />,
};

export const ModerationHold: Story = {
  name: "3. Publish / Moderation hold",
  render: () => <OriginalVideoPublicationSurface state="moderation_hold" />,
};

export const FailedRetry: Story = {
  name: "3. Publish / Failed and retryable",
  render: () => <OriginalVideoPublicationSurface state="failed" />,
};

export const PlaybackPending: Story = {
  name: "4. Published / Playback pending",
  render: () => <OriginalVideoPublicationSurface state="playback_pending" />,
  parameters: {
    docs: {
      description: {
        story:
          "The post has published but Stream playback is not ready. The state promises convergence from the retained operation, not another upload.",
      },
    },
  },
};
