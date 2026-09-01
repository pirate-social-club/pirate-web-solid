/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import {
  Avatar,
  MobileFooterNav as DesignSystemMobileFooterNav,
  IconArrowLeft,
  IconBell,
  IconButton,
  IconList,
  IconPlus,
  IconSquare,
  IconWallet,
  Type,
  cn,
} from "../../../design-system";
import { formatUnreadCount, normalizeUnreadCount, type ShellNavItem } from "../shell-model";

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
      <Type as="span" variant="h3" class="tracking-wide">PIRATE</Type>
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

/**
 * The shell's footer nav is the design-system pattern; this wrapper only keeps
 * the shell's explicit `forceMobile` gating, which stories and SSR rely on,
 * instead of the pattern's CSS breakpoint.
 */
export interface MobileFooterNavProps {
  activeItem?: ShellNavItem;
  avatarFallback?: string;
  class?: string;
  forceMobile?: boolean;
  labels?: Partial<Record<ShellNavItem, string>> & {
    learnAriaLabel?: string;
    primaryNavAriaLabel?: string;
    profileAriaLabel?: string;
    walletAriaLabel?: string;
  };
  onHomeClick?: () => void;
  onLearnClick?: () => void;
  onProfileClick?: () => void;
  onWalletClick?: () => void;
}

export function MobileFooterNav(props: MobileFooterNavProps) {
  const labels = () => props.labels ?? {};
  return (
    <Show when={props.forceMobile}>
      <DesignSystemMobileFooterNav
        activeItem={props.activeItem}
        avatarFallback={props.avatarFallback}
        class={cn("md:block", props.class)}
        labels={{
          home: labels().home,
          learn: labels().learn,
          learnAriaLabel: labels().learnAriaLabel,
          wallet: labels().wallet,
          walletAriaLabel: labels().walletAriaLabel,
          profile: labels().profile,
          profileAriaLabel: labels().profileAriaLabel,
          primaryNavAriaLabel: labels().primaryNavAriaLabel,
        }}
        onHomeClick={props.onHomeClick}
        onLearnClick={props.onLearnClick}
        onProfileClick={props.onProfileClick}
        onWalletClick={props.onWalletClick}
      />
    </Show>
  );
}

export {
  MobilePageHeader,
  type MobilePageHeaderProps,
} from "../../../design-system";
