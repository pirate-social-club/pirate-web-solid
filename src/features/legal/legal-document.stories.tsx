import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { privacyPolicy, termsOfService } from "./legal-content";
import { LegalDocument } from "./legal-document";

const meta = {
  title: "Screens/Legal/LegalDocument",
  component: LegalDocument,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof LegalDocument>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `/terms` as the router renders it. */
export const Terms: Story = {
  args: { document: termsOfService },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Terms of Service", level: 1 })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  },
};

/** `/privacy` as the router renders it. */
export const PrivacyPolicy: Story = {
  args: { document: privacyPolicy },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Microphone recordings" })).toBeInTheDocument();
  },
};

export const PrivacyPolicyMobile: Story = {
  ...PrivacyPolicy,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
