import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Button } from "@/components/actions/button/button";
import { IconButton } from "@/components/actions/icon-button/icon-button";
import { Avatar } from "@/components/data-display/avatar/avatar";
import { Type } from "@/components/data-display/type/type";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBell,
  IconChatCircle,
  IconList,
  IconPlus,
  IconSquare,
  IconWallet,
} from "@/components/media/icons";
import { PirateBrandMark } from "@/patterns/identity/pirate-brand-mark/pirate-brand-mark";
import { createClientHydrated } from "@/lib/hydration";
import { createIsMobile } from "@/lib/media-query";
import { cn } from "@/lib/cn";

import { createSidebar } from "../sidebar/sidebar.shared";

function formatUnreadCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function normalizeUnreadCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

export function shouldShowMobileConnectAction(
  showConnectAction: boolean,
  appearance: AppHeaderProps["mobileAppearance"],
): boolean {
  return showConnectAction && appearance !== "media-overlay";
}

export function shouldShowDesktopConnectAction(
  showConnectAction: boolean,
  hideDesktopConnectAction: boolean,
): boolean {
  return showConnectAction && !hideDesktopConnectAction;
}

function CreatePostGlyph() {
  return (
    <span class="relative inline-flex size-5 items-center justify-center">
      <IconSquare class="size-5" />
      <IconPlus class="absolute size-3.5" />
    </span>
  );
}

function SidebarMenuToggleButton(props: { ariaLabel: string }) {
  const { toggleSidebar } = createSidebar();

  return (
    <IconButton aria-label={props.ariaLabel} data-app-header-icon onClick={toggleSidebar} variant="ghost">
      <IconList class="size-6" />
    </IconButton>
  );
}

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
  searchPlaceholder?: string;
  walletAriaLabel?: string;
}

export interface AppHeaderProps {
  avatarFallback?: string;
  class?: string;
  createActionTitle?: string;
  disableCreateAction?: boolean;
  forceMobile?: boolean;
  hideBrand?: boolean;
  hideDesktopConnectAction?: boolean;
  hideDesktopBrand?: boolean;
  hideMobileBrand?: boolean;
  /** Mirrors the active text direction; flips the back chevron. */
  isRtl?: boolean;
  labels?: AppHeaderLabels;
  mobileLeadingContent?: JSX.Element;
  mobileAppearance?: "default" | "media-overlay";
  mobileCenterContent?: JSX.Element;
  mobileTrailingContent?: JSX.Element;
  onBackClick?: () => void;
  onConnectClick?: () => void;
  onCreateClick?: () => void;
  onChatClick?: () => void;
  onHomeClick?: () => void;
  onMenuClick?: () => void;
  onNotificationsClick?: () => void;
  onProfileClick?: () => void;
  onSearchClick?: () => void;
  onWalletClick?: () => void;
  showCreateAction?: boolean;
  showChatAction?: boolean;
  showMobileCreateAction?: boolean;
  showNotificationsAction?: boolean;
  showConnectAction?: boolean;
  showProfileAction?: boolean;
  showWalletAction?: boolean;
  unreadChatCount?: number;
  unreadNotificationsCount?: number;
  useSidebarTrigger?: boolean;
  userAvatarSeed?: string | null;
  userAvatarSrc?: string | null;
}

/**
 * Application header chrome. Callback-driven (all actions are on*Click
 * props), locale copy arrives via labels, and mobile rendering is
 * hydration-gated with forceMobile override. The mobile branch supports a
 * media-overlay appearance for immersive video surfaces.
 */
