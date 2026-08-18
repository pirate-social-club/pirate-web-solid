import { createSignal, untrack } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import {
  CommunityLinksEditorPage,
  createEmptyCommunityLinkEditorItem,
  linkSaveDisabled,
  type CommunityLinkEditorItem,
} from "./community-links-editor-page";

const DEFAULT_LINKS: CommunityLinkEditorItem[] = [
  { id: "link-1", label: "Spotify", platform: "spotify", url: "https://open.spotify.com/artist/example", verified: true },
  { id: "link-2", label: "Official site", platform: "official_website", url: "https://example.com", verified: false },
];

function LinksEditorStory(props: { initialLinks: CommunityLinkEditorItem[] }) {
  const [links, setLinks] = createSignal(untrack(() => props.initialLinks));
  const [saved, setSaved] = createSignal(0);
  const addLink = () => setLinks((current) => [...current, createEmptyCommunityLinkEditorItem(current.map((link) => link.id))]);

  return (
    <main class="mx-auto w-full max-w-5xl p-4 md:p-8" dir="rtl">
      <CommunityLinksEditorPage
        links={links()}
        onAddLink={addLink}
        onLinkChange={(id, patch) => setLinks((current) => current.map((link) => link.id === id ? { ...link, ...patch } : link))}
        onRemoveLink={(id) => setLinks((current) => current.filter((link) => link.id !== id))}
        onSave={() => setSaved((current) => current + 1)}
        saveDisabled={linkSaveDisabled(links())}
      />
      <Type aria-live="polite" class="sr-only" variant="caption">Saved {saved()} times</Type>
    </main>
  );
}

const meta = {
  title: "Compositions/Community/Moderation/Links",
  component: CommunityLinksEditorPage,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityLinksEditorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { links: DEFAULT_LINKS },
  globals: { direction: "rtl", viewport: { value: "mobile1", isRotated: false } },
  render: (args) => <LinksEditorStory initialLinks={args.links} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const firstLabel = canvas.getAllByLabelText("Label")[0]!;
    const firstUrl = canvas.getAllByLabelText("URL")[0]!;
    const firstPlatform = canvas.getAllByLabelText("Platform")[0]!;
    await userEvent.clear(firstLabel);
    await userEvent.type(firstLabel, "Spotify community");
    await userEvent.clear(firstUrl);
    await userEvent.type(firstUrl, "https://open.spotify.com/artist/community");
    await userEvent.selectOptions(firstPlatform, "youtube");
    await expect(firstPlatform).toHaveValue("youtube");
    await userEvent.click(canvas.getByRole("button", { name: "Add link" }));
    const url = canvas.getAllByLabelText("URL").at(-1)!;
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    const newLabel = canvas.getAllByLabelText("Label").at(-1)!;
    await userEvent.type(newLabel, "Community site");
    await userEvent.type(url, "https://example.com/new");
    await userEvent.click(canvas.getByRole("button", { name: "Delete link 3" }));
    await expect(canvas.getAllByLabelText("URL")).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByText("Saved 1 times")).toBeInTheDocument();
  },
};

export const Blank: Story = {
  args: { links: [] },
  render: (args) => <LinksEditorStory initialLinks={args.links} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole("button", { name: "Save" });
    await expect(save).not.toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Add link" }));
    await expect(save).toBeDisabled();
    await userEvent.type(canvas.getByLabelText("URL"), "https://example.com");
    await expect(save).not.toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Delete link 1" }));
  },
};
