import { describe, expect, test } from "vitest";

import { spacesClaimStatus } from "./spaces-claim-status.tsx";

describe("private Spaces registration status", () => {
  test("keeps pending and delayed names private, and announces only an active grant as ready", () => {
    const pending = { state: "issuance_pending", delayed: false, display_identifier: "alice@yahoo", grant: null } as const;
    expect(spacesClaimStatus(pending)).toEqual({ title: "Registration pending",
      detail: "Only you can see this requested name until its Bitcoin registration is final." });
    expect(spacesClaimStatus({ ...pending, delayed: true }).detail).toContain("Only you can see");
    expect(spacesClaimStatus({ ...pending, state: "issuance_failed" }).title).toBe("Registration needs attention");
    expect(spacesClaimStatus({ ...pending, state: "issued" }).title).toBe("Registration pending");
    expect(spacesClaimStatus({ ...pending, state: "issued", grant: { status: "active" } })).toEqual({
      title: "alice@yahoo is registered", detail: "Your name is ready to use.",
    });
  });
});
