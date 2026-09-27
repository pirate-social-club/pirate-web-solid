/** @jsxImportSource @solidjs/web */
import { onCleanup, Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import {
  Avatar,
  MobileFooterNav as DesignSystemMobileFooterNav,
  IconArrowLeft,
  IconBell,
  IconHouse,
  IconButton,
  IconList,
  IconPlus,
  IconSquare,
  IconWallet,
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
    // Each app domain is its own product, so the chrome carries no brand name.
    <IconButton aria-label={home()} onClick={props.onHomeClick} variant="ghost">
      <IconHouse class="size-6" />
    </IconButton>
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
        <header class={cn("flex min-h-16 items-center justify-between bg-background px-6 py-2", props.class)}>
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
      <header class={cn("fixed inset-x-0 top-0 z-40 bg-background pt-[env(safe-area-inset-top)]", appearance() === "media-overlay" && "bg-transparent text-white", props.class)} data-appearance={appearance()}>
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
  activeItem?: ShellNavItem | "none";
  avatarFallback?: string;
  class?: string;
  forceMobile?: boolean;
  labels?: Partial<Record<ShellNavItem, string>> & {
    primaryNavAriaLabel?: string;
    profileAriaLabel?: string;
  };
  onHomeClick?: () => void;
  onSongsClick?: () => void;
  onWalletClick?: () => void;
  onProfileClick?: () => void;
  /**
   * A second tap on the profile control within the double-tap window. When it
   * is absent the profile tap stays immediate; when it is present the single
   * tap waits one window so a double tap can win, then navigates.
   */
  onProfileDoubleTap?: () => void;
  userAvatarSeed?: string | null;
  userAvatarSrc?: string | null;
}

export function MobileFooterNav(props: MobileFooterNavProps) {
  const labels = () => props.labels ?? {};
  const doubleTapWindowMs = 280;
  let lastProfileTap = 0;
  let pendingProfileTap: ReturnType<typeof setTimeout> | undefined;
  const clearPendingProfileTap = () => {
    if (pendingProfileTap === undefined) return;
    clearTimeout(pendingProfileTap);
    pendingProfileTap = undefined;
  };
  const handleProfileTap = () => {
    if (props.onProfileDoubleTap === undefined) {
      props.onProfileClick?.();
      return;
    }
    const now = Date.now();
    if (now - lastProfileTap <= doubleTapWindowMs) {
      clearPendingProfileTap();
      lastProfileTap = 0;
      props.onProfileDoubleTap();
      return;
    }
    lastProfileTap = now;
    clearPendingProfileTap();
    pendingProfileTap = setTimeout(() => {
      pendingProfileTap = undefined;
      lastProfileTap = 0;
      props.onProfileClick?.();
    }, doubleTapWindowMs);
  };
  onCleanup(clearPendingProfileTap);
  return (
    <Show when={props.forceMobile}>
      <DesignSystemMobileFooterNav
        activeItem={props.activeItem}
        avatarFallback={props.avatarFallback}
        class={cn("md:block", props.class)}
        labels={{
          home: labels().home,
          songs: labels().songs,
          wallet: labels().wallet,
          profile: labels().profile,
          profileAriaLabel: labels().profileAriaLabel,
          primaryNavAriaLabel: labels().primaryNavAriaLabel,
        }}
        onHomeClick={props.onHomeClick}
        onSongsClick={props.onSongsClick}
        onWalletClick={props.onWalletClick}
        onProfileClick={handleProfileTap}
        userAvatarSeed={props.userAvatarSeed}
        userAvatarSrc={props.userAvatarSrc}
      />
    </Show>
  );
}

export {
  MobilePageHeader,
  type MobilePageHeaderProps,
} from "../../../design-system";
