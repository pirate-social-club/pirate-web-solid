/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Type } from "../../../design-system";
import { AppHeader, MobileFooterNav } from "./app-shell-chrome";

const labels = { createLabel: "Create", homeAriaLabel: "Go to home", notificationsAriaLabel: "Notifications", openNavigationAriaLabel: "Open navigation", profileAriaLabel: "Open profile", walletAriaLabel: "Wallet" };
const meta = { title: "Parts/Shell/AppShellChrome", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Body(props: { children: string }) { return <div class="mx-auto max-w-5xl px-6 py-10"><div class="rounded-2xl border border-border-soft bg-card p-6"><Type variant="caption">{props.children}</Type></div></div>; }

// Production always renders the mobile branch (forceMobile inside md:hidden)
// with the wallet and notification actions hidden.
export const MobileHeader: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <div class="min-h-screen bg-background"><AppHeader forceMobile labels={labels} /><Body>Mobile header chrome</Body></div> };
const footerLabels = { home: "Home", communities: "Communities", profile: "Profile", primaryNavAriaLabel: "Primary navigation" };

export const MobileFooter: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <div class="min-h-screen bg-background px-3 pb-28 pt-6"><Body>Mobile footer navigation</Body><MobileFooterNav forceMobile labels={footerLabels} /></div> };
export const MobileFooterOnCommunities: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <div class="min-h-screen bg-background px-3 pb-28 pt-6"><Body>Mobile footer on the Communities destination</Body><MobileFooterNav activeItem="communities" forceMobile labels={footerLabels} /></div> };
