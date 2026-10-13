import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { SpacesClaimStateCard, type SpacesClaimDisplay } from "./spaces-claim-state.tsx";

const issued: SpacesClaimDisplay = {
  state: "issued", delayed: false, display_identifier: "member@yahoo", grant: null,
};

const meta = {
  title: "Screens/Community/SpacesIssuedGrantState",
  component: SpacesClaimStateCard,
  parameters: { layout: "centered", a11y: { test: "error" } },
  decorators: [(Story) => <main class="w-[min(100vw-2rem,32rem)] rounded-xl border bg-background p-5 text-foreground"><Story /></main>],
  args: { claim: issued },
} satisfies Meta<typeof SpacesClaimStateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Revoked: Story = {
  args: { claim: { ...issued, grant: { status: "revoked" } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Name revoked here" })).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveAttribute("data-spaces-claim-state", "issued");
    await expect(canvas.getByText("This name is no longer active here.")).toBeVisible();
    await expect(canvas.queryByText("Registration pending")).not.toBeInTheDocument();
  },
};

export const Removed: Story = {
  args: { claim: { ...issued, delayed: true, grant: { status: "tombstoned" } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Name removed here" })).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveAttribute("data-spaces-claim-state", "issued");
    await expect(canvas.getByText("This name is no longer active here.")).toBeVisible();
    await expect(canvas.queryByText("Registration pending")).not.toBeInTheDocument();
  },
};

export const Unavailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Name status unavailable" })).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveAttribute("data-spaces-claim-state", "issued");
    await expect(canvas.getByText("Refresh status to check again.")).toBeVisible();
    await expect(canvas.queryByText("Registration pending")).not.toBeInTheDocument();
  },
};
