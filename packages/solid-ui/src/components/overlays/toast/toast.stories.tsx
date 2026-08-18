import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button } from "@/components/actions/button/button";
import { StoryRow } from "@/stories/lib/story-layout";
import { toast, Toaster } from "./toast";

const meta = {
  title: "Components/Overlays/Toast",
  component: Toaster,
  tags: ["autodocs"],
  args: {},
  parameters: {
    docs: {
      description: {
        component:
          "Mounted toast region plus the imperative toast service. Mount one Toaster at the app root and call toast.show or the typed helpers from anywhere. Ordinary feedback announces politely; only error toasts default to assertive announcement. Never use toasts as the only channel for an important error. Stories mount an isolated region and clear it afterwards.",
      },
    },
  },
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <>
      <Button onClick={() => toast.show({ title: "Copied to clipboard", type: "info" })}>
        Show toast
      </Button>
      <Toaster />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    toast.clear();
    await userEvent.click(canvas.getByRole("button", { name: "Show toast" }));

    const title = await body.findByText("Copied to clipboard");
    await expect(title).toBeVisible();
    await expect(body.getByRole("status")).toContainElement(title);

    await userEvent.click(body.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(body.queryByText("Copied to clipboard")).not.toBeInTheDocument(),
    );
    toast.clear();
  },
};

export const Variants: Story = {
  render: () => (
    <>
      <StoryRow>
        <Button onClick={() => toast.success("Song added to your list")}>
          Success
        </Button>
        <Button variant="secondary" onClick={() => toast.error("Payment failed")}>
          Error
        </Button>
        <Button variant="outline" onClick={() => toast.warning("Low balance")}>
          Warning
        </Button>
        <Button variant="ghost" onClick={() => toast.info("Update available")}>
          Info
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            toast.show({
              title: "New follower",
              description: "Someone started following you.",
              type: "default",
            })
          }
        >
          With description
        </Button>
      </StoryRow>
      <Toaster />
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    toast.clear();
    for (const name of ["Success", "Error", "Warning", "Info", "With description"]) {
      await userEvent.click(canvas.getByRole("button", { name }));
    }

    await expect(await body.findByText("Song added to your list")).toBeVisible();
    await expect(body.getByText("Payment failed")).toBeVisible();
    await expect(body.getByText("Low balance")).toBeVisible();
    await expect(body.getByText("Update available")).toBeVisible();
    await expect(body.getByText("New follower")).toBeVisible();
    await expect(body.getByText("Someone started following you.")).toBeVisible();
    toast.clear();
  },
};

export const RightToLeft: Story = {
  render: () => (
    <div dir="rtl">
      <Button onClick={() => toast.info("مرحبا")}>Show toast</Button>
      <Toaster />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    toast.clear();
    await userEvent.click(canvas.getByRole("button", { name: "Show toast" }));

    const title = await body.findByText("مرحبا");
    await expect(title).toBeVisible();
    toast.clear();
  },
};
