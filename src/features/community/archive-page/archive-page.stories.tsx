import { Show, createEffect, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import {
  CommunityArchivePage,
  type CommunityArchivePageProps,
} from "./community-archive-page";

function ArchiveStory(props: CommunityArchivePageProps) {
  const [status, setStatus] = createSignal<CommunityArchivePageProps["status"]>("active");
  const [submitState, setSubmitState] = createSignal<CommunityArchivePageProps["submitState"]>({ kind: "idle" });
  const [archived, setArchived] = createSignal(0);
  const [restored, setRestored] = createSignal(0);
  const [pendingTransition, setPendingTransition] = createSignal<"archive" | "unarchive" | null>(null);

  createEffect(() => props.status, (nextStatus) => { setStatus(nextStatus); });
  createEffect(() => props.submitState, (nextSubmitState) => { setSubmitState(nextSubmitState); });

  const archive = () => {
    setSubmitState({ kind: "saving" });
    setPendingTransition("archive");
  };
  const unarchive = () => {
    setSubmitState({ kind: "saving" });
    setPendingTransition("unarchive");
  };
  const completeTransition = () => {
    const transition = pendingTransition();
    if (transition === "archive") {
      setArchived((count) => count + 1);
      setStatus("archived");
    } else if (transition === "unarchive") {
      setRestored((count) => count + 1);
      setStatus("active");
    }
    setPendingTransition(null);
    setSubmitState({ kind: "idle" });
  };

  return (
    <main class="mx-auto w-full max-w-5xl p-4 md:p-8" dir="rtl">
      <CommunityArchivePage
        {...props}
        onArchive={archive}
        onUnarchive={unarchive}
        status={status()}
        submitState={submitState()}
      />
      <Type aria-live="polite" class="sr-only" variant="caption">Archived {archived()} times; Restored {restored()} times</Type>
      <Show when={pendingTransition()}>
        {(transition) => <button aria-label={`Complete ${transition()} transition`} class="sr-only" onClick={completeTransition} type="button">Complete</button>}
      </Show>
    </main>
  );
}

const meta = {
  title: "Screens/Community/Moderation/Archive",
  component: CommunityArchivePage,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityArchivePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: { status: "active", submitState: { kind: "idle" } },
  globals: { direction: "rtl" },
  render: (args) => <ArchiveStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const archive = canvas.getByRole("button", { name: "Archive community" });
    await userEvent.click(archive);
    await expect(canvas.getByRole("button", { name: "Yes, archive" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(canvas.getByRole("button", { name: "Archive community" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Archive community" }));
    await userEvent.click(canvas.getByRole("button", { name: "Yes, archive" }));
    await expect(canvas.getByRole("button", { name: "Yes, archive" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Yes, archive" })).toHaveAttribute("aria-busy", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Complete archive transition" }));
    await expect(canvas.getByText("This community is archived")).toBeInTheDocument();
    await expect(canvas.getByText("Archived 1 times; Restored 0 times")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Unarchive community" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Unarchive community" }));
    await expect(canvas.getByRole("button", { name: "Unarchive community" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Unarchive community" })).toHaveAttribute("aria-busy", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Complete unarchive transition" }));
    await expect(canvas.getByText("Danger zone")).toBeInTheDocument();
    await expect(canvas.getByText("Archived 1 times; Restored 1 times")).toBeInTheDocument();
  },
};

export const Archived: Story = {
  args: { status: "archived", submitState: { kind: "idle" } },
  globals: { direction: "rtl" },
  render: (args) => <ArchiveStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "This community is archived" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Unarchive community" }));
    await expect(canvas.getByRole("button", { name: "Unarchive community" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Complete unarchive transition" }));
    await expect(canvas.getByRole("heading", { name: "What archiving does" })).toBeInTheDocument();
  },
};

export const Saving: Story = {
  args: { status: "active", submitState: { kind: "saving" } },
  globals: { direction: "rtl" },
  render: (args) => <ArchiveStory {...args} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Archive community" })).toBeDisabled();
  },
};

export const Error: Story = {
  args: { status: "active", submitState: { kind: "error", message: "Couldn't archive the community. Try again." } },
  globals: { direction: "rtl" },
  render: (args) => <ArchiveStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Couldn't archive the community. Try again.");
    await expect(canvas.getByRole("button", { name: "Archive community" })).toBeEnabled();
  },
};

export const Mobile: Story = {
  args: { status: "active", submitState: { kind: "idle" } },
  globals: { direction: "rtl" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: (args) => <ArchiveStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Archive community" }));
    await expect(canvas.getByRole("button", { name: "Yes, archive" })).toBeInTheDocument();
  },
};