export function AppHeader(props: AppHeaderProps) {
  const backAriaLabel = () => props.labels?.backAriaLabel ?? "Go back";
  const connectLabel = () => props.labels?.connectLabel ?? "Connect";
  const chatAriaLabel = () => props.labels?.chatAriaLabel ?? "Messages";
  const createLabel = () => props.labels?.createLabel ?? "Create";
  const homeAriaLabel = () => props.labels?.homeAriaLabel ?? "Go to home";
  const notificationsAriaLabel = () =>
    props.labels?.notificationsAriaLabel ?? "Notifications";
  const openNavigationAriaLabel = () =>
    props.labels?.openNavigationAriaLabel ?? "Open navigation";
  const profileAriaLabel = () => props.labels?.profileAriaLabel ?? "Open profile";
  const walletAriaLabel = () => props.labels?.walletAriaLabel ?? "Wallet";

  const detectedMobile = createIsMobile();
  const hydrated = createClientHydrated();
  const isMobile = () => props.forceMobile ?? (hydrated() ? detectedMobile() : false);
  const isRtl = () => props.isRtl ?? false;

  const unreadChat = () => normalizeUnreadCount(props.unreadChatCount ?? 0);
  const unreadNotifications = () =>
    normalizeUnreadCount(props.unreadNotificationsCount ?? 0);
  const chatAccessibleLabel = () =>
    unreadChat() > 0 ? `${chatAriaLabel()}, ${unreadChat()}` : chatAriaLabel();
  const unreadNotificationsLabel = () =>
    unreadNotifications() > 0
      ? `${notificationsAriaLabel()}, ${unreadNotifications()}`
      : notificationsAriaLabel();

  const showCreateAction = () => props.showCreateAction ?? true;
  const showNotificationsAction = () => props.showNotificationsAction ?? true;
  const showProfileAction = () => props.showProfileAction ?? true;

  const createAction = () =>
    showCreateAction() ? (
      <IconButton
        aria-label={createLabel()}
        class="relative"
        data-app-header-icon
        disabled={props.disableCreateAction ?? false}
        onClick={() => props.onCreateClick?.()}
        title={props.createActionTitle}
        variant="ghost"
      >
        {isMobile() ? <IconPlus class="size-6" /> : <CreatePostGlyph />}
      </IconButton>
    ) : null;

  const notificationsAction = () =>
    showNotificationsAction() ? (
      <IconButton
        aria-label={unreadNotificationsLabel()}
        class="relative"
        data-app-header-icon
        onClick={() => props.onNotificationsClick?.()}
        variant="ghost"
      >
        <IconBell class="size-6" />
        {unreadNotifications() > 0 ? (
          <span
            aria-hidden="true"
            class="notification-count-badge absolute end-1.5 top-1.5"
          >
            {formatUnreadCount(unreadNotifications())}
          </span>
        ) : null}
      </IconButton>
    ) : null;

  const chatAction = () =>
    props.showChatAction ? (
      <IconButton
        aria-label={chatAccessibleLabel()}
        class="relative"
        data-app-header-icon
        onClick={() => props.onChatClick?.()}
        variant="ghost"
      >
        <IconChatCircle class="size-6" />
        {unreadChat() > 0 ? (
          <span
            aria-hidden="true"
            class="notification-count-badge absolute end-1.5 top-1.5"
          >
            {formatUnreadCount(unreadChat())}
          </span>
        ) : null}
      </IconButton>
    ) : null;

  const walletAction = () =>
    props.showWalletAction ? (
      <IconButton
        aria-label={walletAriaLabel()}
        class="relative"
        data-app-header-icon
        onClick={() => props.onWalletClick?.()}
        variant="ghost"
      >
        <IconWallet class="size-6" />
      </IconButton>
    ) : null;

  const profileAction = () =>
    showProfileAction() && !props.showConnectAction ? (
      <IconButton
        aria-label={profileAriaLabel()}
        class="p-0"
        data-app-header-icon
        onClick={() => props.onProfileClick?.()}
        variant="ghost"
      >
        <Avatar
          class="size-11 bg-card text-base"
          fallback={props.avatarFallback ?? "Pirate User"}
          fallbackSeed={props.userAvatarSeed ?? undefined}
          size="sm"
          src={props.userAvatarSrc ?? undefined}
        />
      </IconButton>
    ) : null;

  const desktopActions = () =>
    [
      createAction(),
      notificationsAction(),
      chatAction(),
      walletAction(),
      profileAction(),
    ].filter(Boolean);
  const mobileActions = () =>
    props.showMobileCreateAction
      ? [createAction()].filter(Boolean)
      : [notificationsAction(), walletAction(), profileAction()].filter(Boolean);

  const brand = (
    <button
      aria-label={homeAriaLabel()}
      class="inline-flex max-w-full items-center gap-3 rounded-full p-1 text-start align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => props.onHomeClick?.()}
      type="button"
    >
      <PirateBrandMark class="size-11 shrink-0" />
      <Type as="span" variant="h3" class="truncate font-display tracking-wide">
        PIRATE
      </Type>
    </button>
  );

  return (
    <Show
      when={!isMobile()}
      fallback={
        <MobileAppHeader
          {...props}
          backAriaLabel={backAriaLabel()}
          brand={brand}
          connectLabel={connectLabel()}
          mobileActions={mobileActions()}
          openNavigationAriaLabel={openNavigationAriaLabel()}
          isRtl={isRtl()}
        />
      }
    >
      <header
        class={cn(
          "sticky top-0 z-30 border-b border-border-soft bg-background/95 backdrop-blur-xl",
          props.forceMobile === undefined && "hidden md:block",
          props.class,
        )}
      >
        <div class="grid h-[var(--header-height)] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 lg:px-8">
          <div class="min-w-0 text-start">
            {props.hideBrand || props.hideDesktopBrand ? null : brand}
          </div>
          <div class="flex min-w-0 items-center justify-end gap-1.5">
            {shouldShowDesktopConnectAction(
              props.showConnectAction ?? false,
              props.hideDesktopConnectAction ?? false,
            ) ? (
              <Button class="h-12 px-5" onClick={() => props.onConnectClick?.()}>
                {connectLabel()}
              </Button>
            ) : null}
            {desktopActions()}
          </div>
        </div>
      </header>
    </Show>
  );
}

