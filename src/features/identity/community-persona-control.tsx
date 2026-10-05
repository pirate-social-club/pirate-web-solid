import { Avatar, IconButton } from "../../design-system";
import type { SwitchablePersona } from "./persona-switcher-sheet/persona-switcher-sheet.tsx";

/** The operation identity control, shared by app chrome and isolated pages. */
export function CommunityPersonaControl(props: {
  persona?: SwitchablePersona;
  label: string;
  opensPicker: boolean;
  desktopOnly?: boolean;
  onClick: () => void;
}) {
  return <IconButton
    aria-label={props.label}
    aria-haspopup={props.opensPicker ? "dialog" : undefined}
    class={`fixed bottom-5 end-5 z-40 size-12 rounded-full border border-border-soft bg-background shadow-md ${props.desktopOnly ? "hidden md:flex" : "flex"}`}
    data-community-profile-control
    title={props.persona ? `Posting as ${props.persona.displayName}` : props.label}
    onClick={props.onClick}
    variant="ghost"
  >
    <Avatar class="size-8" fallback={props.persona?.displayName ?? "Profile"} fallbackSeed={props.persona?.avatarSeed ?? props.persona?.publicHandle ?? undefined} size="sm" src={props.persona?.avatarSrc ?? undefined} />
  </IconButton>;
}
