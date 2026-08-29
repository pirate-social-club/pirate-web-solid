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
    onLearnClick: fn(),
    onProfileClick: fn(),
    onWalletClick: fn(),
  },
  argTypes: { class: { table: { disable: true } }, icons: { table: { disable: true } }, labels: { table: { disable: true } } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: {
    docs: { description: { component: "Callback-driven bottom navigation with the four product destinations: Home, Learn, Wallet and Profile. The component owns presentation and mobile CSS; the host owns routing, active-item resolution, labels, and haptic feedback. Injected icons receive an optional `filled` prop for active-state rendering; custom icons may ignore it." } },
  },
} satisfies Meta<typeof MobileFooterNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button")).toHaveLength(4);
    await canvas.getByRole("button", { name: "Profile" }).click();
    await expect(args.onProfileClick).toHaveBeenCalledTimes(1);
  },
};

export const LearnActive: Story = {
  args: { activeItem: "learn" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Learn" })).toHaveAttribute("aria-current", "page");
    await canvas.getByRole("button", { name: "Wallet" }).click();
    await expect(args.onWalletClick).toHaveBeenCalledTimes(1);
  },
};

export const RTL: Story = {
  args: {
    activeItem: "wallet",
    labels: { home: "الرئيسية", learn: "تعلّم", wallet: "المحفظة", profile: "الملف الشخصي", primaryNavAriaLabel: "التنقل الأساسي" },
  },
  globals: { direction: "rtl", locale: "ar" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await expect(canvas.getByRole("button", { name: "المحفظة" })).toHaveAttribute("aria-current", "page");
  },
};
