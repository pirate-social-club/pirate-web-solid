import { describe, expect, test } from "bun:test";
import {
  actionPinViolations,
  actionReferences,
  isPinnedActionReference,
  repositoryActionPinViolations,
} from "./check-action-pins.ts";

const pinned = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262";

describe("workflow action pinning", () => {
  test("reads block action references", () => {
    expect(
      actionReferences(`steps:
  - uses: ${pinned}
  - name: Local
    uses: ./.github/actions/local
`),
    ).toEqual([pinned, "./.github/actions/local"]);
  });

  test("accepts local actions and full commit SHAs only", () => {
    expect(isPinnedActionReference(pinned)).toBe(true);
    expect(isPinnedActionReference("./.github/actions/local")).toBe(true);
    expect(isPinnedActionReference("actions/checkout@v4")).toBe(false);
    expect(isPinnedActionReference("actions/checkout@11d5960")).toBe(false);
  });

  test("reports the workflow and mutable reference", () => {
    expect(actionPinViolations(".github/workflows/ci.yml", "- uses: actions/checkout@v4")).toEqual([
      ".github/workflows/ci.yml: action actions/checkout@v4 is not pinned to a full commit SHA",
    ]);
  });

  test("keeps every checked-in workflow immutable", async () => {
    expect(await repositoryActionPinViolations()).toEqual([]);
  });
});
