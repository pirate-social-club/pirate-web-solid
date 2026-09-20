import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import { CreateCommunityView } from "./create-community";
import {
  createEmptyDraft,
  withDraftName,
  type CreateCommunityDraft,
} from "./create-community-model";

const personaId = { kind: "create_new" } as const;

/**
 * The story set is the four screens a person can see; behaviour lives in the
 * route and unit tests. Phone width and right-to-left are toolbar switches,
 * not stories.
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
  parameters: { docs: { description: { story: "Step one: the community's avatar picker, name, and the join policy. With the authoring gate closed (production today) the policy is the one-line Palm fact; the avatar picker waits on the avatar API record and is off in the app." } } },
  render: () => <Screen avatarAuthoring />,
};

export const DetailsNationality: Story = {
  name: "Details with nationality gate",
  parameters: { docs: { description: { story: "Waits on package B (api-community-document-only-join-policy) for the gate and the avatar API record for the picker; both are off in the app today. The join-policy section offers Palm scan or Nationality, and Nationality reveals the inline multi-select with chips." } } },
  render: () => <Screen avatarAuthoring nationalityAuthoring />,
};

export const Profile: Story = {
  parameters: { docs: { description: { story: "Step two: your name in this community (prefilled with a locally generated suggestion) and the profile image picker with the generated default in the region. The picker waits on the avatar API record and is off in the app." } } },
  render: () => <Screen avatarAuthoring step={2} draft={withDraftName(createEmptyDraft(personaId), "Night Shift")} />,
};
