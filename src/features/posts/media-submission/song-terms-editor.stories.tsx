import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import type { AssetRoyaltySplitState } from "../post-composer/types";
import { SongTermsEditor } from "./song-terms-editor";

const soloSplit: AssetRoyaltySplitState = {
  allocations: [
    { id: "a_creator", recipientKind: "creator", shareBps: 10_000, sharePct: 100 },
  ],
};

const collaboratorSplit: AssetRoyaltySplitState = {
  allocations: [
    { id: "a_creator", recipientKind: "creator", shareBps: 6_000, sharePct: 60 },
    { id: "a_lena", recipientKind: "collaborator", recipientId: "lena-wave.pirate", shareBps: 4_000, sharePct: 40 },
  ],
};

/** Deliberately short of 10 000 bps, which the editor has to surface. */
const underAllocatedSplit: AssetRoyaltySplitState = {
  allocations: [
    { id: "a_creator", recipientKind: "creator", shareBps: 6_000, sharePct: 60 },
    { id: "a_lena", recipientKind: "collaborator", recipientId: "lena-wave.pirate", shareBps: 2_500, sharePct: 25 },
  ],
};

const meta = {
  title: "Parts/Posts/SongTermsEditor",
  component: SongTermsEditor,
  args: {
    license: "non-commercial",
    commercialRevShareBps: 0,
    allocations: soloSplit,
    onLicenseChange: () => undefined,
    onCommercialRevShareBpsChange: () => undefined,
    onAllocationsChange: () => undefined,
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => (
    <div class="mx-auto max-w-lg bg-background text-foreground">
      <SongTermsEditor {...args} />
    </div>
  ),
} satisfies Meta<typeof SongTermsEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Non-commercial, solo",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Non-commercial remixing")).toBeInTheDocument();
  },
};

export const CommercialUse: Story = {
  name: "Commercial use",
  args: { license: "commercial-use", commercialRevShareBps: 1_000 },
};

export const CommercialRemix: Story = {
  name: "Commercial remix",
  args: { license: "commercial-remix", commercialRevShareBps: 2_500 },
};

export const WithCollaborator: Story = {
  name: "Split with a collaborator",
  args: { license: "commercial-remix", commercialRevShareBps: 1_500, allocations: collaboratorSplit },
};

export const UnderAllocated: Story = {
  name: "Split under 100%",
  args: { allocations: underAllocatedSplit },
};

export const Mobile: Story = {
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
