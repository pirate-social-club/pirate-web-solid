import { within } from "@testing-library/dom";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";

import {
  buildDefaultCommunityAvatarSrc,
  CommunityAvatar,
  resolveCommunityAvatarSrc,
} from "./community-avatar";
import { expectNoA11yViolations, render } from "@/test/test-utils";

describe("community avatar src resolver", () => {
  it("generates a deterministic data-uri svg per community", () => {
    const first = buildDefaultCommunityAvatarSrc({ communityId: "cmt_atlas", displayName: "Atlas Gardens" });
    const second = buildDefaultCommunityAvatarSrc({ communityId: "cmt_atlas", displayName: "Atlas Gardens" });

    expect(first).toBe(second);
    expect(first).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(first).toContain(encodeURIComponent('aria-label="AG"'));
  });

  it("varies by community id", () => {
    const first = buildDefaultCommunityAvatarSrc({ communityId: "cmt_atlas", displayName: "Atlas Gardens" });
    const second = buildDefaultCommunityAvatarSrc({ communityId: "cmt_tide", displayName: "Atlas Gardens" });

    expect(first).not.toBe(second);
  });

  it("prefers an explicit avatar src", () => {
    expect(
      resolveCommunityAvatarSrc({ communityId: "cmt_atlas", displayName: "Atlas Gardens", avatarSrc: "https://pirate.test/avatar.png" }),
    ).toBe("https://pirate.test/avatar.png");
  });
});

describe("CommunityAvatar", () => {
  it("renders the generated image with the display name as accessible name", () => {
    const container = render(() => (
      <CommunityAvatar communityId="cmt_atlas" displayName="Atlas Gardens" />
    ));

    const image = within(container).getByAltText("Atlas Gardens");
    expect(image).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));
  });

  it("falls back to initials when the generated image fails", () => {
    const container = render(() => (
      <CommunityAvatar communityId="cmt_atlas" displayName="Atlas Gardens" />
    ));

    const image = container.querySelector("img")!;
    image.dispatchEvent(new Event("error"));
    flush();

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(within(container).getByText("AG")).toBeVisible();
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
