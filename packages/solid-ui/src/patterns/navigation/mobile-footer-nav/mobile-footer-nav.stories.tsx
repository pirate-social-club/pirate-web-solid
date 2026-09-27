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
    onSongsClick: fn(),
    onWalletClick: fn(),
    onProfileClick: fn(),
  },
  argTypes: { class: { table: { disable: true } }, icons: { table: { disable: true } }, labels: { table: { disable: true } } },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: {
    docs: { description: { component: "Callback-driven bottom navigation with the four product destinations: Home, Your songs, Wallet and Profile, plus an optional center create action that widens the bar to five positions. The create control is a command, never the current page. The component owns presentation and mobile CSS; the host owns routing, active-item resolution, labels, and haptic feedback. Injected icons receive an optional `filled` prop for active-state rendering; custom icons may ignore it." } },
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

export const CreateAction: Story = {
  args: {
    onCreateClick: fn(),
    labels: { createAriaLabel: "Create a video" },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button")).toHaveLength(5);
    const create = canvas.getByRole("button", { name: "Create a video" });
    await expect(create).not.toHaveAttribute("aria-current");
    await create.click();
    await expect(args.onCreateClick).toHaveBeenCalledTimes(1);
    // The destinations still mark the current page; only the create action
    // never does.
    await expect(canvas.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
  },
};

export const SongsActive: Story = {
  args: { activeItem: "songs" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Your songs" })).toHaveAttribute("aria-current", "page");
    await canvas.getByRole("button", { name: "Home" }).click();
    await expect(args.onHomeClick).toHaveBeenCalledTimes(1);
  },
};

export const RTL: Story = {
  args: {
    activeItem: "songs",
    labels: { home: "الرئيسية", songs: "أغانيك", wallet: "المحفظة", profile: "الملف الشخصي", primaryNavAriaLabel: "التنقل الأساسي" },
  },
  globals: { direction: "rtl", locale: "ar" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
    await expect(canvas.getByRole("button", { name: "أغانيك" })).toHaveAttribute("aria-current", "page");
  },
};
