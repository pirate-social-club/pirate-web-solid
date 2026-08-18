/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import {
  Avatar,
  IconArrowLeft,
  IconBell,
  IconButton,
  IconChatCircle,
  IconHouse,
  IconList,
  IconPlus,
  IconSquare,
  IconWallet,
  IconX,
  Type,
  cn,
} from "../../../design-system";
import { formatUnreadCount, normalizeUnreadCount, shellNavItems, type ShellNavItem } from "../shell-model";

export interface AppHeaderLabels {
  backAriaLabel?: string;
  connectLabel?: string;
  createLabel?: string;
  chatAriaLabel?: string;
  homeAriaLabel?: string;
  notificationsAriaLabel?: string;
  openNavigationAriaLabel?: string;
  profileAriaLabel?: string;
  searchAriaLabel?: string;
  walletAriaLabel?: string;
}

export interface AppHeaderProps {
  avatarFallback?: string;
  class?: string;
  forceMobile?: boolean;
  hideBrand?: boolean;
  hideMobileBrand?: boolean;
  labels?: AppHeaderLabels;
  mobileLeadingContent?: JSX.Element;
  mobileAppearance?: "default" | "media-overlay";
  mobileCenterContent?: JSX.Element;
  mobileTrailingContent?: JSX.Element;
  onBackClick?: () => void;
  onConnectClick?: () => void;
  onCreateClick?: () => void;
  onHomeClick?: () => void;
  onMenuClick?: () => void;
  onNotificationsClick?: () => void;
  onProfileClick?: () => void;
  onWalletClick?: () => void;
  showCreateAction?: boolean;
  showNotificationsAction?: boolean;
  showConnectAction?: boolean;
  showProfileAction?: boolean;
  showWalletAction?: boolean;
  unreadNotificationsCount?: number;
}

function CreateGlyph() {
  return <span aria-hidden="true" class="relative inline-flex size-5 items-center justify-center"><IconSquare class="size-5" /><IconPlus class="absolute size-3.5" /></span>;
}

function NavIcon(props: { item: ShellNavItem; class?: string }) {
  const className = () => cn("size-6", props.class);
  switch (props.item) {
    case "home": return <IconHouse class={className()} />;
    case "wallet": return <IconWallet class={className()} />;
    case "chat": return <IconChatCircle class={className()} />;
    case "inbox": return <IconBell class={className()} />;
    case "profile": return <Avatar fallback="Story Pirate" fallbackSeed="story-pirate" size="sm" />;
  }
}

export function AppHeader(props: AppHeaderProps) {
  const labels = () => props.labels ?? {};
  const unread = () => normalizeUnreadCount(props.unreadNotificationsCount);
  const mobile = () => props.forceMobile === true;
  const appearance = () => props.mobileAppearance ?? "default";
  const home = () => props.labels?.homeAriaLabel ?? "Go to home";
  const profile = () => props.labels?.profileAriaLabel ?? "Open profile";
  const notifications = () => props.labels?.notificationsAriaLabel ?? "Notifications";

  const brand = () => (
    <button
      aria-label={home()}
      class="inline-flex items-center gap-3 rounded-full p-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={props.onHomeClick}
      type="button"
    >
      <span aria-hidden="true" class="grid size-10 place-items-center rounded-full border border-border-soft bg-card text-lg font-semibold">P</span>
      <Type as="span" variant="h3" class="font-display tracking-wide">PIRATE</Type>
    </button>
  );

  const notificationAction = () => props.showNotificationsAction === false ? null : (
    <IconButton
      aria-label={unread() > 0 ? `${notifications()}, ${unread()}` : notifications()}
      class="relative"
      onClick={props.onNotificationsClick}
      variant="ghost"
    >
      <IconBell class="size-6" />
      <Show when={unread() > 0}><span aria-hidden="true" class="absolute end-1 top-1 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{formatUnreadCount(unread())}</span></Show>
    </IconButton>
  );

  const profileAction = () => props.showProfileAction === false ? null : (
    <IconButton aria-label={profile()} class="p-0" onClick={props.onProfileClick} variant="ghost">
      <Avatar fallback={props.avatarFallback ?? "Pirate User"} fallbackSeed="story-pirate" size="sm" />
    </IconButton>
  );

  return (
    <Show
      when={mobile()}
      fallback={
        <header class={cn("flex min-h-16 items-center justify-between border-b border-border-soft bg-background/95 px-6 py-2", props.class)}>
          <Show when={!props.hideBrand}>{brand()}</Show>
          <div class="flex items-center gap-1">
            <Show when={props.showCreateAction !== false}><IconButton aria-label={labels().createLabel ?? "Create"} onClick={props.onCreateClick} variant="ghost"><CreateGlyph /></IconButton></Show>
            {notificationAction()}
            <Show when={props.showWalletAction}><IconButton aria-label={labels().walletAriaLabel ?? "Wallet"} onClick={props.onWalletClick} variant="ghost"><IconWallet class="size-6" /></IconButton></Show>
            {profileAction()}
          </div>
        </header>
      }
    >
      <header class={cn("fixed inset-x-0 top-0 z-40 border-b border-border-soft bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur-md", appearance() === "media-overlay" && "border-transparent bg-transparent text-white", props.class)} data-appearance={appearance()}>
        <div class="grid h-16 grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-2 px-3">
          <div class="min-w-0 justify-self-start">
            <Show when={props.mobileLeadingContent} fallback={
              <IconButton aria-label={props.onBackClick ? (labels().backAriaLabel ?? "Go back") : (labels().openNavigationAriaLabel ?? "Open navigation")} onClick={props.onBackClick ?? props.onMenuClick} variant="ghost">
                <Show when={props.onBackClick} fallback={<IconList class="size-6" />}><IconArrowLeft class="size-6" /></Show>
              </IconButton>
            }>{props.mobileLeadingContent}</Show>
          </div>
          <div class="min-w-0 max-w-56 justify-self-center text-center"><Show when={props.mobileCenterContent} fallback={<Show when={!props.hideBrand && !props.hideMobileBrand}>{brand()}</Show>}>{props.mobileCenterContent}</Show></div>
          <div class="min-w-0 justify-self-end">
            <Show when={props.mobileTrailingContent} fallback={<div class="flex items-center gap-1">{notificationAction()}<Show when={props.showWalletAction}><IconButton aria-label={labels().walletAriaLabel ?? "Wallet"} onClick={props.onWalletClick} variant="ghost"><IconWallet class="size-6" /></IconButton></Show>{profileAction()}</div>}>{props.mobileTrailingContent}</Show>
          </div>
        </div>
      </header>
    </Show>
  );
}

