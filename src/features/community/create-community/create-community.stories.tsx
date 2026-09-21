import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import { CreateCommunityView } from "./create-community";
import {
  createEmptyDraft,
  withDraftName,
  type CreateCommunityDraft,
} from "./create-community-model";

const personaId = { kind: "create_new" } as const;

/**
 * The story set keeps the creation candidate reviewable while the route gate
 * remains closed in production. Phone width and right-to-left are toolbar
 * switches, not stories.
 */
function Screen(props: {
  draft?: CreateCommunityDraft;
  step?: 1 | 2 | 3;
  nationalityAuthoring?: boolean;
  avatarAuthoring?: boolean;
  ownerDisabled?: boolean;
  personas?: readonly ActivePersonaPublicProjection[];
}) {
  const [draft, setDraft] = createSignal<CreateCommunityDraft>(
    props.draft ?? createEmptyDraft(personaId),
  );
  return (
    <div class="h-dvh bg-background text-foreground">
      <CreateCommunityView
        initialStep={props.step}
        nationalityAuthoring={props.nationalityAuthoring}
        avatarAuthoring={props.avatarAuthoring}
        ownerDisabled={props.ownerDisabled}
        personas={props.personas}
        draft={draft()}
        onDraftChange={(patch) => setDraft(current => ({ ...current, ...patch }))}
        onSubmit={() => undefined}
      />
    </div>
  );
}

const meta = {
  title: "Flows/Community/Create",
  component: CreateCommunityView,
  args: { draft: createEmptyDraft(personaId), onSubmit: () => undefined, onDraftChange: () => undefined },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CreateCommunityView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Details: Story = {
  parameters: { docs: { description: { story: "Staging candidate: the community avatar picker, name, and join policy. Live route authoring remains disabled until provider-backed acceptance." } } },
  render: () => <Screen avatarAuthoring />,
};

export const DetailsNationality: Story = {
  name: "Details with nationality gate",
  parameters: { docs: { description: { story: "The join-policy section offers Palm scan or Nationality, and Nationality reveals the inline multi-select with chips. Live route authoring remains disabled until provider-backed acceptance." } } },
  render: () => <Screen avatarAuthoring nationalityAuthoring />,
};

export const Profile: Story = {
  parameters: { docs: { description: { story: "Step two: your name in this community and the profile image picker with the deterministic generated default." } } },
  render: () => <Screen avatarAuthoring step={2} draft={withDraftName(createEmptyDraft(personaId), "Night Shift")} />,
};

export const GeneratedDefault: Story = {
  name: "Generated default persists",
  render: () => <Screen avatarAuthoring step={2} draft={withDraftName(createEmptyDraft(personaId), "Night Shift")} />,
  play: async ({ canvasElement }) => {
    const avatar = canvasElement.querySelector<HTMLImageElement>('img[src^="data:image/svg+xml,"]');
    expect(avatar).not.toBeNull();
    if (avatar === null) throw new Error("generated avatar missing");
    expect(avatar.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/u);
  },
};

export const ExistingAvatarPreserved: Story = {
  name: "Existing profile preserves its avatar",
  render: () => <Screen
    avatarAuthoring
    ownerDisabled
    step={2}
    draft={{ ...createEmptyDraft({ kind: "existing", personaId: "persona-existing" }), profileAvatarSeed: "ignored-seed" }}
    personas={[{ personaId: "persona-existing", displayName: "Existing profile", avatarRef: "avatar-existing", primaryPublicHandle: null, communityBinding: null }]}
  />,
};

export const ExistingProfileWithoutAvatar: Story = {
  name: "Existing profile without avatar",
  render: () => <Screen
    avatarAuthoring
    step={2}
    draft={{ ...createEmptyDraft({ kind: "existing", personaId: "persona-empty" }), profileAvatarSeed: "existing-empty-seed" }}
    personas={[{ personaId: "persona-empty", displayName: "Empty profile", avatarRef: null, primaryPublicHandle: null, communityBinding: null }]}
  />,
};

export const MobileAvatar: Story = {
  name: "Mobile avatar authoring",
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <Screen avatarAuthoring step={2} draft={withDraftName(createEmptyDraft(personaId), "Night Shift")} />,
};
