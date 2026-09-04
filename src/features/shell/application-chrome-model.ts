import type { ShellNavItem } from "./shell-model.ts";

export type ApplicationChromeMode = "bare" | "immersive" | "standard";
export type ApplicationChromeRoute =
  | "home"
  | "search"
  | "live"
  | "your-communities"
  | "create-community"
  | "karaoke"
  | "study"
  | "activity"
  | "settings";

export interface ApplicationChromePolicy {
  readonly activeItemId: ApplicationChromeRoute;
  readonly mobileActiveItem: ShellNavItem;
  readonly mobileTitle: string;
  readonly mode: ApplicationChromeMode;
}

function pathSegments(pathname: string): readonly string[] {
  return pathname.split("/").filter(Boolean);
}

export function resolveApplicationChrome(pathname: string): ApplicationChromePolicy {
  const segments = pathSegments(pathname);
  const first = segments[0];
  const activity = segments.includes("activity");
  const karaoke = first === "karaoke" || segments.includes("karaoke");
  const study = first === "study" || segments.includes("study");
  const community = first === "c";
  const profile = first === "u" || (first === "p" && !karaoke && !study);

  if (first === "auth" || first === "verify" || first === "terms" || first === "privacy") {
    return { activeItemId: "home", mobileActiveItem: "home", mobileTitle: "Pirate", mode: "bare" };
  }
  if (segments.length === 0) {
    return { activeItemId: "home", mobileActiveItem: "home", mobileTitle: "PIRATE", mode: "immersive" };
  }
  if (first === "search") {
    return { activeItemId: "search", mobileActiveItem: "home", mobileTitle: "Search", mode: "standard" };
  }
  if (first === "live") {
    return { activeItemId: "live", mobileActiveItem: "home", mobileTitle: "Live", mode: "standard" };
  }
  if (activity) {
    return { activeItemId: "activity", mobileActiveItem: "home", mobileTitle: "Activity", mode: "standard" };
  }
  if (karaoke) {
    return { activeItemId: "karaoke", mobileActiveItem: "learn", mobileTitle: "Karaoke", mode: "standard" };
  }
  if (study) {
    return { activeItemId: "study", mobileActiveItem: "learn", mobileTitle: "Study", mode: "standard" };
  }
  if (community) {
    return { activeItemId: "your-communities", mobileActiveItem: "learn", mobileTitle: "Community", mode: "standard" };
  }
  if (first === "communities") {
    return {
      activeItemId: segments[1] === "new" ? "create-community" : "your-communities",
      mobileActiveItem: "learn",
      mobileTitle: segments[1] === "new" ? "Create Community" : "Your Communities",
      mode: "standard",
    };
  }
  if (first === "settings" || profile) {
    return { activeItemId: "settings", mobileActiveItem: "profile", mobileTitle: profile ? "Profile" : "Settings", mode: "standard" };
  }
  return { activeItemId: "home", mobileActiveItem: "home", mobileTitle: "Pirate", mode: "standard" };
}
