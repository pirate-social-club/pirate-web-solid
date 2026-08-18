import { describe, expect, test } from "bun:test";

import {
  canSubmitEditProfile,
  editProfileValidation,
  isEditProfileDirty,
  trimDisplayName,
} from "./edit-profile-form.model";

describe("edit profile form model", () => {
  const original = { bio: "A bio", displayName: "Pampa" };

  test("trims names for dirty comparison and submit eligibility", () => {
    expect(trimDisplayName("  Pampa  ")).toBe("Pampa");
    expect(isEditProfileDirty({ bio: "A bio", displayName: "  Pampa  " }, original.displayName, original.bio)).toBe(false);
    expect(canSubmitEditProfile({ bio: "New bio", displayName: " Pampa " }, original.displayName, original.bio)).toBe(true);
  });

  test("requires a non-whitespace display name and blocks saving", () => {
    const errors = editProfileValidation({ bio: "A bio", displayName: "  " });
    expect(errors).toEqual([{ field: "displayName", message: "Display name is required." }]);
    expect(canSubmitEditProfile({ bio: "New bio", displayName: "  " }, original.displayName, original.bio)).toBe(false);
  });

  test("enforces display name and bio limits", () => {
    expect(editProfileValidation({ bio: "A bio", displayName: "x".repeat(51) })[0]?.message).toContain("50");
    expect(editProfileValidation({ bio: "x".repeat(301), displayName: "Pampa" })[0]?.message).toContain("300");
  });
});
