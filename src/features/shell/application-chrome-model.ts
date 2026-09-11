import type { ShellNavItem } from "./shell-model.ts";

export type ApplicationChromeMode = "bare" | "immersive" | "standard";
export type ApplicationChromeRoute = "home" | "your-communities" | "create-community" | "none";
export type ApplicationMobileItem = ShellNavItem | "none";

export interface ApplicationChromePolicy {
  readonly activeItemId: ApplicationChromeRoute;
  readonly mobileActiveItem: ApplicationMobileItem;
  readonly mobileTitle: string;
  readonly mode: ApplicationChromeMode;
}

function pathSegments(pathname: string): readonly string[] {
  return pathname.split("/").filter(Boolean);
}

/**
 * Community management renders its own takeover shell, including its own
 * sidebar, header and exit control, on every viewport. Legacy kept the
 * equivalent routes standalone so the application sidebar never rendered
 * beside the management sidebar; classifying them as bare here is what stops
 * this application nesting one navigation column inside another.
 */
export function isCommunityManagementRoute(pathname: string): boolean {
  const segments = pathSegments(pathname);
  return segments[0] === "c" && segments[2] === "settings";
}

/**
 * The navigation keeps only destinations with real pages: Home, Communities
 * and Create community. Search, Live, Activity, Study, Karaoke and Settings
 * keep their routes so old links resolve, but they are unlisted and highlight
 * no item. A viewer's own profile highlights Profile; anyone else's profile
 * highlights nothing, which is what `viewerProfilePath` distinguishes.
 */
export function resolveApplicationChrome(pathname: string, viewerProfilePath?: string): ApplicationChromePolicy {
  const segments = pathSegments(pathname);
  const first = segments[0];
  const activity = segments.includes("activity");
  const karaoke = first === "karaoke" || segments.includes("karaoke");
  const study = first === "study" || segments.includes("study");
  const community = first === "c";
  const profile = first === "u" || (first === "p" && !karaoke && !study);
  const ownProfile = viewerProfilePath !== undefined && pathname === viewerProfilePath;

  if (isCommunityManagementRoute(pathname)) {
    return { activeItemId: "your-communities", mobileActiveItem: "communities", mobileTitle: "Community", mode: "bare" };
  }
  if (first === "auth" || first === "verify" || first === "terms" || first === "privacy") {
    return { activeItemId: "home", mobileActiveItem: "home", mobileTitle: "Pirate", mode: "bare" };
  }
  if (segments.length === 0) {
    return { activeItemId: "home", mobileActiveItem: "home", mobileTitle: "PIRATE", mode: "immersive" };
  }
  if (community) {
    return { activeItemId: "your-communities", mobileActiveItem: "communities", mobileTitle: "Community", mode: "standard" };
  }
  if (first === "communities") {
    return {
      activeItemId: segments[1] === "new" ? "create-community" : "your-communities",
      mobileActiveItem: "communities",
      mobileTitle: segments[1] === "new" ? "Create community" : "Your communities",
      mode: "standard",
    };
  }
  if (profile) {
    return { activeItemId: "none", mobileActiveItem: ownProfile ? "profile" : "none", mobileTitle: "Profile", mode: "standard" };
  }
  if (first === "search") {
    return { activeItemId: "none", mobileActiveItem: "none", mobileTitle: "Search", mode: "standard" };
  }
  if (first === "live") {
    return { activeItemId: "none", mobileActiveItem: "none", mobileTitle: "Live", mode: "standard" };
  }
  if (activity) {
    return { activeItemId: "none", mobileActiveItem: "none", mobileTitle: "Activity", mode: "standard" };
  }
  if (karaoke) {
    return { activeItemId: "none", mobileActiveItem: "none", mobileTitle: "Karaoke", mode: "standard" };
  }
  if (study) {
    return { activeItemId: "none", mobileActiveItem: "none", mobileTitle: "Study", mode: "standard" };
  }
  if (first === "settings") {
    return { activeItemId: "none", mobileActiveItem: "none", mobileTitle: "Settings", mode: "standard" };
  }
  return { activeItemId: "home", mobileActiveItem: "home", mobileTitle: "Pirate", mode: "standard" };
}