export interface MobileFooterNavProps {
  activeItem?: ShellNavItem;
  avatarFallback?: string;
  class?: string;
  forceMobile?: boolean;
  labels?: Partial<Record<ShellNavItem, string>> & { primaryNavAriaLabel?: string; inboxAriaLabel?: string };
  onHomeClick?: () => void;
  onWalletClick?: () => void;
  onChatClick?: () => void;
  onInboxClick?: () => void;
  onProfileClick?: () => void;
  unreadChatCount?: number;
  unreadInboxCount?: number;
}

export function MobileFooterNav(props: MobileFooterNavProps) {
  const labels = () => props.labels ?? {};
  const callback = (item: ShellNavItem) => ({ home: props.onHomeClick, wallet: props.onWalletClick, chat: props.onChatClick, inbox: props.onInboxClick, profile: props.onProfileClick })[item];
  const count = (item: ShellNavItem) => item === "chat" ? normalizeUnreadCount(props.unreadChatCount) : item === "inbox" ? normalizeUnreadCount(props.unreadInboxCount) : 0;
  return <Show when={props.forceMobile}>
    <nav aria-label={labels().primaryNavAriaLabel ?? "Primary navigation"} class={cn("fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md", props.class)}>
      <div class="grid h-16 grid-cols-5 items-center px-2">
        <For each={shellNavItems}>{(item) => {
          const unreadCount = () => count(item);
          const label = () => labels()[item] ?? item;
          return <button aria-current={props.activeItem === item ? "page" : undefined} aria-label={unreadCount() > 0 ? `${label()}, ${unreadCount()}` : label()} class={cn("relative mx-auto inline-flex size-12 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground", props.activeItem === item && "bg-primary/15 text-primary")} onClick={callback(item)} type="button"><NavIcon item={item} /><span class="sr-only">{label()}</span><Show when={unreadCount() > 0}><span aria-hidden="true" class="absolute end-1 top-1 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{formatUnreadCount(unreadCount())}</span></Show></button>;
        }}</For>
      </div>
    </nav>
  </Show>;
}

export interface MobilePageHeaderProps {
  title: string;
  class?: string;
  onBackClick?: () => void;
  onCloseClick?: () => void;
  trailingAction?: JSX.Element;
}

export function MobilePageHeader(props: MobilePageHeaderProps) {
  return <AppHeader class={props.class} forceMobile hideBrand mobileCenterContent={<Type as="span" variant="h4" class="truncate">{props.title}</Type>} mobileLeadingContent={<IconButton aria-label={props.onCloseClick ? "Close" : "Go back"} onClick={props.onCloseClick ?? props.onBackClick} variant="ghost"><Show when={props.onCloseClick} fallback={<IconArrowLeft class="size-6" />}><IconX class="size-6" /></Show></IconButton>} mobileTrailingContent={props.trailingAction} />;
}
