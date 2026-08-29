import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";
import { For } from "solid-js";

import { Avatar } from "@/components/data-display/avatar/avatar";
import { IconHouse, IconPlaylist, IconWallet } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export type FooterNavItemId = "home" | "learn" | "wallet" | "profile";
type FooterIcon = (props: { class?: string; filled?: boolean }) => JSX.Element;

export interface MobileFooterNavLabels {
  home?: string;
  learn?: string;
  learnAriaLabel?: string;
  primaryNavAriaLabel?: string;
  profile?: string;
  profileAriaLabel?: string;
  wallet?: string;
  walletAriaLabel?: string;
}

export interface MobileFooterNavIcons {
  home?: FooterIcon;
  learn?: FooterIcon;
  wallet?: FooterIcon;
}

export interface MobileFooterNavProps {
  activeItem?: FooterNavItemId;
  avatarFallback?: string;
  class?: string;
  icons?: MobileFooterNavIcons;
  labels?: MobileFooterNavLabels;
  onHomeClick?: () => void;
  onLearnClick?: () => void;
  onProfileClick?: () => void;
  /**
   * Render at any width instead of only below md. The nav is display:none on a
   * wide viewport, which makes it untestable and unpreviewable there; the same
   * escape exists on AppHeader and OperationPersonaControl.
   */
  forceMobile?: boolean;
  onTapHaptic?: () => void;
  onWalletClick?: () => void;
  userAvatarSeed?: string | null;
  userAvatarSrc?: string | null;
}

/** Callback-driven bottom navigation. CSS owns the mobile breakpoint. */
export function MobileFooterNav(props: MobileFooterNavProps) {
  const labels = () => props.labels ?? {};
  const icons = () => props.icons ?? {};
  const home = () => labels().home ?? "Home";
  const learn = () => labels().learn ?? "Learn";
  const wallet = () => labels().wallet ?? "Wallet";
  const profile = () => labels().profile ?? "Profile";
  const active = () => props.activeItem ?? "home";
  const handleTap = (action?: () => void) => {
    if (!action) return;
    props.onTapHaptic?.();
    action();
  };

  const items = () => [
    { id: "home" as const, icon: icons().home ?? IconHouse, label: home(), onClick: props.onHomeClick, ariaLabel: home() },
    { id: "learn" as const, icon: icons().learn ?? IconPlaylist, label: learn(), onClick: props.onLearnClick, ariaLabel: labels().learnAriaLabel ?? learn() },
    { id: "wallet" as const, icon: icons().wallet ?? IconWallet, label: wallet(), onClick: props.onWalletClick, ariaLabel: labels().walletAriaLabel ?? wallet() },
  ];

  return (
    <nav
      aria-label={labels().primaryNavAriaLabel ?? "Primary navigation"}
      class={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md",
        !props.forceMobile && "md:hidden",
        props.class,
      )}
    >
      <div class="grid h-[var(--header-height)] grid-cols-4 items-center px-3">
        <For each={items()}>
          {(item) => (
            <button
              aria-current={active() === item.id ? "page" : undefined}
              aria-label={item.ariaLabel}
              class={cn(
                "relative flex h-full w-full items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active() === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => handleTap(item.onClick)}
              type="button"
            >
              <Dynamic component={item.icon} class="size-6" filled={active() === item.id} />
              <span class="sr-only">{item.label}</span>
            </button>
          )}
        </For>
        <button
          aria-current={active() === "profile" ? "page" : undefined}
          aria-label={labels().profileAriaLabel ?? profile()}
          class={cn(
            "relative flex h-full w-full items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            active() === "profile" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => handleTap(props.onProfileClick)}
          type="button"
        >
          <Avatar
            class="size-7 bg-card"
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
