import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { AvatarBadge } from "./avatar-badge";

const fixtureFlag = (code: string) =>
  `/mascots/error-ghost-256.png#${code}`;

describe("AvatarBadge", () => {
  it("renders the plain avatar without a valid country code", () => {
    const container = render(() => (
      <AvatarBadge badgeCountryCode={null} badgeLabel="Verified" fallback="Ada Lovelace" />
    ));

    expect(within(container).queryByRole("img", { name: "Verified" })).toBeNull();
    expect(within(container).getByText("AL")).toBeVisible();
  });

  it("renders the badge with its accessible label for a valid country code", () => {
    const container = render(() => (
      <AvatarBadge
        badgeCountryCode="US"
        badgeLabel="Verified United States nationality"
        fallback="Ada Lovelace"
        flagUrlForCountryCode={fixtureFlag}
      />
    ));

    const badge = within(container).getByRole("img", {
      name: "Verified United States nationality",
    });
    expect(badge).toBeVisible();
    const flag = badge.querySelector("img");
    expect(flag?.getAttribute("src")).toContain("#us");
  });

  it("normalizes invalid country codes away", () => {
    const container = render(() => (
      <AvatarBadge
        badgeCountryCode="usa"
        badgeLabel="Verified"
        fallback="Ada Lovelace"
        flagUrlForCountryCode={fixtureFlag}
      />
    ));

    expect(within(container).queryByRole("img", { name: "Verified" })).toBeNull();
  });

  it("uses a deterministic HTML country-code mark when no artwork resolver is supplied", () => {
    const container = render(() => (
      <AvatarBadge
        badgeCountryCode="US"
        badgeLabel="Verified United States nationality"
        fallback="Ada Lovelace"
      />
    ));

    const badge = within(container).getByRole("img", {
      name: "Verified United States nationality",
    });
    expect(within(badge).getByText("US")).toBeInTheDocument();
    expect(badge.querySelector("svg")).not.toBeInTheDocument();
    expect(badge.querySelector("img")).not.toBeInTheDocument();
  });

  it("has no automated a11y violations", async () => {
    render(() => (
      <AvatarBadge
        badgeCountryCode="gb"
        badgeLabel="Verified United Kingdom nationality"
        fallback="Ada Lovelace"
        flagUrlForCountryCode={fixtureFlag}
      />
    ));

    await expectNoA11yViolations();
  });
});