function MobileAppHeader(
  props: AppHeaderProps & {
    backAriaLabel: string;
    brand: JSX.Element;
    connectLabel: string;
    isRtl: boolean;
    mobileActions: JSX.Element[];
    openNavigationAriaLabel: string;
  },
) {
  const mediaOverlay = () => props.mobileAppearance === "media-overlay";
  const showMobileConnectAction = () =>
    shouldShowMobileConnectAction(props.showConnectAction ?? false, props.mobileAppearance);

  return (
    <header
      class={cn(
        "fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)]",
        mediaOverlay()
          ? "border-b border-transparent bg-transparent media-overlay-foreground"
          : "border-b border-border-soft bg-background/95 backdrop-blur-md",
        props.class,
      )}
      data-appearance={props.mobileAppearance ?? "default"}
    >
      {mediaOverlay() ? (
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 top-0 h-[calc(100%+2rem)] media-overlay-scrim"
        />
      ) : null}
      <div
        class={cn(
          "relative grid h-16 grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-2 px-3",
          mediaOverlay() &&
            "[&_button[data-app-header-icon]]:drop-shadow-md",
        )}
      >
        <div class="min-w-0 justify-self-start">
          {props.mobileLeadingContent ?? (
            props.useSidebarTrigger ? (
              <SidebarMenuToggleButton ariaLabel={props.openNavigationAriaLabel} />
            ) : props.onBackClick ? (
              <IconButton
                aria-label={props.backAriaLabel}
                data-app-header-icon
                onClick={() => props.onBackClick?.()}
                variant="ghost"
              >
                {props.isRtl ? <IconArrowRight class="size-6" /> : <IconArrowLeft class="size-6" />}
              </IconButton>
            ) : (
              <IconButton
                aria-label={props.openNavigationAriaLabel}
                data-app-header-icon
                onClick={() => props.onMenuClick?.()}
                variant="ghost"
              >
                <IconList class="size-6" />
              </IconButton>
            )
          )}
        </div>
        <div class="min-w-0 max-w-56 justify-self-center text-center">
          {props.mobileCenterContent ??
            (props.hideBrand || props.hideMobileBrand ? null : props.brand)}
        </div>
        <div class="min-w-0 justify-self-end">
          {props.mobileTrailingContent ?? (
            showMobileConnectAction() ? (
              <Button class="h-11 px-4" onClick={() => props.onConnectClick?.()}>
                {props.connectLabel}
              </Button>
            ) : props.mobileActions.length > 0 ? (
              <div class="flex items-center justify-end gap-1">{props.mobileActions}</div>
            ) : (
              <div class="size-11" aria-hidden="true" />
            )
          )}
        </div>
      </div>
    </header>
  );
}
