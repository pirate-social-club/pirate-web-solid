import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { SignInPanel } from "./sign-in-panel";

const meta = {
  title: "Screens/Auth/SignInPanel",
  component: SignInPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof SignInPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The `/auth/sign-in` deep link wires its own session, and the catalog has no
 * verification backend, so the method form renders and its actions disable
 * once the exchange load fails — the same degradation the product shows when
 * the ceremony backend is unreachable.
 */
export const DeepLink: Story = {
  name: "Deep link",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Join Pirate" })).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Continue with email" })).toBeDisabled(),
    );
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
