import { describe, expect, test } from "vitest";

import { profilePath, profileSwitch } from "./navigation-model.ts";

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
