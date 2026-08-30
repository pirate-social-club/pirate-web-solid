import { createSignal } from "solid-js";

import { MobileFooterNav } from "../../../design-system";
import {
  PersonaSwitcherSheet,
  type SwitchablePersona,
} from "../../identity/persona-switcher-sheet/persona-switcher-sheet";

export type MobilePersonaFooterItem = "home" | "profile" | "study" | "wallet";

export interface MobilePersonaFooterProps {
  activeItem?: MobilePersonaFooterItem;
  initialProfileSheetOpen?: boolean;
  onHomeClick?: () => void;
  onPersonaChange?: (personaId: string) => void;
  onStudyClick?: () => void;
  onWalletClick?: () => void;
  personas: readonly SwitchablePersona[];
  selectedPersonaId: string;
}

/** Four-tab mobile navigation with Profile acting as the app persona switcher. */
export function MobilePersonaFooter(props: MobilePersonaFooterProps) {
  const [profileSheetOpen, setProfileSheetOpen] = createSignal(props.initialProfileSheetOpen ?? false);
  const selected = () =>
    props.personas.find((persona) => persona.personaId === props.selectedPersonaId)
      ?? props.personas[0];
  const activeItem = () => props.activeItem === "study" ? "learn" : props.activeItem;

  const selectPersona = (personaId: string) => {
    props.onPersonaChange?.(personaId);
    setProfileSheetOpen(false);
  };

  return (
    <>
      <MobileFooterNav
        activeItem={activeItem()}
        avatarFallback={selected()?.displayName ?? "Profile"}
        forceMobile
        labels={{
          home: "Home",
          learn: "Study",
          learnAriaLabel: "Study",
          primaryNavAriaLabel: "Primary navigation",
          profile: "Profile",
          profileAriaLabel: selected() ? `Switch profile, currently ${selected()!.displayName}` : "Switch profile",
          wallet: "Wallet",
        }}
        onHomeClick={props.onHomeClick}
        onLearnClick={props.onStudyClick}
        onProfileClick={() => setProfileSheetOpen(true)}
        onWalletClick={props.onWalletClick}
        userAvatarSeed={selected()?.avatarSeed ?? selected()?.publicHandle ?? undefined}
        userAvatarSrc={selected()?.avatarSrc ?? undefined}
      />
      <PersonaSwitcherSheet
        onOpenChange={setProfileSheetOpen}
        onSelect={selectPersona}
        open={profileSheetOpen()}
        personas={props.personas}
        selectedPersonaId={selected()?.personaId ?? ""}
      />
    </>
  );
}
