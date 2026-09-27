/** One destination map for desktop, the mobile drawer and the four mobile tabs. */
export const navigationPaths = {
  home: "/", songs: "/songs",
  wallet: "/wallet", profile: "/me", settings: "/settings",
  "your-communities": "/communities", "create-community": "/communities/new",
} as const;

const paths = new Map<string, string>(Object.entries(navigationPaths));

export function navigationPath(id: string): string | undefined {
  return paths.get(id);
}

/** The public page for a profile: its handle when it has one, else its id. */
export function profilePath(profile: { readonly personaId: string; readonly publicHandle?: string | null }): string {
  const handle = profile.publicHandle?.trim();
  return handle ? `/u/${encodeURIComponent(handle)}` : `/p/${encodeURIComponent(profile.personaId)}`;
}

export type ProfileSwitch =
  | { readonly kind: "none" }
  | { readonly kind: "toggle"; readonly personaId: string }
  | { readonly kind: "open" };

/**
 * What a double tap on the profile tab does: nothing with one profile, a
 * direct toggle with two, and the profile sheet with three or more.
 */
export function profileSwitch(personaIds: readonly string[], selectedPersonaId: string | undefined): ProfileSwitch {
  if (personaIds.length < 2) return { kind: "none" };
  if (personaIds.length > 2) return { kind: "open" };
  // With no explicit selection the first profile is the one in use.
  const current = selectedPersonaId !== undefined && personaIds.includes(selectedPersonaId) ? selectedPersonaId : personaIds[0];
  const other = personaIds.find(personaId => personaId !== current) ?? personaIds[0]!;
  return { kind: "toggle", personaId: other };
}
