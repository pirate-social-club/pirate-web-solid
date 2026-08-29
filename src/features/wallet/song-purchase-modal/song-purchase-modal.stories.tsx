import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Button } from "../../../design-system";
import { SongPurchaseModal } from "./song-purchase-modal";
import type { SongPurchaseModalProps } from "./song-purchase-modal.types";

const baseArgs: SongPurchaseModalProps = {
  onConfirm: () => undefined,
  onOpenChange: () => undefined,
  onSelfVerificationClick: () => undefined,
  open: true,
  priceLabel: "$3.99",
  selfVerificationSavingsPercent: 20,
  songTitle: "Midnight Waves",
};

const meta = {
  title: "Parts/Wallet/SongPurchaseModal",
  component: SongPurchaseModal,
  args: baseArgs,
  parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof SongPurchaseModal>;

export default meta;
type Story = StoryObj<typeof meta>;

function ModalStory(props: Partial<SongPurchaseModalProps>) {
  const [open, setOpen] = createSignal(true);
  return <><ShowReopen open={open()} onReopen={() => setOpen(true)} /><SongPurchaseModal {...baseArgs} {...props} onOpenChange={setOpen} open={open()} /></>;
}

function ShowReopen(props: { onReopen: () => void; open: boolean }) {
  return props.open ? null : <Button onClick={props.onReopen}>Reopen purchase</Button>;
}

export const Desktop: Story = {
  name: "Desktop / Confirm purchase",
  args: { onConfirm: fn() },
  render: (args) => <ModalStory {...args} state="desktop" />,
  play: async ({ args }) => {
    const confirm = within(document.body).getByRole("button", { name: "Buy for $3.99" });
    await expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await expect(args.onConfirm).toHaveBeenCalled();
  },
};
export const Mobile: Story = { name: "Mobile / Confirm purchase", parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <ModalStory state="mobile" /> };
export const Processing: Story = { name: "Desktop / Processing", render: () => <ModalStory state="processing" /> };
export const Verified: Story = { name: "Desktop / Verified price", render: () => <ModalStory priceLabel="$3.19" state="verified" /> };
export const VinylAvailable: Story = { name: "Desktop / Vinyl available", render: () => <ModalStory state="vinyl-available" /> };
export const Error: Story = { name: "Desktop / Error", render: () => <ModalStory state="error" /> };
