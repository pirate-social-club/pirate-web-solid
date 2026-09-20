import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import { Type } from "@pirate/web-solid-ui";
import { CreateCommunityView } from "./create-community";
import {
  createEmptyDraft,
  withDraftDescription,
  withDraftName,
  type CreateCommunityDraft,
} from "./create-community-model";

const personaId = { kind: "create_new" } as const;

function CreateStory(props: {
  draft?: CreateCommunityDraft;
  nameError?: string | null;
  submitting?: boolean;
  steps?: boolean;
  nationalityAuthoring?: boolean;
  personas?: readonly ActivePersonaPublicProjection[];
}) {
  const [draft, setDraft] = createSignal<CreateCommunityDraft>(
    props.draft ?? createEmptyDraft(personaId),
  );
  const [submitCount, setSubmitCount] = createSignal(0);

  return (
    <div class="h-dvh bg-background text-foreground">
      <CreateCommunityView
        showMediaFields={false}
        steps={props.steps}
        nationalityAuthoring={props.nationalityAuthoring}
        draft={draft()}
        personas={props.personas}
        nameError={props.nameError}
        onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onSubmit={() => setSubmitCount((count) => count + 1)}
        submitting={props.submitting}
      />
      <Type aria-live="polite" class="sr-only" variant="caption">
        {`Submitted ${submitCount()} times`}
      </Type>
    </div>
  );
}

const validDraft = () =>
  withDraftDescription(
    withDraftName({ ...createEmptyDraft(personaId), publicName: "River Room" }, "Night Shift"),
    "A late-night space for music, ideas, and people building after dark.",
  );

const meta = {
  title: "Flows/Community/Create",
  component: CreateCommunityView,
  args: { draft: createEmptyDraft(personaId), onSubmit: () => undefined, onDraftChange: () => undefined },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CreateCommunityView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <CreateStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(canvas.getByText("Who can join?")).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: /Anyone with Palm verification/ })).toBeChecked();
    await expect(canvas.queryByRole("radio", { name: /People with selected nationalities/ })).toBeNull();
  },
};

export const ThreePages: Story = {
  name: "Three pages",
  render: () => <CreateStory steps nationalityAuthoring />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeDisabled();

    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Night Shift");
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    // The join policy page offers both options and no community fields.
    await expect(await canvas.findByText("Who can join?")).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: /Anyone with Palm verification/ })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: /People with selected nationalities/ })).toBeInTheDocument();
    await expect(canvas.queryByRole("textbox", { name: "Name" })).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByText(/This profile belongs to this community only/)).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Public name" })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(await canvas.findByText("Who can join?")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(await canvas.findByRole("textbox", { name: "Name" })).toHaveValue("Night Shift");
  },
};

export const ValidDraft: Story = {
  render: () => <CreateStory draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
    await expect(canvas.getByText("Anyone with Palm verification")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Create" }));
    await expect(canvas.getByText("Submitted 1 times")).toBeInTheDocument();
  },
};

export const NationalityPolicy: Story = {
  name: "Nationality policy",
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("radio", { name: /People with selected nationalities/ }));

    // The empty picker and the any-of helper appear; no stacked Palm row.
    await expect(canvas.getByText("Members must prove one of the selected nationalities.")).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Allowed nationalities" })).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: /Anyone with Palm verification/ })).not.toBeChecked();
    await expect(canvas.queryByText(/Required · Members verify/)).toBeNull();
  },
};

export const NationalityPolicyWithChips: Story = {
  name: "Nationality policy with chips",
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("radio", { name: /People with selected nationalities/ }));

    const picker = canvas.getByRole("combobox", { name: "Allowed nationalities" });
    await userEvent.type(picker, "United States");
    await userEvent.click(await within(document.body).findByRole("option", { name: "United States" }));
    await expect(canvas.getByRole("button", { name: "Remove United States" })).toBeInTheDocument();

    await userEvent.type(picker, "Canada");
    await userEvent.click(await within(document.body).findByRole("option", { name: "Canada" }));
    await expect(canvas.getByRole("button", { name: "Remove Canada" })).toBeInTheDocument();
  },
};

