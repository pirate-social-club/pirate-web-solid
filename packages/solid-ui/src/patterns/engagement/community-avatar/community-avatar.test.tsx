import { within } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations, render } from "@/test/test-utils";

import { CommunityAvatar, resolveCommunityAvatarSrc } from "./community-avatar";

describe("community avatar src resolver", () => {
  it("returns no source when an explicit avatar is absent", () => {
    expect(resolveCommunityAvatarSrc({
      avatarSrc: "  ",
      communityId: "cmt_atlas",
      displayName: "Atlas Gardens",
    })).toBeUndefined();
  });

  it("prefers an explicit avatar src", () => {
    expect(resolveCommunityAvatarSrc({
      avatarSrc: " https://pirate.test/avatar.png ",
      communityId: "cmt_atlas",
      displayName: "Atlas Gardens",
    })).toBe(
      "https://pirate.test/avatar.png",
    );
  });
});

describe("CommunityAvatar", () => {
  it("uses a deterministic HTML identity mark when no avatar source is supplied", () => {
    const container = render(() => (
      <CommunityAvatar communityId="cmt_atlas" displayName="Atlas Gardens" />
    ));

    const image = within(container).getByRole("img", { name: "Atlas Gardens" });
    expect(within(image).getByText("AG")).toBeInTheDocument();
    expect(image.querySelector("svg")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("keeps the identity mark stable for identical community inputs", () => {
    const first = render(() => (
      <CommunityAvatar communityId="cmt_atlas" displayName="Atlas Gardens" />
    ));
    const second = render(() => (
      <CommunityAvatar communityId="cmt_atlas" displayName="Atlas Gardens" />
    ));

    expect(first.querySelector("[aria-hidden='true']")?.getAttribute("style"))
      .toBe(second.querySelector("[aria-hidden='true']")?.getAttribute("style"));
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
