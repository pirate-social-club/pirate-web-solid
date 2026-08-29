import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { PostComposer } from "./post-composer";
import { baseComposer } from "./story-fixtures";
import { ComposerFrame } from "./story-helpers";

const meta = {
  title: "Flows/Posts/TextPost",
  component: PostComposer,
  args: baseComposer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Compose: Story = {
  name: "Default",
  render: () => <ComposerFrame><PostComposer {...baseComposer} /></ComposerFrame>,
};

export const Mobile: Story = {
  ...Compose,
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
export const PublicHandleOnly: Story = {
  name: "Public handle only",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        identity={{
          allowAnonymousIdentity: false,
          identityMode: "public",
          publicHandle: "saint-pablo.pirate",
          availableQualifiers: [],
        }}
      />
    </ComposerFrame>
  ),
};

export const AnonymousWithQualifiers: Story = {
  name: "Anonymous with qualifiers",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        identity={{
          allowAnonymousIdentity: true,
          allowQualifiersOnAnonymousPosts: true,
          identityMode: "anonymous",
          publicHandle: "saint-pablo.pirate",
          anonymousLabel: "anon_amber-anchor-00",
          availableQualifiers: baseComposer.identity?.availableQualifiers,
          selectedQualifierIds: ["qlf_unique_human"],
          helpText: "Select qualifiers that add authority to this post.",
        }}
      />
    </ComposerFrame>
  ),
};

export const QualifiersDropdown: Story = {
  name: "Qualifiers dropdown",
  render: () => <ComposerFrame><PostComposer {...baseComposer} identity={{ ...baseComposer.identity, identityMode: "anonymous", selectedQualifierIds: ["qlf_unique_human", "qlf_age_over_18"] }} /></ComposerFrame>,
};

export const AnonymousWithoutDisclosure: Story = {
  name: "Anonymous without qualifier disclosure",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        identity={{
          allowAnonymousIdentity: true,
          allowQualifiersOnAnonymousPosts: false,
          identityMode: "anonymous",
          publicHandle: "saint-pablo.pirate",
          anonymousLabel: "anon_lunar-echo-42",
          availableQualifiers: baseComposer.identity?.availableQualifiers,
          selectedQualifierIds: [],
        }}
      />
    </ComposerFrame>
  ),
};

export const RTL: Story = {
  name: "Direction / RTL",
  globals: { direction: "rtl" },
  render: () => <ComposerFrame><PostComposer {...baseComposer} /></ComposerFrame>,
};
