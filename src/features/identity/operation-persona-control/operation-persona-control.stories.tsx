import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { OperationPersonaControl, type OperationPersona } from "./operation-persona-control";

const personas: OperationPersona[] = [
  { personaId: "p_night", displayName: "Night Shift", publicHandle: "nightshift.pirate" },
  { personaId: "p_aster", displayName: "Aster", publicHandle: "aster.charizard" },
  { personaId: "p_mirror", displayName: "Mirror Room", publicHandle: "mirror.squirtle" },
];

const meta = {
  title: "Parts/Identity/OperationPersonaControl",
  component: OperationPersonaControl,
  args: {
    label: "Posting as",
    personas,
    selectedPersonaId: "p_night",
    onSelect: () => undefined,
  },
  parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof OperationPersonaControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Multiple personas",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Night Shift")).toBeInTheDocument();
  },
};

/**
 * The component's own contract: with fewer than two personas there is no
 * choice to present, so the trigger must not offer one.
 */
export const SinglePersona: Story = {
  name: "Only one persona",
  args: { personas: [personas[0]!], selectedPersonaId: "p_night" },
};

export const Disabled: Story = {
  name: "Disabled",
  args: { disabled: true },
};

/** A selected id that is not in the list falls back to the first persona. */
export const UnknownSelection: Story = {
  name: "Unknown selected id",
  args: { selectedPersonaId: "p_missing" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Night Shift")).toBeInTheDocument();
  },
};

export const Open: Story = {
  name: "Picker open",
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("open the picker", async () => {
      await userEvent.click(canvas.getAllByRole("button")[0]!);
    });
  },
};

export const Mobile: Story = {
  name: "Mobile",
  args: { forceMobile: true },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
