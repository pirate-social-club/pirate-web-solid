import { createSignal, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import { CreateCommunityView } from "./create-community";
import {
  createEmptyDraft,
  draftGatePolicy,
  withAdvancedRequirements,
  withDraftDescription,
  withDraftName,
  withJoinPolicy,
  type AdvancedGateOption,
  type CreateCommunityDraft,
} from "./create-community-model";

const personaId = "persona_1";

const personas = [
  { personaId, displayName: "Signal", publicHandle: "signal.pirate" },
  { personaId: "persona_2", displayName: "Night Shift", publicHandle: "nightshift.pirate" },
];

/**
 * Stands in for the backend capability catalog. Production currently offers no
 * advanced gates, which is why most stories pass nothing and the Advanced
 * choice does not render at all. Each option arrives fully configured, and its
 * copy names the configured value rather than promising a control the client
 * does not have.
 */
const advancedGateOptions: AdvancedGateOption[] = [
  {
    requirement: { requirement: "age-minimum", minimumAge: 18 },
    label: "18 or older",
    description: "Members must have a verified age of at least 18.",
  },
  {
    requirement: { requirement: "reputation-score", provider: "passport", minimumScore: 8 },
    label: "Passport score 8+",
    description: "Members must have a Passport reputation score of at least 8.",
  },
  {
    requirement: { requirement: "reputation-score", provider: "passport", minimumScore: 20 },
    label: "Passport score 20+",
    description: "Members must have a Passport reputation score of at least 20.",
  },
];

function CreateStory(props: {
  advancedGateOptions?: AdvancedGateOption[];
  draft?: CreateCommunityDraft;
  submitting?: boolean;
  withPersonas?: boolean;
}) {
  const [draft, setDraft] = createSignal<CreateCommunityDraft>(
    props.draft ?? createEmptyDraft(personaId),
  );
  const [submitCount, setSubmitCount] = createSignal(0);
  const [avatarSrc, setAvatarSrc] = createSignal<string | null>(null);
  const [coverSrc, setCoverSrc] = createSignal<string | null>(null);
  let avatarObjectUrl: string | null = null;
  let coverObjectUrl: string | null = null;

  const updatePreview = (kind: "avatar" | "cover", file: File | null) => {
    const current = kind === "avatar" ? avatarObjectUrl : coverObjectUrl;
    if (current) URL.revokeObjectURL(current);
    const next = file ? URL.createObjectURL(file) : null;
    if (kind === "avatar") {
      avatarObjectUrl = next;
      setAvatarSrc(next);
    } else {
      coverObjectUrl = next;
      setCoverSrc(next);
    }
  };

  onCleanup(() => {
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  });

  return (
    <div class="min-h-[720px] bg-background p-6 text-foreground">
      <CreateCommunityView
        advancedGateOptions={props.advancedGateOptions}
        avatarSrc={avatarSrc()}
        coverSrc={coverSrc()}
        draft={draft()}
        onAdvancedRequirementsChange={(requirements) => setDraft((current) => withAdvancedRequirements(current, requirements))}
        onAvatarChange={(file) => updatePreview("avatar", file)}
        onCoverChange={(file) => updatePreview("cover", file)}
        onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onJoinPolicyChange={(choice) => setDraft((current) => withJoinPolicy(current, choice))}
        onPersonaChange={(nextPersonaId) => setDraft((current) => ({ ...current, personaId: nextPersonaId }))}
        onSubmit={() => setSubmitCount((count) => count + 1)}
        personas={props.withPersonas ? personas : undefined}
        submitting={props.submitting}
      />
      <Type aria-live="polite" class="sr-only" variant="caption">
        {`Submitted ${submitCount()} times; requirements ${draftGatePolicy(draft()).accessPaths[0].requirements.length}`}
      </Type>
    </div>
  );
}

const validDraft = () =>
  withDraftDescription(
    withDraftName(createEmptyDraft(personaId), "Signal Room"),
    "A room for live signals and quiet listening.",
  );

const meta = {
  title: "Compositions/Community/CreateCommunity",
  component: CreateCommunityView,
  args: { draft: createEmptyDraft(personaId), onSubmit: () => undefined, onDraftChange: () => undefined },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CreateCommunityView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <CreateStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(canvas.getByRole("radiogroup", { name: "Who can join?" })).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: /Everyone/ })).not.toBeChecked();
    await expect(canvas.getByRole("radio", { name: /Verified people/ })).toBeChecked();
    await expect(canvas.queryByRole("radio", { name: /Advanced requirements/ })).not.toBeInTheDocument();
  },
};

export const ValidDraft: Story = {
  render: () => <CreateStory draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
    await expect(canvas.getByText(/requirements 1/)).toBeInTheDocument();
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

    await userEvent.type(name, "Signal Room");
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
    await userEvent.clear(name);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(canvas.getByText("Name is required.")).toBeInTheDocument();
    await expect(name).toHaveAttribute("aria-invalid", "true");
  },
};

/** Spec 010 §2: Everyone is a real choice and commits an empty policy. */
export const JoinPolicyEveryone: Story = {
  render: () => <CreateStory draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: /Everyone/ }));
    await expect(canvas.getByRole("radio", { name: /Everyone/ })).toBeChecked();
    await expect(canvas.getByText(/requirements 0/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
  },
};

export const AdvancedRequirements: Story = {
  render: () => (
    <CreateStory
      advancedGateOptions={advancedGateOptions}
      draft={withJoinPolicy(validDraft(), "advanced")}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(canvas.getByText("Select at least one requirement.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: "18 or older" }));
    await expect(canvas.getByText(/requirements 1/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();

    // Two configured options of the same kind are distinct choices: selecting
    // score 8+ must not mark score 20+ selected, nor silently replace it.
    await userEvent.click(canvas.getByRole("checkbox", { name: "Passport score 8+" }));
    await expect(canvas.getByRole("checkbox", { name: "Passport score 20+" })).not.toBeChecked();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Passport score 20+" }));
    await expect(canvas.getByRole("checkbox", { name: "Passport score 8+" })).toBeChecked();
    await expect(canvas.getByText(/requirements 3/)).toBeInTheDocument();
  },
};

export const PersonaSelection: Story = {
  render: () => <CreateStory draft={validDraft()} withPersonas />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Creating as")).toBeInTheDocument();
    await expect(canvas.getByText("Signal")).toBeInTheDocument();
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
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <CreateStory draft={validDraft()} withPersonas />,
};

export const Rtl: Story = {
  globals: { locale: "ar" },
  render: () => <CreateStory draft={validDraft()} withPersonas />,
};
