import type { SwitchablePersona } from "./persona-switcher-sheet.tsx";

export const switcherPersonas: readonly SwitchablePersona[] = [
  { personaId: "persona_harbor", displayName: "Harbor", publicHandle: "harbor.pirate", avatarSeed: "harbor" },
  { personaId: "persona_night", displayName: "Night Shift", publicHandle: "nightshift.community", avatarSeed: "night" },
  { personaId: "persona_studio", displayName: "Studio", publicHandle: null, avatarSeed: "studio" },
];
