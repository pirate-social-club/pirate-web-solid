import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { PostComposer } from "./post-composer";
import { baseComposer } from "./story-fixtures";
import { ComposerFrame, InteractiveComposer } from "./story-helpers";
import type { AuthorAgeGatePolicy, ComposerAudienceState } from "./types";

const meta = {
  title: "Parts/Posts/PostComposer",
  component: PostComposer,
  args: baseComposer,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The post composer port. Host-owned identity, upload, and submit callbacks are represented with deterministic Storybook fixtures.",
      },
    },
  },
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

function PublishControlsStory(props: {
  ageGateConfirmationRequired?: boolean;
  initialAgeGatePolicy?: AuthorAgeGatePolicy;
  initialAudience?: ComposerAudienceState;
}) {
  const [ageGatePolicy, setAgeGatePolicy] = createSignal<AuthorAgeGatePolicy>(
    props.initialAgeGatePolicy ?? "none",
  );
  const [audience, setAudience] = createSignal<ComposerAudienceState | undefined>(props.initialAudience);

  return (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        ageGateConfirmationRequired={props.ageGateConfirmationRequired}
        ageGatePolicy={ageGatePolicy()}
        audience={audience()}
        onAgeGatePolicyChange={setAgeGatePolicy}
        onAudienceChange={setAudience}
      />
    </ComposerFrame>
  );
}

export const Overview: Story = {
  name: "Overview",
  render: () => (
    <ComposerFrame>
      <PostComposer {...baseComposer} />
    </ComposerFrame>
  ),
};

export const Mobile: Story = {
  ...Overview,
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
export const DragAndDrop: Story = {
  name: "Drag and drop",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        titleValue="Try dragging a file here"
        textBodyValue="Drop an image, video, audio file, or downloadable document onto the composer."
      />
    </ComposerFrame>
  ),
};

export const MobileSimpleFlow: Story = {
  name: "Mobile / Write to publish",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <ComposerFrame>
      <InteractiveComposer {...baseComposer} />
    </ComposerFrame>
  ),
};

export const PublicAudience: Story = {
  name: "Audience / Public",
  render: () => (
    <PublishControlsStory initialAudience={{ visibility: "public", publicOptionEnabled: true }} />
  ),
};

export const MembersOnly: Story = {
  name: "Audience / Members only",
  render: () => (
    <PublishControlsStory
      initialAudience={{
        visibility: "members_only",
        publicOptionEnabled: false,
        publicOptionDisabledReason: "This community limits posts to members.",
      }}
    />
  ),
};

export const AgeGatedPublish: Story = {
  name: "Age gate / Publish review",
  render: () => (
    <PublishControlsStory
      initialAgeGatePolicy="18_plus"
      initialAudience={{ visibility: "public", publicOptionEnabled: true }}
    />
  ),
};

export const AgeGateConfirmation: Story = {
  name: "Age gate / Confirmation required",
  render: () => (
    <PublishControlsStory ageGateConfirmationRequired />
  ),
};

export const ImageUpload: Story = {
  name: "Image / Upload",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        mode="image"
        imageUploadLabel="backstage-at-the-show.jpg"
        titleValue="Backstage at the show"
        captionValue="Caught this backstage right before the set."
      />
    </ComposerFrame>
  ),
};

export const LinkPaste: Story = {
  name: "Link / Paste URL",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        mode="link"
        titleValue="A sharp look at tour design"
        linkUrlValue="https://032c.com/magazine/kanye-west-tour-design"
        textBodyValue="Worth posting for the production notes alone."
        linkPreview={{
          domain: "032c.com",
          title: "A sharp look at tour design",
          description: "Production notes from a long-running tour.",
          state: "preview",
        }}
      />
    </ComposerFrame>
  ),
};

export const LiveStream: Story = {
  name: "Live / Go live now",
  render: () => (
    <ComposerFrame>
      <InteractiveComposer
        {...baseComposer}
        mode="live"
        availableTabs={["text", "image", "video", "link", "song", "live"]}
        titleValue="Friday night set"
        textBodyValue="A live run through the new material with a short Q&A."
        live={{
          roomKind: "solo",
          accessMode: "free",
          visibility: "public",
          scheduleForLater: false,
          setlistItems: [],
          setlistStatus: "draft",
          performerAllocations: [{ userId: "", role: "host", sharePct: 100 }],
        }}
      />
    </ComposerFrame>
  ),
};

export const LiveScheduledEvent: Story = {
  name: "Live / Scheduled event",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        mode="live"
        titleValue="Friday night set"
        live={{
          roomKind: "solo",
          accessMode: "free",
          visibility: "public",
          scheduleForLater: true,
          scheduleAt: "2026-08-22T20:00",
          setlistItems: [],
          setlistStatus: "draft",
          performerAllocations: [{ userId: "", role: "host", sharePct: 100 }],
        }}
      />
    </ComposerFrame>
  ),
};

export const LiveDuet: Story = {
  name: "Live / Duet",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        mode="live"
        titleValue="Late set with a guest"
        live={{
          roomKind: "duet",
          accessMode: "free",
          visibility: "public",
          guestUserId: "usr_guest",
          setlistItems: [],
          setlistStatus: "draft",
          performerAllocations: [
            { userId: "", role: "host", sharePct: 70 },
            { userId: "usr_guest", role: "guest", sharePct: 30 },
          ],
        }}
      />
    </ComposerFrame>
  ),
};

export const LivePaidDuetRoyaltySplit: Story = {
  name: "Live / Paid duet and royalty split",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        mode="live"
        titleValue="Ticketed duet session"
        live={{
          roomKind: "duet",
          accessMode: "paid",
          visibility: "public",
          guestUserId: "usr_guest",
          setlistItems: [],
          setlistStatus: "draft",
          performerAllocations: [
            { userId: "", role: "host", sharePct: 60 },
            { userId: "usr_guest", role: "guest", sharePct: 40 },
          ],
        }}
        monetization={{ visible: true, priceUsd: "12.00" }}
        royaltySplit={{
          allocations: [
            { id: "creator", recipientKind: "creator", sharePct: 60 },
            { id: "guest", recipientKind: "collaborator", sharePct: 40 },
          ],
        }}
      />
    </ComposerFrame>
  ),
};

export const LivePaidPublishPreview: Story = {
  name: "Live / Paid publish preview",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        mode="live"
        titleValue="Friday night ticketed set"
        live={{
          roomKind: "solo",
          accessMode: "paid",
          visibility: "public",
          setlistItems: [],
          setlistStatus: "ready",
          performerAllocations: [{ userId: "", role: "host", sharePct: 100 }],
        }}
        monetization={{ visible: true, priceUsd: "8.00" }}
        submit={{ canPost: true, label: "Go live", onSubmit: () => undefined }}
      />
    </ComposerFrame>
  ),
};

export const FileDownload: Story = {
  name: "File / Downloadable asset",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        mode="file"
        availableTabs={["file"]}
        titleValue="Research export"
        textBodyValue="A deterministic downloadable file."
        file={{ upload: null, label: "research-export.csv" }}
      />
    </ComposerFrame>
  ),
};
