/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Type } from "../../../design-system";
import { AppHeader, MobileFooterNav } from "./app-shell-chrome";

const labels = { createLabel: "Create", homeAriaLabel: "Go to home", notificationsAriaLabel: "Notifications", openNavigationAriaLabel: "Open navigation", profileAriaLabel: "Open profile", walletAriaLabel: "Wallet" };
const meta = { title: "Parts/Shell/AppShellChrome", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Body(props: { children: string }) { return <div class="mx-auto max-w-5xl px-6 py-10"><div class="rounded-2xl border border-border-soft bg-card p-6"><Type variant="caption">{props.children}</Type></div></div>; }

export const DesktopHeader: Story = { render: () => <div class="min-h-screen bg-background"><AppHeader labels={labels} showWalletAction /><Body>Desktop header with account actions</Body></div> };
export const DesktopHeaderWithNotifications: Story = { render: () => <div class="min-h-screen bg-background"><AppHeader labels={labels} showWalletAction unreadNotificationsCount={12} /><Body>Desktop header with a notification badge</Body></div> };
export const MobileHeader: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <div class="min-h-screen bg-background"><AppHeader forceMobile labels={labels} showWalletAction /><Body>Mobile header chrome</Body></div> };
export const MobileMediaOverlayHeader: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <div class="relative min-h-screen bg-gradient-to-br from-muted to-card"><AppHeader forceMobile hideMobileBrand labels={labels} mobileAppearance="media-overlay" mobileCenterContent={<Type as="span" variant="h4">Pirate</Type>} /><Body>Media overlay keeps controls legible over video</Body></div> };
export const MobileFooter: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <div class="min-h-screen bg-background px-3 pb-28 pt-6"><Body>Mobile footer navigation</Body><MobileFooterNav forceMobile labels={{ home: "Home", wallet: "Wallet", chat: "Chat", inbox: "Inbox", profile: "Profile", primaryNavAriaLabel: "Primary navigation" }} /></div> };
export const MobileFooterWithNotifications: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <div class="min-h-screen bg-background px-3 pb-28 pt-6"><Body>Mobile footer with unread inbox</Body><MobileFooterNav forceMobile labels={{ home: "Home", wallet: "Wallet", chat: "Chat", inbox: "Inbox", profile: "Profile", primaryNavAriaLabel: "Primary navigation" }} unreadInboxCount={12} /></div> };

