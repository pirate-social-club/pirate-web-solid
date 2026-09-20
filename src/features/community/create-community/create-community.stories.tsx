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
  parameters: { docs: { description: { story: "Step one: the community's avatar picker, name, description, and the join policy. With the authoring gate closed (production today) the policy is the one-line Palm fact." } } },
  render: () => <Screen />,
};

export const DetailsNationality: Story = {
  name: "Details with nationality gate",
  parameters: { docs: { description: { story: "Waits on package B (api-community-document-only-join-policy) to be reachable in the app; authoring is off in every environment today. The join-policy section offers Palm scan or Nationality, and Nationality reveals the inline multi-select with chips." } } },
  render: () => <Screen nationalityAuthoring />,
};

export const Profile: Story = {
  parameters: { docs: { description: { story: "Step two: the profile avatar picker with the generated default shown inside the region, and the name field titled for this community, prefilled with a locally generated suggestion. Persistence waits on the avatar API record." } } },
  render: () => <Screen step={2} draft={withDraftName(createEmptyDraft(personaId), "Night Shift")} />,
};
