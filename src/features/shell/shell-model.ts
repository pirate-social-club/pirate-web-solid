export type ShellNavItem = "home" | "wallet" | "chat" | "inbox" | "profile";

export const shellNavItems = ["home", "wallet", "chat", "inbox", "profile"] as const;

export function normalizeUnreadCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function formatUnreadCount(value: number | undefined): string {
  const count = normalizeUnreadCount(value);
  return count > 99 ? "99+" : String(count);
}

export function resolveShellTitle(route: "home" | "community" | "post" | "wallet" | "profile"): string | null {
  switch (route) {
    case "home": return "Pirate";
    case "community": return "Builders";
    case "post": return "Post";
    case "wallet": return "Wallet";
    case "profile": return "story.pirate";
  }
}

