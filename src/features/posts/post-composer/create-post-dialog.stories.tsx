/** @jsxImportSource @solidjs/web */
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import { createMemoryMediaSubmissionStorage } from "../media-submission/pending";
import { CreatePostDialog } from "./create-post-dialog";
import { createMemoryPendingSubmissionStorage } from "./pending-submission";

// The composer surface a community actually ships. The PostComposer stories
// under Parts exercise the component with capabilities no product surface
// grants; this is the one to review, because it is the one a member opens.

const persona = (personaId: string, displayName: string): ActivePersonaPublicProjection => ({
  personaId,
  displayName,
  avatarRef: null,
  primaryPublicHandle: `${displayName.toLowerCase().replaceAll(" ", "-")}.pirate`,
  communityBinding: { communityId: "community-harbor", bindingSource: "first_membership" },
});

const harbor = { id: "community-harbor", name: "Pirate Harbor" };

function StoryCreatePostDialog(props: {
  personas?: readonly ActivePersonaPublicProjection[];
  withCommunityContext?: boolean;
}) {
  const [open, setOpen] = createSignal(true);
  return (
    <CreatePostDialog
      communityContext={props.withCommunityContext === false ? undefined : harbor}
      mediaStorage={createMemoryMediaSubmissionStorage()}
      onOpenChange={setOpen}
      open={open()}
      personas={props.personas ?? [persona("persona-one", "Harbour Voice")]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />
  );
}

const meta = {
  title: "Flows/Posts/CreatePostDialog",
  component: CreatePostDialog,
  args: { open: true, onOpenChange: () => undefined },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The composer as a community page opens it: text, song and video only, "
          + "one framed presentation, and the host-owned community context and author "
          + "persona above it.",
      },
    },
  },
} satisfies Meta<typeof CreatePostDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextInACommunity: Story = {
  name: "Text in a community",
  render: () => <StoryCreatePostDialog />,
};

export const ChoosingAnAuthorPersona: Story = {
  name: "Choosing an author persona",
  render: () => (
    <StoryCreatePostDialog
      personas={[persona("persona-one", "Harbour Voice"), persona("persona-two", "Deck Hand")]}
    />
  ),
};

export const WithoutAnActivePersona: Story = {
  name: "Without an active persona",
  render: () => <StoryCreatePostDialog personas={[]} />,
};

export const WithoutCommunityContext: Story = {
  name: "Opened outside a community",
  render: () => <StoryCreatePostDialog withCommunityContext={false} />,
};
