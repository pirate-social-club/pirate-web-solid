import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";
import { For } from "solid-js";

import { Avatar } from "@/components/data-display/avatar/avatar";
import { IconHouse, IconUsersThree } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export type FooterNavItemId = "home" | "communities" | "profile" | "none";
type FooterIcon = (props: { class?: string; filled?: boolean }) => JSX.Element;

export interface MobileFooterNavLabels {
  home?: string;
  communities?: string;
  communitiesAriaLabel?: string;
  primaryNavAriaLabel?: string;
  profile?: string;
  profileAriaLabel?: string;
}

export interface MobileFooterNavIcons {
  home?: FooterIcon;
  communities?: FooterIcon;
}

export interface MobileFooterNavProps {
  activeItem?: FooterNavItemId;
  avatarFallback?: string;
  class?: string;
  icons?: MobileFooterNavIcons;
  labels?: MobileFooterNavLabels;
  onHomeClick?: () => void;
  onCommunitiesClick?: () => void;
  onProfileClick?: () => void;
  /**
   * Render at any width instead of only below md. The nav is display:none on a
   * wide viewport, which makes it untestable and unpreviewable there; the same
   * escape exists on AppHeader and OperationPersonaControl.
   */
  forceMobile?: boolean;
  onTapHaptic?: () => void;
  userAvatarSeed?: string | null;
  userAvatarSrc?: string | null;
}

/** Callback-driven bottom navigation. CSS owns the mobile breakpoint. */
export function MobileFooterNav(props: MobileFooterNavProps) {
  const labels = () => props.labels ?? {};
  const icons = () => props.icons ?? {};
  const home = () => labels().home ?? "Home";
  const communities = () => labels().communities ?? "Communities";
  const profile = () => labels().profile ?? "Profile";
  const active = () => props.activeItem ?? "home";
  const handleTap = (action?: () => void) => {
    if (!action) return;
    props.onTapHaptic?.();
    action();
  };

  const items = () => [
    { id: "home" as const, icon: icons().home ?? IconHouse, label: home(), onClick: props.onHomeClick, ariaLabel: home() },
    { id: "communities" as const, icon: icons().communities ?? IconUsersThree, label: communities(), onClick: props.onCommunitiesClick, ariaLabel: labels().communitiesAriaLabel ?? communities() },
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
      <div class="grid h-[var(--header-height)] grid-cols-3 items-center px-3">
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
