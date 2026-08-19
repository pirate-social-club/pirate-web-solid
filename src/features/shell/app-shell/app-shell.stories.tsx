/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";

import { Card, Type } from "../../../design-system";
import { AppShell, RootErrorState, RouteFallback as RouteFallbackState } from "./app-shell";

const meta = { id: "app-shell", title: "App/Shell/AppShell", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function StoryBody(props: { label: string }) {
  return <div class="mx-auto max-w-3xl p-5 md:p-10"><Card class="p-6"><Type as="h1" variant="h2">{props.label}</Type><Type as="p" variant="caption" class="mt-2">A deterministic, offline shell fixture for keyboard and responsive review.</Type></Card></div>;
}

export const Desktop: Story = { render: () => <AppShell route="home"><StoryBody label="Desktop shell" /></AppShell> };
export const MobileHeader: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <AppShell forceMobile onBackClick={() => undefined} route="post"><StoryBody label="Mobile header with back affordance" /></AppShell> };
export const MobileFooterWithNotifications: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <AppShell forceMobile route="community" unreadNotificationCount={12}><StoryBody label="Mobile footer with notifications" /></AppShell> };
export const MobileFooterWithChatNotification: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <AppShell forceMobile route="community" unreadChatCount={1}><StoryBody label="Mobile footer with chat notification" /></AppShell> };
function WalletAndProfileSurface() {
  const [lastAction, setLastAction] = createSignal("Choose Wallet or Profile");
  return <AppShell forceMobile onProfileClick={() => setLastAction("Profile selected")} onWalletClick={() => setLastAction("Wallet selected")} route="wallet"><div class="mx-auto max-w-3xl p-5"><Card class="p-6"><Type as="h1" variant="h2">Wallet and profile actions</Type><Type as="p" variant="caption" class="mt-2">{lastAction()}</Type></Card></div></AppShell>;
}

export const WalletAndProfileActions: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <WalletAndProfileSurface /> };
export const RouteFallback: Story = { render: () => <AppShell route="community"><div class="mx-auto max-w-3xl p-6"><RouteFallbackState /></div></AppShell> };
export const RootError: Story = { render: () => <AppShell route="home"><RootErrorState /></AppShell> };