export const JoinPolicyValidation: Story = {
  name: "Join policy validation",
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("radio", { name: /People with selected nationalities/ }));
    await expect(canvas.queryByText("Choose at least one country.")).not.toBeInTheDocument();

    // An empty picker blocks Continue with the note, and the profile page stays closed.
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText("Choose at least one country.")).toBeInTheDocument();
    await expect(canvas.getByText("Who can join?")).toBeInTheDocument();
    await expect(canvas.queryByRole("textbox", { name: "Public name" })).toBeNull();
  },
};

export const NationalityHidden: Story = {
  name: "Nationality option behind the authoring gate",
  render: () => <CreateStory steps draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText("Who can join?")).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: /Anyone with Palm verification/ })).toBeChecked();
    await expect(canvas.queryByRole("radio", { name: /People with selected nationalities/ })).toBeNull();
  },
};

export const NameValidation: Story = {
  render: () => <CreateStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Name" });

    // Untouched and empty is neutral, not "valid" and not yet an error.
    await expect(name).not.toHaveAttribute("aria-invalid");
    await expect(canvas.queryByText("Name is required.")).not.toBeInTheDocument();

    // Focusing and leaving an empty field is enough to surface the error.
    await userEvent.click(name);
    await userEvent.tab();
    await expect(canvas.getByText("Name is required.")).toBeInTheDocument();

    await userEvent.type(canvas.getByRole("textbox", { name: "Public name" }), "River Room");
    await userEvent.type(name, "Signal Room");
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
    await userEvent.clear(name);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(canvas.getByText("Name is required.")).toBeInTheDocument();
    await expect(name).toHaveAttribute("aria-invalid", "true");
  },
};

export const EnterSubmits: Story = {
  render: () => <CreateStory draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "{Enter}");
    await expect(canvas.getByText(/Submitted 1 times/)).toBeInTheDocument();
  },
};

export const LongContent: Story = {
  render: () => (
    <CreateStory
      draft={withDraftDescription(
        withDraftName(createEmptyDraft(personaId), "A deliberately long community name that should wrap gracefully across the field"),
        "A much longer description that keeps going to exercise wrapping and truncation in the field as a community is being composed.",
      )}
    />
  ),
};

export const Submitting: Story = {
  render: () => <CreateStory draft={validDraft()} submitting />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Create" });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("radio", { name: /People with selected nationalities/ }));
  },
};

export const Rtl: Story = {
  globals: { locale: "ar" },
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "متابعة" }));
    await userEvent.click(await canvas.findByRole("radio", { name: /الأشخاص من الجنسيات المحددة/ }));
    await expect(canvas.getByText("يجب أن يثبت الأعضاء انتماءهم إلى إحدى الجنسيات المحددة.")).toBeInTheDocument();
  },
};

export const RejectedCommit: Story = {
  name: "Rejected commit stays retryable",
  render: () => (
    <CreateStory draft={validDraft()} nameError="That name is already taken." />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("That name is already taken.")).toBeInTheDocument();

    const submit = canvas.getByRole("button", { name: "Create" });
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
  },
};

export const ExistingProfile: Story = {
  render: () => <CreateStory draft={validDraft()} personas={[{ personaId: "unused-profile", displayName: "Harbor keeper", avatarRef: null, primaryPublicHandle: null, communityBinding: null }]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox", { name: "Public name" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Use an existing profile" }));
    await expect(canvas.getByText("Creating as Harbor keeper")).toBeInTheDocument();
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
    await expect(canvas.getByText("This profile becomes permanently linked to this community.")).toBeInTheDocument();
    await expect(canvas.queryByText(/coming soon/)).not.toBeInTheDocument();
  },
};
