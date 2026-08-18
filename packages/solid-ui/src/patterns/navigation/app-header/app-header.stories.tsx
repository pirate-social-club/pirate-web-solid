import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@/components/data-display/type/type";

import { AppHeader } from "./app-header";

const meta = {
  title: "Patterns/Navigation/AppHeader",
  component: AppHeader,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Application header chrome: brand, create/notifications/chat/wallet/profile actions with unread badges, connect CTA, and a mobile branch with back/menu/sidebar leading affordances and a media-overlay appearance. All actions are callbacks; all copy arrives via labels. Locale-specific React stories are covered here by the direction toolbar global because copy is host-injected.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ "min-height": "100vh", width: "100%" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

function HeaderOnlyStory(props: { forceMobile?: boolean; unreadNotificationsCount?: number }) {
  return (
    <div class="min-h-screen bg-background">
      <AppHeader
        forceMobile={props.forceMobile}
        showWalletAction
        unreadNotificationsCount={props.unreadNotificationsCount ?? 0}
      />
      <div
        class={
          props.forceMobile
            ? "px-3 pb-24 pt-[calc(env(safe-area-inset-top)+5rem)]"
            : "mx-auto max-w-5xl px-6 py-10"
        }
      >
        <Type
          as="div"
          variant="caption"
          class="rounded-[var(--radius-xl)] border border-border-soft bg-card p-5 md:p-8"
        >
          {props.forceMobile
            ? "Mobile header above a scrolled content body."
            : "Desktop header above a constrained content column."}
        </Type>
      </div>
    </div>
  );
}

export const DesktopHeader: Story = {
  render: () => <HeaderOnlyStory />,
};

export const DesktopHeaderRtl: Story = {
  globals: { direction: "rtl" },
  render: () => <HeaderOnlyStory />,
};

export const DesktopHeaderWithSingleNotification: Story = {
  render: () => <HeaderOnlyStory unreadNotificationsCount={1} />,
};

export const DesktopHeaderWithNotifications: Story = {
  render: () => <HeaderOnlyStory unreadNotificationsCount={12} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bell = canvas.getByRole("button", { name: "Notifications, 12" });
    await expect(bell).toBeVisible();
    await expect(bell.querySelector(".notification-count-badge")).toHaveTextContent("12");
  },
};

export const DesktopHeaderOverflowNotifications: Story = {
  render: () => <HeaderOnlyStory unreadNotificationsCount={120} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Notifications, 120" }).querySelector(
        ".notification-count-badge",
      ),
    ).toHaveTextContent("99+");
  },
};

export const MobileHeader: Story = {
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => <HeaderOnlyStory forceMobile />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Notifications" }));
    // Callback-driven: no crash, no navigation.
    await expect(canvas.getByRole("button", { name: "Open navigation" })).toBeVisible();
  },
};

export const MobileHeaderRtl: Story = {
  globals: {
    direction: "rtl",
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => <HeaderOnlyStory forceMobile />,
};

function MobileMediaOverlayHeaderStory(props: { loggedOut?: boolean }) {
  return (
    <div class="relative h-dvh overflow-hidden bg-gradient-to-br from-muted via-card to-secondary">
      <div class="absolute inset-0 grid place-items-center px-8 text-center text-foreground/70">
        <Type as="div" variant="h2">Bright video frame</Type>
      </div>
      <AppHeader
        forceMobile
        hideMobileBrand
        mobileAppearance="media-overlay"
        mobileCenterContent={<Type as="div" variant="h4">Pirate</Type>}
          mobileTrailingContent={
          props.loggedOut ? undefined : <div class="size-11" aria-hidden="true" />
        }
        showConnectAction={props.loggedOut}
        showCreateAction={false}
        showNotificationsAction={false}
        showProfileAction={false}
      />
    </div>
  );
}

export const MobileMediaOverlayHeader: Story = {
  name: "Mobile header / Media overlay",
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => <MobileMediaOverlayHeaderStory />,
};

export const MobileMediaOverlayHeaderLoggedOut: Story = {
  name: "Mobile header / Media overlay / Logged out",
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => <MobileMediaOverlayHeaderStory loggedOut />,
  play: async () => {
    const connect = await within(document.body).findByRole("button", { name: "Connect" });
    await expect(connect).toBeVisible();
  },
};
