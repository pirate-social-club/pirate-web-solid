import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Avatar } from "@/components/data-display/avatar/avatar";
import {
  IconBell,
  IconChatCircle,
  IconHouse,
  IconWallet,
} from "@/components/media/icons";
import { cn } from "@/lib/cn";

export type FooterNavItemId = "home" | "wallet" | "chat" | "inbox" | "profile";
type FooterIcon = (props: { class?: string; filled?: boolean }) => JSX.Element;

export interface MobileFooterNavLabels {
  chat?: string;
  chatAriaLabel?: string;
  home?: string;
  inbox?: string;
  inboxAriaLabel?: string;
  primaryNavAriaLabel?: string;
  profile?: string;
  profileAriaLabel?: string;
  wallet?: string;
  walletAriaLabel?: string;
}

export interface MobileFooterNavIcons {
  chat?: FooterIcon;
  home?: FooterIcon;
  inbox?: FooterIcon;
  wallet?: FooterIcon;
}

export interface MobileFooterNavProps {
  activeItem?: FooterNavItemId;
  avatarFallback?: string;
  class?: string;
  icons?: MobileFooterNavIcons;
  labels?: MobileFooterNavLabels;
  onChatClick?: () => void;
  onHomeClick?: () => void;
  onInboxClick?: () => void;
  onProfileClick?: () => void;
  onTapHaptic?: () => void;
  onWalletClick?: () => void;
  unreadChatCount?: number;
  unreadInboxCount?: number;
  userAvatarSeed?: string | null;
  userAvatarSrc?: string | null;
}

function normalizeUnreadCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

function formatUnreadCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/** Callback-driven bottom navigation. CSS owns the mobile breakpoint. */
export function MobileFooterNav(props: MobileFooterNavProps) {
  const labels = () => props.labels ?? {};
  const icons = () => props.icons ?? {};
  const chat = () => labels().chat ?? "Chat";
  const home = () => labels().home ?? "Home";
  const inbox = () => labels().inbox ?? "Inbox";
  const wallet = () => labels().wallet ?? "Wallet";
  const profile = () => labels().profile ?? "Profile";
  const unreadChat = () => normalizeUnreadCount(props.unreadChatCount ?? 0);
  const unreadInbox = () => normalizeUnreadCount(props.unreadInboxCount ?? 0);
  const handleTap = (action?: () => void) => {
    if (!action) return;
    props.onTapHaptic?.();
    action();
  };

  const items = () => [
    { id: "home" as const, icon: icons().home ?? IconHouse, label: home(), onClick: props.onHomeClick, ariaLabel: home() },
    { id: "wallet" as const, icon: icons().wallet ?? IconWallet, label: wallet(), onClick: props.onWalletClick, ariaLabel: labels().walletAriaLabel ?? wallet() },
    { id: "chat" as const, icon: icons().chat ?? IconChatCircle, label: chat(), onClick: props.onChatClick, ariaLabel: labels().chatAriaLabel ?? chat() },
    { id: "inbox" as const, icon: icons().inbox ?? IconBell, label: inbox(), onClick: props.onInboxClick, ariaLabel: labels().inboxAriaLabel ?? inbox() },
  ];

  return (
    <nav
      aria-label={labels().primaryNavAriaLabel ?? "Primary navigation"}
      class={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden",
        props.class,
      )}
    >
      <div class="grid h-[var(--header-height)] grid-cols-5 items-center">
        <For each={items()}>
          {(item) => {
            const active = () => (props.activeItem ?? "home") === item.id;
            const unread = () => item.id === "chat" ? unreadChat() : item.id === "inbox" ? unreadInbox() : 0;
            const ariaLabel = () => unread() > 0 ? `${item.ariaLabel}, ${unread()}` : item.ariaLabel;
            return (
              <button
                aria-current={active() ? "page" : undefined}
                aria-label={ariaLabel()}
                class={cn(
                  "relative flex h-full w-full items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active() ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => handleTap(item.onClick)}
                type="button"
              >
                <span class="relative inline-flex size-6">
                  <Dynamic component={item.icon} class="size-6" filled={active()} />
                  <Show when={unread() > 0}>
                    <span aria-hidden="true" class="notification-count-badge absolute -end-2 -top-2">
                      {formatUnreadCount(unread())}
                    </span>
                  </Show>
                </span>
                <span class="sr-only">{item.label}</span>
              </button>
            );
          }}
        </For>
        <button
          aria-current={(props.activeItem ?? "home") === "profile" ? "page" : undefined}
          aria-label={labels().profileAriaLabel ?? profile()}
          class={cn(
            "relative flex h-full w-full items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            (props.activeItem ?? "home") === "profile" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => handleTap(props.onProfileClick)}
          type="button"
        >
          <Avatar
            class="size-9 bg-card"
            fallback={props.avatarFallback ?? "Pirate User"}
            fallbackSeed={props.userAvatarSeed ?? undefined}
            size="sm"
            src={props.userAvatarSrc ?? undefined}
          />
          <span class="sr-only">{profile()}</span>
        </button>
      </div>
    </nav>
  );
}
