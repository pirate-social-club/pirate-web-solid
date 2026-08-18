import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import {
  StackedSectionNav,
  type StackedSectionNavSection,
} from "./stacked-section-nav";

const baseSections: StackedSectionNavSection[] = [
  {
    label: "Account",
    items: [
      { label: "Profile", active: true },
      { label: "Notifications" },
      { label: "Privacy" },
    ],
  },
  {
    label: "App",
    items: [
      { label: "Appearance" },
      { label: "Language" },
    ],
  },
];

const meta = {
  title: "Patterns/Navigation/StackedSectionNav",
  component: StackedSectionNav,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Stacked settings-style navigation with section labels and chevron rows. Items are data with optional active state, description, and onSelect callback; the pattern never routes by itself. mobileLayout flattens the card chrome for small viewports.",
      },
    },
  },
  args: {
    sections: baseSections,
  },
} satisfies Meta<typeof StackedSectionNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MobileLayout: Story = {
  args: {
    mobileLayout: true,
  },
  // Storybook 10 core viewport: mobile1 = Small mobile (320x568).
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
};

export const Interactive: Story = {
  render: () => {
    const [active, setActive] = createSignal("Profile");
    const item = (label: string) => ({
      label,
      active: active() === label,
      onSelect: () => setActive(label),
    });
    return (
      <div class="p-4">
        <StackedSectionNav
          sections={[
            {
              label: "Account",
              items: [item("Profile"), item("Notifications"), item("Privacy")],
            },
            {
              label: "App",
              items: [item("Appearance"), item("Language")],
            },
          ]}
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const privacy = canvas.getByRole("button", { name: /Privacy/ });
    await userEvent.click(privacy);
    await expect(privacy).toHaveAttribute("aria-current", "page");
    await expect(
      canvas.getByRole("button", { name: /Profile/ }),
    ).not.toHaveAttribute("aria-current");
  },
};
