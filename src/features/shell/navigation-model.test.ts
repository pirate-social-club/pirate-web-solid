import { describe, expect, test } from "vitest";

import { communityNavigationSections, scopedPrimaryNavigation, navigationHomePath, profilePath, profileSwitch } from "./navigation-model.ts";

describe("navigation model", () => {
  test("links a profile by handle when it has one, else by id", () => {
    expect(profilePath({ personaId: "persona-1", publicHandle: "harbor.pirate" })).toBe("/u/harbor.pirate");
    expect(profilePath({ personaId: "persona 1", publicHandle: null })).toBe("/p/persona%201");
    expect(profilePath({ personaId: "persona-1", publicHandle: "  " })).toBe("/p/persona-1");
  });

  test("a double tap does nothing with one profile, toggles two, and opens the sheet for three or more", () => {
    expect(profileSwitch(["one"], "one")).toEqual({ kind: "none" });
    expect(profileSwitch(["one", "two"], "one")).toEqual({ kind: "toggle", personaId: "two" });
    expect(profileSwitch(["one", "two"], "two")).toEqual({ kind: "toggle", personaId: "one" });
    expect(profileSwitch(["one", "two"], undefined)).toEqual({ kind: "toggle", personaId: "two" });
    expect(profileSwitch(["one", "two"], "gone")).toEqual({ kind: "toggle", personaId: "two" });
    expect(profileSwitch(["one", "two", "three"], "one")).toEqual({ kind: "open" });
  });
});

const community = (communityId: string) => ({ communityId, displayName: communityId, href: `/c/${communityId}` });

describe("community navigation projection", () => {
  test("joins first, keeps moderated communities separate, and deduplicates both sections", () => {
    const sections = communityNavigationSections({
      joined: [community("joined"), community("moderated"), community("joined")],
      popular: [community("popular"), community("joined"), community("moderated"), community("popular")],
      moderated: [community("moderated"), community("moderated")],
    });
    expect(sections.communities.map(item => item.communityId)).toEqual(["joined", "popular"]);
    expect(sections.moderated.map(item => item.communityId)).toEqual(["moderated"]);
    expect(sections.seeAllJoined).toBe(false);
  });
  test("caps heavy membership while keeping a way to the full list", () => {
    const sections = communityNavigationSections({ joined: Array.from({ length: 8 }, (_, index) => community(`joined-${index}`)), popular: [community("popular")], moderated: [] });
    expect(sections.communities.map(item => item.communityId)).toEqual(["joined-0", "joined-1", "joined-2", "joined-3", "joined-4"]);
    expect(sections.seeAllJoined).toBe(true);
    expect(sections.moderated).toEqual([]);
  });
  test("anonymous discovery preserves server ranking without a membership link", () => {
    const sections = communityNavigationSections({ joined: [], popular: [community("ranked-first"), community("ranked-second")], moderated: [] });
    expect(sections.communities.map(item => item.communityId)).toEqual(["ranked-first", "ranked-second"]);
    expect(sections.seeAllJoined).toBe(false);
  });
});

describe("community application scope", () => {
  test("keeps the home destination local and omits platform discovery", () => {
    const scope = { kind: "community" as const, community: community("harbor") };
    expect(navigationHomePath(scope)).toBe("/c/harbor");
    expect(scopedPrimaryNavigation(scope).map(item => item.id)).toEqual(["home", "songs", "wallet", "profile"]);
    expect(scopedPrimaryNavigation(scope)[0]?.href).toBe("/c/harbor");
    expect(scopedPrimaryNavigation(scope)[0]?.label).toBe("Home");
    expect(scopedPrimaryNavigation({ kind: "platform" }).some(item => String(item.id) === "explore")).toBe(false);
  });
});
