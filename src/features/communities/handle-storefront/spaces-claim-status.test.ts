import { describe, expect, test } from "vitest";

import { spacesClaimStatus, type SpacesClaimDisplay } from "./spaces-claim-state.tsx";

const claim: SpacesClaimDisplay = {
  state: "issuance_pending", delayed: false, display_identifier: "member@yahoo", grant: null,
};

describe("private Spaces registration status", () => {
  test.each([false, true])("keeps pending names private (delayed=%s)", delayed => {
    expect(spacesClaimStatus({ ...claim, delayed })).toEqual({
      title: "Registration pending",
      detail: delayed
        ? "Registration is taking longer than expected. Only you can see this requested name while it is pending."
        : "Only you can see this requested name until its Bitcoin registration is final.",
    });
  });

  test.each([false, true])("preserves failed registration guidance (delayed=%s)", delayed => {
    expect(spacesClaimStatus({ ...claim, state: "issuance_failed", delayed })).toEqual({
      title: "Registration needs attention",
      detail: "This name could not be registered. Contact the community owner before requesting it again.",
    });
  });

  test.each([false, true])("announces an active issued grant as ready (delayed=%s)", delayed => {
    expect(spacesClaimStatus({ ...claim, state: "issued", delayed, grant: { status: "active" } })).toEqual({
      title: "member@yahoo is registered", detail: "Your name is ready to use.",
    });
  });

  test.each([
    { grant: { status: "revoked" }, title: "Name grant revoked",
      detail: "Pirate's grant for this name has been revoked. This does not change ownership of the native Spaces name." },
    { grant: { status: "tombstoned" }, title: "Name grant removed",
      detail: "Pirate's grant for this name has been removed. This does not change ownership of the native Spaces name." },
    { grant: null, title: "Grant status unavailable",
      detail: "This name is registered, but its current Pirate grant status is unavailable. Refresh status to check again." },
  ] satisfies Array<{ grant: SpacesClaimDisplay["grant"]; title: string; detail: string }>)(
    "shows $title for an issued claim instead of pending registration",
    ({ grant, title, detail }) => {
      for (const delayed of [false, true]) {
        expect(spacesClaimStatus({ ...claim, state: "issued", delayed, grant })).toEqual({ title, detail });
      }
    },
  );
});
