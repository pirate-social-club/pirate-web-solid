/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import { Type, cn } from "../../../design-system";
import { AppHeader, MobileFooterNav, type AppHeaderLabels } from "../app-shell-chrome/app-shell-chrome";
import { resolveShellTitle } from "../shell-model";

export type ShellRoute = "home" | "community" | "post" | "wallet" | "profile";

export interface AppShellProps {
  children?: JSX.Element;
  class?: string;
  forceMobile?: boolean;
  route?: ShellRoute;
  title?: string;
  unreadChatCount?: number;
  unreadNotificationCount?: number;
  labels?: AppHeaderLabels;
  onBackClick?: () => void;
  onCreateClick?: () => void;
  onHomeClick?: () => void;
  onMenuClick?: () => void;
  onNotificationsClick?: () => void;
  onProfileClick?: () => void;
  onWalletClick?: () => void;
  onChatClick?: () => void;
  onInboxClick?: () => void;
}

export function AppShell(props: AppShellProps) {
  const title = () => props.title ?? resolveShellTitle(props.route ?? "home");
  return <div class={cn("min-h-screen w-full min-w-0 bg-background text-foreground", props.class)}>
    <AppHeader forceMobile={props.forceMobile} labels={props.labels} mobileCenterContent={<Show when={title()}><Type as="span" variant="h4">{title()}</Type></Show>} onBackClick={props.onBackClick} onCreateClick={props.onCreateClick} onHomeClick={props.onHomeClick} onMenuClick={props.onMenuClick} onNotificationsClick={props.onNotificationsClick} onProfileClick={props.onProfileClick} onWalletClick={props.onWalletClick} showWalletAction={props.route === "wallet"} unreadNotificationsCount={props.unreadNotificationCount} />
    <main class={cn(props.forceMobile ? "min-h-screen pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)]" : "min-h-screen")}>{props.children}</main>
    <MobileFooterNav forceMobile={props.forceMobile} activeItem={props.route === "profile" ? "profile" : props.route === "wallet" ? "wallet" : "home"} labels={{ home: "Home", wallet: "Wallet", chat: "Chat", inbox: "Inbox", profile: "Profile", primaryNavAriaLabel: "Primary navigation" }} onChatClick={props.onChatClick} onHomeClick={props.onHomeClick} onInboxClick={props.onInboxClick} onProfileClick={props.onProfileClick} onWalletClick={props.onWalletClick} unreadChatCount={props.unreadChatCount} unreadInboxCount={props.unreadNotificationCount} />
  </div>;
}

export function RouteFallback() {
  return <div aria-busy="true" class="flex min-h-48 items-center justify-center rounded-2xl border border-border-soft bg-card p-6"><Type variant="caption">Loading route content…</Type></div>;
}

export function RootErrorState(props: { onHome?: () => void }) {
  return <section aria-live="polite" class="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center gap-4 px-6 text-center"><Type as="h1" variant="h2">We hit a temporary problem</Type><Type variant="body">This page did not finish loading. Try returning home and opening it again.</Type><button class="rounded-lg border border-border-soft px-4 py-2 underline-offset-4 hover:underline" onClick={props.onHome} type="button">Return home</button></section>;
}
