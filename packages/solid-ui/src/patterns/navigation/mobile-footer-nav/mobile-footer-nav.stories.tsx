import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, within } from "storybook/test";

import { MobileFooterNav } from "./mobile-footer-nav";

const meta = {
  title: "Patterns/Navigation/MobileFooterNav",
  component: MobileFooterNav,
  tags: ["autodocs"],
  args: { activeItem: "home", onHomeClick: fn(), onProfileClick: fn() },
  argTypes: { class: { table: { disable: true } }, icons: { table: { disable: true } }, labels: { table: { disable: true } } },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    docs: { description: { component: "Callback-driven bottom navigation. The component owns presentation and mobile CSS; the host owns routing, active-item resolution, labels, and haptic feedback. Injected icons receive an optional `filled` prop for active-state rendering; custom icons may ignore it." } },
  },
} satisfies Meta<typeof MobileFooterNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.getByRole("button", { name: "Profile" }).click();
    await expect(args.onProfileClick).toHaveBeenCalledTimes(1);
  },
};

export const Notifications: Story = {
  args: { activeItem: "inbox", unreadChatCount: 4, unreadInboxCount: 128 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Chat, 4" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Inbox, 128" })).toBeVisible();
  },
};

export const RTL: Story = {
  args: { labels: { home: "الرئيسية", wallet: "المحفظة", chat: "الدردشة", inbox: "الوارد", profile: "الملف الشخصي", primaryNavAriaLabel: "التنقل الأساسي" }, unreadChatCount: 4, unreadInboxCount: 128 },
  globals: { direction: "rtl", locale: "ar" },
  play: async () => {
    await expect(document.documentElement).toHaveAttribute("dir", "rtl");
  },
};
