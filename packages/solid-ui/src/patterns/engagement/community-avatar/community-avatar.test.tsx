import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { CommunityAvatar, resolveCommunityAvatarSrc } from "./community-avatar";

describe("community avatar src resolver", () => {
  it("returns no source when an explicit avatar is absent", () => {
    expect(resolveCommunityAvatarSrc({ avatarSrc: "  " })).toBeUndefined();
  });

  it("prefers an explicit avatar src", () => {
    expect(resolveCommunityAvatarSrc({ avatarSrc: " https://pirate.test/avatar.png " })).toBe(
      "https://pirate.test/avatar.png",
    );
  });
});

describe("CommunityAvatar", () => {
  it("uses the Phosphor community icon when no avatar source is supplied", () => {
    const container = render(() => (
      <CommunityAvatar communityId="cmt_atlas" displayName="Atlas Gardens" />
    ));

    const image = within(container).getByRole("img", { name: "Atlas Gardens" });
    expect(image.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    render(() => (
      <div>
        <CommunityAvatar communityId="cmt_atlas" displayName="Atlas Gardens" />
        <CommunityAvatar communityId="cmt_tide" displayName="Tide Room" />
      </div>
    ));

    await expectNoA11yViolations();
  });
});
