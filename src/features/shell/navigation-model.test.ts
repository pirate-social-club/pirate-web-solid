import { describe, expect, test } from "vitest";

import { communityNavigationSections, profilePath, profileSwitch } from "./navigation-model.ts";

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
  test("joins first, keeps creators separate, and deduplicates both sections", () => {
    const sections = communityNavigationSections({
      joined: [community("joined"), community("created"), community("joined")],
      popular: [community("popular"), community("joined"), community("created"), community("popular")],
      created: [community("created"), community("created")],
    });
    expect(sections.communities.map(item => item.communityId)).toEqual(["joined", "popular"]);
    expect(sections.created.map(item => item.communityId)).toEqual(["created"]);
    expect(sections.seeAllJoined).toBe(true);
  });
  test("caps heavy membership while keeping a way to the full list", () => {
    const sections = communityNavigationSections({ joined: Array.from({ length: 8 }, (_, index) => community(`joined-${index}`)), popular: [community("popular")], created: [] });
    expect(sections.communities.map(item => item.communityId)).toEqual(["joined-0", "joined-1", "joined-2", "joined-3", "joined-4"]);
    expect(sections.seeAllJoined).toBe(true);
    expect(sections.created).toEqual([]);
  });
  test("anonymous discovery preserves server ranking without a membership link", () => {
    const sections = communityNavigationSections({ joined: [], popular: [community("ranked-first"), community("ranked-second")], created: [] });
    expect(sections.communities.map(item => item.communityId)).toEqual(["ranked-first", "ranked-second"]);
    expect(sections.seeAllJoined).toBe(false);
  });
});
