import { Show } from "solid-js";
import { Avatar, IconButton, IconDotsThree } from "../../design-system";
import type { SwitchablePersona } from "./persona-switcher-sheet/persona-switcher-sheet.tsx";

/**
 * The operation identity control, shared by app chrome and isolated pages.
 *
 * `floating` is the app chrome's fixed corner control. `banner` sits in a
 * community banner's top-right group beside More: a 40px disc on the
 * secondary surface with a ring in the banner's control colour, kept at the
 * outer edge, with the profile menu (when there is one) just inside it.
 */
export function CommunityPersonaControl(props: {
  persona?: SwitchablePersona;
  label: string;
  opensPicker: boolean;
  desktopOnly?: boolean;
  placement?: "floating" | "banner";
  onClick: () => void;
  onMenuClick?: () => void;
  menuLabel?: string;
}) {
  const banner = () => props.placement === "banner";
  const visibility = () => props.desktopOnly ? "hidden md:flex" : "flex";
  const menu = () => <Show when={props.onMenuClick}><IconButton
    aria-label={props.menuLabel ?? "Profile menu"} aria-haspopup="dialog"
    class={banner()
      ? "size-10 shrink-0 bg-background/75 text-foreground backdrop-blur-sm"
      : `fixed bottom-5 end-20 z-40 size-11 rounded-full border border-border-soft bg-background shadow-md ${visibility()}`}
    onClick={props.onMenuClick} variant="ghost"><IconDotsThree class="size-5" /></IconButton></Show>;
  const profile = () => <IconButton
    aria-label={props.label}
    aria-haspopup={props.opensPicker ? "dialog" : undefined}
    class={banner()
      ? "size-10 shrink-0 overflow-hidden rounded-full border-2 border-background/75 bg-secondary p-0 text-secondary-foreground hover:bg-secondary"
      : `fixed bottom-5 end-5 z-40 size-12 rounded-full border border-border-soft bg-background shadow-md ${visibility()}`}
    data-community-profile-control={banner() ? "banner" : ""}
    title={props.persona ? `Posting as ${props.persona.displayName}` : props.label}
    onClick={props.onClick}
    variant="ghost"
  >
    <Avatar
      class={banner() ? "size-full border-0 bg-transparent text-base text-secondary-foreground" : "size-8"}
      fallback={props.persona?.displayName ?? "Profile"}
      fallbackSeed={props.persona?.avatarSeed ?? props.persona?.publicHandle ?? undefined}
      size="sm"
      src={props.persona?.avatarSrc ?? undefined}
    />
  </IconButton>;
  return <Show when={banner()} fallback={<>{profile()}{menu()}</>}>{menu()}{profile()}</Show>;
}
