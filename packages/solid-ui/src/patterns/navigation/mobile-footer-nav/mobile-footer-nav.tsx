import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Avatar } from "@/components/data-display/avatar/avatar";
import { IconHouse, IconPlaylist, IconPlus, IconWallet } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export type FooterNavItemId = "home" | "songs" | "wallet" | "profile" | "none";
type FooterIcon = (props: { class?: string; filled?: boolean }) => JSX.Element;

export interface MobileFooterNavLabels {
  home?: string;
  songs?: string;
  songsAriaLabel?: string;
  wallet?: string;
  walletAriaLabel?: string;
  primaryNavAriaLabel?: string;
  profile?: string;
  profileAriaLabel?: string;
  /** Names the optional center create action for assistive technology. */
  createAriaLabel?: string;
}

export interface MobileFooterNavIcons {
  home?: FooterIcon;
  songs?: FooterIcon;
  wallet?: FooterIcon;
}

export interface MobileFooterNavProps {
  activeItem?: FooterNavItemId;
  avatarFallback?: string;
  class?: string;
  /**
   * Renders the center create action and widens the bar to five positions.
   * The action is a command, never the current page: only the four
   * destination items carry `aria-current`.
   */
  onCreateClick?: () => void;
  icons?: MobileFooterNavIcons;
  labels?: MobileFooterNavLabels;
  onHomeClick?: () => void;
  onSongsClick?: () => void;
  onWalletClick?: () => void;
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

/** Callback-driven bottom navigation. CSS owns the mobile breakpoint. Without
 * a create callback it is the four-position destination bar; with one it adds
 * the center create action in a five-position grid. */
export function MobileFooterNav(props: MobileFooterNavProps) {
  const labels = () => props.labels ?? {};
  const icons = () => props.icons ?? {};
  const home = () => labels().home ?? "Home";
  const songs = () => labels().songs ?? "Your songs";
  const wallet = () => labels().wallet ?? "Wallet";
  const profile = () => labels().profile ?? "Profile";
  const create = () => labels().createAriaLabel ?? "Create";
  const active = () => props.activeItem ?? "home";
  const handleTap = (action?: () => void) => {
    if (!action) return;
    props.onTapHaptic?.();
    action();
  };

  const items = () => [
    { id: "home" as const, icon: icons().home ?? IconHouse, label: home(), onClick: props.onHomeClick, ariaLabel: home() },
    { id: "songs" as const, icon: icons().songs ?? IconPlaylist, label: songs(), onClick: props.onSongsClick, ariaLabel: labels().songsAriaLabel ?? songs() },
  ];
  const trailingItems = () => [
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
      <div class={cn("grid h-[var(--header-height)] items-center px-3", props.onCreateClick ? "grid-cols-5" : "grid-cols-4")}>
        <For each={items()}>
          {(item) => (
            <button
              aria-current={active() === item.id ? "page" : undefined}
              aria-label={item.ariaLabel}
              class={cn(
                "relative flex h-full w-full cursor-pointer items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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
        <Show when={props.onCreateClick}>
          <button
            aria-label={create()}
            class="relative flex h-full w-full cursor-pointer items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => handleTap(props.onCreateClick)}
            type="button"
          >
            <span aria-hidden="true" class="grid size-11 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground">
              <IconPlus class="size-5" />
            </span>
          </button>
        </Show>
        <For each={trailingItems()}>
          {(item) => (
            <button
              aria-current={active() === item.id ? "page" : undefined}
              aria-label={item.ariaLabel}
              class={cn(
                "relative flex h-full w-full cursor-pointer items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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
            "relative flex h-full w-full cursor-pointer items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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
