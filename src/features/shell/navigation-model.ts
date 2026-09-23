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
