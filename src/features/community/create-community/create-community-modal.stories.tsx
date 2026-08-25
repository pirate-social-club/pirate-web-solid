import { createSignal, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import { CreateCommunityModal } from "./create-community";
import {
  createEmptyDraft,
  withDraftDescription,
  withDraftGates,
  withDraftName,
  type CreateCommunityDraft,
} from "./create-community-model";

const personaId = "persona_1";

function ModalStory(props: { draft?: CreateCommunityDraft; forceMobile?: boolean }) {
  const [open, setOpen] = createSignal(true);
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
      <CreateCommunityModal
        avatarSrc={avatarSrc()}
        coverSrc={coverSrc()}
        draft={draft()}
        forceMobile={props.forceMobile}
        onAvatarChange={(file) => updatePreview("avatar", file)}
        onCoverChange={(file) => updatePreview("cover", file)}
        onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onGatesChange={(kinds) => setDraft((current) => withDraftGates(current, kinds))}
        onOpenChange={setOpen}
        onSubmit={() => setSubmitCount((count) => count + 1)}
        open={open()}
      />
      <Type aria-live="polite" class="sr-only" variant="caption">Submitted {submitCount()} times; open {String(open())}</Type>
    </div>
  );
}

const validDraft = () =>
  withDraftDescription(
    withDraftName(createEmptyDraft(personaId), "Night Shift"),
    "A late-night space for music, ideas, and people building after dark.",
  );

const meta = {
  title: "Compositions/Community/CreateCommunityModal",
  component: CreateCommunityModal,
  args: { draft: createEmptyDraft(personaId), open: true, onSubmit: () => undefined, onDraftChange: () => undefined, onGatesChange: () => undefined, onOpenChange: () => undefined },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CreateCommunityModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  render: () => <ModalStory draft={validDraft()} forceMobile={false} />,
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole("dialog");
    await expect(within(dialog).getByRole("heading", { name: "Create community" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Create" })).toBeEnabled();
  },
};

export const DesktopGatePicker: Story = {
  render: () => <ModalStory draft={validDraft()} forceMobile={false} />,
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add gate" }));
    await expect(within(dialog).queryByRole("checkbox", { name: "Palm scan" })).not.toBeInTheDocument();
    await expect(within(dialog).getByRole("checkbox", { name: "Age minimum (18+)" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("checkbox", { name: "Reputation score" })).toBeInTheDocument();
    const scrollRegion = dialog.querySelector<HTMLElement>("[data-create-community-scroll]");
    await expect(scrollRegion).not.toBeNull();
    await expect(scrollRegion!.scrollHeight).toBeGreaterThan(scrollRegion!.clientHeight);
  },
};

export const CloseAction: Story = {
  render: () => <ModalStory draft={validDraft()} forceMobile={false} />,
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const dialog = await body.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await expect(within(canvasElement).getByText(/open false/)).toBeInTheDocument();
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <ModalStory draft={validDraft()} forceMobile />,
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole("dialog");
    await expect(within(dialog).getByRole("button", { name: "Create" })).toBeEnabled();
    await expect(within(dialog).getByText("Palm scan")).toBeInTheDocument();
    await expect(within(dialog).getByLabelText("Add cover")).toBeInTheDocument();
    await expect(within(dialog).getByLabelText("Choose image")).toBeInTheDocument();
    await expect(within(dialog).queryByText("Creating as")).not.toBeInTheDocument();
  },
};
