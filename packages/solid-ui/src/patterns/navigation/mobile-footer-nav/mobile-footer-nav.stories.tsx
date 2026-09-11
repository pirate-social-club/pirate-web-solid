import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, within } from "storybook/test";

import { MobileFooterNav } from "./mobile-footer-nav";

const meta = {
  title: "Patterns/Navigation/MobileFooterNav",
  component: MobileFooterNav,
  tags: ["autodocs"],
  args: {
    activeItem: "home",
    // The viewport global is applied after the play function runs, so without
    // this the nav is still md:hidden at play time and has no queryable roles.
    forceMobile: true,
    onHomeClick: fn(),
    onCommunitiesClick: fn(),
    onProfileClick: fn(),
  },
  argTypes: { class: { table: { disable: true } }, icons: { table: { disable: true } }, labels: { table: { disable: true } } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: {
    docs: { description: { component: "Callback-driven bottom navigation with the three real product destinations: Home, Communities and Profile. The component owns presentation and mobile CSS; the host owns routing, active-item resolution, labels, and haptic feedback. Injected icons receive an optional `filled` prop for active-state rendering; custom icons may ignore it." } },
  },
} satisfies Meta<typeof MobileFooterNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button")).toHaveLength(3);
    await canvas.getByRole("button", { name: "Profile" }).click();
    await expect(args.onProfileClick).toHaveBeenCalledTimes(1);
  },
};

export const CommunitiesActive: Story = {
  args: { activeItem: "communities" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Communities" })).toHaveAttribute("aria-current", "page");
    await canvas.getByRole("button", { name: "Home" }).click();
    await expect(args.onHomeClick).toHaveBeenCalledTimes(1);
  },
};

export const RTL: Story = {
  args: {
    activeItem: "communities",
    labels: { home: "الرئيسية", communities: "المجتمعات", profile: "الملف الشخصي", primaryNavAriaLabel: "التنقل الأساسي" },
  },
  globals: { direction: "rtl", locale: "ar" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await expect(canvas.getByRole("button", { name: "المجتمعات" })).toHaveAttribute("aria-current", "page");
  },
};
